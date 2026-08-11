package services

import (
	"bufio"
	"crypto/md5"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"regexp"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/creack/pty"
)

var qualityFormats = map[string]string{
	"low":         "bestvideo[height<=360][ext=mp4]+bestaudio[ext=m4a]/best[height<=360][ext=mp4]/best",
	"recommended": "bestvideo[height<=1080][ext=mp4]+bestaudio[ext=m4a]/best[height<=1080][ext=mp4]/best",
	"best":        "bestvideo+bestaudio/best",
}

type DownloadEvent struct {
	Type     string  `json:"type"`
	Percent  float64 `json:"percent,omitempty"`
	Speed    string  `json:"speed,omitempty"`
	ETA      string  `json:"eta,omitempty"`
	Filename string  `json:"filename,omitempty"`
	Size     int64   `json:"size,omitempty"`
	Message  string  `json:"message,omitempty"`
}

type downloadJob struct {
	key     string
	videoID string
	quality string

	mu       sync.RWMutex
	status   string
	progress float64
	speed    string
	eta      string
	filePath string
	filename string
	fileSize int64
	errorMsg string
	done     chan struct{}
	subs     []chan DownloadEvent
}

type cacheEntry struct {
	filePath  string
	filename  string
	size      int64
	expiresAt time.Time
}

type DownloadManager struct {
	mu       sync.Mutex
	jobs     map[string]*downloadJob
	cache    map[string]*cacheEntry
	cacheDir string
	ttl      time.Duration
}

var (
	downloadManager *DownloadManager
	downloadOnce    sync.Once
)

func GetDownloadManager() *DownloadManager {
	downloadOnce.Do(func() {
		cacheDir := filepath.Join(os.TempDir(), "kv-tube-downloads")
		os.MkdirAll(cacheDir, 0755)
		downloadManager = &DownloadManager{
			jobs:     make(map[string]*downloadJob),
			cache:    make(map[string]*cacheEntry),
			cacheDir: cacheDir,
			ttl:      30 * time.Minute,
		}
		go downloadManager.cleanupLoop()
	})
	return downloadManager
}

func (dm *DownloadManager) jobKey(videoID, quality string) string {
	raw := videoID + ":" + quality
	return fmt.Sprintf("%x", md5.Sum([]byte(raw)))
}

func (dm *DownloadManager) SubscribeSSE(videoID, quality string) (<-chan []byte, error) {
	eventCh, err := dm.Subscribe(videoID, quality)
	if err != nil {
		return nil, err
	}
	out := make(chan []byte, 64)
	go func() {
		defer close(out)
		for event := range eventCh {
			data, _ := json.Marshal(event)
			out <- data
		}
	}()
	return out, nil
}

func (dm *DownloadManager) Subscribe(videoID, quality string) (<-chan DownloadEvent, error) {
	key := dm.jobKey(videoID, quality)
	ch := make(chan DownloadEvent, 64)

	dm.mu.Lock()

	if entry, ok := dm.cache[key]; ok && time.Now().Before(entry.expiresAt) {
		dm.mu.Unlock()
		ch <- DownloadEvent{Type: "complete", Filename: entry.filename, Size: entry.size}
		close(ch)
		return ch, nil
	}

	job, exists := dm.jobs[key]
	if !exists {
		job = &downloadJob{
			key:     key,
			videoID: videoID,
			quality: quality,
			status:  "starting",
			done:    make(chan struct{}),
		}
		dm.jobs[key] = job
		dm.mu.Unlock()

		ch <- DownloadEvent{Type: "progress", Percent: 0, Message: "Starting download..."}
		job.mu.Lock()
		job.subs = append(job.subs, ch)
		job.mu.Unlock()

		go dm.runDownload(job)
		return ch, nil
	}

	job.mu.Lock()
	job.subs = append(job.subs, ch)
	job.mu.Unlock()
	dm.mu.Unlock()

	job.mu.RLock()
	status := job.status
	progress := job.progress
	speed := job.speed
	eta := job.eta
	errorMsg := job.errorMsg
	filename := job.filename
	fileSize := job.fileSize
	job.mu.RUnlock()

	switch status {
	case "downloading":
		ch <- DownloadEvent{Type: "progress", Percent: progress, Speed: speed, ETA: eta, Message: fmt.Sprintf("Downloading... %.1f%%", progress)}
	case "merging":
		ch <- DownloadEvent{Type: "merging"}
	case "complete":
		ch <- DownloadEvent{Type: "complete", Filename: filename, Size: fileSize}
		close(ch)
	case "error":
		ch <- DownloadEvent{Type: "error", Message: errorMsg}
		close(ch)
	}

	return ch, nil
}

var downloadProgressRe = regexp.MustCompile(`\[download\]\s+(\d+\.?\d*)%`)
var downloadMergeRe = regexp.MustCompile(`\[Merger\]`)
var ansiRe = regexp.MustCompile(`\x1b\[[0-9;]*[A-Za-z]`)

