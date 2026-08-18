package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"

	"kvtube-go/models"
)

// Personalized home feed via YouTube's Innertube browse API.
//
// The old approach — `yt-dlp --flat-playlist https://www.youtube.com/` —
// is fundamentally broken: yt-dlp's [youtube:tab] extractor downloads 0 items
// from /feed/recommended, so the home feed always came back empty and the
// frontend fell back to search content.
//
// The real account home feed is served by the Innertube `browse` endpoint
// with browseId=FEwhat_to_watch. When called with the USER's logged-in
// cookies (from a non-datacenter / home IP), it returns the account's actual
// "For You" recommendations as videoRenderer items in a rich grid. This is
// the same client/web API the real YouTube website uses, so it personalizes
// correctly where the flat-playlist hack never did.

// Default Innertube context. The API key is youtube.com's public, stable key
// (baked into every page's ytcfg); the client version is refreshed from the
// live site whenever possible but a recent default works for the browse API.
const (
	defaultInnertubeKey     = "AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8"
	defaultClientVersion    = "2.20260811.07.00"
	innertubeMaxContinuations = 5  // follow up to N "load more" pages to build a pool
	innertubeItemsPerPage      = 24
)

var (
	innertubeMu          sync.Mutex
	innertubeKey         = defaultInnertubeKey
	innertubeVersion     = defaultClientVersion
	innertubeVisitorData = "CgtKeGlJdHFIdXBnQSiLlZHUBjIKCgJWThIEGgAgUzoCCAE%3D"
	innertubeContextAt   time.Time
)

// innertubeClient is a dedicated HTTP client for browse API calls.
var innertubeClient = &http.Client{Timeout: 20 * time.Second}

// youtubeCookieHeader builds a Cookie header for .youtube.com from the
// configured Netscape cookie file (YTDLP_COOKIES, else <dataDir>/cookies.txt).
// Returns "" when no usable cookies exist.
func youtubeCookieHeader() string {
	src := os.Getenv("YTDLP_COOKIES")
	if src == "" {
		src = PersistedCookiesPath()
	}
	if src == "" {
		return ""
	}
	raw, err := os.ReadFile(src)
	if err != nil {
		return ""
	}
	return netscapeCookiesForDomain(raw, "youtube.com")
}

// netscapeCookiesForDomain parses a Netscape cookie file and returns a
// "name=value; ..." Cookie header containing only non-expired cookies whose
// domain matches the given domain suffix.
func netscapeCookiesForDomain(data []byte, domainSuffix string) string {
	var parts []string
	now := time.Now().Unix()
	domainSuffix = strings.ToLower(domainSuffix)
	for _, line := range bytes.Split(data, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if len(line) == 0 || line[0] == '#' {
			continue
		}
		fields := strings.Split(string(line), "\t")
		if len(fields) < 7 {
			continue
		}
		domain := strings.ToLower(strings.TrimSpace(fields[0]))
		// Skip HttpOnly flag in fields[3] is irrelevant for header building;
		// skip expired cookies (fields[4] = expiry epoch).
		var expires int64
		if _, err := fmt.Sscanf(strings.TrimSpace(fields[4]), "%d", &expires); err == nil && expires > 0 && expires < now {
			continue
		}
		name := strings.TrimSpace(fields[5])
		value := strings.TrimSpace(fields[6])
		if name == "" {
			continue
		}
		// Include exact "youtube.com" and any subdomain of it.
		if domain == domainSuffix || strings.HasSuffix(domain, "."+domainSuffix) {
			parts = append(parts, name+"="+value)
		}
	}
	return strings.Join(parts, "; ")
}

// innertubeContext returns the current API key + client version, refreshing
// them from the live youtube.com page at most once an hour (they change as
// YouTube ships releases, and stale versions occasionally get 403'd).
func innertubeContext() (key, version, visitorData string) {
	innertubeMu.Lock()
	defer innertubeMu.Unlock()
	if innertubeContextAt.IsZero() || time.Since(innertubeContextAt) > time.Hour {
		if k, v, ok := fetchInnertubeContext(); ok {
			if k != "" {
				innertubeKey = k
			}
			if v != "" {
				innertubeVersion = v
			}
		}
		innertubeContextAt = time.Now()
	}
	return innertubeKey, innertubeVersion, innertubeVisitorData
}

// fetchInnertubeContext scrapes the public INNERTUBE_API_KEY and client
// version from the youtube.com home page's ytcfg block.
func fetchInnertubeContext() (key, version string, ok bool) {
	req, err := http.NewRequest("GET", "https://www.youtube.com/", nil)
	if err != nil {
		return "", "", false
	}
	req.Header.Set("User-Agent", watchPageUA)
	resp, err := innertubeClient.Do(req)
	if err != nil {
		return "", "", false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", "", false
	}
	body, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", "", false
	}
	key = extractInnertubeString(body, `"INNERTUBE_API_KEY":"`)
	version = extractInnertubeString(body, `"INNERTUBE_CONTEXT_CLIENT_VERSION":"`)
	if key == "" && version == "" {
		return "", "", false
	}
	return key, version, true
}

