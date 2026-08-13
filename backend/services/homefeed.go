package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"time"

	"kvtube-go/models"

	"golang.org/x/sync/singleflight"
)

// Personalized home feed. The YouTube main page is a logged-in "tab": with
// the server's cookies attached, yt-dlp extracts the account's real home
// feed (recommendations based on watch history), which is what the app's
// main page mirrors. Extraction is a flat-playlist call (lightweight, passes
// bot checks — KB §1), so it is cached for homeFeedCacheTTL and refreshed in
// the background to keep page loads instant.

const (
	homeFeedCacheTTL  = 15 * time.Minute
	homeFeedBatchSize = 150 // entries extracted per refresh
)

var (
	homeFeedFlight singleflight.Group
	homeFeedKey    = "homefeed"
)

// GetHomeFeed returns the personalized YouTube home feed, sliced for
// pagination. Returns an empty slice (never an error) when the feed cannot
// be fetched (no cookies / bot gate) so the frontend can fall back.
func GetHomeFeed(limit, offset int) []VideoData {
	if limit <= 0 {
		limit = 30
	}
	if offset < 0 {
		offset = 0
	}

	all, ok := getHomeFeedCached()
	if !ok || len(all) == 0 {
		return nil
	}
	if offset >= len(all) {
		return []VideoData{}
	}
	end := offset + limit
	if end > len(all) {
		end = len(all)
	}
	return all[offset:end]
}

// HasMoreHomeFeed reports whether pagination has more entries beyond offset.
func HasMoreHomeFeed(offset int) bool {
	all, ok := getHomeFeedCached()
	if !ok {
		return false
	}
	return offset < len(all)
}

// HomeFeedInfo bundles the feed slice with pagination metadata.
type HomeFeedInfo struct {
	Videos  []VideoData `json:"videos"`
	HasMore bool        `json:"has_more"`
	Cached  bool        `json:"cached"`
}

// GetHomeFeedPage returns one page of the home feed plus pagination info.
func GetHomeFeedPage(limit, offset int) HomeFeedInfo {
	info := HomeFeedInfo{}
	info.Videos = GetHomeFeed(limit, offset)
	info.HasMore = HasMoreHomeFeed(offset + len(info.Videos))
	info.Cached = len(info.Videos) > 0
	return info
}

// getHomeFeedCached returns the full cached feed, fetching it via
// singleflight if missing or expired. ok=false when fetching failed.
func getHomeFeedCached() ([]VideoData, bool) {
	if cached, err := models.GetCachedVideo(homeFeedKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var out []VideoData
		if json.Unmarshal(cached, &out) == nil && len(out) > 0 {
			return out, true
		}
	}

	v, _, _ := homeFeedFlight.Do(homeFeedKey, func() (interface{}, error) {
		return fetchHomeFeed(), nil
	})
	out, _ := v.([]VideoData)
	if len(out) == 0 {
		return nil, false
	}
	return out, true
}

// fetchHomeFeed fetches the personalized home feed. The primary method is
// YouTube's Innertube browse API (FEwhat_to_watch) with the USER's logged-in
// cookies, which returns the account's real "For You" recommendations — the
// `yt-dlp --flat-playlist https://www.youtube.com/` fallback extracts 0 items
// and is kept only as a last resort.
func fetchHomeFeed() []VideoData {
	if v := browseHomeFeed(); len(v) > 0 {
		return v
	}
	return fetchHomeFeedLegacy()
}

// fetchHomeFeedLegacy is the old yt-dlp flat-playlist attempt. It usually
// extracts nothing (YouTube's recommended tab isn't a flat playlist), but is
// harmless to keep as a final fallback.
func fetchHomeFeedLegacy() []VideoData {
	base := []string{
		"--dump-json",
		"--no-warnings",
		"--quiet",
		"--ignore-errors",
		"--user-agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
	}
	args := append(base,
		"--flat-playlist",
		"--playlist-end", fmt.Sprintf("%d", homeFeedBatchSize),
		"https://www.youtube.com/",
	)

	out, _, err := runYtDlpArgsUserCookies(args)
	if err != nil || len(bytes.TrimSpace(out)) == 0 {
		log.Printf("[homefeed] user-cookie extraction failed (%v); falling back to standard chain", err)
		out2, _, err2 := runYtDlpArgs(args)
		if err2 != nil || len(bytes.TrimSpace(out2)) == 0 {
			log.Printf("[homefeed] extraction failed: %v", err2)
			return nil
		}
		out = out2
	}

	var results []VideoData
	seen := make(map[string]bool)
	for _, line := range bytes.Split(out, []byte("\n")) {
		line = bytes.TrimSpace(line)
		if len(line) == 0 {
			continue
		}
		var entry YtDlpEntry
		if json.Unmarshal(line, &entry) != nil {
			continue
		}
		if entry.ID == "" || entry.Title == "" || seen[entry.ID] {
			continue
		}
		seen[entry.ID] = true
		results = append(results, sanitizeVideoData(entry))
	}
	if len(results) == 0 {
		log.Printf("[homefeed] extraction returned no entries")
		return nil
	}

	if b, err := json.Marshal(results); err == nil {
		_ = models.SetCachedVideo(homeFeedKey, string(b), int(homeFeedCacheTTL.Seconds()))
	}
	log.Printf("[homefeed] refreshed: %d entries", len(results))
	return results
}

// StartHomeFeedRefresher warms the home feed cache in the background at boot
// and keeps it fresh, so the main page never blocks on yt-dlp.
func StartHomeFeedRefresher() {
	go func() {
		time.Sleep(3 * time.Second)
		fetchHomeFeed()
		ticker := time.NewTicker(homeFeedCacheTTL)
		for range ticker.C {
			fetchHomeFeed()
		}
	}()
}