func (dm *DownloadManager) runDownload(job *downloadJob) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", job.videoID)

	tmpDir, err := os.MkdirTemp(dm.cacheDir, "dl-*")
	if err != nil {
		job.mu.Lock()
		job.status = "error"
		job.errorMsg = fmt.Sprintf("Failed to create temp dir: %v", err)
		job.mu.Unlock()
		dm.broadcast(job, DownloadEvent{Type: "error", Message: job.errorMsg})
		dm.closeSubs(job)
		return
	}

	formatStr := qualityFormats[job.quality]
	if formatStr == "" {
		formatStr = qualityFormats["recommended"]
	}

	outputTmpl := filepath.Join(tmpDir, "%(title)s.%(ext)s")

	args := []string{
		"--format", formatStr,
		"--merge-output-format", "mp4",
		"--output", outputTmpl,
		"--no-playlist",
		"--no-warnings",
		"--force-ipv4",
		"--newline",
		"--no-colors",
	}
	args = appendYtDlpOpts(args)
	args = append(args, url)

	cmd := exec.Command(ytDlpBinPath, args...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	log.Printf("[download] Starting yt-dlp for %s (quality=%s)", job.videoID, job.quality)

	// yt-dlp suppresses progress output unless it is attached to a terminal.
	// Run it inside a pseudo-terminal (pty) so the progress bar is emitted,
	// then parse the combined pty stream for [download] percentage lines.
	ptmx, err := pty.Start(cmd)
	if err != nil {
		// Fallback: run without a pty. Progress will not be reported, but the
		// download still completes and the result is served.
		log.Printf("[download] pty.Start failed for %s: %v (falling back to direct exec)", job.videoID, err)
		// pty.Start assigns cmd.Stdin/Stdout/Stderr to the tty, replaces
		// SysProcAttr, and calls cmd.Start() before returning, so the cmd is
		// left in a partially-started state (Process set) even on failure.
		// Reap any spawned zombie, then use a fresh command for the fallback.
		if cmd.Process != nil {
			go func() { _ = cmd.Wait() }()
		}
		cmd = exec.Command(ytDlpBinPath, args...)
		cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}
		stderr, perr := cmd.StderrPipe()
		if perr != nil {
			job.mu.Lock()
			job.status = "error"
			job.errorMsg = fmt.Sprintf("Failed to start yt-dlp: %v", perr)
			job.mu.Unlock()
			dm.broadcast(job, DownloadEvent{Type: "error", Message: job.errorMsg})
			dm.closeSubs(job)
			return
		}
		if perr := cmd.Start(); perr != nil {
			job.mu.Lock()
			job.status = "error"
			job.errorMsg = fmt.Sprintf("Failed to start yt-dlp: %v", perr)
			job.mu.Unlock()
			dm.broadcast(job, DownloadEvent{Type: "error", Message: job.errorMsg})
			dm.closeSubs(job)
			return
		}
		go func() {
			scanner := bufio.NewScanner(stderr)
			for scanner.Scan() {
				line := ansiRe.ReplaceAllString(scanner.Text(), "")
				if downloadMergeRe.MatchString(line) {
					job.mu.Lock()
					job.status = "merging"
					job.mu.Unlock()
					dm.broadcast(job, DownloadEvent{Type: "merging"})
				}
			}
		}()
		err = downloadWaitWithTimeout(cmd, 30*time.Minute)
	} else {
		defer ptmx.Close()

		job.mu.Lock()
		job.status = "downloading"
		job.mu.Unlock()

		go func() {
			scanner := bufio.NewScanner(ptmx)
			lineCount := 0
			for scanner.Scan() {
				line := ansiRe.ReplaceAllString(scanner.Text(), "")
				lineCount++

				if downloadMergeRe.MatchString(line) {
					log.Printf("[download] Merge phase for %s", job.videoID)
					job.mu.Lock()
					job.status = "merging"
					job.mu.Unlock()
					dm.broadcast(job, DownloadEvent{Type: "merging"})
					continue
				}

				matches := downloadProgressRe.FindStringSubmatch(line)
				if len(matches) >= 2 {
					percent := parseFloat(matches[1])
					speed, eta := parseSpeedETA(line)
					job.mu.Lock()
					job.progress = percent
					job.speed = speed
					job.eta = eta
					job.mu.Unlock()
					dm.broadcast(job, DownloadEvent{
						Type:    "progress",
						Percent: percent,
						Speed:   speed,
						ETA:     eta,
						Message: fmt.Sprintf("Downloading... %.1f%%", percent),
					})
				}
			}
			log.Printf("[download] pty scanner finished for %s (read %d lines, err=%v)", job.videoID, lineCount, scanner.Err())
		}()

		err = downloadWaitWithTimeout(cmd, 30*time.Minute)
	}

	log.Printf("[download] yt-dlp finished for %s (err=%v)", job.videoID, err)
	if err != nil {
		job.mu.Lock()
		job.status = "error"
		job.errorMsg = fmt.Sprintf("yt-dlp failed: %v", err)
		job.mu.Unlock()
		dm.broadcast(job, DownloadEvent{Type: "error", Message: job.errorMsg})
		dm.closeSubs(job)
		return
	}

	var mp4File string
	filepath.Walk(tmpDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || mp4File != "" {
			return nil
		}
		if !info.IsDir() && strings.HasSuffix(info.Name(), ".mp4") {
			mp4File = path
		}
		return nil
	})

	if mp4File == "" {
		job.mu.Lock()
		job.status = "error"
		job.errorMsg = "No output mp4 file generated"
		job.mu.Unlock()
		dm.broadcast(job, DownloadEvent{Type: "error", Message: job.errorMsg})
		dm.closeSubs(job)
		return
	}

	fi, err := os.Stat(mp4File)
	if err != nil {
		job.mu.Lock()
		job.status = "error"
		job.errorMsg = fmt.Sprintf("Failed to stat output file: %v", err)
		job.mu.Unlock()
		dm.broadcast(job, DownloadEvent{Type: "error", Message: job.errorMsg})
		dm.closeSubs(job)
		return
	}
	filename := filepath.Base(mp4File)

	job.mu.Lock()
	job.status = "complete"
	job.filePath = mp4File
	job.filename = filename
	job.fileSize = fi.Size()
	job.mu.Unlock()

	dm.mu.Lock()
	dm.cache[job.key] = &cacheEntry{
		filePath:  mp4File,
		filename:  filename,
		size:      fi.Size(),
		expiresAt: time.Now().Add(dm.ttl),
	}
	dm.mu.Unlock()

	log.Printf("[download] Complete for %s: %s (%d bytes)", job.videoID, filename, fi.Size())
	dm.broadcast(job, DownloadEvent{
		Type:     "complete",
		Filename: filename,
		Size:     fi.Size(),
	})
	dm.closeSubs(job)
}