func extractInnertubeString(body []byte, marker string) string {
	idx := bytes.Index(body, []byte(marker))
	if idx == -1 {
		return ""
	}
	start := idx + len(marker)
	end := bytes.IndexByte(body[start:], '"')
	if end == -1 {
		return ""
	}
	return string(body[start : start+end])
}

// browseRequestBody builds the JSON body for an Innertube browse request.
func browseRequestBody(browseID, continuation string) map[string]interface{} {
	_, version, visitorData := innertubeContext()
	clientObj := map[string]interface{}{
		"clientName":    "WEB",
		"clientVersion": version,
		"hl":            "en",
		"gl":            "US",
		"timeZone":      "UTC",
	}
	if visitorData != "" {
		clientObj["visitorData"] = visitorData
	}

	ctx := map[string]interface{}{
		"client": clientObj,
	}
	body := map[string]interface{}{
		"context": ctx,
	}
	if continuation != "" {
		body["continuation"] = continuation
	} else {
		body["browseId"] = browseID
	}
	return body
}

// postInnertubeBrowse issues a browse (or continuation) request and returns
// the parsed JSON body. Returns error on HTTP failure.
func postInnertubeBrowse(browseID, continuation string) ([]byte, error) {
	key, _, visitorData := innertubeContext()
	url := fmt.Sprintf("https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&key=%s", key)
	payload, err := json.Marshal(browseRequestBody(browseID, continuation))
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequest("POST", url, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", watchPageUA)
	req.Header.Set("Origin", "https://www.youtube.com")
	req.Header.Set("Referer", "https://www.youtube.com/")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	if visitorData != "" {
		req.Header.Set("X-Goog-Visitor-Id", visitorData)
	}
	if ch := youtubeCookieHeader(); ch != "" {
		req.Header.Set("Cookie", ch)
	}

	resp, err := innertubeClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}

	if resp.StatusCode != http.StatusOK {
		// If Google returned a visitorData in responseContext on error, update and retry once
		if vIdx := bytes.Index(body, []byte(`"visitorData":"`)); vIdx != -1 {
			vStart := vIdx + len(`"visitorData":"`)
			vEnd := bytes.IndexByte(body[vStart:], '"')
			if vEnd != -1 {
				newVisitor := string(body[vStart : vStart+vEnd])
				innertubeMu.Lock()
				innertubeVisitorData = newVisitor
				innertubeMu.Unlock()

				// Retry request with fresh visitorData
				retryPayload, _ := json.Marshal(browseRequestBody(browseID, continuation))
				retryReq, _ := http.NewRequest("POST", url, bytes.NewReader(retryPayload))
				retryReq.Header.Set("Content-Type", "application/json")
				retryReq.Header.Set("User-Agent", watchPageUA)
				retryReq.Header.Set("X-Goog-Visitor-Id", newVisitor)
				if ch := youtubeCookieHeader(); ch != "" {
					retryReq.Header.Set("Cookie", ch)
				}
				if retryResp, err := innertubeClient.Do(retryReq); err == nil {
					defer retryResp.Body.Close()
					if retryResp.StatusCode == http.StatusOK {
						return io.ReadAll(io.LimitReader(retryResp.Body, 8<<20))
					}
				}
			}
		}
		return nil, fmt.Errorf("browse API status %d", resp.StatusCode)
	}
	return body, nil
}

// ---- browse response parsing ----

// browseResponse mirrors the Innertube browse/continuation response shape.
type browseResponse struct {
	Contents struct {
		TwoColumnBrowseResultsRenderer struct {
			Tabs []struct {
				TabRenderer struct {
					Content struct {
						RichGridRenderer struct {
							Contents []json.RawMessage `json:"contents"`
						} `json:"richGridRenderer"`
					} `json:"content"`
				} `json:"tabRenderer"`
			} `json:"tabs"`
		} `json:"twoColumnBrowseResultsRenderer"`
	} `json:"contents"`
	OnResponseReceivedEndpoints []struct {
		AppendContinuationItemsAction struct {
			ContinuationItems []json.RawMessage `json:"continuationItems"`
		} `json:"appendContinuationItemsAction"`
	} `json:"onResponseReceivedEndpoints"`
}

// videoRenderer mirrors the fields we need from a rich-grid video entry.
type browseVideoRenderer struct {
	VideoID string `json:"videoId"`
	Title   struct {
		Runs []struct {
			Text string `json:"text"`
		} `json:"runs"`
	} `json:"title"`
	OwnerText struct {
		Runs []struct {
			Text string `json:"text"`
		} `json:"runs"`
	} `json:"ownerText"`
	LengthText struct {
		SimpleText string `json:"simpleText"`
		Runs       []struct {
			Text string `json:"text"`
		} `json:"runs"`
	} `json:"lengthText"`
	PublishedTimeText struct {
		SimpleText string `json:"simpleText"`
	} `json:"publishedTimeText"`
	ViewCountText struct {
		SimpleText string `json:"simpleText"`
	} `json:"viewCountText"`
}

