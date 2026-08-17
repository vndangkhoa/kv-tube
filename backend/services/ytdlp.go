package services

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"slices"
	"strconv"
	"strings"
	"sync"
	"syscall"
	"time"

	"kvtube-go/models"

	"golang.org/x/sync/singleflight"
)

const channelVideosCacheTTL = 60 * time.Minute

var ytDlpBinPath string

// singleflight groups prevent duplicate concurrent yt-dlp / cache calls for
// the same key.  If N goroutines request the same video simultaneously, only
// one yt-dlp process is spawned and the result is shared.
var (
	videoInfoFlight   singleflight.Group
	searchFlight      singleflight.Group
	playbackFlight    singleflight.Group
	channelPageFlight singleflight.Group
	channelVidFlight  singleflight.Group
	commentsFlight    singleflight.Group
)

// ytDlpBlocked tracks whether YouTube is currently blocking this server's IP.
// When true, all yt-dlp calls are short-circuited to avoid wasting CPU on
// processes that will inevitably time out. The flag auto-resolves after a
// cooldown period.
var (
	ytDlpBlocked     bool
	ytDlpBlockedAt   time.Time
	ytDlpBlockedMu   sync.RWMutex
	ytDlpBlockCooldown = 2 * time.Minute
)

// markYtDlpBlocked records that YouTube is blocking this server's IP.
func markYtDlpBlocked() {
	ytDlpBlockedMu.Lock()
	defer ytDlpBlockedMu.Unlock()
	if !ytDlpBlocked {
		log.Printf("[ytdlp] YouTube is blocking this server's IP, pausing new requests for %v", ytDlpBlockCooldown)
	}
	ytDlpBlocked = true
	ytDlpBlockedAt = time.Now()
}

// isYtDlpBlocked reports whether YouTube is currently blocking. It
// auto-clears after the cooldown period.
func isYtDlpBlocked() bool {
	ytDlpBlockedMu.RLock()
	defer ytDlpBlockedMu.RUnlock()
	if !ytDlpBlocked {
		return false
	}
	if time.Since(ytDlpBlockedAt) > ytDlpBlockCooldown {
		// Auto-clear after cooldown
		go func() {
			ytDlpBlockedMu.Lock()
			ytDlpBlocked = false
			ytDlpBlockedMu.Unlock()
			log.Printf("[ytdlp] Block cooldown expired, resuming yt-dlp requests")
		}()
		return false
	}
	return true
}

func init() {
	ytDlpBinPath = resolveYtDlpBinPath()
	denoBinPath = resolveDenoBinPath()
	nodeBinPath = resolveNodeBinPath()
	impersonateSupported = detectImpersonateSupport()
}

// impersonateSupported indicates whether this yt-dlp install can impersonate
// browser TLS fingerprints (KB §4: curl_cffi helps against bot checks).
// Only pip-style installs with curl_cffi support it; standalone binaries do
// not, and passing --impersonate there errors out — so it is auto-detected.
var impersonateSupported bool

// detectImpersonateSupport checks whether THIS yt-dlp binary can impersonate
// browser TLS fingerprints. Probing the binary itself is the only reliable
// way: standalone builds lack curl_cffi even when the system python has it
// (pip installs carry their own env). YTDLP_IMPERSONATE=<target> forces
// impersonation regardless.
func detectImpersonateSupport() bool {
	if p := os.Getenv("YTDLP_IMPERSONATE"); p != "" {
		return true
	}
	out, err := exec.Command(ytDlpBinPath, "--list-impersonate-targets").CombinedOutput()
	if err != nil {
		return false
	}
	s := string(out)
	return strings.Contains(s, "Chrome") && !strings.Contains(s, "unavailable")
}

// impersonateArgs returns --impersonate <target> when supported (default
// "chrome", overridable via YTDLP_IMPERSONATE).
func impersonateArgs() []string {
	if !impersonateSupported {
		return nil
	}
	target := os.Getenv("YTDLP_IMPERSONATE")
	if target == "" {
		target = "chrome"
	}
	return []string{"--impersonate", target}
}

// denoBinPath is the resolved path of the deno JS runtime, used by yt-dlp to
// solve YouTube's JavaScript challenges (n challenge, signature solving) when
// cookies are in use. Empty means deno is unavailable; yt-dlp falls back to
// whatever runtime is on PATH (or fails with reduced formats).
var denoBinPath string

