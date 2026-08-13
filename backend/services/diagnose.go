package services

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"time"
)

// In-container network diagnostics (KB §6): tells us from inside the NAS
// container whether YouTube is reachable over IPv4 and/or IPv6, so a
// "player doesn't play" report can be resolved to "IP family blocked" vs
// "code broken" without SSH.

// NetworkDiag is the result of GET /api/settings/diagnose.
type NetworkDiag struct {
	Family          string            `json:"family"` // current yt-dlp IP family
	IPv6Routable    bool              `json:"ipv6_routable"`
	YouTubeV4       string            `json:"youtube_v4"` // HTTP status or error over IPv4
	YouTubeV6       string            `json:"youtube_v6"` // HTTP status or error over IPv6
	YtDlpVersion    string            `json:"ytdlp_version"`
	Impersonate     bool              `json:"impersonate"` // --impersonate active (curl_cffi present)
	ExtractionTest  *ExtractionResult `json:"extraction_test,omitempty"`
}

// ExtractionResult reports the outcome of a real yt-dlp extraction run
// through the exact same retry chain playback uses.
type ExtractionResult struct {
	OK          bool   `json:"ok"`
	VideoID     string `json:"video_id"`
	Title       string `json:"title,omitempty"`
	FormatCount int    `json:"format_count"`
	Error       string `json:"error,omitempty"`
}

// RunNetworkDiagnostics probes YouTube connectivity from this process.
func RunNetworkDiagnostics() NetworkDiag {
	d := NetworkDiag{
		Family:       currentIPFamily(),
		IPv6Routable: ipv6Available,
		YtDlpVersion: YtDlpVersion(),
		Impersonate:  impersonateSupported,
	}
	d.YouTubeV4 = checkYouTube("ipv4")
	d.YouTubeV6 = checkYouTube("ipv6")
	return d
}

// RunExtractionTest performs a real extraction through the standard retry
// chain (cookies+web → anonymous web → anonymous android, with IPv6 flips)
// so failures can be diagnosed from the Settings UI without SSH.
func RunExtractionTest(videoID string) ExtractionResult {
	if videoID == "" {
		videoID = "dQw4w9WgXcQ"
	}
	res := ExtractionResult{VideoID: videoID}

	out, err := RunYtDlpSingleJSON(
		"--dump-json",
		"--skip-download",
		fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID),
	)
	if err != nil {
		res.Error = fmt.Sprintf("%v", err)
		return res
	}

	var raw struct {
		Title   string `json:"title"`
		Formats []struct {
			FormatID string `json:"format_id"`
		} `json:"formats"`
	}
	if jerr := json.Unmarshal(out, &raw); jerr != nil {
		res.Error = fmt.Sprintf("parse error: %v", jerr)
		return res
	}
	res.OK = raw.Title != ""
	res.Title = raw.Title
	res.FormatCount = len(raw.Formats)
	if res.FormatCount == 0 {
		res.Error = "no formats extracted (player downgraded / bot gate)"
	}
	return res
}

// checkYouTube fetches https://www.youtube.com/ forcing the given IP family.
func checkYouTube(family string) string {
	transport := &http.Transport{
		DialContext: func(ctx context.Context, network, addr string) (net.Conn, error) {
			n := "tcp4"
			if family == "ipv6" {
				n = "tcp6"
			}
			d := &net.Dialer{Timeout: 8 * time.Second}
			return d.DialContext(ctx, n, addr)
		},
	}
	client := &http.Client{Transport: transport, Timeout: 12 * time.Second}
	resp, err := client.Get("https://www.youtube.com/")
	if err != nil {
		return fmt.Sprintf("ERR: %v", err)
	}
	defer resp.Body.Close()
	return fmt.Sprintf("HTTP %d", resp.StatusCode)
}
