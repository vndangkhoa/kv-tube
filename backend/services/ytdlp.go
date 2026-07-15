package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"kvtube-go/models"
)

const channelVideosCacheTTL = 30 * time.Minute

var ytDlpBinPath string

func init() {
	ytDlpBinPath = resolveYtDlpBinPath()
}

func resolveYtDlpBinPath() string {
	// Check if yt-dlp is in PATH
	if _, err := exec.LookPath("yt-dlp"); err == nil {
		return "yt-dlp"
	}

	fallbacks := []string{
		os.ExpandEnv("$HOME/Library/Python/3.14/bin/yt-dlp"),
		os.ExpandEnv("$HOME/Library/Python/3.13/bin/yt-dlp"),
		os.ExpandEnv("$HOME/Library/Python/3.12/bin/yt-dlp"),
		os.ExpandEnv("$HOME/Library/Python/3.11/bin/yt-dlp"),
		os.ExpandEnv("$HOME/.local/bin/yt-dlp"),
		"/usr/local/bin/yt-dlp",
		"/opt/homebrew/bin/yt-dlp",
	}

	for _, fb := range fallbacks {
		if _, err := os.Stat(fb); err == nil {
			return fb
		}
	}

	// Default fallback
	return "yt-dlp"
}

type VideoData struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Uploader    string `json:"uploader"`
	ChannelID   string `json:"channel_id"`
	UploaderID  string `json:"uploader_id"`
	Thumbnail   string `json:"thumbnail"`
	ViewCount   int64  `json:"view_count"`
	UploadDate  string `json:"upload_date"`
	Duration    string `json:"duration"`
	Description string `json:"description"`
	WatchedAt   string `json:"watched_at,omitempty"`
	StreamURL   string `json:"stream_url,omitempty"`
}

type VideoFormat struct {
	FormatID   string `json:"format_id"`
	FormatNote string `json:"format_note"`
	Ext        string `json:"ext"`
	Resolution string `json:"resolution"`
	Filesize   int64  `json:"filesize"`
	VCodec     string `json:"vcodec"`
	ACodec     string `json:"acodec"`
	Type       string `json:"type"` // "video", "audio", or "both"
}

type YtDlpEntry struct {
	ID          string      `json:"id"`
	Title       string      `json:"title"`
	Uploader    string      `json:"uploader"`
	Channel     string      `json:"channel"`
	ChannelID   string      `json:"channel_id"`
	UploaderID  string      `json:"uploader_id"`
	ViewCount   int64       `json:"view_count"`
	UploadDate  string      `json:"upload_date"`
	Duration    interface{} `json:"duration"` // Can be float64 or int
	Description string      `json:"description"`
	URL         string      `json:"url"`
}

func sanitizeVideoData(entry YtDlpEntry) VideoData {
	uploader := entry.Uploader
	if uploader == "" {
		uploader = entry.Channel
	}
	if uploader == "" {
		uploader = "Unknown"
	}

	var durationStr string
	if d, ok := entry.Duration.(float64); ok && d > 0 {
		hours := int(d) / 3600
		mins := (int(d) % 3600) / 60
		secs := int(d) % 60
		if hours > 0 {
			durationStr = fmt.Sprintf("%d:%02d:%02d", hours, mins, secs)
		} else {
			durationStr = fmt.Sprintf("%d:%02d", mins, secs)
		}
	}

	thumbnail := ""
	if entry.ID != "" {
		// Use hqdefault.jpg which is more reliably available than maxresdefault.jpg
		thumbnail = fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", entry.ID)
	}

	return VideoData{
		ID:          entry.ID,
		Title:       entry.Title,
		Uploader:    uploader,
		ChannelID:   entry.ChannelID,
		UploaderID:  entry.UploaderID,
		Thumbnail:   thumbnail,
		ViewCount:   entry.ViewCount,
		UploadDate:  entry.UploadDate,
		Duration:    durationStr,
		Description: entry.Description,
	}
}

// extractVideoID tries to extract a YouTube video ID from yt-dlp arguments
func extractVideoID(args []string) string {
	for _, arg := range args {
		// Look for 11-character video IDs (YouTube standard)
		if len(arg) == 11 {
			// Simple check: alphanumeric with underscore and dash
			isValid := true
			for _, c := range arg {
				if !((c >= 'a' && c <= 'z') || (c >= 'A' && c <= 'Z') || (c >= '0' && c <= '9') || c == '_' || c == '-') {
					isValid = false
					break
				}
			}
			if isValid {
				return arg
			}
		}

		// Extract from YouTube URL patterns
		if strings.Contains(arg, "youtube.com") || strings.Contains(arg, "youtu.be") {
			// Simple regex for video ID in URL
			if idx := strings.Index(arg, "v="); idx != -1 {
				id := arg[idx+2:]
				if len(id) >= 11 {
					return id[:11]
				}
			}
			// youtu.be/ID
			if idx := strings.LastIndex(arg, "/"); idx != -1 {
				id := arg[idx+1:]
				if len(id) >= 11 {
					return id[:11]
				}
			}
		}
	}
	return ""
}

// RunYtDlpCached executes yt-dlp with caching
func RunYtDlpCached(cacheKey string, ttlSeconds int, args ...string) ([]byte, error) {
	// Try to get from cache first
	if cachedData, err := models.GetCachedVideo(cacheKey); err == nil && cachedData != nil {
		return cachedData, nil
	}

	// Execute yt-dlp
	data, err := RunYtDlp(args...)
	if err != nil {
		return nil, err
	}

	// Store in cache (ignore cache errors). Never cache empty output so a
	// transient bot-check/failure doesn't poison the cache with "null".
	if cacheKey != "" && len(bytes.TrimSpace(data)) > 0 {
		_ = models.SetCachedVideo(cacheKey, string(data), ttlSeconds)
	}

	return data, nil
}

// IsBotCheckError reports whether yt-dlp's stderr indicates YouTube's
// "confirm you're not a bot" gate, which can usually be bypassed by
// switching to an alternate player client.
func IsBotCheckError(stderr string) bool {
	s := strings.ToLower(stderr)
	return strings.Contains(s, "not a bot") ||
		strings.Contains(s, "sign in to confirm") ||
		strings.Contains(s, "confirm you")
}

// ytDlpCookieArgs returns cookie arguments for yt-dlp derived from the
// environment. Set YTDLP_COOKIES to a Netscape/cookies.txt file path, or
// YTDLP_COOKIES_FROM_BROWSER to a browser name (e.g. "chrome") to export
// cookies from a local browser. This is required to bypass YouTube's
// "confirm you're not a bot" gate when the server's IP is rate-limited.
func ytDlpCookieArgs() []string {
	if p := os.Getenv("YTDLP_COOKIES"); p != "" {
		if _, err := os.Stat(p); err == nil {
			return []string{"--cookies", p}
		}
		log.Printf("[ytdlp] YTDLP_COOKIES file not found: %s", p)
	}
	if b := os.Getenv("YTDLP_COOKIES_FROM_BROWSER"); b != "" {
		return []string{"--cookies-from-browser", b}
	}
	return nil
}

