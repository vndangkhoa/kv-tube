package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"os/exec"
	"strconv"
	"strings"
	"sync"
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

// PlaybackFormat describes a single quality level for MSE playback.
type PlaybackFormat struct {
	FormatID   string `json:"format_id"`
	Height     int    `json:"height"`
	Width      int    `json:"width"`
	VCodec     string `json:"vcodec"`
	ACodec     string `json:"acodec"`
	Ext        string `json:"ext"`
	Bandwidth  int    `json:"bandwidth"`
	FPS        int    `json:"fps"`
	Filesize   int64  `json:"filesize"`
	URL        string `json:"url"`
	HasAudio   bool   `json:"has_audio"`

	// DASH fragment info (0 if not DASH)
	FragmentCount   int    `json:"fragment_count"`
	InitURL         string `json:"init_url,omitempty"`
	MediaURL        string `json:"media_url,omitempty"` // first media segment URL (for template extraction)
}

// PlaybackInfo is returned by /api/video/:id/playback-info.
type PlaybackInfo struct {
	Title      string           `json:"title"`
	Duration   float64          `json:"duration"`
	VideoFormats []PlaybackFormat `json:"video_formats"`
	AudioFormat *PlaybackFormat `json:"audio_format,omitempty"`
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

// GetPlaybackInfo returns video + audio format information for client-side MSE playback.
func GetPlaybackInfo(videoID string) (*PlaybackInfo, error) {
	url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

	out, err := RunYtDlpSingleJSON(
		"--dump-json",
		"--no-playlist",
		"--force-ipv4",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
		url,
	)
	if err != nil {
		return nil, err
	}

	var raw struct {
		Title    string  `json:"title"`
		Duration float64 `json:"duration"`
		Formats  []struct {
			FormatID      string  `json:"format_id"`
			FormatNote    string  `json:"format_note"`
			Ext           string  `json:"ext"`
			Width         int     `json:"width"`
			Height        int     `json:"height"`
			VCodec        string  `json:"vcodec"`
			ACodec        string  `json:"acodec"`
			TBR           float64 `json:"tbr"`
			FPS           float64 `json:"fps"`
			Filesize      float64 `json:"filesize"`
			URL           string  `json:"url"`
			FragmentCount int     `json:"fragment_count"`
			InitURL       string  `json:"init_url"`
			ManifestURL   string  `json:"manifest_url"`
		} `json:"formats"`
	}

	if err := json.Unmarshal(out, &raw); err != nil {
		return nil, err
	}

	pi := &PlaybackInfo{
		Title:    raw.Title,
		Duration: raw.Duration,
	}

	// First pass: separate audio and video formats
	var audioFormats []PlaybackFormat
	var videoFormats []PlaybackFormat

	for _, f := range raw.Formats {
		isVideo := f.VCodec != "" && f.VCodec != "none"
		isAudio := f.ACodec != "" && f.ACodec != "none"

		if !isVideo && !isAudio {
			continue
		}

		// Build init & media URLs for DASH
		initURL := f.InitURL
		var mediaURL string

		if f.FragmentCount > 0 && f.URL != "" {
			if initURL != "" && f.ManifestURL == "" {
				mediaURL = f.URL
			} else if f.FragmentCount > 0 {
				mediaURL = f.URL
			}
		}

		pf := PlaybackFormat{
			FormatID:      f.FormatID,
			Height:        f.Height,
			Width:         f.Width,
			VCodec:        f.VCodec,
			ACodec:        f.ACodec,
			Ext:           f.Ext,
			Bandwidth:     int(f.TBR),
			FPS:           int(f.FPS),
			Filesize:      int64(f.Filesize),
			URL:           f.URL,
			HasAudio:      isAudio,
			FragmentCount: f.FragmentCount,
			InitURL:       initURL,
			MediaURL:      mediaURL,
		}

		if isVideo {
			videoFormats = append(videoFormats, pf)
		}
		if isAudio && !isVideo {
			audioFormats = append(audioFormats, pf)
		}
	}

	// Pick the best audio format (highest bandwidth)
	if len(audioFormats) > 0 {
		best := audioFormats[0]
		for _, a := range audioFormats[1:] {
			if a.Bandwidth > best.Bandwidth {
				best = a
			}
		}
		pi.AudioFormat = &best
	}

	// Deduplicate video formats by height (prefer higher FPS)
	seenHeights := make(map[int]bool)
	for _, f := range videoFormats {
		if seenHeights[f.Height] {
			continue
		}
		seenHeights[f.Height] = true
		pi.VideoFormats = append(pi.VideoFormats, f)
	}

	// Sort by height descending
	for i := range pi.VideoFormats {
		for j := i + 1; j < len(pi.VideoFormats); j++ {
			if pi.VideoFormats[j].Height > pi.VideoFormats[i].Height {
				pi.VideoFormats[i], pi.VideoFormats[j] = pi.VideoFormats[j], pi.VideoFormats[i]
			}
		}
	}

	return pi, nil
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