// resolveDenoBinPath locates a deno binary: on PATH first, then common install
// locations (deno.land installer, homebrew, /usr/local). Returns "" if none
// found.
func resolveDenoBinPath() string {
	if _, err := exec.LookPath("deno"); err == nil {
		return "deno"
	}
	candidates := []string{
		os.ExpandEnv("$HOME/.deno/bin/deno"),
		"/usr/local/bin/deno",
		"/opt/homebrew/bin/deno",
		"/usr/bin/deno",
		"/app/bin/deno/bin/deno",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// nodeBinPath is the resolved path of the node JS runtime, used by yt-dlp as
// a second JS challenge solver when deno is unavailable. The runtime name is
// "node" (NOT "nodejs" — yt-dlp ignores "nodejs" with a warning).
var nodeBinPath string

// resolveNodeBinPath locates a node binary: on PATH first, then common
// install locations. Returns "" if none found.
func resolveNodeBinPath() string {
	if _, err := exec.LookPath("node"); err == nil {
		return "node"
	}
	candidates := []string{
		"/usr/bin/node",
		"/usr/local/bin/node",
		"/opt/homebrew/bin/node",
		"/app/bin/node",
	}
	for _, p := range candidates {
		if _, err := os.Stat(p); err == nil {
			return p
		}
	}
	return ""
}

// appendYtDlpRuntimeArgs appends --js-runtimes with the available JS runtimes
// (deno preferred, node as fallback), enabling JS challenge solving for the
// web player client.
func appendYtDlpRuntimeArgs(args []string) []string {
	var runtimes []string
	if denoBinPath != "" {
		runtimes = append(runtimes, "deno:"+denoBinPath)
	}
	if nodeBinPath != "" {
		runtimes = append(runtimes, "node")
	}
	if len(runtimes) > 0 {
		return append(args, "--js-runtimes", strings.Join(runtimes, ","))
	}
	return args
}

func resolveYtDlpBinPath() string {
	// Check if yt-dlp is in PATH
	if _, err := exec.LookPath("yt-dlp"); err == nil {
		return "yt-dlp"
	}

	fallbacks := []string{
		"/app/bin/yt-dlp",
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

// RunYtDlpCached executes yt-dlp with caching. If yt-dlp fails or is blocked,
// it attempts to fall back to stale cached data to keep the UI functional.
func RunYtDlpCached(cacheKey string, ttlSeconds int, args ...string) ([]byte, error) {
	// Try to get from fresh cache first
	if cachedData, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cachedData)) > 0 {
		return cachedData, nil
	}

	// Execute yt-dlp
	data, err := RunYtDlp(args...)
	if err != nil {
		// Fallback to stale cache if available when yt-dlp fails or YouTube is blocking
		if staleData, sErr := models.GetStaleCachedVideo(cacheKey); sErr == nil && len(bytes.TrimSpace(staleData)) > 0 {
			log.Printf("[ytdlp] Serving stale cache for key %s (error: %v)", cacheKey, err)
			return staleData, nil
		}
		return nil, err
	}

	// Store in cache (ignore cache errors). Never cache empty output so a
	// transient bot-check/failure doesn't poison the cache with "null".
	if cacheKey != "" && len(bytes.TrimSpace(data)) > 0 {
		_ = models.SetCachedVideo(cacheKey, string(data), ttlSeconds)
	}

	return data, nil
}

var (
	cookieWarningLogged   bool
	cookieWarningLoggedMu sync.Mutex
)

func logCookieWarningOnce(msg string, args ...interface{}) {
	cookieWarningLoggedMu.Lock()
	defer cookieWarningLoggedMu.Unlock()
	if !cookieWarningLogged {
		log.Printf(msg, args...)
		cookieWarningLogged = true
	}
}

// IsBotCheckError reports whether yt-dlp's stderr indicates YouTube's
// bot gate or IP block.
func IsBotCheckError(stderr string) bool {
	s := strings.ToLower(stderr)
	// Do NOT treat age-restricted videos ("sign in to confirm your age") as IP blocks/bot checks.
	if strings.Contains(s, "confirm your age") {
		return false
	}
	return strings.Contains(s, "not a bot") ||
		strings.Contains(s, "sign in to confirm you're not a bot") ||
		strings.Contains(s, "confirm you're not a bot") ||
		strings.Contains(s, "blocking this server's ip") ||
		strings.Contains(s, "http error 429") ||
		strings.Contains(s, "too many requests") ||
		strings.Contains(s, "rate limit") ||
		strings.Contains(s, "captcha") ||
		strings.Contains(s, "bot-check")
}

// Cookie rejection / blacklist (KB §3): once YouTube reports the provided
// cookies as invalid ("no longer valid" = expired/rotated), blacklist the
// user-provided file for the process lifetime and switch to the
// auto-refreshed anonymous session. Never keep reusing a rejected file
// silently.
var (
	cookiesBlacklisted   bool
	cookiesBlacklistedMu sync.RWMutex
)

func markCookiesBlacklisted() {
	cookiesBlacklistedMu.Lock()
	defer cookiesBlacklistedMu.Unlock()
	if !cookiesBlacklisted {
		log.Printf("[ytdlp] YouTube rejected the provided cookies; blacklisting them for this process lifetime")
	}
	cookiesBlacklisted = true
}

// clearCookiesBlacklist un-blacklists the user cookies (called when a fresh
// file is uploaded/fetched — new session, new chance).
func clearCookiesBlacklist() {
	cookiesBlacklistedMu.Lock()
	defer cookiesBlacklistedMu.Unlock()
	if cookiesBlacklisted {
		log.Printf("[ytdlp] cookies un-blacklisted (new session provided)")
	}
	cookiesBlacklisted = false
}

func areCookiesBlacklisted() bool {
	cookiesBlacklistedMu.RLock()
	defer cookiesBlacklistedMu.RUnlock()
	return cookiesBlacklisted
}

// IsCookieRejectionError reports whether yt-dlp stderr indicates the supplied
// cookies were rejected (they expired/rotated and must be re-exported or
// replaced with a fresh anonymous session).
func IsCookieRejectionError(stderr string) bool {
	s := strings.ToLower(stderr)
	return strings.Contains(s, "no longer valid") ||
		strings.Contains(s, "cookies have expired") ||
		strings.Contains(s, "invalid cookies")
}

// runtimeCookiesPath is the writable staging path yt-dlp actually receives.
// yt-dlp WRITES BACK to the --cookies file on exit, so passing a read-only
// mount (./cookies.txt:ro) or a path in a directory it can't touch would
// crash it. Every configured cookie source is copied here first.
func runtimeCookiesPath() string {
	return filepath.Join(DataDir(), ".cookies-runtime.txt")
}

// cookiesStageMu serializes the staging copy so concurrent yt-dlp invocations
// never read a half-written file.
var cookiesStageMu sync.Mutex

// prepareCookieFile validates a Netscape cookie file and returns a canonical,
// writable staging path safe for yt-dlp to read AND write back to.
//   - is_file() check: a missing mount point is a DIRECTORY, not a file
//   - canonicalize: yt-dlp may run with a different current_dir
//   - copy to a writable location so :ro mounts cannot crash yt-dlp
func prepareCookieFile(src string) (string, bool) {
	fi, err := os.Stat(src)
	if err != nil || fi.IsDir() {
		return "", false
	}
	if !isValidNetscapeCookieFile(src) {
		return "", false
	}

	abs := src
	if a, aerr := filepath.Abs(src); aerr == nil {
		if resolved, rerr := filepath.EvalSymlinks(a); rerr == nil {
			abs = resolved
		} else {
			abs = a
		}
	}

	cookiesStageMu.Lock()
	defer cookiesStageMu.Unlock()

	dst := runtimeCookiesPath()
	if dfi, derr := os.Stat(dst); derr == nil && dfi.Size() == fi.Size() && dfi.ModTime().Equal(fi.ModTime()) {
		return dst, true
	}
	if err := copyFile(abs, dst); err != nil {
		log.Printf("[ytdlp] failed to stage cookies file at %s: %v", dst, err)
		return "", false
	}
	_ = os.Chtimes(dst, fi.ModTime(), fi.ModTime())
	return dst, true
}

// AnonymousCookiesPath returns the writable anonymous-session cookie file
// (VISITOR_INFO1_LIVE, YSC, PREF), auto-fetched at boot and refreshed when
// the user cookies are rejected.
func AnonymousCookiesPath() string {
	return filepath.Join(DataDir(), "cookies-anonymous.txt")
}

// anonymousCookieArgs returns --cookies for the anonymous session when one
// has been fetched.
func anonymousCookieArgs() []string {
	if p := AnonymousCookiesPath(); p != "" {
		if rp, ok := prepareCookieFile(p); ok {
			return []string{"--cookies", rp}
		}
	}
	return nil
}

// ytDlpUserCookieArgs returns the USER-provided cookie file regardless of the
// blacklist state (used by personalization endpoints — a blacklisted session
// still personalizes the home feed, which is a lightweight call that passes
// on flagged IPs). Falls back to the anonymous session when no user file
// exists.
func ytDlpUserCookieArgs() []string {
	if p := os.Getenv("YTDLP_COOKIES"); p != "" {
		if rp, ok := prepareCookieFile(p); ok {
			return []string{"--cookies", rp}
		}
	} else if p := PersistedCookiesPath(); p != "" {
		if rp, ok := prepareCookieFile(p); ok {
			return []string{"--cookies", rp}
		}
	}
	return anonymousCookieArgs()
}

// ytDlpCookieArgs returns cookie arguments for yt-dlp derived from the
// environment. Set YTDLP_COOKIES to a Netscape/cookies.txt file path, or
// YTDLP_COOKIES_FROM_BROWSER to a browser name (e.g. "chrome") to export
// cookies from a local browser. If YTDLP_COOKIES is unset, the persisted
// cookies file at <dataDir>/cookies.txt is used when present. When no user
// cookies exist (or they were rejected), the auto-refreshed anonymous
// session is used. This is required to bypass YouTube's "confirm you're not
// a bot" gate when the server's IP is rate-limited.
func ytDlpCookieArgs() []string {
	if areCookiesBlacklisted() {
		return anonymousCookieArgs()
	}

	if p := os.Getenv("YTDLP_COOKIES"); p != "" {
		if rp, ok := prepareCookieFile(p); ok {
			return []string{"--cookies", rp}
		}
		logCookieWarningOnce("[ytdlp] YTDLP_COOKIES file not usable: %s", p)
	} else if p := PersistedCookiesPath(); p != "" {
		if rp, ok := prepareCookieFile(p); ok {
			return []string{"--cookies", rp}
		}
	}
	if b := os.Getenv("YTDLP_COOKIES_FROM_BROWSER"); b != "" {
		return []string{"--cookies-from-browser", b}
	}
	return anonymousCookieArgs()
}

// DataDir returns the configured KV-Tube data directory (KVTUBE_DATA_DIR),
// defaulting to "../data" when unset. The directory is created if missing.
func DataDir() string {
	dataDir := os.Getenv("KVTUBE_DATA_DIR")
	if dataDir == "" {
		dataDir = "../data"
	}
	os.MkdirAll(dataDir, 0755)
	return dataDir
}

// PersistedCookiesPath returns the path of the persisted cookies file that
// users upload via the settings page, or "" when the data dir is unavailable.
func PersistedCookiesPath() string {
	return filepath.Join(DataDir(), "cookies.txt")
}

// SaveCookiesFile validates an uploaded Netscape-format cookies file and
// atomically persists it to <dataDir>/cookies.txt so future yt-dlp calls use
// it. Returns an error if the content is not a valid Netscape cookie file.
func SaveCookiesFile(data []byte) error {
	path := PersistedCookiesPath()
	if len(data) == 0 {
		return fmt.Errorf("cookies file is empty")
	}

	tmpPath := path + ".tmp"
	if err := os.WriteFile(tmpPath, data, 0600); err != nil {
		return err
	}
	if !isValidNetscapeCookieFile(tmpPath) {
		os.Remove(tmpPath)
		return fmt.Errorf("not a valid Netscape-format cookies file (expected 'Netscape HTTP Cookie File' header or tab-separated rows)")
	}
	if err := copyFile(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	os.Remove(tmpPath)
	log.Printf("[ytdlp] Cookies file saved to %s", path)
	// New session cookies: un-blacklist and clear in-memory caches so
	// everything re-fetches with the new session.
	clearCookiesBlacklist()
	models.ClearVideoCache()
	return nil
}

// RemoveCookiesFile deletes the persisted cookies file, if any.
func RemoveCookiesFile() error {
	path := PersistedCookiesPath()
	fi, err := os.Stat(path)
	if os.IsNotExist(err) {
		return nil
	}
	if err != nil {
		return err
	}
	if fi.IsDir() {
		return fmt.Errorf("%s is a directory, not a cookies file", path)
	}
	if err := os.Remove(path); err != nil {
		return err
	}
	log.Printf("[ytdlp] Cookies file removed: %s", path)
	clearCookiesBlacklist()
	models.ClearVideoCache()
	return nil
}

// SupportedBrowserCookies lists browsers yt-dlp can export cookies from.
var SupportedBrowserCookies = []string{"chrome", "chromium", "firefox", "edge", "brave", "opera", "vivaldi", "whale"}

// FetchCookiesFromBrowser exports cookies from a local browser via yt-dlp and
// persists them to <dataDir>/cookies.txt, replacing any existing file. This
// automates the manual `yt-dlp --cookies-from-browser <browser> --cookies
// cookies.txt ...` step. Requires a browser with cookies present on the host
// (works in Docker when the browser profile dir is mounted).
func FetchCookiesFromBrowser(browser string) error {
	if !slices.Contains(SupportedBrowserCookies, browser) {
		return fmt.Errorf("unsupported browser %q (supported: %s)", browser, strings.Join(SupportedBrowserCookies, ", "))
	}

	path := PersistedCookiesPath()
	tmpPath := path + ".tmp"
	os.Remove(tmpPath)

	// yt-dlp writes the exported cookies into --cookies FILE; use a known-good
	// video URL so no actual download happens (--skip-download). Extraction of
	// the test video may still fail (bot gate / downgraded player), but the
	// cookie export happens first and is what we care about, so only treat a
	// missing/invalid output file as failure.
	args := []string{
		"--cookies-from-browser", browser,
		"--cookies", tmpPath,
		"--skip-download",
		"--no-warnings",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	}
	args = append(args, ipFamilyArgs()...)

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()
	out, err := exec.CommandContext(ctx, ytDlpBinPath, args...).CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			os.Remove(tmpPath)
			return fmt.Errorf("cookie export timed out (browser may be locked)")
		}
		// Exit non-zero is expected when video extraction fails; check the file.
		log.Printf("[ytdlp] yt-dlp exited during cookie export (non-fatal): %v (%s)", err, strings.TrimSpace(string(out)))
	}
	if !isValidNetscapeCookieFile(tmpPath) {
		os.Remove(tmpPath)
		return fmt.Errorf("exported cookies file is not valid Netscape format")
	}
	if err := copyFile(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	os.Remove(tmpPath)
	log.Printf("[ytdlp] Cookies fetched from browser %q (%d entries)", browser, countCookieEntries(path))
	clearCookiesBlacklist()
	models.ClearVideoCache()
	return nil
}

// anonymousCookiesFlight coalesces concurrent anonymous-session refreshes so
// a burst of cookie rejections (or rejection + boot bootstrap) share one
// fetch instead of racing each other.
var anonymousCookiesFlight singleflight.Group

// RefreshAnonymousCookies fetches a fresh anonymous YouTube session
// (VISITOR_INFO1_LIVE, YSC, PREF) into <dataDir>/cookies-anonymous.txt.
// Used at boot (when no cookies exist at all) and when YouTube rejects the
// user-provided cookies (KB §3: discard the rejected file, auto-refresh an
// anonymous session, write to a writable path, retry).
func RefreshAnonymousCookies() error {
	_, err, _ := anonymousCookiesFlight.Do("refresh", func() (interface{}, error) {
		return nil, refreshAnonymousCookiesOnce()
	})
	return err
}

func refreshAnonymousCookiesOnce() error {
	path := AnonymousCookiesPath()
	tmpPath := path + ".tmp"
	os.Remove(tmpPath)

	args := []string{
		"--cookies", tmpPath,
		"--skip-download",
		"--no-warnings",
		"--quiet",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ",
	}
	args = append(args, ipFamilyArgs()...)

	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	out, err := exec.CommandContext(ctx, ytDlpBinPath, args...).CombinedOutput()
	if err != nil {
		if ctx.Err() == context.DeadlineExceeded {
			os.Remove(tmpPath)
			return fmt.Errorf("anonymous cookie fetch timed out")
		}
		// Non-zero exit is expected when video extraction fails; the cookie
		// export happens first and is what we care about.
		log.Printf("[ytdlp] yt-dlp exited during anonymous cookie fetch (non-fatal): %v (%s)", err, strings.TrimSpace(string(out)))
	}
	if !isValidNetscapeCookieFile(tmpPath) || countCookieEntries(tmpPath) == 0 {
		os.Remove(tmpPath)
		return fmt.Errorf("anonymous cookie fetch produced no valid cookies")
	}
	if err := copyFile(tmpPath, path); err != nil {
		os.Remove(tmpPath)
		return err
	}
	os.Remove(tmpPath)
	log.Printf("[ytdlp] anonymous session cookies refreshed (%d entries)", countCookieEntries(path))
	return nil
}

// StartCookieBootstrap auto-fetches an anonymous session in the background at
// boot when no user cookies exist at all, so the first yt-dlp calls are not
// cookie-less (KB §3: startup refresh).
func StartCookieBootstrap() {
	go func() {
		time.Sleep(3 * time.Second)

		if areCookiesBlacklisted() {
			_ = RefreshAnonymousCookies()
			return
		}
		if p := os.Getenv("YTDLP_COOKIES"); p != "" {
			if fi, err := os.Stat(p); err == nil && !fi.IsDir() {
				return // user cookies present, nothing to bootstrap
			}
		}
		if fi, err := os.Stat(PersistedCookiesPath()); err == nil && !fi.IsDir() {
			return
		}
		if fi, err := os.Stat(AnonymousCookiesPath()); err == nil && !fi.IsDir() {
			return
		}
		if err := RefreshAnonymousCookies(); err != nil {
			log.Printf("[ytdlp] anonymous cookie bootstrap failed: %v", err)
		}
	}()
}

// copyFile copies src to dst. Works around os.Rename failures on Docker volumes.
func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.Create(dst)
	if err != nil {
		return err
	}
	defer out.Close()
	if _, err := io.Copy(out, in); err != nil {
		return err
	}
	return out.Close()
}

// CookiesStatus describes the current cookies configuration.
type CookiesStatus struct {
	Configured  bool   `json:"configured"`    // cookies will be passed to yt-dlp
	Source      string `json:"source"`        // env | persisted | browser | anonymous | none
	Path        string `json:"path,omitempty"` // file path when file-based
	Exists      bool   `json:"exists"`        // file exists on disk (as a file)
	Valid       bool   `json:"valid"`         // parses as Netscape format
	Entries     int    `json:"entries"`       // number of non-comment lines
	Blacklisted bool   `json:"blacklisted"`   // user cookies rejected by YouTube this process
}

// CookiesStatus reports how yt-dlp cookies are currently configured.
func GetCookiesStatus() CookiesStatus {
	st := CookiesStatus{}

	statFile := func(p string) {
		fi, err := os.Stat(p)
		if err != nil || fi.IsDir() {
			return
		}
		st.Exists = true
		st.Valid = isValidNetscapeCookieFile(p)
		st.Configured = st.Valid
		st.Entries = countCookieEntries(p)
	}

	switch {
	case os.Getenv("YTDLP_COOKIES") != "":
		st.Source = "env"
		st.Path = os.Getenv("YTDLP_COOKIES")
	case os.Getenv("YTDLP_COOKIES_FROM_BROWSER") != "":
		st.Source = "browser"
		st.Configured = true
		st.Blacklisted = areCookiesBlacklisted()
		return st
	default:
		if fi, err := os.Stat(PersistedCookiesPath()); err == nil && !fi.IsDir() {
			st.Source = "persisted"
			st.Path = PersistedCookiesPath()
		} else if fi, err := os.Stat(AnonymousCookiesPath()); err == nil && !fi.IsDir() {
			st.Source = "anonymous"
			st.Path = AnonymousCookiesPath()
		} else {
			st.Source = "none"
			st.Blacklisted = areCookiesBlacklisted()
			return st
		}
	}

	statFile(st.Path)
	st.Blacklisted = areCookiesBlacklisted()
	return st
}

func countCookieEntries(path string) int {
	data, err := os.ReadFile(path)
	if err != nil {
		return 0
	}
	count := 0
	for _, line := range strings.Split(string(data), "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		// Netscape files mark HttpOnly cookies with a #HttpOnly_ prefix —
		// those are real entries, unlike header comments.
		if strings.HasPrefix(line, "#HttpOnly_") || !strings.HasPrefix(line, "#") {
			count++
		}
	}
	return count
}

// isValidNetscapeCookieFile checks if a file looks like a valid Netscape
// format cookies file.
func isValidNetscapeCookieFile(path string) bool {
	f, err := os.Open(path)
	if err != nil {
		return false
	}
	defer f.Close()

	buf := make([]byte, 1024)
	n, err := f.Read(buf)
	if n == 0 {
		logCookieWarningOnce("[ytdlp] YTDLP_COOKIES file is empty: %s (ignoring)", path)
		return false
	}
	header := string(buf[:n])

	lowerHeader := strings.ToLower(header)
	if strings.Contains(lowerHeader, "netscape") ||
		strings.Contains(lowerHeader, "cookie file") ||
		strings.Contains(lowerHeader, "curl.haxx.se") {
		return true
	}

	lines := strings.Split(header, "\n")
	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line != "" && !strings.HasPrefix(line, "#") {
			fields := strings.Split(line, "\t")
			if len(fields) >= 6 {
				return true
			}
		}
	}

	logCookieWarningOnce("[ytdlp] YTDLP_COOKIES file exists but is not valid Netscape format: %s (ignoring)", path)
	return false
}