// appendYtDlpCookies adds any configured cookie arguments to a yt-dlp arg list.
func appendYtDlpCookies(args []string) []string {
	if c := ytDlpCookieArgs(); c != nil {
		return append(args, c...)
	}
	return args
}

// runYtDlpArgs runs yt-dlp with the exact given argument list.
func runYtDlpArgs(cmdArgs []string) ([]byte, string, error) {
	cmd := exec.Command(ytDlpBinPath, appendYtDlpCookies(cmdArgs)...)

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	return out.Bytes(), stderr.String(), err
}

// RunYtDlp securely executes yt-dlp with the given arguments and returns JSON output.
// If YouTube's bot-check is hit, it retries once with the android player client,
// which is not subject to the same gate.
func RunYtDlp(args ...string) ([]byte, error) {
	base := []string{
		"--dump-json",
		"--no-warnings",
		"--quiet",
		"--force-ipv4",
		"--ignore-errors",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	}
	return runYtDlpWithBase(base, args...)
}

// RunYtDlpSingleJSON runs yt-dlp expecting a single JSON document (for use with
// -J / --dump-single-json). It omits --dump-json, which would otherwise emit
// one object per entry and corrupt single-JSON output.
func RunYtDlpSingleJSON(args ...string) ([]byte, error) {
	base := []string{
		"--no-warnings",
		"--quiet",
		"--force-ipv4",
		"--ignore-errors",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	}
	return runYtDlpWithBase(base, args...)
}

// runYtDlpWithBase runs yt-dlp with the given base flags, retrying across
// player clients when YouTube's bot-check gate returns empty output.
func runYtDlpWithBase(base []string, args ...string) ([]byte, error) {
	// Player clients to try in order. Empty means yt-dlp's default. YouTube's
	// bot-check gates certain clients intermittently, and with --ignore-errors
	// yt-dlp exits 0 but returns empty output, so we treat empty output or a
	// bot-check message as a signal to fall back to the next client.
	clients := []string{"", "android", "tv", "ios", "web_safari"}

	var lastStderr string
	var lastErr error
	for _, client := range clients {
		cmdArgs := append([]string{}, base...)
		if client != "" {
			cmdArgs = append(cmdArgs, "--extractor-args", "youtube:player_client="+client)
		}
		cmdArgs = append(cmdArgs, args...)

		out, stderr, err := runYtDlpArgs(cmdArgs)

		// Success: usable output and no bot-check gate.
		if len(bytes.TrimSpace(out)) > 0 && !IsBotCheckError(stderr) {
			return out, nil
		}

		// Genuine empty result (no error, no bot-check): nothing to retry for.
		if err == nil && !IsBotCheckError(stderr) {
			return out, nil
		}

		if client == "" {
			log.Printf("yt-dlp default client failed (bot-check=%v, err=%v), falling back", IsBotCheckError(stderr), err)
		} else {
			log.Printf("yt-dlp client %q failed (bot-check=%v, err=%v), falling back", client, IsBotCheckError(stderr), err)
		}
		lastStderr = stderr
		lastErr = err
	}

	log.Printf("yt-dlp failed after all client fallbacks: %v, stderr: %s", lastErr, lastStderr)
	if lastErr != nil {
		return nil, lastErr
	}
	return nil, fmt.Errorf("yt-dlp returned no usable output (possible bot-check): %s", lastStderr)
}

func SearchVideos(query string, limit int) ([]VideoData, error) {
	searchQuery := fmt.Sprintf("ytsearch%d:%s", limit, query)

	// Cache flat search results for 30 minutes so repeat/category loads are instant.
	cacheKey := fmt.Sprintf("search:%d:%s", limit, query)
	out, err := RunYtDlpCached(cacheKey, 1800,
		"--flat-playlist",
		"--no-warnings",
		searchQuery,
	)
	if err != nil {
		return nil, err
	}

	var results []VideoData
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		var entry YtDlpEntry
		if err := json.Unmarshal([]byte(line), &entry); err == nil {
			if entry.ID != "" {
				results = append(results, sanitizeVideoData(entry))
			}
		}
	}

	return results, nil
}

func GetVideoInfo(videoID string) (*VideoData, error) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	args := []string{
		"--format", "bestvideo+bestaudio/best",
		"--skip-download",
		"--no-playlist",
		url,
	}

	// Skip cache for now to avoid corrupted data issues
	out, err := RunYtDlp(args...)
	if err != nil {
		log.Printf("yt-dlp failed for %s: %v", videoID, err)
		return nil, err
	}

	// Log first 500 chars for debugging
	if len(out) > 0 {
		log.Printf("yt-dlp response for %s (first 200 chars): %s", videoID, string(out[:min(200, len(out))]))
	}

	var entry YtDlpEntry
	if err := json.Unmarshal(out, &entry); err != nil {
		log.Printf("JSON unmarshal error for %s: %v", videoID, err)
		log.Printf("Raw response: %s", string(out[:min(500, len(out))]))
		return nil, fmt.Errorf("failed to parse video info: %w", err)
	}

	data := sanitizeVideoData(entry)
	data.StreamURL = entry.URL

	return &data, nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

type QualityFormat struct {
	FormatID   string `json:"format_id"`
	Label      string `json:"label"`
	Resolution string `json:"resolution"`
	Height     int    `json:"height"`
	URL        string `json:"url"`
	AudioURL   string `json:"audio_url,omitempty"`
	IsHLS      bool   `json:"is_hls"`
	VCodec     string `json:"vcodec"`
	ACodec     string `json:"acodec"`
	Filesize   int64  `json:"filesize"`
	HasAudio   bool   `json:"has_audio"`
}

