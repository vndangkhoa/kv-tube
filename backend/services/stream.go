package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
	"syscall"
	"time"
)

// StreamManager generates a local HLS stream per video by merging the highest
// available video-only format with the best audio-only format (server-side via
// yt-dlp + ffmpeg). This is required because YouTube only serves combined
// video+audio files up to ~360p-720p; higher resolutions are video-only and need
// a separate audio track. Producing a local HLS gives a single playable,
// seekable, adaptive stream at full resolution with audio.
type StreamManager struct {
	root string
	mu   sync.Mutex
	sess map[string]*StreamSession
}

// StreamSession represents one in-progress (or finished) HLS generation.
type StreamSession struct {
	ID          string
	Dir         string
	mergedPath  string
	playlistPath string
	ytCmd       *exec.Cmd
	ffCmd       *exec.Cmd
	mp4Out      io.ReadCloser
	CreatedAt   time.Time
	LastAccess  time.Time
	mu          sync.Mutex
	done        bool
	errored     bool
}

// DefaultStreamManager is the process-wide manager.
var DefaultStreamManager *StreamManager

// InitStreamManager creates the manager and starts the reaper. dataDir is the
// base data directory (e.g. ./data); HLS sessions are stored under <dataDir>/hls.
func InitStreamManager(dataDir string) {
	root := filepath.Join(dataDir, "hls")
	if err := os.MkdirAll(root, 0o755); err != nil {
		log.Printf("[stream] failed to create hls dir: %v", err)
	}
	DefaultStreamManager = &StreamManager{
		root: root,
		sess: make(map[string]*StreamSession),
	}
	go DefaultStreamManager.reap()
}

func randID() string {
	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		return fmt.Sprintf("%d", time.Now().UnixNano())
	}
	return hex.EncodeToString(b)
}