func (dm *DownloadManager) broadcast(job *downloadJob, event DownloadEvent) {
	job.mu.RLock()
	subs := make([]chan DownloadEvent, len(job.subs))
	copy(subs, job.subs)
	job.mu.RUnlock()

	for _, ch := range subs {
		select {
		case ch <- event:
		default:
		}
	}
}

func (dm *DownloadManager) closeSubs(job *downloadJob) {
	job.mu.Lock()
	defer job.mu.Unlock()
	for _, ch := range job.subs {
		close(ch)
	}
	job.subs = nil
}

func (dm *DownloadManager) GetCachedFile(videoID, quality string) (string, string, int64, bool) {
	key := dm.jobKey(videoID, quality)
	dm.mu.Lock()
	defer dm.mu.Unlock()

	entry, ok := dm.cache[key]
	if !ok || time.Now().After(entry.expiresAt) {
		return "", "", 0, false
	}

	if _, err := os.Stat(entry.filePath); os.IsNotExist(err) {
		delete(dm.cache, key)
		return "", "", 0, false
	}

	return entry.filePath, entry.filename, entry.size, true
}

func (dm *DownloadManager) cleanupLoop() {
	ticker := time.NewTicker(5 * time.Minute)
	for range ticker.C {
		dm.mu.Lock()
		for key, entry := range dm.cache {
			if time.Now().After(entry.expiresAt) {
				os.RemoveAll(filepath.Dir(entry.filePath))
				delete(dm.cache, key)
			}
		}
		for key, job := range dm.jobs {
			job.mu.RLock()
			done := job.status == "complete" || job.status == "error"
			job.mu.RUnlock()
			if done {
				delete(dm.jobs, key)
			}
		}
		dm.mu.Unlock()
	}
}

func parseFloat(s string) float64 {
	var v float64
	fmt.Sscanf(s, "%f", &v)
	return v
}

func parseSpeedETA(line string) (string, string) {
	speed := ""
	eta := ""

	if idx := strings.Index(line, " at "); idx >= 0 {
		rest := line[idx+4:]
		if end := strings.Index(rest, " "); end >= 0 {
			speed = rest[:end]
		}
	}

	if idx := strings.Index(line, " ETA "); idx >= 0 {
		eta = strings.TrimSpace(line[idx+5:])
	}

	return speed, eta
}

// downloadWaitWithTimeout waits for a command to finish, killing its process group if it
// exceeds the given timeout.
func downloadWaitWithTimeout(cmd *exec.Cmd, timeout time.Duration) error {
	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case err := <-done:
		return err
	case <-time.After(timeout):
		if cmd.Process != nil && cmd.Process.Pid > 0 {
			log.Printf("[download] Process timed out after %v, killing process group for PID %d", timeout, cmd.Process.Pid)
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
		<-done
		return fmt.Errorf("download timed out after %v", timeout)
	}
}