func GetVideoQualities(videoID string) ([]QualityFormat, error) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	cmdArgs := []string{
		"--dump-json",
		"--no-warnings",
		"--quiet",
		"--force-ipv4",
		"--no-playlist",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		url,
	}

	cacheKey := "video_qualities:" + videoID
	out, err := RunYtDlpCached(cacheKey, 3600, cmdArgs...) // Cache for 1 hour
	if err != nil {
		return nil, err
	}

	var raw struct {
		Formats []struct {
			FormatID    string      `json:"format_id"`
			FormatNote  string      `json:"format_note"`
			Ext         string      `json:"ext"`
			Resolution  string      `json:"resolution"`
			Width       interface{} `json:"width"`
			Height      interface{} `json:"height"`
			URL         string      `json:"url"`
			ManifestURL string      `json:"manifest_url"`
			VCodec      string      `json:"vcodec"`
			ACodec      string      `json:"acodec"`
			Filesize    interface{} `json:"filesize"`
		} `json:"formats"`
	}

	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	var qualities []QualityFormat
	seen := make(map[int]int) // height -> index in qualities

	for _, f := range raw.Formats {
		if f.VCodec == "none" || f.URL == "" {
			continue
		}

		var height int
		switch v := f.Height.(type) {
		case float64:
			height = int(v)
		case int:
			height = v
		}

		if height == 0 {
			continue
		}

		hasAudio := f.ACodec != "none" && f.ACodec != ""

		var filesize int64
		switch v := f.Filesize.(type) {
		case float64:
			filesize = int64(v)
		case int64:
			filesize = v
		}

		isHLS := f.ManifestURL != "" || strings.Contains(f.URL, ".m3u8") || strings.Contains(f.URL, "manifest")

		label := f.FormatNote
		if label == "" {
			switch height {
			case 2160:
				label = "4K"
			case 1440:
				label = "1440p"
			case 1080:
				label = "1080p"
			case 720:
				label = "720p"
			case 480:
				label = "480p"
			case 360:
				label = "360p"
			default:
				label = fmt.Sprintf("%dp", height)
			}
		}

		streamURL := f.URL
		if f.ManifestURL != "" {
			streamURL = f.ManifestURL
		}

		qf := QualityFormat{
			FormatID:   f.FormatID,
			Label:      label,
			Resolution: f.Resolution,
			Height:     height,
			URL:        streamURL,
			IsHLS:      isHLS,
			VCodec:     f.VCodec,
			ACodec:     f.ACodec,
			Filesize:   filesize,
			HasAudio:   hasAudio,
		}

		// Prefer formats with audio, otherwise just add
		if idx, exists := seen[height]; exists {
			// Replace if this one has audio and the existing one doesn't
			if hasAudio && !qualities[idx].HasAudio {
				qualities[idx] = qf
			}
		} else {
			seen[height] = len(qualities)
			qualities = append(qualities, qf)
		}
	}

	// Sort by height descending
	sort.Slice(qualities, func(i, j int) bool {
		return qualities[i].Height > qualities[j].Height
	})

	return qualities, nil
}

func GetBestAudioURL(videoID string) (string, error) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	cmdArgs := []string{
		"--dump-json",
		"--no-warnings",
		"--quiet",
		"--force-ipv4",
		"--no-playlist",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		url,
	}

	binPath := "yt-dlp"
	if _, err := exec.LookPath("yt-dlp"); err != nil {
		fallbacks := []string{
			os.ExpandEnv("$HOME/.local/bin/yt-dlp"),
			"/usr/local/bin/yt-dlp",
			"/opt/homebrew/bin/yt-dlp",
			"/config/.local/bin/yt-dlp",
		}
		for _, fb := range fallbacks {
			if _, err := os.Stat(fb); err == nil {
				binPath = fb
				break
			}
		}
	}

	cmd := exec.Command(binPath, cmdArgs...)

	var out bytes.Buffer
	cmd.Stdout = &out

	if err := cmd.Run(); err != nil {
		return "", err
	}

	var raw struct {
		Formats []struct {
			FormatID   string      `json:"format_id"`
			URL        string      `json:"url"`
			VCodec     string      `json:"vcodec"`
			ACodec     string      `json:"acodec"`
			ABR        interface{} `json:"abr"`
			FormatNote string      `json:"format_note"`
		} `json:"formats"`
	}

	if err := json.Unmarshal(out.Bytes(), &raw); err != nil {
		return "", err
	}

	// Find best audio-only stream (prefer highest ABR)
	var bestAudio string
	var bestABR float64
	for _, f := range raw.Formats {
		if f.VCodec == "none" && f.ACodec != "none" && f.URL != "" {
			var abr float64
			switch v := f.ABR.(type) {
			case float64:
				abr = v
			case int:
				abr = float64(v)
			}
			if abr > bestABR {
				bestABR = abr
				bestAudio = f.URL
			}
		}
	}

	return bestAudio, nil
}

func GetVideoQualitiesWithAudio(videoID string) ([]QualityFormat, string, error) {
	qualities, err := GetVideoQualities(videoID)
	if err != nil {
		return nil, "", err
	}

	// Get best audio URL
	audioURL, err := GetBestAudioURL(videoID)
	if err != nil {
		log.Printf("Warning: could not get audio URL: %v", err)
	}

	// Attach audio URL to qualities without audio
	for i := range qualities {
		if !qualities[i].HasAudio && audioURL != "" {
			qualities[i].AudioURL = audioURL
		}
	}

	return qualities, audioURL, nil
}