// appendYtDlpCookies adds any configured cookie arguments to a yt-dlp arg list.
func appendYtDlpCookies(args []string) []string {
	if c := ytDlpCookieArgs(); c != nil {
		return append(args, c...)
	}
	return args
}

// ytDlpProxyArgs returns proxy arguments for yt-dlp from the YTDLP_PROXY
// environment variable. Supports SOCKS5 and HTTP proxies, e.g.:
//   - YTDLP_PROXY=socks5://user:pass@host:port
//   - YTDLP_PROXY=http://user:pass@host:port
func ytDlpProxyArgs() []string {
	if p := os.Getenv("YTDLP_PROXY"); p != "" {
		return []string{"--proxy", p}
	}
	return nil
}

// appendYtDlpProxy adds any configured proxy arguments to a yt-dlp arg list.
func appendYtDlpProxy(args []string) []string {
	if p := ytDlpProxyArgs(); p != nil {
		return append(args, p...)
	}
	return args
}

// appendYtDlpOpts adds cookie, proxy, and JS-runtime arguments to a yt-dlp
// arg list. withCookies=false skips cookies entirely — used for the
// last-resort retry, because a stale/rotated cookie session makes YouTube
// serve downgraded (empty-format) player responses while anonymous requests
// still extract fine.
func appendYtDlpOpts(args []string, withCookies bool) []string {
	if withCookies {
		args = appendYtDlpCookies(args)
	}
	args = appendYtDlpProxy(args)
	args = appendYtDlpRuntimeArgs(args)
	args = append(args, impersonateArgs()...)
	return args
}