// richGridItem wraps a single rich-grid entry, which may be a richItemRenderer
// wrapping a videoRenderer, or a continuation/other placeholder.
type richGridItem struct {
	RichItemRenderer struct {
		Content struct {
			VideoRenderer browseVideoRenderer `json:"videoRenderer"`
		} `json:"content"`
	} `json:"richItemRenderer"`
	ContinuationItemRenderer struct {
		ContinuationEndpoint struct {
			ContinuationCommand struct {
				Token string `json:"token"`
			} `json:"continuationCommand"`
		} `json:"continuationEndpoint"`
	} `json:"continuationItemRenderer"`
}

// parseBrowsePage extracts video entries + the next continuation token from a
// single browse/continuation JSON payload.
func parseBrowsePage(raw []byte) (videos []VideoData, nextToken string) {
	var resp browseResponse
	if err := json.Unmarshal(raw, &resp); err != nil {
		log.Printf("[homefeed-browse] unmarshal error: %v", err)
		return nil, ""
	}

	items := resp.Contents.TwoColumnBrowseResultsRenderer.Tabs
	// Initial browse: items under the rich grid.
	if len(items) > 0 {
		for _, rawItem := range items[0].TabRenderer.Content.RichGridRenderer.Contents {
			collectRichItem(rawItem, &videos, &nextToken)
		}
	}
	// Continuation responses: items under onResponseReceivedEndpoints.
	for _, ep := range resp.OnResponseReceivedEndpoints {
		for _, rawItem := range ep.AppendContinuationItemsAction.ContinuationItems {
			collectRichItem(rawItem, &videos, &nextToken)
		}
	}
	return videos, nextToken
}

func collectRichItem(raw json.RawMessage, videos *[]VideoData, nextToken *string) {
	var item richGridItem
	if err := json.Unmarshal(raw, &item); err != nil {
		return
	}
	if t := item.ContinuationItemRenderer.ContinuationEndpoint.ContinuationCommand.Token; t != "" {
		*nextToken = t
		return
	}
	vr := item.RichItemRenderer.Content.VideoRenderer
	if vr.VideoID == "" {
		return
	}
	title := joinRuns(vr.Title.Runs)
	if title == "" {
		return
	}
	uploader := joinRuns(vr.OwnerText.Runs)
	if uploader == "" {
		uploader = "Unknown"
	}
	lengthText := vr.LengthText.SimpleText
	if lengthText == "" {
		lengthText = joinRuns(vr.LengthText.Runs)
	}
	*videos = append(*videos, VideoData{
		ID:          vr.VideoID,
		Title:       title,
		Uploader:    uploader,
		Thumbnail:   fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", vr.VideoID),
		Duration:    lengthText,
		UploadDate:  vr.PublishedTimeText.SimpleText, // e.g. "3 days ago"
		ViewCount:   parseViewCount(vr.ViewCountText.SimpleText),
	})
}

func joinRuns(runs []struct {
	Text string `json:"text"`
}) string {
	var b strings.Builder
	for _, r := range runs {
		b.WriteString(r.Text)
	}
	return b.String()
}

func parseViewCount(s string) int64 {
	// "1,234,567 views" → 1234567
	num := strings.TrimSpace(strings.TrimSuffix(s, " views"))
	num = strings.ReplaceAll(num, ",", "")
	var v int64
	fmt.Sscanf(num, "%d", &v)
	return v
}

// browseHomeFeed fetches the real personalized home feed via the Innertube
// browse API, following continuations to build a pool of up to
// homeFeedBatchSize videos. Returns an empty slice when unavailable.
func browseHomeFeed() []VideoData {
	var all []VideoData
	seen := make(map[string]bool)
	token := ""

	for page := 0; page <= 1; page++ {
		raw, err := postInnertubeBrowse("FEwhat_to_watch", token)
		if err != nil {
			log.Printf("[homefeed-browse] request failed (page %d): %v", page, err)
			break
		}
		videos, next := parseBrowsePage(raw)
		for _, v := range videos {
			if seen[v.ID] {
				continue
			}
			seen[v.ID] = true
			all = append(all, v)
		}
		if next == "" || next == token || len(all) >= 30 {
			break
		}
		token = next
	}

	if len(all) == 0 {
		log.Printf("[homefeed-browse] no videos extracted (check that valid logged-in cookies are configured)")
		return nil
	}
	if b, err := json.Marshal(all); err == nil {
		_ = models.SetCachedVideo(homeFeedKey, string(b), int(homeFeedCacheTTL.Seconds()))
	}
	log.Printf("[homefeed-browse] refreshed %d entries", len(all))
	return all
}