// Create starts a new HLS generation session for the given video. heightCap, if
// > 0, limits the selected video resolution (e.g. 1080). A value of 0 means no
// cap (highest available). forceAvc1 restricts to H.264 (necessary for Safari/iOS,
// which can't play AV1/VP9 in fMP4 HLS) and caps at 1080p there.
func (m *StreamManager) Create(videoID string, heightCap int, forceAvc1 bool) (*StreamSession, error) {
	id := randID()
	dir := filepath.Join(m.root, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	s := &StreamSession{
		ID:        id,
		Dir:       dir,
		CreatedAt: time.Now(),
		LastAccess: time.Now(),
	}

	urlStr := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	playlistPath := filepath.Join(dir, "index.m3u8")

	// fMP4 HLS (file-based, two-stage) is only required for VP9/AV1 resolutions
	// > 1080p: fMP4 HLS can't be produced from a non-seekable pipe, so we must
	// download+merge the whole file first (slow start). H.264 (<=1080p, or
	// forced via forceAvc1 for Safari/iOS) can be piped straight from yt-dlp into
	// a TS-HLS muxer, producing segments progressively — ready in ~1-2s.
	needsFmp4 := !forceAvc1 && (heightCap == 0 || heightCap > 1080)
	useFastPath := !needsFmp4

	// On the fast path we always restrict to H.264 (avc1) since we only go fast
	// for <=1080p; this also keeps the output Safari/iOS-friendly.
	format := buildStreamFormat(heightCap, useFastPath || forceAvc1)

	s.playlistPath = playlistPath

	if useFastPath {
		// Fast path: yt-dlp streams the merged video+audio to stdout, piped
		// directly into ffmpeg which writes TS-HLS segments as data arrives.
		ytArgs := []string{
			"--no-warnings",
			"--quiet",
			"--force-ipv4",
			"--no-playlist",
			"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"-f", format,
			"-o", "-",
			urlStr,
		}
		ytArgs = appendYtDlpCookies(ytArgs)
		ffArgs := []string{
			"-i", "-",
			"-c", "copy",
			"-f", "hls",
			"-hls_time", "4",
			"-hls_list_size", "0",
			"-hls_flags", "append_list",
			playlistPath,
		}

		go func() {
			defer func() {
				s.mu.Lock()
				s.done = true
				s.mu.Unlock()
			}()

			ytCmd := exec.Command(ytDlpBinPath, ytArgs...)
			ffCmd := exec.Command("ffmpeg", ffArgs...)
			s.mu.Lock()
			s.ytCmd = ytCmd
			s.ffCmd = ffCmd
			s.mu.Unlock()

			ytLog, _ := os.Create(filepath.Join(dir, "yt-dlp.log"))
			ffLog, _ := os.Create(filepath.Join(dir, "ffmpeg.log"))
			defer ytLog.Close()
			defer ffLog.Close()
			ytCmd.Stderr = ytLog
			ffCmd.Stderr = ffLog

			stdout, err := ytCmd.StdoutPipe()
			if err != nil {
				s.mu.Lock()
				s.errored = true
				s.mu.Unlock()
				log.Printf("[stream] session %s pipe setup failed: %v", id, err)
				return
			}
			ffCmd.Stdin = stdout

			if err := ffCmd.Start(); err != nil {
				s.mu.Lock()
				s.errored = true
				s.mu.Unlock()
				log.Printf("[stream] session %s ffmpeg start failed: %v", id, err)
				return
			}
			if err := ytCmd.Start(); err != nil {
				_ = ffCmd.Process.Kill()
				s.mu.Lock()
				s.errored = true
				s.mu.Unlock()
				log.Printf("[stream] session %s yt-dlp start failed: %v", id, err)
				return
			}

			_ = ytCmd.Wait()
			// When yt-dlp closes stdout, ffmpeg finalizes the last segment.
			_ = ffCmd.Wait()

			if _, statErr := os.Stat(playlistPath); statErr != nil {
				s.mu.Lock()
				s.errored = true
				s.mu.Unlock()
				log.Printf("[stream] session %s playlist missing", id)
				return
			}
			log.Printf("[stream] session %s ready (fast path)", id)
		}()
	} else {
		// Slow path: download+merge to a file, then segment into fMP4 HLS
		// (carries VP9/AV1 + AAC, enabling true 1440p/2160p). This runs
		// asynchronously; the playlist appears once segmentation starts.
		mergedPath := filepath.Join(dir, "merged.mp4")
		s.mergedPath = mergedPath

		ytArgs := []string{
			"--no-warnings",
			"--quiet",
			"--force-ipv4",
			"--no-playlist",
			"--merge-output-format", "mp4",
			"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
			"-f", format,
			"-o", mergedPath,
			urlStr,
		}
		ytArgs = appendYtDlpCookies(ytArgs)

		ffArgs := []string{
			"-i", mergedPath,
			"-c", "copy",
			"-f", "hls",
			"-hls_segment_type", "fmp4",
			"-hls_time", "4",
			"-hls_list_size", "0",
			"-hls_flags", "append_list",
			playlistPath,
		}

		go func() {
			defer func() {
				s.mu.Lock()
				s.done = true
				s.mu.Unlock()
			}()

			ytCmd := exec.Command(ytDlpBinPath, ytArgs...)
			s.mu.Lock()
			s.ytCmd = ytCmd
			s.mu.Unlock()
			ytLog, _ := os.Create(filepath.Join(dir, "yt-dlp.log"))
			ytCmd.Stderr = ytLog

			if err := ytCmd.Run(); err != nil {
				s.mu.Lock()
				s.errored = true
				s.mu.Unlock()
				log.Printf("[stream] session %s yt-dlp failed: %v", id, err)
				return
			}
			if _, statErr := os.Stat(mergedPath); statErr != nil {
				s.mu.Lock()
				s.errored = true
				s.mu.Unlock()
				log.Printf("[stream] session %s merged file missing", id)
				return
			}

			ffCmd := exec.Command("ffmpeg", ffArgs...)
			s.mu.Lock()
			s.ffCmd = ffCmd
			s.mu.Unlock()
			ffLog, _ := os.Create(filepath.Join(dir, "ffmpeg.log"))
			ffCmd.Stderr = ffLog

			if err := ffCmd.Run(); err != nil {
				s.mu.Lock()
				s.errored = true
				s.mu.Unlock()
				log.Printf("[stream] session %s ffmpeg failed: %v", id, err)
				return
			}
			// Segmentation done — free the (large) merged source file.
			_ = os.Remove(mergedPath)
			log.Printf("[stream] session %s ready", id)
		}()
	}

	m.mu.Lock()
	m.sess[id] = s
	m.mu.Unlock()
	return s, nil
}

// Get returns the session with the given id, updating its last-access time.
func (m *StreamManager) Get(id string) *StreamSession {
	m.mu.Lock()
	defer m.mu.Unlock()
	s, ok := m.sess[id]
	if !ok {
		return nil
	}
	s.LastAccess = time.Now()
	return s
}

// CreateDash builds a client-playable DASH manifest by remuxing YouTube's native
// video+audio streams into a fragmented MP4 (fMP4) via `ffmpeg -c copy` (NO
// re-encode — server CPU stays negligible). Unlike the client-built single-segment
// DASH (which forces the browser to download the whole file at once and stalls on
// a slow upstream link), the fragmented output lets the player fetch small segments
// on demand, so bandwidth is used efficiently. The client still does all decode.
//
// To avoid making the user wait for the entire file to download before playback can
// start, the video-only and audio-only streams are piped through named pipes
// (FIFOs) straight into ffmpeg's DASH muxer. Segments are written incrementally
// (with "-dash 1", live profile) as bytes arrive, so the manifest exists within
// seconds and the player begins streaming immediately. Using separate native
// containers (instead of merging into one mp4 first) is required so ffmpeg still
// recognizes VP9/AV1 video when building the DASH adaptation sets.
func (m *StreamManager) CreateDash(videoID string, heightCap int, forceAvc1 bool) (*StreamSession, error) {
	id := randID()
	dir := filepath.Join(m.root, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	s := &StreamSession{
		ID:         id,
		Dir:        dir,
		CreatedAt:  time.Now(),
		LastAccess: time.Now(),
	}
	urlStr := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	mpdPath := filepath.Join(dir, "manifest.mpd")
	videoPipe := filepath.Join(dir, "video.pipe")
	audioPipe := filepath.Join(dir, "audio.pipe")

	const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	videoSel := "bestvideo"
	if heightCap > 0 {
		videoSel = fmt.Sprintf("bestvideo[height<=%d]", heightCap)
	}
	videoFmt := videoSel
	if forceAvc1 {
		videoFmt = videoSel + "[vcodec^=avc1]"
	}
	audioFmt := "bestaudio[acodec^=mp4a]/bestaudio"

	s.playlistPath = mpdPath // reuse field for the manifest path

	if err := syscall.Mkfifo(videoPipe, 0o600); err != nil {
		return nil, err
	}
	if err := syscall.Mkfifo(audioPipe, 0o600); err != nil {
		os.Remove(videoPipe)
		return nil, err
	}

	go func() {
		defer func() {
			s.mu.Lock()
			s.done = true
			s.mu.Unlock()
			os.Remove(videoPipe)
			os.Remove(audioPipe)
		}()

		// Start ffmpeg first so it opens both FIFOs (blocking until the writers
		// connect), then start the two yt-dlp downloads that feed them.
		ytV := exec.Command(ytDlpBinPath,
			"--no-warnings", "--quiet", "--force-ipv4", "--no-playlist",
			"--user-agent", ua,
			"-f", videoFmt,
			"-o", videoPipe,
			urlStr,
		)
		ytA := exec.Command(ytDlpBinPath,
			"--no-warnings", "--quiet", "--force-ipv4", "--no-playlist",
			"--user-agent", ua,
			"-f", audioFmt,
			"-o", audioPipe,
			urlStr,
		)
		ytV.Args = appendYtDlpCookies(ytV.Args)
		ytA.Args = appendYtDlpCookies(ytA.Args)

		ff := exec.Command("ffmpeg",
			"-i", videoPipe,
			"-i", audioPipe,
			"-c", "copy",
			"-f", "dash",
			"-dash", "1",
			"-seg_duration", "4",
			"-adaptation_sets", "id=0,streams=v id=1,streams=a",
			mpdPath,
		)

		ytVLog, _ := os.Create(filepath.Join(dir, "yt-video.log"))
		ytALog, _ := os.Create(filepath.Join(dir, "yt-audio.log"))
		ffLog, _ := os.Create(filepath.Join(dir, "ffmpeg-dash.log"))
		defer ytVLog.Close()
		defer ytALog.Close()
		defer ffLog.Close()
		ytV.Stderr = ytVLog
		ytA.Stderr = ytALog
		ff.Stderr = ffLog

		s.mu.Lock()
		s.ytCmd = ytV
		s.ffCmd = ff
		s.mu.Unlock()

		if err := ff.Start(); err != nil {
			s.mu.Lock()
			s.errored = true
			s.mu.Unlock()
			log.Printf("[dash] session %s ffmpeg start failed: %v", id, err)
			return
		}
		if err := ytV.Start(); err != nil {
			_ = ff.Process.Kill()
			s.mu.Lock()
			s.errored = true
			s.mu.Unlock()
			log.Printf("[dash] session %s yt-dlp(video) start failed: %v", id, err)
			return
		}
		if err := ytA.Start(); err != nil {
			_ = ytV.Process.Kill()
			_ = ff.Process.Kill()
			s.mu.Lock()
			s.errored = true
			s.mu.Unlock()
			log.Printf("[dash] session %s yt-dlp(audio) start failed: %v", id, err)
			return
		}

		// When the downloads finish they close their FIFOs; ffmpeg then
		// finalizes the last segment + manifest.
		_ = ytV.Wait()
		_ = ytA.Wait()
		_ = ff.Wait()

		if _, statErr := os.Stat(mpdPath); statErr != nil {
			s.mu.Lock()
			s.errored = true
			s.mu.Unlock()
			log.Printf("[dash] session %s manifest missing", id)
			return
		}
		log.Printf("[dash] session %s finished", id)
	}()

	m.mu.Lock()
	m.sess[id] = s
	m.mu.Unlock()
	return s, nil
}

// CreateMp4 starts a self-hosted progressive-MP4 stream. Instead of generating a
// DASH manifest (which is fragile in the browser), it pipes YouTube's native
// video+audio streams through FIFOs into ffmpeg, which copies them into a
// fragmented MP4 written to stdout. The HTTP handler streams those bytes straight
// to the client, so playback starts within a few seconds (empty_moov puts the moov
// atom at the front). The client decodes with a plain <video> element — no
// shaka/dash.js needed.
func (m *StreamManager) CreateMp4(videoID string, heightCap int, forceAvc1 bool) (*StreamSession, error) {
	id := randID()
	dir := filepath.Join(m.root, id)
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return nil, err
	}

	s := &StreamSession{
		ID:         id,
		Dir:        dir,
		CreatedAt:  time.Now(),
		LastAccess: time.Now(),
	}
	urlStr := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	videoPipe := filepath.Join(dir, "video.pipe")
	audioPipe := filepath.Join(dir, "audio.pipe")

	const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	videoSel := "bestvideo"
	if heightCap > 0 {
		videoSel = fmt.Sprintf("bestvideo[height<=%d]", heightCap)
	}
	videoFmt := videoSel
	if forceAvc1 {
		videoFmt = videoSel + "[vcodec^=avc1]"
	}
	audioFmt := "bestaudio[acodec^=mp4a]/bestaudio"

	if err := syscall.Mkfifo(videoPipe, 0o600); err != nil {
		return nil, err
	}
	if err := syscall.Mkfifo(audioPipe, 0o600); err != nil {
		os.Remove(videoPipe)
		return nil, err
	}

	go func() {
		defer func() {
			s.mu.Lock()
			s.done = true
			s.mu.Unlock()
			os.Remove(videoPipe)
			os.Remove(audioPipe)
		}()

		// Try YouTube player clients in order so a "confirm you're not a bot"
		// gate on the default (web) client is bypassed automatically — the same
		// fallback the metadata fetchers already use. Without this, the streaming
		// pipeline gets blocked while info lookups succeed.
		clientArgs := []string{"--extractor-args", "youtube:player_client=web,android,tv,ios,web_safari"}

		ytV := exec.Command(ytDlpBinPath,
			"--no-warnings", "--quiet", "--force-ipv4", "--no-playlist",
			"--user-agent", ua,
			clientArgs[0], clientArgs[1],
			"-f", videoFmt,
			"-o", videoPipe,
			urlStr,
		)
		ytA := exec.Command(ytDlpBinPath,
			"--no-warnings", "--quiet", "--force-ipv4", "--no-playlist",
			"--user-agent", ua,
			clientArgs[0], clientArgs[1],
			"-f", audioFmt,
			"-o", audioPipe,
			urlStr,
		)
		ytV.Args = appendYtDlpCookies(ytV.Args)
		ytA.Args = appendYtDlpCookies(ytA.Args)

		ff := exec.Command("ffmpeg",
			"-i", videoPipe,
			"-i", audioPipe,
			"-c", "copy",
			"-movflags", "+frag_keyframe+empty_moov",
			"-f", "mp4",
			"-",
		)

		ytVLog, _ := os.Create(filepath.Join(dir, "yt-video.log"))
		ytALog, _ := os.Create(filepath.Join(dir, "yt-audio.log"))
		ffLog, _ := os.Create(filepath.Join(dir, "ffmpeg-mp4.log"))
		defer ytVLog.Close()
		defer ytALog.Close()
		defer ffLog.Close()
		ytV.Stderr = ytVLog
		ytA.Stderr = ytALog
		ff.Stderr = ffLog

		mp4Pipe, perr := ff.StdoutPipe()
		if perr != nil {
			s.mu.Lock()
			s.errored = true
			s.mu.Unlock()
			log.Printf("[mp4] session %s stdout pipe failed: %v", id, perr)
			return
		}

		s.mu.Lock()
		s.ytCmd = ytV
		s.ffCmd = ff
		s.mp4Out = mp4Pipe
		s.mu.Unlock()

		if err := ff.Start(); err != nil {
			s.mu.Lock()
			s.errored = true
			s.mu.Unlock()
			log.Printf("[mp4] session %s ffmpeg start failed: %v", id, err)
			return
		}
		if err := ytV.Start(); err != nil {
			_ = ff.Process.Kill()
			s.mu.Lock()
			s.errored = true
			s.mu.Unlock()
			log.Printf("[mp4] session %s yt-dlp(video) start failed: %v", id, err)
			return
		}
		if err := ytA.Start(); err != nil {
			_ = ytV.Process.Kill()
			_ = ff.Process.Kill()
			s.mu.Lock()
			s.errored = true
			s.mu.Unlock()
			log.Printf("[mp4] session %s yt-dlp(audio) start failed: %v", id, err)
			return
		}

		_ = ytV.Wait()
		_ = ytA.Wait()
		_ = ff.Wait()

		s.mu.Lock()
		s.mp4Out = nil
		s.mu.Unlock()
		log.Printf("[mp4] session %s finished", id)
	}()

	m.mu.Lock()
	m.sess[id] = s
	m.mu.Unlock()
	return s, nil
}

// WaitMp4Out waits up to timeout for ffmpeg's MP4 stdout to be ready, returning
// the reader when streaming can begin, or nil if the session errored/timed out.
func (s *StreamSession) WaitMp4Out(timeout time.Duration) io.ReadCloser {
	deadline := time.Now().Add(timeout)
	for {
		s.mu.Lock()
		out := s.mp4Out
		errored := s.errored
		s.mu.Unlock()
		if out != nil {
			return out
		}
		if errored {
			return nil
		}
		if time.Now().After(deadline) {
			return nil
		}
		time.Sleep(100 * time.Millisecond)
	}
}

// buildStreamFormat selects the merge format. By default it allows VP9/AV1 video
// so we reach 1440p/2160p (true 4K); audio is AAC for compatibility. When
// forceAvc1 is set (Safari/iOS), it restricts to H.264 (caps at 1080p there,
// since those browsers can't play AV1/VP9 in fMP4 HLS).
func buildStreamFormat(cap int, forceAvc1 bool) string {
	videoSel := "bestvideo"
	if cap > 0 {
		videoSel = fmt.Sprintf("bestvideo[height<=%d]", cap)
	}
	if forceAvc1 {
		return fmt.Sprintf("%s[vcodec^=avc1]+bestaudio[acodec^=mp4a]/%s[vcodec^=avc1]+bestaudio/best[ext=mp4]", videoSel, videoSel)
	}
	return fmt.Sprintf("%s+bestaudio[acodec^=mp4a]/%s+bestaudio/best", videoSel, videoSel)
}

// IsDone reports whether generation finished and whether it errored.
func (s *StreamSession) IsDone() (done bool, errored bool) {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.done, s.errored
}

// reap periodically removes stale sessions and kills their processes.
func (m *StreamManager) reap() {
	ticker := time.NewTicker(5 * time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		m.mu.Lock()
		now := time.Now()
		for id, s := range m.sess {
			done, _ := s.IsDone()
			age := now.Sub(s.CreatedAt)
			idle := now.Sub(s.LastAccess)
			// Remove finished sessions idle for >15 min, or any session >2h old.
			if (done && idle > 15*time.Minute) || age > 2*time.Hour {
				s.kill()
				_ = os.RemoveAll(s.Dir)
				delete(m.sess, id)
				log.Printf("[stream] reaped session %s", id)
			}
		}
		m.mu.Unlock()
	}
}

func (s *StreamSession) kill() {
	s.mu.Lock()
	defer s.mu.Unlock()
	if s.ytCmd != nil && s.ytCmd.Process != nil {
		_ = s.ytCmd.Process.Kill()
	}
	if s.ffCmd != nil && s.ffCmd.Process != nil {
		_ = s.ffCmd.Process.Kill()
	}
}

// Stop kills and removes a session by id.
func (m *StreamManager) Stop(id string) {
	m.mu.Lock()
	s, ok := m.sess[id]
	if ok {
		delete(m.sess, id)
	}
	m.mu.Unlock()
	if ok {
		s.kill()
		_ = os.RemoveAll(s.Dir)
	}
}
