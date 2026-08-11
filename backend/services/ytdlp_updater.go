package services

import (
	"context"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"sync"
	"time"
)

const (
	ytDlpUpdateInterval   = 24 * time.Hour
	ytDlpUpdateDelay      = 1 * time.Minute
	ytDlpUpdateTimeout    = 5 * time.Minute
	ytDlpNightlyUpdateURL = "https://github.com/yt-dlp/yt-dlp-nightly-builds/releases/latest/download/yt-dlp"
)

// StartYtDlpUpdater keeps yt-dlp on the latest nightly build. It runs once
// shortly after startup and then every 24 hours, so the binary stays fresh
// without requiring an image rebuild. Set YTDLP_AUTO_UPDATE=false to disable.
func StartYtDlpUpdater() {
	if strings.EqualFold(os.Getenv("YTDLP_AUTO_UPDATE"), "false") {
		log.Printf("[ytdlp-updater] Auto-update disabled (YTDLP_AUTO_UPDATE=false)")
		return
	}

	go func() {
		time.Sleep(ytDlpUpdateDelay)
		for {
			runYtDlpUpdate()
			time.Sleep(ytDlpUpdateInterval)
		}
	}()
}

var (
	ytDlpUpdateMu    sync.Mutex
	ytDlpLastUpdated time.Time
)

// UpdateYtDlpNow manually triggers a yt-dlp nightly update, returning the
// before/after versions and any error. Safe to call concurrently with the
// background updater; a second concurrent call blocks until the first ends.
func UpdateYtDlpNow() (before, after string, err error) {
	ytDlpUpdateMu.Lock()
	defer ytDlpUpdateMu.Unlock()

	before = YtDlpVersion()
	if err = updateYtDlpSelf(); err == nil {
		after = YtDlpVersion()
		ytDlpLastUpdated = time.Now()
		logYtDlpUpdateResult(before, after, "self-update")
		return before, after, nil
	}
	if err = updateYtDlpDirect(); err == nil {
		after = YtDlpVersion()
		ytDlpLastUpdated = time.Now()
		logYtDlpUpdateResult(before, after, "direct download")
		return before, after, nil
	}
	return before, "", err
}

// YtDlpLastUpdateAt returns the timestamp of the last successful yt-dlp
// update, formatted as RFC3339, or "" if no update has run yet.
func YtDlpLastUpdateAt() string {
	if ytDlpLastUpdated.IsZero() {
		return ""
	}
	return ytDlpLastUpdated.Format(time.RFC3339)
}

// YtDlpVersion returns the currently installed yt-dlp version string.
func YtDlpVersion() string {
	out, err := exec.Command(ytDlpBinPath, "--version").CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

// YtDlpUpdateEnabled reports whether automatic yt-dlp updates are enabled.
func YtDlpUpdateEnabled() bool {
	return !strings.EqualFold(os.Getenv("YTDLP_AUTO_UPDATE"), "false")
}

// runYtDlpUpdate updates yt-dlp to the latest nightly build, logging the
// result. Update failures are non-fatal: the server keeps running and retries
// on the next interval.
func runYtDlpUpdate() {
	before := ytDlpVersion()
	log.Printf("[ytdlp-updater] Checking for yt-dlp update (current: %s)", before)

	if err := updateYtDlpSelf(); err == nil {
		after := ytDlpVersion()
		logYtDlpUpdateResult(before, after, "self-update")
		return
	}

	// Some installs (e.g. pip-based ones) cannot self-update to the nightly
	// channel. Fall back to replacing the binary with the latest nightly
	// standalone build, which works everywhere.
	if err := updateYtDlpDirect(); err == nil {
		after := ytDlpVersion()
		logYtDlpUpdateResult(before, after, "direct download")
		return
	}

	log.Printf("[ytdlp-updater] yt-dlp update failed")
}

func logYtDlpUpdateResult(before, after, method string) {
	switch {
	case after == "":
		log.Printf("[ytdlp-updater] yt-dlp update via %s finished (version unknown)", method)
	case after != before:
		log.Printf("[ytdlp-updater] yt-dlp updated via %s: %s -> %s", method, before, after)
	default:
		log.Printf("[ytdlp-updater] yt-dlp is up to date (%s)", after)
	}
}

// updateYtDlpSelf runs yt-dlp's own updater pinned to the nightly channel.
func updateYtDlpSelf() error {
	ctx, cancel := context.WithTimeout(context.Background(), ytDlpUpdateTimeout)
	defer cancel()

	out, err := exec.CommandContext(ctx, ytDlpBinPath, "--update-to", "nightly").CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			log.Printf("[ytdlp-updater] yt-dlp self-update timed out after %v", ytDlpUpdateTimeout)
		} else {
			log.Printf("[ytdlp-updater] yt-dlp self-update failed: %v (%s)", err, strings.TrimSpace(string(out)))
		}
		return err
	}
	return nil
}

// updateYtDlpDirect downloads the latest nightly standalone binary and
// atomically replaces the currently resolved yt-dlp binary with it.
func updateYtDlpDirect() error {
	binPath, err := exec.LookPath(ytDlpBinPath)
	if err != nil {
		binPath = ytDlpBinPath
	}
	if resolved, rerr := filepath.EvalSymlinks(binPath); rerr == nil {
		binPath = resolved
	}

	tmpFile, err := os.CreateTemp(filepath.Dir(binPath), ".yt-dlp-update-*")
	if err != nil {
		log.Printf("[ytdlp-updater] direct download: cannot create temp file: %v", err)
		return err
	}
	tmpPath := tmpFile.Name()
	defer os.Remove(tmpPath)

	client := &http.Client{Timeout: ytDlpUpdateTimeout}
	resp, err := client.Get(ytDlpNightlyUpdateURL)
	if err != nil {
		tmpFile.Close()
		log.Printf("[ytdlp-updater] direct download: %v", err)
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		tmpFile.Close()
		log.Printf("[ytdlp-updater] direct download: unexpected status %d", resp.StatusCode)
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}

	if _, err := io.Copy(tmpFile, resp.Body); err != nil {
		tmpFile.Close()
		log.Printf("[ytdlp-updater] direct download: %v", err)
		return err
	}
	if err := tmpFile.Close(); err != nil {
		log.Printf("[ytdlp-updater] direct download: %v", err)
		return err
	}
	if err := os.Chmod(tmpPath, 0755); err != nil {
		log.Printf("[ytdlp-updater] direct download: %v", err)
		return err
	}
	if err := os.Rename(tmpPath, binPath); err != nil {
		log.Printf("[ytdlp-updater] direct download: cannot replace %s: %v", binPath, err)
		return err
	}
	log.Printf("[ytdlp-updater] direct download: replaced %s with latest nightly", binPath)
	return nil
}

func ytDlpVersion() string {
	out, err := exec.Command(ytDlpBinPath, "--version").CombinedOutput()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}