// GetFullStreamData runs a single yt-dlp command to fetch all essential information at once
// This avoids doing 3 separate slow calls for video info, qualities, and best audio.
func GetFullStreamData(videoID string) (*VideoData, []QualityFormat, string, error) {
	urlStr := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	cmdArgs := []string{
		"--dump-json",
		"--no-warnings",
		"--quiet",
		"--force-ipv4",
		"--no-playlist",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		urlStr,
	}

	binPath := "yt-dlp"
	if _, err := exec.LookPath("yt-dlp"); err != nil {
		fallbacks := []string{
			os.ExpandEnv("$HOME/Library/Python/3.14/bin/yt-dlp"),
			os.ExpandEnv("$HOME/Library/Python/3.13/bin/yt-dlp"),
			os.ExpandEnv("$HOME/Library/Python/3.12/bin/yt-dlp"),
			os.ExpandEnv("$HOME/.local/bin/yt-dlp"),
			"/usr/local/bin/yt-dlp",
			"/opt/homebrew/bin/yt-dlp",
			"/config/.local/bin/yt-dlp",
		}
		for _, fb := range fallbacks {
			if _, err := os.Stat(fb); err == nil {
				binPath = fb
				break
			}
		}
	}

	cmd := exec.Command(binPath, cmdArgs...)

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		log.Printf("yt-dlp error in GetFullStreamData: %v, stderr: %s", err, stderr.String())
		return nil, nil, "", err
	}

	// Unmarshal common metadata
	var entry YtDlpEntry
	if err := json.Unmarshal(out.Bytes(), &entry); err != nil {
		return nil, nil, "", err
	}

	videoData := sanitizeVideoData(entry)
	videoData.StreamURL = entry.URL

	// Unmarshal formats specifically
	var raw struct {
		Formats []struct {
			FormatID    string      `json:"format_id"`
			FormatNote  string      `json:"format_note"`
			Ext         string      `json:"ext"`
			Resolution  string      `json:"resolution"`
			Width       interface{} `json:"width"`
			Height      interface{} `json:"height"`
			URL         string      `json:"url"`
			ManifestURL string      `json:"manifest_url"`
			VCodec      string      `json:"vcodec"`
			ACodec      string      `json:"acodec"`
			Filesize    interface{} `json:"filesize"`
			ABR         interface{} `json:"abr"`
		} `json:"formats"`
	}

	if err := json.Unmarshal(out.Bytes(), &raw); err != nil {
		return nil, nil, "", err
	}

	var qualities []QualityFormat
	seen := make(map[int]int) // height -> index in qualities
	var bestAudio string
	var bestABR float64

	for _, f := range raw.Formats {
		// Determine if it's the best audio
		if f.VCodec == "none" && f.ACodec != "none" && f.URL != "" {
			var abr float64
			switch v := f.ABR.(type) {
			case float64:
				abr = v
			case int:
				abr = float64(v)
			}
			if bestAudio == "" || abr > bestABR {
				bestABR = abr
				bestAudio = f.URL
			}
		}

		if f.VCodec == "none" || f.URL == "" {
			continue
		}

		var height int
		switch v := f.Height.(type) {
		case float64:
			height = int(v)
		case int:
			height = v
		}

		if height == 0 {
			continue
		}

		hasAudio := f.ACodec != "none" && f.ACodec != ""

		var filesize int64
		switch v := f.Filesize.(type) {
		case float64:
			filesize = int64(v)
		case int64:
			filesize = v
		}

		isHLS := f.ManifestURL != "" || strings.Contains(f.URL, ".m3u8") || strings.Contains(f.URL, "manifest")

		label := f.FormatNote
		if label == "" {
			switch height {
			case 2160:
				label = "4K"
			case 1440:
				label = "1440p"
			case 1080:
				label = "1080p"
			case 720:
				label = "720p"
			case 480:
				label = "480p"
			case 360:
				label = "360p"
			default:
				label = fmt.Sprintf("%dp", height)
			}
		}

		streamURL := f.URL
		if f.ManifestURL != "" {
			streamURL = f.ManifestURL
		}

		qf := QualityFormat{
			FormatID:   f.FormatID,
			Label:      label,
			Resolution: f.Resolution,
			Height:     height,
			URL:        streamURL,
			IsHLS:      isHLS,
			VCodec:     f.VCodec,
			ACodec:     f.ACodec,
			Filesize:   filesize,
			HasAudio:   hasAudio,
		}

		// Prefer formats with audio, otherwise just add
		if idx, exists := seen[height]; exists {
			// Replace if this one has audio and the existing one doesn't
			if hasAudio && !qualities[idx].HasAudio {
				qualities[idx] = qf
			}
		} else {
			seen[height] = len(qualities)
			qualities = append(qualities, qf)
		}
	}

	// Sort by height descending
	for i := range qualities {
		for j := i + 1; j < len(qualities); j++ {
			if qualities[j].Height > qualities[i].Height {
				qualities[i], qualities[j] = qualities[j], qualities[i]
			}
		}
	}

	// Attach audio URL to qualities without audio
	for i := range qualities {
		if !qualities[i].HasAudio && bestAudio != "" {
			qualities[i].AudioURL = bestAudio
		}
	}

	return &videoData, qualities, bestAudio, nil
}

func GetStreamURLForQuality(videoID string, height int) (string, error) {
	qualities, err := GetVideoQualities(videoID)
	if err != nil {
		return "", err
	}

	for _, q := range qualities {
		if q.Height == height {
			return q.URL, nil
		}
	}

	if len(qualities) > 0 {
		return qualities[0].URL, nil
	}

	return "", fmt.Errorf("no suitable quality found")
}

func GetRelatedVideos(title, uploader string, limit int) ([]VideoData, error) {
	query := title
	if uploader != "" {
		query = uploader + " " + title
	}
	// Limit query length to avoid issues
	if len(query) > 100 {
		query = query[:100]
	}
	return SearchVideos(query, limit)
}

type DownloadInfo struct {
	URL   string `json:"url"`
	Title string `json:"title"`
	Ext   string `json:"ext"`
}

func GetDownloadURL(videoID string, formatID string) (*DownloadInfo, error) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	formatArgs := "bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best"
	if formatID != "" {
		// Use the exact requested format ID directly. yt-dlp --dump-json -f <id>
		// returns the format JSON with a direct "url" for single itags (combined,
		// video-only, or audio-only). No server-side merge — direct URLs only.
		formatArgs = formatID
	}

	args := []string{
		"--format", formatArgs,
		"--no-playlist",
		url,
	}

	out, err := RunYtDlp(args...)
	if err != nil {
		return nil, err
	}

	var raw map[string]interface{}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	downloadURL, _ := raw["url"].(string)
	title, _ := raw["title"].(string)
	ext, _ := raw["ext"].(string)

	if downloadURL == "" {
		formats, ok := raw["formats"].([]interface{})
		if ok && len(formats) > 0 {
			// Try to find the first mp4 format that is not m3u8
			for i := len(formats) - 1; i >= 0; i-- {
				fmtMap, ok := formats[i].(map[string]interface{})
				if !ok {
					continue
				}
				fUrl, _ := fmtMap["url"].(string)
				fExt, _ := fmtMap["ext"].(string)
				if fUrl != "" && !strings.Contains(fUrl, ".m3u8") && fExt == "mp4" {
					downloadURL = fUrl
					ext = fExt
					break
				}
			}
		}
	}

	if title == "" {
		title = "video"
	}
	if ext == "" {
		ext = "mp4"
	}

	return &DownloadInfo{
		URL:   downloadURL,
		Title: title,
		Ext:   ext,
	}, nil
}

func GetVideoFormats(videoID string) ([]VideoFormat, error) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	args := []string{
		"--dump-json",
		"--no-playlist",
		url,
	}

	out, err := RunYtDlp(args...)
	if err != nil {
		return nil, err
	}

	var raw struct {
		Formats []struct {
			FormatID   string  `json:"format_id"`
			FormatNote string  `json:"format_note"`
			Ext        string  `json:"ext"`
			Resolution string  `json:"resolution"`
			Filesize   float64 `json:"filesize"`
			VCodec     string  `json:"vcodec"`
			ACodec     string  `json:"acodec"`
		} `json:"formats"`
	}

	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	var formats []VideoFormat
	for _, f := range raw.Formats {
		// Filter out storyboards and other non-media formats
		if strings.Contains(f.FormatID, "sb") || f.VCodec == "none" && f.ACodec == "none" {
			continue
		}

		fType := "both"
		if f.VCodec == "none" {
			fType = "audio"
		} else if f.ACodec == "none" {
			fType = "video"
		}

		formats = append(formats, VideoFormat{
			FormatID:   f.FormatID,
			FormatNote: f.FormatNote,
			Ext:        f.Ext,
			Resolution: f.Resolution,
			Filesize:   int64(f.Filesize),
			VCodec:     f.VCodec,
			ACodec:     f.ACodec,
			Type:       fType,
		})
	}

	return formats, nil
}

