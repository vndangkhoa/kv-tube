package services

import (
	"log"

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

// GetSuggestions retrieves suggestions based on the user's recent history
// NOTE: This function now returns empty results since we're using client-side YouTube API
// The frontend should use the YouTube API directly for suggestions
func GetSuggestions(limit int) ([]VideoData, error) {
	// Return empty results - suggestions are now handled client-side
	// Frontend should use YouTube API for suggestions
	return []VideoData{}, nil
}
