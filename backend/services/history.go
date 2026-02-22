package services

import (
	"log"
	"strings"

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
func GetSuggestions(limit int) ([]VideoData, error) {
	// 1. Get the 3 most recently watched videos to extract keywords
	history, err := GetHistory(3)
	if err != nil || len(history) == 0 {
		// Fallback to trending if no history
		return SearchVideos("trending videos", limit)
	}

	// 2. Build a combined query string from titles
	var words []string
	for _, h := range history {
		// take first few words from title
		parts := strings.Fields(h.Title)
		for i := 0; i < len(parts) && i < 3; i++ {
			// clean up some common punctuation if needed, or just let yt-dlp handle it
			words = append(words, parts[i])
		}
	}

	query := strings.Join(words, " ")
	if query == "" {
		query = "popular videos"
	}

	// 3. Search using yt-dlp
	return SearchVideos(query, limit)
}