// MergeDownloadResult holds the merged MP4 reader and metadata.
type MergeDownloadResult struct {
	Reader  io.ReadCloser
	Title   string
	Ext     string
	Size    int64
	Cleanup func()
}

// MergeDownload downloads the best video+audio for the given height cap and
// merges them with ffmpeg -c copy (no re-encode). Returns a streaming reader
// to the merged MP4 output. Caller must close the reader and call Cleanup.
func MergeDownload(videoID string, heightCap int) (*MergeDownloadResult, error) {
	baseDir := filepath.Join(os.TempDir(), "kvdln")
	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return nil, fmt.Errorf("mkdir: %w", err)
	}
	// Use a unique subdir per request
	tmpDir, err := os.MkdirTemp(baseDir, "dl-*")
	if err != nil {
		return nil, fmt.Errorf("mktemp: %w", err)
	}
	cleanup := func() { os.RemoveAll(tmpDir) }

	videoPipe := filepath.Join(tmpDir, "video.pipe")
	audioPipe := filepath.Join(tmpDir, "audio.pipe")

	if err := syscall.Mkfifo(videoPipe, 0o600); err != nil {
		cleanup()
		return nil, fmt.Errorf("mkfifo video: %w", err)
	}
	if err := syscall.Mkfifo(audioPipe, 0o600); err != nil {
		cleanup()
		return nil, fmt.Errorf("mkfifo audio: %w", err)
	}

	const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	urlStr := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	videoSel := "bestvideo[ext=mp4][vcodec^=avc1]"
	if heightCap > 0 {
		videoSel = fmt.Sprintf("bestvideo[ext=mp4][height<=%d][vcodec^=avc1]", heightCap)
	}
	audioSel := "bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio"

	clientArg := []string{"--extractor-args", "youtube:player_client=web,android,tv,ios,web_safari"}

	ytV := exec.Command(ytDlpBinPath,
		"--no-warnings", "--quiet", "--force-ipv4", "--no-playlist",
		"--user-agent", ua,
		clientArg[0], clientArg[1],
		"-f", videoSel,
		"-o", videoPipe,
		urlStr,
	)
	ytA := exec.Command(ytDlpBinPath,
		"--no-warnings", "--quiet", "--force-ipv4", "--no-playlist",
		"--user-agent", ua,
		clientArg[0], clientArg[1],
		"-f", audioSel,
		"-o", audioPipe,
		urlStr,
	)
	ytV.Args = appendYtDlpCookies(ytV.Args)
	ytA.Args = appendYtDlpCookies(ytA.Args)

	ff := exec.Command("ffmpeg",
		"-y",
		"-i", videoPipe,
		"-i", audioPipe,
		"-c", "copy",
		"-movflags", "+frag_keyframe+empty_moov",
		"-f", "mp4",
		"-",
	)

	ffStdout, perr := ff.StdoutPipe()
	if perr != nil {
		cleanup()
		return nil, fmt.Errorf("ffmpeg stdout pipe: %w", perr)
	}

	// Suppress logs but keep them for debugging
	ytV.Stderr, _ = os.Create(filepath.Join(tmpDir, "yt-video.log"))
	ytA.Stderr, _ = os.Create(filepath.Join(tmpDir, "yt-audio.log"))
	ff.Stderr, _ = os.Create(filepath.Join(tmpDir, "ffmpeg.log"))

	if err := ff.Start(); err != nil {
		cleanup()
		return nil, fmt.Errorf("ffmpeg start: %w", err)
	}
	if err := ytV.Start(); err != nil {
		_ = ff.Process.Kill()
		cleanup()
		return nil, fmt.Errorf("yt-dlp video start: %w", err)
	}
	if err := ytA.Start(); err != nil {
		_ = ytV.Process.Kill()
		_ = ff.Process.Kill()
		cleanup()
		return nil, fmt.Errorf("yt-dlp audio start: %w", err)
	}

	// Wait for yt-dlp processes in background, then wait for ffmpeg
	go func() {
		_ = ytV.Wait()
		_ = ytA.Wait()
		_ = ff.Wait()
		// Close pipes so ffmpeg gets EOF and finishes
		if f, ok := ytV.Stderr.(*os.File); ok { f.Close() }
		if f, ok := ytA.Stderr.(*os.File); ok { f.Close() }
		if f, ok := ff.Stderr.(*os.File); ok { f.Close() }
		cleanup()
	}()

	// Get video title for Content-Disposition
	title := "video"
	info, err := GetVideoInfo(videoID)
	if err == nil && info.Title != "" {
		title = info.Title
	}

	return &MergeDownloadResult{
		Reader:  ffStdout,
		Title:   title,
		Ext:     "mp4",
		Cleanup: cleanup,
	}, nil
}

type ChannelInfo struct {
	ID              string `json:"id"`
	Title           string `json:"title"`
	SubscriberCount int64  `json:"subscriber_count"`
	Avatar          string `json:"avatar"`
	AvatarURL       string `json:"avatar_url"`
	BannerURL       string `json:"banner_url"`
	Description     string `json:"description"`
	VideoCount      int    `json:"video_count"`
}

func GetChannelInfo(channelID string) (*ChannelInfo, error) {
	url := fmt.Sprintf("https://www.youtube.com/channel/%s", channelID)
	if strings.HasPrefix(channelID, "@") {
		url = fmt.Sprintf("https://www.youtube.com/%s", channelID)
	}

	// Fetch 1 video with full metadata to extract channel info
	args := []string{
		url + "/videos",
		"--dump-json",
		"--playlist-end", "1",
		"--no-warnings",
		"--quiet",
	}

	out, err := RunYtDlp(args...)
	if err != nil || len(out) == 0 {
		return nil, fmt.Errorf("failed to get channel info: %v", err)
	}

	// Parse the first video's JSON
	var raw map[string]interface{}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	if len(lines) == 0 {
		return nil, fmt.Errorf("no output from yt-dlp")
	}

	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	title, _ := raw["channel"].(string)
	if title == "" {
		title, _ = raw["uploader"].(string)
	}
	if title == "" {
		title = channelID
	}

	cID, _ := raw["channel_id"].(string)
	if cID == "" {
		cID = channelID
	}

	subCountFloat, _ := raw["channel_follower_count"].(float64)

	// Create an avatar based on the first letter of the channel title
	avatarStr := "?"
	if len(title) > 0 {
		avatarStr = strings.ToUpper(string(title[0]))
	}

	return &ChannelInfo{
		ID:              cID,
		Title:           title,
		SubscriberCount: int64(subCountFloat),
		Avatar:          avatarStr, // Simple fallback for now
	}, nil
}