// ytDlpTimeout is the maximum time allowed for a single yt-dlp invocation.
// Generous, because JS challenge solving (deno) + cookies add latency; a short
// timeout would kill slow-but-valid requests and trigger false IP blocks.
var ytDlpTimeout = 60 * time.Second

// ytDlpSem is a global concurrency limiter for yt-dlp processes.
// Reduced from 5 to 3 to prevent CPU saturation when many requests arrive.
var ytDlpSem = make(chan struct{}, 3)

func acquireYtDlp() { ytDlpSem <- struct{}{} }
func releaseYtDlp()  { <-ytDlpSem }

// runYtDlpArgs runs yt-dlp with the exact given argument list, handling the
// three distinct failure classes from the knowledge base:
//   - network failures  -> flip IP family (IPv4 <-> IPv6) and retry once
//   - rate limits (429) -> retry with backoff (up to maxRateLimitRetries)
//   - cookie rejection  -> blacklist the user cookies + trigger an anonymous
//     session refresh (the caller's retry loop picks up the fresh session)
//
// It enforces a hard timeout and kills the entire process group on timeout
// to prevent zombie processes. If the server is known to be blocked, it
// short-circuits immediately.
var maxRateLimitRetries = 2

func runYtDlpArgs(cmdArgs []string) ([]byte, string, error) {
	return runYtDlpArgsMode(cmdArgs, true, false, false)
}

