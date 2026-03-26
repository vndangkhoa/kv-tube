package services

import (
	"log"

	"kvtube-go/models"
)

// AddToHistory records a video in the history for the user (default id 1)
func AddToHistory(videoID, title, thumbnail string) error {
	// First check if it already exists to just update timestamp, or insert new
	var existingId int
	err := models.DB.QueryRow("SELECT id FROM user_videos WHERE user_id = 1 AND video_id = ?", videoID).Scan(&existingId)

	if err == nil {
		// Exists, update timestamp
		_, err = models.DB.Exec("UPDATE user_videos SET timestamp = CURRENT_TIMESTAMP WHERE id = ?", existingId)
		if err != nil {
			log.Printf("Error updating history timestamp: %v", err)
			return err
		}
		return nil
	}

	// Insert new
	_, err = models.DB.Exec(
		"INSERT INTO user_videos (user_id, video_id, title, thumbnail, type) VALUES (1, ?, ?, ?, 'history')",
		videoID, title, thumbnail,
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
}

// GetHistory retrieves the most recently watched videos
func GetHistory(limit int) ([]HistoryVideo, error) {
	rows, err := models.DB.Query(
		"SELECT video_id, title, thumbnail FROM user_videos WHERE user_id = 1 ORDER BY timestamp DESC LIMIT ?", limit,
	)
	if err != nil {
		log.Printf("Error querying history: %v", err)
		return nil, err
	}
	defer rows.Close()

	var videos []HistoryVideo
	for rows.Next() {
		var v HistoryVideo
		if err := rows.Scan(&v.ID, &v.Title, &v.Thumbnail); err != nil {
			continue
		}
		videos = append(videos, v)
	}

	return videos, nil
}

// GetSuggestions retrieves suggestions based on the user's recent history
// NOTE: This function now returns empty results since we're using client-side YouTube API
// The frontend should use the YouTube API directly for suggestions
func GetSuggestions(limit int) ([]VideoData, error) {
	// Return empty results - suggestions are now handled client-side
	// Frontend should use YouTube API for suggestions
	return []VideoData{}, nil
}