func GetChannelVideos(channelID string, limit int) ([]VideoData, error) {
	// Check SQLite cache first
	var cachedJSON string
	err := models.DB.QueryRow(
		"SELECT videos_json FROM channel_videos_cache WHERE channel_id = ? AND fetched_at > datetime('now', ?)",
		channelID, fmt.Sprintf("-%d seconds", int(channelVideosCacheTTL.Seconds())),
	).Scan(&cachedJSON)
	if err == nil && cachedJSON != "" {
		var videos []VideoData
		if json.Unmarshal([]byte(cachedJSON), &videos) == nil {
			return videos, nil
		}
	}

	url := fmt.Sprintf("https://www.youtube.com/channel/%s", channelID)
	if strings.HasPrefix(channelID, "@") {
		url = fmt.Sprintf("https://www.youtube.com/%s", channelID)
	}

	// Use --flat-playlist: fast, reliable, and far less likely to trip YouTube's
	// bot check than a full per-video extraction. The channel /videos tab is
	// already ordered newest-first, so this always yields the latest uploads.
	args := []string{
		url + "/videos",
		"--flat-playlist",
		"--playlist-end=" + fmt.Sprintf("%d", limit),
	}

	out, err := RunYtDlp(args...)
	if err != nil {
		return nil, err
	}

	var results []VideoData
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		if line == "" {
			continue
		}
		var entry YtDlpEntry
		if err := json.Unmarshal([]byte(line), &entry); err == nil {
			if entry.ID != "" {
				results = append(results, sanitizeVideoData(entry))
			}
		}
	}

	// Store in SQLite cache (upsert)
	if jsonBytes, err := json.Marshal(results); err == nil {
		_, err := models.DB.Exec(
			"INSERT OR REPLACE INTO channel_videos_cache (channel_id, videos_json, fetched_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
			channelID, string(jsonBytes),
		)
		if err != nil {
			log.Printf("[Cache] Failed to store channel videos for %s: %v", channelID, err)
		}
	}

	return results, nil
}

// ChannelPage bundles a channel's metadata and its latest videos so the whole
// page can be rendered from a single fast yt-dlp call.
type ChannelPage struct {
	Info   *ChannelInfo `json:"info"`
	Videos []VideoData  `json:"videos"`
}