// runYtDlpArgsNoCookies is like runYtDlpArgs but never attaches cookies and
// ignores the IP-blocked cooldown (last-resort retry for downgraded
// extractions — a flagged IPv4 route is exactly when the anonymous android
// client is needed, so the block flag must not short-circuit it).
func runYtDlpArgsNoCookies(cmdArgs []string) ([]byte, string, error) {
	return runYtDlpArgsMode(cmdArgs, false, true, false)
}

// runYtDlpArgsUserCookies runs with the USER-provided cookie file even when
// the session is blacklisted (personalization endpoints like the home feed:
// a blacklisted session still personalizes, and flat calls pass on flagged
// IPs).
func runYtDlpArgsUserCookies(cmdArgs []string) ([]byte, string, error) {
	return runYtDlpArgsMode(cmdArgs, true, false, true)
}

func runYtDlpArgsMode(cmdArgs []string, withCookies bool, ignoreBlock bool, forceUserCookies bool) ([]byte, string, error) {
	if !ignoreBlock && isYtDlpBlocked() {
		return nil, "", fmt.Errorf("YouTube is blocking this server's IP, try again later")
	}

	acquireYtDlp()
	defer releaseYtDlp()

	family := currentIPFamily()
	var out []byte
	var stderr string
	var err error

	for attempt := 0; ; attempt++ {
		out, stderr, err = runYtDlpArgsOnce(cmdArgs, family, withCookies, forceUserCookies)

		if IsCookieRejectionError(stderr) {
			markCookiesBlacklisted()
			go func() { _ = RefreshAnonymousCookies() }()
		}

		// IPv6 is the best weapon against IPv4 bot-blocks; on network-level
		// failures flip the family and retry once.
		if isNetworkFailure(stderr) {
			other := alternateIPFamily(family)
			log.Printf("[ytdlp] network failure on %s (%s), retrying over %s", family, strings.TrimSpace(stderr), other)
			out2, stderr2, err2 := runYtDlpArgsOnce(cmdArgs, other, withCookies, forceUserCookies)
			if !isNetworkFailure(stderr2) {
				return out2, stderr2, err2
			}
		}

		if !isRateLimitError(stderr) || attempt >= maxRateLimitRetries {
			break
		}
		backoff := time.Duration(attempt+1) * 2 * time.Second
		log.Printf("[ytdlp] rate-limited (attempt %d/%d), backing off %v", attempt+1, maxRateLimitRetries, backoff)
		time.Sleep(backoff)
	}

	return out, stderr, err
}

// isRateLimitError distinguishes HTTP 429 / "too many requests" (retry with
// backoff) from hard blocks (give up and mark the IP blocked).
func isRateLimitError(stderr string) bool {
	s := strings.ToLower(stderr)
	return strings.Contains(s, "http error 429") ||
		strings.Contains(s, "too many requests") ||
		strings.Contains(s, "rate limit")
}

// runYtDlpArgsOnce executes a single yt-dlp attempt on the given IP family.
func runYtDlpArgsOnce(cmdArgs []string, family string, withCookies bool, forceUserCookies bool) ([]byte, string, error) {
	cmdArgs = stripFamilyArgs(cmdArgs)
	cmdArgs = append(cmdArgs, ipFamilyArgsFor(family)...)

	var opts []string
	if forceUserCookies {
		// Personalization endpoints: use the user file even when blacklisted.
		opts = append(appendYtDlpOpts(cmdArgs, false), ytDlpUserCookieArgs()...)
	} else {
		opts = appendYtDlpOpts(cmdArgs, withCookies)
	}

	cmd := exec.Command(ytDlpBinPath, opts...)
	cmd.SysProcAttr = &syscall.SysProcAttr{Setpgid: true}

	var out bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &out
	cmd.Stderr = &stderr

	if err := cmd.Start(); err != nil {
		return nil, "", err
	}

	done := make(chan error, 1)
	go func() {
		done <- cmd.Wait()
	}()

	select {
	case err := <-done:
		return out.Bytes(), stderr.String(), err
	case <-time.After(ytDlpTimeout):
		if cmd.Process != nil && cmd.Process.Pid > 0 {
			// Kill the entire process group (-pid) to terminate python and all child processes
			_ = syscall.Kill(-cmd.Process.Pid, syscall.SIGKILL)
		}
		<-done
		log.Printf("[ytdlp] Process timed out after %v (killed process group)", ytDlpTimeout)
		// NOTE: a timeout alone does not mean the IP is blocked (it may just
		// be a slow challenge solve), so do NOT markYtDlpBlocked() here. Only
		// explicit bot-check errors mark the block.
		return nil, "", fmt.Errorf("yt-dlp timed out after %v", ytDlpTimeout)
	}
}

// RunYtDlp securely executes yt-dlp with the given arguments and returns JSON output.
func RunYtDlp(args ...string) ([]byte, error) {
	base := []string{
		"--dump-json",
		"--no-warnings",
		"--quiet",
		"--ignore-errors",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	}
	return runYtDlpWithBase(base, args...)
}

// RunYtDlpSingleJSON runs yt-dlp expecting a single JSON document (for use with
// -J / --dump-single-json).
func RunYtDlpSingleJSON(args ...string) ([]byte, error) {
	base := []string{
		"--no-warnings",
		"--quiet",
		"--ignore-errors",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	}
	return runYtDlpWithBase(base, args...)
}

// runYtDlpWithBase runs yt-dlp with the given base flags, retrying across
// player clients when YouTube's bot-check gate returns empty output, and
// repairing the cookie session once when YouTube rejects it (KB §1: detect →
// discard rejected cookies → refresh anonymous session → retry). When every
// attempt fails it makes one last pass WITHOUT cookies: a stale/rotated
// cookie session makes YouTube serve downgraded (empty-format) player
// responses, while anonymous extraction still passes.
func runYtDlpWithBase(base []string, args ...string) ([]byte, error) {
	out, err := runYtDlpWithBaseLoop(base, true, args...)
	if err == nil {
		return out, nil
	}
	// The block cooldown must NOT skip this pass: on a flagged IP the
	// cookie-less anonymous android client is the only path that works.
	log.Printf("[ytdlp] all attempts with cookies failed (%v); retrying without cookies", err)
	out2, err2 := runYtDlpWithBaseLoop(base, false, args...)
	if err2 == nil {
		// The cookie session is actively HURTING (every client + cookies gets
		// a downgraded empty-format response, anonymous works). Blacklist it
		// so later requests skip straight to the anonymous pass; the user can
		// re-upload fresh cookies to un-blacklist (SaveCookiesFile).
		markCookiesBlacklisted()
		models.ClearVideoCache()
		log.Printf("[ytdlp] anonymous extraction succeeded where cookies failed; blacklisting cookie session")
	} else if isCookieBlockedError(err) && isCookieBlockedError(err2) {
		// Both passes blocked (bot gate / downgraded formats): the uploaded
		// cookies demonstrably don't authenticate (they're stale). Blacklist
		// them so the Settings page warns the user to re-export fresh ones —
		// fresh logged-in cookies are what defeats this exact gate (KB §3).
		markCookiesBlacklisted()
		log.Printf("[ytdlp] blocked with and without cookies (%v); blacklisting stale cookie session", err2)
	}
	return out2, err2
}

