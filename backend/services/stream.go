package services

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sync"
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
	format := buildStreamFormat(heightCap, forceAvc1)
	mergedPath := filepath.Join(dir, "merged.mp4")
	playlistPath := filepath.Join(dir, "index.m3u8")

	// Two-stage pipeline (fMP4 HLS can't be produced from a non-seekable pipe):
	// 1) yt-dlp downloads the best video+audio and merges them into a single file.
	// 2) ffmpeg segments that file into fragmented-MP4 HLS (carries VP9/AV1 + AAC,
	//    enabling true 1440p/2160p). This runs asynchronously; the playlist file
	//    appears once segmentation starts, and the route waits for it.
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

	s.mergedPath = mergedPath
	s.playlistPath = playlistPath

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
