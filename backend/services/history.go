package services

import (
	"log"
	"strings"
	"sync"

	"kvtube-go/models"
)

// AddToHistory records a video in the history for the user (default id 1)
func AddToHistory(videoID, title, thumbnail, uploader string) error {
	// Check for an existing history entry (must match type so liked rows aren't touched)
	var existingId int
	err := models.DB.QueryRow(
		"SELECT id FROM user_videos WHERE user_id = 1 AND video_id = ? AND type = 'history'", videoID,
	).Scan(&existingId)

	if err == nil {
		// Exists, refresh timestamp and metadata
		_, err = models.DB.Exec(
			"UPDATE user_videos SET timestamp = CURRENT_TIMESTAMP, title = ?, thumbnail = ?, uploader = ? WHERE id = ?",
			title, thumbnail, uploader, existingId,
		)
		if err != nil {
			log.Printf("Error updating history timestamp: %v", err)
			return err
		}
		return nil
	}

	// Insert new
	_, err = models.DB.Exec(
		"INSERT INTO user_videos (user_id, video_id, title, thumbnail, uploader, type) VALUES (1, ?, ?, ?, ?, 'history')",
		videoID, title, thumbnail, uploader,
	)
	if err != nil {
		log.Printf("Error inserting history: %v", err)
		return err
	}

	return nil
}

// HistoryVideo represents a video in the user's history
type HistoryVideo struct {
	ID        string `json:"id"`
	Title     string `json:"title"`
	Thumbnail string `json:"thumbnail"`
	Uploader  string `json:"uploader"`
	WatchedAt string `json:"watched_at"`
}

func scanUserVideos(limit int, videoType string) ([]HistoryVideo, error) {
	rows, err := models.DB.Query(
		`SELECT video_id, title, thumbnail, COALESCE(uploader, ''), COALESCE(timestamp, '')
		 FROM user_videos WHERE user_id = 1 AND type = ? ORDER BY timestamp DESC LIMIT ?`,
		videoType, limit,
	)
	if err != nil {
		log.Printf("Error querying %s: %v", videoType, err)
		return nil, err
	}
	defer rows.Close()

	var videos []HistoryVideo
	for rows.Next() {
		var v HistoryVideo
		if err := rows.Scan(&v.ID, &v.Title, &v.Thumbnail, &v.Uploader, &v.WatchedAt); err != nil {
			continue
		}
		videos = append(videos, v)
	}

	return videos, nil
}

// GetHistory retrieves the most recently watched videos
func GetHistory(limit int) ([]HistoryVideo, error) {
	return scanUserVideos(limit, "history")
}

// GetLikedVideos retrieves the user's liked videos
func GetLikedVideos(limit int) ([]HistoryVideo, error) {
	return scanUserVideos(limit, "liked")
}

// GetSmartSuggestions generates personalized video suggestions based on provided seed video IDs
// or recently watched videos from the database. It queries YouTube's real "Up Next" graph
// concurrently, excludes already-watched and dismissed videos, and round-robin interleaves
// the results across seeds to provide maximum topic diversity.
func GetSmartSuggestions(seedIDs []string, excludeIDs []string, limit int) ([]VideoData, error) {
	if limit <= 0 {
		limit = 12
	}
	if limit > 50 {
		limit = 50
	}

	excludeSet := make(map[string]bool)
	for _, id := range excludeIDs {
		if id = strings.TrimSpace(id); id != "" {
			excludeSet[id] = true
		}
	}

	// If no seeds provided by caller, look up user's recent history from DB
	effectiveSeeds := make([]string, 0, len(seedIDs))
	for _, id := range seedIDs {
		if id = strings.TrimSpace(id); id != "" {
			effectiveSeeds = append(effectiveSeeds, id)
			excludeSet[id] = true
		}
	}

	if len(effectiveSeeds) == 0 {
		history, err := GetHistory(10)
		if err == nil {
			for _, h := range history {
				if h.ID != "" {
					excludeSet[h.ID] = true
					if len(effectiveSeeds) < 4 {
						effectiveSeeds = append(effectiveSeeds, h.ID)
					}
				}
			}
		}
	}

	if len(effectiveSeeds) == 0 {
		return []VideoData{}, nil
	}

	// Limit to top 4 seeds for performance & diversity
	if len(effectiveSeeds) > 4 {
		effectiveSeeds = effectiveSeeds[:4]
	}

	// Concurrently fetch related videos for each seed
	type seedPool struct {
		seedID string
		videos []VideoData
	}

	pools := make([]seedPool, len(effectiveSeeds))
	var wg sync.WaitGroup

	for i, seed := range effectiveSeeds {
		wg.Add(1)
		go func(idx int, s string) {
			defer wg.Done()
			rel := GetRelatedVideos(s, 12)
			pools[idx] = seedPool{
				seedID: s,
				videos: rel,
			}
		}(i, seed)
	}
	wg.Wait()

	// Round-robin interleaving across seed pools with strict deduplication
	seen := make(map[string]bool)
	for k := range excludeSet {
		seen[k] = true
	}

	var suggestions []VideoData
	maxDepth := 12
	for depth := 0; depth < maxDepth; depth++ {
		for _, pool := range pools {
			if depth < len(pool.videos) {
				v := pool.videos[depth]
				if v.ID != "" && !seen[v.ID] {
					seen[v.ID] = true
					suggestions = append(suggestions, v)
					if len(suggestions) >= limit {
						return suggestions, nil
					}
				}
			}
		}
	}

	return suggestions, nil
}

// GetSuggestions retrieves suggestions based on the user's recent history
func GetSuggestions(limit int) ([]VideoData, error) {
	return GetSmartSuggestions(nil, nil, limit)
}