// isCookieBlockedError matches the failure signatures that fresh cookies
// would fix: the explicit bot gate and the downgraded empty-format response.
func isCookieBlockedError(err error) bool {
	s := strings.ToLower(err.Error())
	return strings.Contains(s, "sign in to confirm") ||
		strings.Contains(s, "not a bot") ||
		strings.Contains(s, "requested format is not available")
}

func runYtDlpWithBaseLoop(base []string, withCookies bool, args ...string) ([]byte, error) {
	clients := []string{"", "android"}
	if !withCookies {
		// Last-resort pass: throw a couple more player clients at it
		// (KB §4 — unreliable alone, useful as fallbacks).
		clients = append(clients, "tv", "web_embedded")
	}

	var lastStderr string
	var lastErr error
	cookieRepaired := false
	for _, client := range clients {
		// The with-cookies pass respects the block cooldown; the cookie-less
		// recovery pass must always run (flagged IPs need the anonymous
		// android client).
		if withCookies && isYtDlpBlocked() {
			return nil, fmt.Errorf("YouTube is blocking this server's IP, try again later")
		}

		cmdArgs := append([]string{}, base...)
		if client != "" {
			cmdArgs = append(cmdArgs, "--extractor-args", "youtube:player_client="+client)
		}
		cmdArgs = append(cmdArgs, args...)

		out, stderr, err := runYtDlpArgsMode(cmdArgs, withCookies, !withCookies, false)

		// Cookie rejection (expired/rotated user cookies): blacklist the file,
		// refresh an anonymous session, and retry the download once with it.
		if IsCookieRejectionError(stderr) && !cookieRepaired {
			cookieRepaired = true
			log.Printf("[ytdlp] Cookies rejected by YouTube; refreshing anonymous session and retrying")
			if rerr := RefreshAnonymousCookies(); rerr != nil {
				log.Printf("[ytdlp] anonymous cookie refresh failed: %v", rerr)
				markYtDlpBlocked()
				break
			}
			continue // re-run clients with the fresh anonymous session
		}

		// Success: usable output and no bot-check gate.
		if len(bytes.TrimSpace(out)) > 0 && !IsBotCheckError(stderr) {
			return out, nil
		}

		// Genuine empty result (no error, no bot-check, nothing on stderr):
		// nothing to retry for. NOTE: --ignore-errors makes yt-dlp swallow
		// extraction errors (exit 0, empty stdout, "ERROR:" on stderr) — an
		// empty output with an ERROR on stderr is a FAILURE and must continue
		// the retry chain (android client / no-cookie pass), otherwise the
		// recovery never runs on blocked IPs.
		if err == nil && !IsBotCheckError(stderr) && !strings.Contains(stderr, "ERROR:") {
			return out, nil
		}

		lastStderr = stderr
		lastErr = err

		if IsBotCheckError(stderr) {
			log.Printf("[ytdlp] Bot-check/IP block detected on client %q: %s", client, stderr)
			markYtDlpBlocked()
			break // Stop trying additional clients if IP is blocked
		}

		if client == "" {
			log.Printf("yt-dlp default client failed (err=%v), falling back", err)
		} else {
			log.Printf("yt-dlp client %q failed (err=%v), falling back", client, err)
		}
	}

	log.Printf("yt-dlp failed after all client fallbacks: %v, stderr: %s", lastErr, lastStderr)
	if lastErr != nil {
		if strings.TrimSpace(lastStderr) != "" {
			return nil, fmt.Errorf("%v. stderr: %s", lastErr, strings.TrimSpace(lastStderr))
		}
		return nil, lastErr
	}
	return nil, fmt.Errorf("yt-dlp returned no usable output: %s", lastStderr)
}

func SearchVideos(query string, limit int, region string) ([]VideoData, error) {
	searchQuery := fmt.Sprintf("ytsearch%d:%s", limit, query)

	// Cache flat search results for 30 minutes so repeat/category loads are instant.
	cacheKey := fmt.Sprintf("search:%d:%s:%s", limit, query, region)

	// Fast path: serve from cache without singleflight contention.
	if cachedData, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cachedData)) > 0 {
		return parseSearchResults(cachedData), nil
	}

	// Deduplicate concurrent identical search requests.
	v, err, _ := searchFlight.Do(cacheKey, func() (interface{}, error) {
		args := []string{
			"--flat-playlist",
			"--no-warnings",
			searchQuery,
		}
		if region != "" && region != "GLOBAL" {
			args = append(args, "--geo-bypass-country", region)
		}
		out, err := RunYtDlpCached(cacheKey, 7200, args...)
		if err != nil {
			if stale, sErr := models.GetStaleCachedVideo(cacheKey); sErr == nil && len(bytes.TrimSpace(stale)) > 0 {
				out = stale
				err = nil
			} else {
				return nil, err
			}
		}
		return parseSearchResults(out), nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]VideoData), nil
}

func parseSearchResults(data []byte) []VideoData {
	var results []VideoData
	lines := strings.Split(strings.TrimSpace(string(data)), "\n")
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
	return results
}

func GetVideoInfo(videoID string) (*VideoData, error) {
	// Fast path: serve from cache.
	if cached, err := models.GetCachedVideo(videoID); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var v VideoData
		if json.Unmarshal(cached, &v) == nil && v.ID != "" {
			return &v, nil
		}
	}

	// Deduplicate concurrent requests for the same video.
	v, err, _ := videoInfoFlight.Do(videoID, func() (interface{}, error) {
		// Fast path: Try direct watch page HTML parsing first (~300ms, avoids slow yt-dlp process)
		if v, ok := FetchWatchPageVideoInfo(videoID); ok && v != nil && v.Title != "" {
			if b, merr := json.Marshal(v); merr == nil {
				_ = models.SetCachedVideo(videoID, string(b), 21600)
			}
			return v, nil
		}

		url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

		// Metadata-only call: NO --format selection.
		args := []string{
			"--skip-download",
			"--no-playlist",
			url,
		}

		out, err := RunYtDlp(args...)
		if err != nil {
			log.Printf("yt-dlp failed for %s: %v", videoID, err)
			if stale, sErr := models.GetStaleCachedVideo(videoID); sErr == nil && len(bytes.TrimSpace(stale)) > 0 {
				var v VideoData
				if json.Unmarshal(stale, &v) == nil && v.ID != "" {
					log.Printf("Serving stale cached video info for %s", videoID)
					return &v, nil
				}
			}
			return nil, err
		}

		// Log first 200 chars for debugging
		if len(out) > 0 {
			log.Printf("yt-dlp response for %s (first 200 chars): %s", videoID, string(out[:min(200, len(out))]))
		}

		var entry YtDlpEntry
		if err := json.Unmarshal(out, &entry); err != nil {
			log.Printf("JSON unmarshal error for %s: %v", videoID, err)
			return nil, fmt.Errorf("failed to parse video info: %w", err)
		}

		data := sanitizeVideoData(entry)
		data.StreamURL = entry.URL

		if b, err := json.Marshal(data); err == nil {
			_ = models.SetCachedVideo(videoID, string(b), 21600) // cache for 6h
		}

		return &data, nil
	})
	if err != nil {
		return nil, err
	}
	return v.(*VideoData), nil
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// pickAudioFormat selects the best audio stream for the client. YouTube
// serves WebM/Opus (itag 251) by default — open codec, plays in Chrome,
// Firefox, Edge and codec-restricted clients (VS Code webview). Safari
// cannot play WebM/Opus and needs m4a/AAC (itag 140): the frontend detects
// this via canPlayType and requests "m4a" explicitly (KB §5).
func pickAudioFormat(formats []PlaybackFormat, pref string) PlaybackFormat {
	var candidate PlaybackFormat
	if pref == "m4a" {
		for _, f := range formats {
			if f.Ext == "m4a" || strings.HasPrefix(f.ACodec, "aac") {
				if candidate.FormatID == "" || f.Bandwidth > candidate.Bandwidth {
					candidate = f
				}
			}
		}
		if candidate.FormatID != "" {
			return candidate
		}
	}
	for _, f := range formats {
		if f.Ext == "webm" || strings.HasPrefix(f.ACodec, "opus") {
			if candidate.FormatID == "" || f.Bandwidth > candidate.Bandwidth {
				candidate = f
			}
		}
	}
	if candidate.FormatID != "" {
		return candidate
	}
	best := formats[0]
	for _, f := range formats[1:] {
		if f.Bandwidth > best.Bandwidth {
			best = f
		}
	}
	return best
}