// GetChannelPage fetches channel metadata (avatar, banner, description,
// subscriber count) and the latest videos in ONE flat-playlist call, which is
// far faster than resolving info and videos separately. Results are cached.
// GetChannelAvatar fetches only a channel's avatar URL (and name) using a
// metadata-only yt-dlp call (no playlist entries), which is much faster than a
// full channel page. Results are cached long-term since avatars rarely change.
func GetChannelAvatar(channelID string) (string, string, error) {
	cacheKey := fmt.Sprintf("channelavatar:%s", channelID)
	if cached, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var res struct {
			AvatarURL string `json:"avatar_url"`
			Name      string `json:"name"`
		}
		if json.Unmarshal(cached, &res) == nil && res.AvatarURL != "" {
			return res.AvatarURL, res.Name, nil
		}
	}

	url := fmt.Sprintf("https://www.youtube.com/channel/%s", channelID)
	if strings.HasPrefix(channelID, "@") {
		url = fmt.Sprintf("https://www.youtube.com/%s", channelID)
	}

	out, err := RunYtDlpSingleJSON(
		url+"/videos",
		"--flat-playlist",
		"-J",
		"--playlist-items", "0",
	)
	if err != nil {
		return "", "", err
	}

	var raw struct {
		Channel    string `json:"channel"`
		Uploader   string `json:"uploader"`
		Title      string `json:"title"`
		Thumbnails []struct {
			ID     string `json:"id"`
			URL    string `json:"url"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"thumbnails"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return "", "", err
	}

	name := raw.Channel
	if name == "" {
		name = raw.Uploader
	}
	if name == "" {
		name = strings.TrimSuffix(raw.Title, " - Videos")
	}

	var avatarURL string
	var avatarBest int
	for _, t := range raw.Thumbnails {
		id := strings.ToLower(t.ID)
		if strings.Contains(id, "avatar") && avatarURL == "" {
			avatarURL = t.URL
		}
		if t.Width > 0 && t.Width == t.Height && t.Width > avatarBest {
			avatarBest = t.Width
			if avatarURL == "" || !strings.Contains(strings.ToLower(avatarURL), "avatar") {
				avatarURL = t.URL
			}
		}
	}

	if avatarURL != "" {
		res := struct {
			AvatarURL string `json:"avatar_url"`
			Name      string `json:"name"`
		}{avatarURL, name}
		if b, err := json.Marshal(res); err == nil {
			_ = models.SetCachedVideo(cacheKey, string(b), int((7 * 24 * time.Hour).Seconds()))
		}
	}
	return avatarURL, name, nil
}

func GetChannelPage(channelID string, limit int) (*ChannelPage, error) {
	cacheKey := fmt.Sprintf("channelpage:%s:%d", channelID, limit)
	if cached, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var page ChannelPage
		if json.Unmarshal(cached, &page) == nil && page.Info != nil {
			return &page, nil
		}
	}

	url := fmt.Sprintf("https://www.youtube.com/channel/%s", channelID)
	if strings.HasPrefix(channelID, "@") {
		url = fmt.Sprintf("https://www.youtube.com/%s", channelID)
	}

	out, err := RunYtDlpSingleJSON(
		url+"/videos",
		"--flat-playlist",
		"-J",
		"--playlist-end="+fmt.Sprintf("%d", limit),
	)
	if err != nil {
		return nil, err
	}

	var raw struct {
		ChannelID            string  `json:"channel_id"`
		Channel              string  `json:"channel"`
		Title                string  `json:"title"`
		Uploader             string  `json:"uploader"`
		ChannelFollowerCount float64 `json:"channel_follower_count"`
		Description          string  `json:"description"`
		PlaylistCount        int     `json:"playlist_count"`
		Thumbnails           []struct {
			ID     string `json:"id"`
			URL    string `json:"url"`
			Width  int    `json:"width"`
			Height int    `json:"height"`
		} `json:"thumbnails"`
		Entries []YtDlpEntry `json:"entries"`
	}
	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	title := raw.Channel
	if title == "" {
		title = raw.Uploader
	}
	if title == "" {
		title = strings.TrimSuffix(raw.Title, " - Videos")
	}
	if title == "" {
		title = channelID
	}

	// Pick avatar (square) and banner (wide) thumbnails.
	var avatarURL, bannerURL string
	var avatarBest, bannerBest int
	for _, t := range raw.Thumbnails {
		id := strings.ToLower(t.ID)
		if strings.Contains(id, "avatar") && avatarURL == "" {
			avatarURL = t.URL
		}
		if strings.Contains(id, "banner") && bannerURL == "" {
			bannerURL = t.URL
		}
		if t.Width > 0 && t.Height > 0 {
			if t.Width == t.Height && t.Width > avatarBest {
				avatarBest = t.Width
				if avatarURL == "" || !strings.Contains(strings.ToLower(avatarURL), "avatar") {
					avatarURL = t.URL
				}
			}
			if t.Width >= t.Height*2 && t.Width > bannerBest {
				bannerBest = t.Width
				if bannerURL == "" || !strings.Contains(strings.ToLower(bannerURL), "banner") {
					bannerURL = t.URL
				}
			}
		}
	}

	cID := raw.ChannelID
	if cID == "" {
		cID = channelID
	}

	avatarStr := "?"
	if r := []rune(title); len(r) > 0 {
		avatarStr = strings.ToUpper(string(r[0]))
	}

	info := &ChannelInfo{
		ID:              cID,
		Title:           title,
		SubscriberCount: int64(raw.ChannelFollowerCount),
		Avatar:          avatarStr,
		AvatarURL:       avatarURL,
		BannerURL:       bannerURL,
		Description:     raw.Description,
		VideoCount:      raw.PlaylistCount,
	}

	var videos []VideoData
	for _, e := range raw.Entries {
		if e.ID != "" {
			v := sanitizeVideoData(e)
			if v.Uploader == "" || v.Uploader == "Unknown" {
				v.Uploader = title
			}
			videos = append(videos, v)
		}
	}

	page := &ChannelPage{Info: info, Videos: videos}
	if b, err := json.Marshal(page); err == nil {
		_ = models.SetCachedVideo(cacheKey, string(b), int(channelVideosCacheTTL.Seconds()))
	}
	return page, nil
}

// GetVideoUploadDates resolves the real upload_date (YYYYMMDD) for a list of
// video IDs, using a persistent SQLite cache and a bounded worker pool.
func GetVideoUploadDates(videoIDs []string) map[string]string {
	results := make(map[string]string)
	var mu sync.Mutex

	// Serve cached dates first; only resolve the misses.
	var toFetch []string
	for _, id := range videoIDs {
		if id == "" {
			continue
		}
		var date string
		err := models.DB.QueryRow("SELECT upload_date FROM video_dates_cache WHERE video_id = ?", id).Scan(&date)
		if err == nil && date != "" {
			results[id] = date
			continue
		}
		toFetch = append(toFetch, id)
	}

	if len(toFetch) == 0 {
		return results
	}

	// Keep concurrency low: heavy parallel extraction trips YouTube's bot check,
	// which then breaks unrelated requests (e.g. video playback).
	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup

	for _, id := range toFetch {
		wg.Add(1)
		go func(videoID string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			date := fetchUploadDate(videoID)
			if date == "" {
				return
			}
			mu.Lock()
			results[videoID] = date
			mu.Unlock()
			_, _ = models.DB.Exec(
				"INSERT OR REPLACE INTO video_dates_cache (video_id, upload_date, fetched_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
				videoID, date,
			)
		}(id)
	}

	wg.Wait()
	return results
}

// fetchUploadDate resolves just the YYYYMMDD upload date for a single video using
// a lightweight metadata-only extraction (no formats), which is far gentler on
// YouTube than a full --dump-json. Falls back to the android player client on a
// bot check.
func fetchUploadDate(videoID string) string {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	base := []string{
		"--skip-download",
		"--no-warnings",
		"--quiet",
		"--force-ipv4",
		"--no-playlist",
		"--print", "%(upload_date)s",
	}

	out, stderr, err := runYtDlpArgs(append(append([]string{}, base...), url))
	if err != nil && IsBotCheckError(stderr) {
		retry := append(append([]string{}, base...), "--extractor-args", "youtube:player_client=android", url)
		out, _, err = runYtDlpArgs(retry)
	}
	if err != nil {
		return ""
	}

	date := strings.TrimSpace(string(out))
	if idx := strings.IndexByte(date, '\n'); idx >= 0 {
		date = strings.TrimSpace(date[:idx])
	}
	if date == "" || date == "NA" {
		return ""
	}
	return date
}

// VideoStats holds lightweight per-video metadata resolved on demand.
type VideoStats struct {
	ViewCount  int64  `json:"view_count"`
	UploadDate string `json:"upload_date"`
}

// GetVideoStats resolves view counts (and upload dates) for a set of video IDs.
// Flat-playlist listings (used by the channel page) don't include view counts,
// so we fetch them lazily via a metadata-only extraction and cache long-term.
func GetVideoStats(videoIDs []string) map[string]VideoStats {
	results := make(map[string]VideoStats)
	var mu sync.Mutex

	var toFetch []string
	for _, id := range videoIDs {
		if id == "" {
			continue
		}
		cacheKey := fmt.Sprintf("videostats:%s", id)
		if cached, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
			var s VideoStats
			if json.Unmarshal(cached, &s) == nil {
				results[id] = s
				continue
			}
		}
		toFetch = append(toFetch, id)
	}

	if len(toFetch) == 0 {
		return results
	}

	sem := make(chan struct{}, 3)
	var wg sync.WaitGroup

	for _, id := range toFetch {
		wg.Add(1)
		go func(videoID string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			s, ok := fetchVideoStats(videoID)
			if !ok {
				return
			}
			mu.Lock()
			results[videoID] = s
			mu.Unlock()
			if b, err := json.Marshal(s); err == nil {
				_ = models.SetCachedVideo(fmt.Sprintf("videostats:%s", videoID), string(b), int((6 * time.Hour).Seconds()))
			}
		}(id)
	}

	wg.Wait()
	return results
}

// fetchVideoStats grabs view count + upload date for a single video using a
// metadata-only extraction (no formats), retrying with the android client on a
// bot check.
func fetchVideoStats(videoID string) (VideoStats, bool) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	base := []string{
		"--skip-download",
		"--no-warnings",
		"--quiet",
		"--force-ipv4",
		"--no-playlist",
		"--print", "%(view_count)s|%(upload_date)s",
	}

	out, stderr, err := runYtDlpArgs(append(append([]string{}, base...), url))
	if err != nil && IsBotCheckError(stderr) {
		retry := append(append([]string{}, base...), "--extractor-args", "youtube:player_client=android", url)
		out, _, err = runYtDlpArgs(retry)
	}
	if err != nil {
		return VideoStats{}, false
	}

	line := strings.TrimSpace(string(out))
	if idx := strings.IndexByte(line, '\n'); idx >= 0 {
		line = strings.TrimSpace(line[:idx])
	}
	parts := strings.SplitN(line, "|", 2)
	var s VideoStats
	if len(parts) > 0 {
		if n, err := strconv.ParseInt(strings.TrimSpace(parts[0]), 10, 64); err == nil {
			s.ViewCount = n
		}
	}
	if len(parts) > 1 {
		d := strings.TrimSpace(parts[1])
		if d != "" && d != "NA" {
			s.UploadDate = d
		}
	}
	return s, true
}

// GetChannelVideosBatch fetches videos for multiple channels in parallel.
// Returns a map of channelID -> videos.
func GetChannelVideosBatch(channelIDs []string, limit int) map[string][]VideoData {
	results := make(map[string][]VideoData)
	var mu sync.Mutex
	var wg sync.WaitGroup

	// Check cache first, only fetch missing channels
	var toFetch []string
	for _, cid := range channelIDs {
		var cachedJSON string
		err := models.DB.QueryRow(
			"SELECT videos_json FROM channel_videos_cache WHERE channel_id = ? AND fetched_at > datetime('now', ?)",
			cid, fmt.Sprintf("-%d seconds", int(channelVideosCacheTTL.Seconds())),
		).Scan(&cachedJSON)
		if err == nil && cachedJSON != "" {
			var videos []VideoData
			if json.Unmarshal([]byte(cachedJSON), &videos) == nil {
				mu.Lock()
				results[cid] = videos
				mu.Unlock()
				continue
			}
		}
		toFetch = append(toFetch, cid)
	}

	// Worker pool: max 5 concurrent yt-dlp processes
	sem := make(chan struct{}, 5)

	for _, cid := range toFetch {
		wg.Add(1)
		go func(channelID string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()

			videos, err := GetChannelVideos(channelID, limit)
			if err != nil {
				log.Printf("[Batch] Failed to fetch videos for %s: %v", channelID, err)
				return
			}
			mu.Lock()
			results[channelID] = videos
			mu.Unlock()
		}(cid)
	}

	wg.Wait()
	return results
}

type Comment struct {
	ID          string `json:"id"`
	Text        string `json:"text"`
	Author      string `json:"author"`
	AuthorID    string `json:"author_id"`
	AuthorThumb string `json:"author_thumbnail"`
	Likes       int    `json:"likes"`
	IsReply     bool   `json:"is_reply"`
	Parent      string `json:"parent"`
	Timestamp   string `json:"timestamp"`
}

func GetComments(videoID string, limit int) ([]Comment, error) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	cmdArgs := []string{
		"--no-warnings",
		"--quiet",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		"--dump-json",
		"--no-download",
		"--no-playlist",
		"--write-comments",
		"--extractor-args", fmt.Sprintf("youtube:comment_sort=top;max_comments=%d", limit),
		url,
	}

	cmd := exec.Command(ytDlpBinPath, appendYtDlpCookies(cmdArgs)...)

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	err := cmd.Run()
	if err != nil {
		log.Printf("yt-dlp comments error: %v, stderr: %s", err, stderr.String())
		return nil, err
	}

	var raw struct {
		Comments []struct {
			ID          string `json:"id"`
			Text        string `json:"text"`
			Author      string `json:"author"`
			AuthorID    string `json:"author_id"`
			AuthorThumb string `json:"author_thumbnail"`
			Likes       int    `json:"like_count"`
			IsReply     bool   `json:"is_reply"`
			Parent      string `json:"parent"`
			Timestamp   int64  `json:"timestamp"`
		} `json:"comments"`
	}

	if err := json.Unmarshal(out.Bytes(), &raw); err != nil {
		return nil, err
	}

	var comments []Comment
	for _, c := range raw.Comments {
		timestamp := ""
		if c.Timestamp > 0 {
			timestamp = formatCommentTime(c.Timestamp)
		}
		comments = append(comments, Comment{
			ID:          c.ID,
			Text:        c.Text,
			Author:      c.Author,
			AuthorID:    c.AuthorID,
			AuthorThumb: c.AuthorThumb,
			Likes:       c.Likes,
			IsReply:     c.IsReply,
			Parent:      c.Parent,
			Timestamp:   timestamp,
		})
	}

	return comments, nil
}

func formatCommentTime(timestamp int64) string {
	now := float64(timestamp)
	then := float64(0)
	diff := int((now - then) / 1000)

	if diff < 60 {
		return "just now"
	} else if diff < 3600 {
		return fmt.Sprintf("%dm ago", diff/60)
	} else if diff < 86400 {
		return fmt.Sprintf("%dh ago", diff/3600)
	} else if diff < 604800 {
		return fmt.Sprintf("%dw ago", diff/604800)
	} else if diff < 2592000 {
		return fmt.Sprintf("%dmo ago", diff/2592000)
	} else if diff < 31536000 {
		return fmt.Sprintf("%dmo ago", diff/2592000)
	}
	return fmt.Sprintf("%dy ago", diff/31536000)
}

// ResolveStreamURL returns a direct, browser-playable YouTube CDN URL for the
// best combined (audio+video) progressive format at or below heightCap. The
// browser then streams straight from YouTube's CDN (no server-side transcode),
// which is far more reliable than the dual-FIFO remux pipeline and starts
// almost instantly. Combined progressive formats cap out at ~1080p, so a
// heightCap above that effectively yields the highest available progressive
// format. Player clients are tried in order so a "confirm you're not a bot"
// gate on the default client is bypassed automatically.
func ResolveStreamURL(videoID string, heightCap int, forceAvc1 bool) (string, error) {
	urlStr := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	sel := "best"
	if heightCap > 0 {
		sel = fmt.Sprintf("best[height<=%d]", heightCap)
	}
	// Force combined formats (must include audio). Prefer the highest combined
	// stream at the requested height (webm/vp9 often reaches 1080p where mp4
	// tops out at 720p), then fall back to mp4/H.264 for broad compatibility.
	fmtStr := sel + "[acodec!=none]/" + sel + "[acodec!=none][ext=mp4]/" + sel + "/best"
	if forceAvc1 {
		fmtStr = sel + "[acodec!=none][ext=mp4][vcodec^=avc1]/" + fmtStr
	}

	const ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
	clients := []string{"web", "android", "tv", "ios", "web_safari"}

	for _, client := range clients {
		args := []string{
			"--no-warnings", "--quiet", "--force-ipv4", "--no-playlist",
			"--user-agent", ua,
			"--extractor-args", "youtube:player_client=" + client,
			"-g", "-f", fmtStr,
			urlStr,
		}
		args = appendYtDlpCookies(args)

		out, _, err := runYtDlpArgs(args)
		if err == nil {
			s := strings.TrimSpace(string(out))
			if s != "" {
				// -g emits one URL per selected stream; for a combined format it
				// is a single line. Take the first http(s) line.
				for _, line := range strings.Split(s, "\n") {
					line = strings.TrimSpace(line)
					if strings.HasPrefix(line, "http") {
						return line, nil
					}
				}
			}
		}
	}

	return "", fmt.Errorf("could not resolve a playable stream URL (YouTube bot-check or format unavailable)")
}
