package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"log"
	"strings"
	"time"

	"kvtube-go/models"

	"golang.org/x/sync/singleflight"
)

// Related videos. Relevance matters: search-by-title alone often surfaces
// random streams, so the primary source is YouTube's OWN "Up next" list,
// parsed from the watch page (see watchpage.go). Only when that fails (bot
// gate, removed video) do we fall back to searching for the channel + title
// keywords.

var (
	relatedFlight   singleflight.Group
	relatedCacheTTL = 6 * time.Hour
)

// GetRelatedVideos returns videos related to the given video, using
// YouTube's real "Up next" list when available and falling back to a
// channel+title search otherwise. The current video is always excluded.
// Returns an empty slice (never an error) when nothing could be resolved.
func GetRelatedVideos(videoID string, limit int) []VideoData {
	if videoID == "" {
		return nil
	}
	if limit <= 0 {
		limit = 15
	}
	if limit > 50 {
		limit = 50
	}

	cacheKey := fmt.Sprintf("related:%s:%d", videoID, limit)
	if cached, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var out []VideoData
		if json.Unmarshal(cached, &out) == nil {
			return out
		}
	}

	v, err, _ := relatedFlight.Do(cacheKey, func() (interface{}, error) {
		related, ok := fetchWatchPageRelated(videoID, limit)
		if ok {
			if b, jerr := json.Marshal(related); jerr == nil {
				_ = models.SetCachedVideo(cacheKey, string(b), int(relatedCacheTTL.Seconds()))
			}
			return related, nil
		}
		fallback := searchRelatedFallback(videoID, limit)
		if b, jerr := json.Marshal(fallback); jerr == nil {
			_ = models.SetCachedVideo(cacheKey, string(b), int(relatedCacheTTL.Seconds()))
		}
		return fallback, nil
	})
	if err != nil {
		return nil
	}
	out, _ := v.([]VideoData)
	return out
}

// searchRelatedFallback searches for the channel + title keywords when the
// watch-page related list is unavailable.
func searchRelatedFallback(videoID string, limit int) []VideoData {
	info, err := GetVideoInfo(videoID)
	if err != nil || info == nil {
		return nil
	}
	query := strings.TrimSpace(info.Title)
	if info.Uploader != "" && info.Uploader != "Unknown" {
		query = strings.TrimSpace(info.Uploader + " " + info.Title)
	}
	if query == "" {
		return nil
	}

	results, err := SearchVideos(query, limit+5, "")
	if err != nil {
		return nil
	}
	related := make([]VideoData, 0, len(results))
	for _, v := range results {
		if v.ID != "" && v.ID != videoID {
			related = append(related, v)
		}
		if len(related) >= limit {
			break
		}
	}
	log.Printf("[related] search fallback for %s: %d items", videoID, len(related))
	return related
}