// GetPlaybackInfo returns video + audio format information for client-side MSE
// playback. audioPref selects the codec family ("m4a" for AAC, anything else
// defaults to WebM/Opus).
func GetPlaybackInfo(videoID, audioPref string) (*PlaybackInfo, error) {
	cacheKey := fmt.Sprintf("playback:%s:%s", videoID, audioPref)
	// Fast path: serve from cache.
	if cached, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var pi PlaybackInfo
		if json.Unmarshal(cached, &pi) == nil && pi.Title != "" {
			return &pi, nil
		}
	}

	v, err, _ := playbackFlight.Do(cacheKey, func() (interface{}, error) {
		url := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)

		out, err := RunYtDlpSingleJSON(
			"--dump-json",
			"--no-playlist",
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

		// Pick the best audio format for the requested codec family
		if len(audioFormats) > 0 {
			best := pickAudioFormat(audioFormats, audioPref)
			pi.AudioFormat = &best
		}

		// Deduplicate video formats by height, choosing the highest bandwidth/quality stream:
		bestByHeight := make(map[int]PlaybackFormat)
		for _, f := range videoFormats {
			if f.Height <= 0 {
				continue
			}
			existing, found := bestByHeight[f.Height]
			if !found {
				bestByHeight[f.Height] = f
				continue
			}
			if f.Bandwidth > existing.Bandwidth || (f.Bandwidth == existing.Bandwidth && f.FPS > existing.FPS) {
				bestByHeight[f.Height] = f
			}
		}

		for _, f := range bestByHeight {
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

		if b, err := json.Marshal(pi); err == nil {
			_ = models.SetCachedVideo(cacheKey, string(b), 21600) // cache for 6h
		}

		return pi, nil
	})
	if err != nil {
		return nil, err
	}
	return v.(*PlaybackInfo), nil
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

	avatarURL, _, _ := GetChannelAvatar(cID)

	return &ChannelInfo{
		ID:              cID,
		Title:           title,
		SubscriberCount: int64(subCountFloat),
		Avatar:          avatarStr,
		AvatarURL:       avatarURL,
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

	flightKey := fmt.Sprintf("chanvids:%s:%d", channelID, limit)
	v, err, _ := channelVidFlight.Do(flightKey, func() (interface{}, error) {
		url := fmt.Sprintf("https://www.youtube.com/channel/%s", channelID)
		if strings.HasPrefix(channelID, "@") {
			url = fmt.Sprintf("https://www.youtube.com/%s", channelID)
		}

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
	})
	if err != nil {
		return nil, err
	}
	return v.([]VideoData), nil
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

	// Try fetching the raw HTML and parsing og:image (fast, no yt-dlp dependency, highly reliable)
	httpClient := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequest("GET", url, nil)
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	resp, err := httpClient.Do(req)
	if err == nil && resp.StatusCode == 200 {
		defer resp.Body.Close()
		bodyBytes, _ := ioutil.ReadAll(resp.Body)
		bodyStr := string(bodyBytes)

		// Extract og:image
		var avatarURL string
		imgIdx := strings.Index(bodyStr, `property="og:image"`)
		if imgIdx != -1 {
			contentStart := strings.Index(bodyStr[imgIdx:], `content="`)
			if contentStart != -1 {
				realStart := imgIdx + contentStart + len(`content="`)
				contentEnd := strings.Index(bodyStr[realStart:], `"`)
				if contentEnd != -1 {
					avatarURL = bodyStr[realStart : realStart+contentEnd]
				}
			}
		}

		// Extract channel name from og:title
		var name string
		titleIdx := strings.Index(bodyStr, `property="og:title"`)
		if titleIdx != -1 {
			contentStart := strings.Index(bodyStr[titleIdx:], `content="`)
			if contentStart != -1 {
				realStart := titleIdx + contentStart + len(`content="`)
				contentEnd := strings.Index(bodyStr[realStart:], `"`)
				if contentEnd != -1 {
					name = bodyStr[realStart : realStart+contentEnd]
				}
			}
		}

		if avatarURL != "" {
			if name == "" {
				name = channelID
			}
			res := struct {
				AvatarURL string `json:"avatar_url"`
				Name      string `json:"name"`
			}{avatarURL, name}
			if b, err := json.Marshal(res); err == nil {
				_ = models.SetCachedVideo(cacheKey, string(b), int((7 * 24 * time.Hour).Seconds()))
			}
			return avatarURL, name, nil
		}
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
	// Fast path: serve from cache.
	if cached, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var page ChannelPage
		if json.Unmarshal(cached, &page) == nil && page.Info != nil {
			return &page, nil
		}
	}

	v, err, _ := channelPageFlight.Do(cacheKey, func() (interface{}, error) {
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
	})
	if err != nil {
		return nil, err
	}
	return v.(*ChannelPage), nil
}

// fetchVideoStatsBatch fetches view_count and upload_date for a slice of video IDs
// in batched yt-dlp calls (up to 15 per call) to avoid spawning N separate Python processes.
func fetchVideoStatsBatch(videoIDs []string) map[string]VideoStats {
	results := make(map[string]VideoStats)
	if len(videoIDs) == 0 || isYtDlpBlocked() {
		return results
	}

	const chunkSize = 15
	for i := 0; i < len(videoIDs); i += chunkSize {
		if isYtDlpBlocked() {
			break
		}
		end := i + chunkSize
		if end > len(videoIDs) {
			end = len(videoIDs)
		}
		chunk := videoIDs[i:end]

		urls := make([]string, 0, len(chunk))
		for _, id := range chunk {
			urls = append(urls, fmt.Sprintf("https://www.youtube.com/watch?v=%s", id))
		}

		base := []string{
			"--skip-download",
			"--no-warnings",
			"--quiet",
			"--no-playlist",
			"--print", "%(id)s|%(view_count)s|%(upload_date)s",
		}

		out, stderr, err := runYtDlpArgs(append(append([]string{}, base...), urls...))
		if err != nil && IsBotCheckError(stderr) {
			retry := append(append([]string{}, base...), "--extractor-args", "youtube:player_client=android")
			retry = append(retry, urls...)
			out, _, err = runYtDlpArgs(retry)
		}
		if err != nil {
			continue
		}

		lines := strings.Split(strings.TrimSpace(string(out)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			parts := strings.SplitN(line, "|", 3)
			if len(parts) >= 1 {
				id := strings.TrimSpace(parts[0])
				if id == "" {
					continue
				}
				var s VideoStats
				if len(parts) > 1 {
					if n, err := strconv.ParseInt(strings.TrimSpace(parts[1]), 10, 64); err == nil {
						s.ViewCount = n
					}
				}
				if len(parts) > 2 {
					d := strings.TrimSpace(parts[2])
					if d != "" && d != "NA" {
						s.UploadDate = d
					}
				}
				results[id] = s
			}
		}
	}

	return results
}

// GetVideoUploadDates resolves the real upload_date (YYYYMMDD) for a list of
// video IDs, using a persistent SQLite cache and batched yt-dlp extraction.
func GetVideoUploadDates(videoIDs []string) map[string]string {
	results := make(map[string]string)

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

	fetched := fetchVideoStatsBatch(toFetch)
	for id, s := range fetched {
		if s.UploadDate != "" {
			results[id] = s.UploadDate
			_, _ = models.DB.Exec(
				"INSERT OR REPLACE INTO video_dates_cache (video_id, upload_date, fetched_at) VALUES (?, ?, CURRENT_TIMESTAMP)",
				id, s.UploadDate,
			)
		}
	}

	return results
}

// VideoStats holds lightweight per-video metadata resolved on demand.
type VideoStats struct {
	ViewCount  int64  `json:"view_count"`
	UploadDate string `json:"upload_date"`
}

// GetVideoStats resolves view counts (and upload dates) for a set of video IDs.
// Uses batched yt-dlp calls to prevent CPU saturation and process spawning floods.
func GetVideoStats(videoIDs []string) map[string]VideoStats {
	results := make(map[string]VideoStats)

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

	fetched := fetchVideoStatsBatch(toFetch)
	for id, s := range fetched {
		results[id] = s
		if b, err := json.Marshal(s); err == nil {
			_ = models.SetCachedVideo(fmt.Sprintf("videostats:%s", id), string(b), int((6 * time.Hour).Seconds()))
		}
	}

	return results
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

	for _, cid := range toFetch {
		wg.Add(1)
		go func(channelID string) {
			defer wg.Done()

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
	// Cache comments for 1 hour.  The cache key includes the limit so different
	// page sizes are stored independently.
	cacheKey := fmt.Sprintf("comments:%s:%d", videoID, limit)

	// Fast path: serve from cache.
	if cached, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var comments []Comment
		if json.Unmarshal(cached, &comments) == nil && len(comments) > 0 {
			return comments, nil
		}
	}

	// Deduplicate concurrent comment fetches for the same video.
	v, err, _ := commentsFlight.Do(cacheKey, func() (interface{}, error) {
		if isYtDlpBlocked() {
			return nil, fmt.Errorf("YouTube is blocking this server's IP, try again later")
		}

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

		outBytes, stderr, err := runYtDlpArgs(cmdArgs)
		if err != nil {
			// Stale/rotated cookie sessions yield downgraded extractions;
			// anonymous runs often still pass. One cookie-less retry.
			log.Printf("yt-dlp comments error: %v, stderr: %s", err, stderr)
			outBytes2, stderr2, err2 := runYtDlpArgsNoCookies(cmdArgs)
			if err2 == nil && len(bytes.TrimSpace(outBytes2)) > 0 && !IsBotCheckError(stderr2) {
				outBytes = outBytes2
				err = nil
			} else if err2 != nil {
				log.Printf("yt-dlp comments cookie-less retry failed: %v, stderr: %s", err2, stderr2)
			}
		}
		if err != nil {
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

		if err := json.Unmarshal(outBytes, &raw); err != nil {
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

		// Cache for 1 hour.
		if b, err := json.Marshal(comments); err == nil {
			_ = models.SetCachedVideo(cacheKey, string(b), 3600)
		}

		return comments, nil
	})
	if err != nil {
		return nil, err
	}
	return v.([]Comment), nil
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
	if isYtDlpBlocked() {
		return "", fmt.Errorf("YouTube is blocking this server's IP, try again later")
	}

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
	// Reduced from 5 to 3 clients to lower CPU usage on NAS when blocked.
	// Player-client tricks are unreliable (KB §4): used only as fallbacks.
	clients := []string{"web", "android", "tv"}

	cookieRepaired := false
	cookieLessTried := false
	for _, client := range clients {
		if isYtDlpBlocked() {
			return "", fmt.Errorf("YouTube is blocking this server's IP, try again later")
		}

		args := []string{
			"--no-warnings", "--quiet", "--no-playlist",
			"--user-agent", ua,
			"--extractor-args", "youtube:player_client=" + client,
			"-g", "-f", fmtStr,
			urlStr,
		}

		out, stderr, err := runYtDlpArgs(args)
		if err != nil && IsCookieRejectionError(stderr) {
			// Cookie rejection: blacklist the user file, refresh an anonymous
			// session, and retry once (KB §1 repair loop).
			if !cookieRepaired {
				cookieRepaired = true
				log.Printf("[ytdlp] Cookies rejected by YouTube; refreshing anonymous session and retrying stream resolve")
				if rerr := RefreshAnonymousCookies(); rerr != nil {
					log.Printf("[ytdlp] anonymous cookie refresh failed: %v", rerr)
					markYtDlpBlocked()
					return "", fmt.Errorf("cookies rejected and anonymous refresh failed: %v. stderr: %s", rerr, stderr)
				}
				continue // next client uses the fresh anonymous session
			}
		}

		if IsBotCheckError(stderr) {
			log.Printf("[ytdlp] Bot-check/IP block detected while resolving stream (client %q): %s", client, stderr)
			markYtDlpBlocked()
			return "", fmt.Errorf("YouTube is blocking this server's IP. stderr: %s", strings.TrimSpace(stderr))
		}

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

		// Last resort: a stale cookie session makes YouTube serve downgraded
		// responses; anonymous extraction often still passes (KB §4).
		if !cookieLessTried {
			cookieLessTried = true
			log.Printf("[ytdlp] stream resolve with cookies failed on %q; retrying without cookies", client)
			out, stderr, err = runYtDlpArgsNoCookies(args)
			if IsBotCheckError(stderr) {
				markYtDlpBlocked()
				return "", fmt.Errorf("YouTube is blocking this server's IP. stderr: %s", strings.TrimSpace(stderr))
			}
			if err == nil {
				s := strings.TrimSpace(string(out))
				if s != "" {
					for _, line := range strings.Split(s, "\n") {
						line = strings.TrimSpace(line)
						if strings.HasPrefix(line, "http") {
							return line, nil
						}
					}
				}
			}
		}
	}

	return "", fmt.Errorf("could not resolve a playable stream URL (YouTube bot-check or format unavailable)")
}
