package models

import (
	"database/sql"
	"encoding/json"
	"log"
	"time"
)

type CacheEntry struct {
	VideoID   string
	Data      []byte
	ExpiresAt time.Time
}

// GetCachedVideo retrieves cached video data by video ID
func GetCachedVideo(videoID string) ([]byte, error) {
	if DB == nil {
		return nil, nil
	}

	var data []byte
	var expiresAt time.Time
	err := DB.QueryRow(
		`SELECT data, expires_at FROM video_cache WHERE video_id = ? AND expires_at > ?`,
		videoID, time.Now(),
	).Scan(&data, &expiresAt)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		log.Printf("Cache query error: %v", err)
		return nil, err
	}

	return data, nil
}

// GetStaleCachedVideo retrieves cached video data even if expired (used as fallback when YouTube is blocking)
func GetStaleCachedVideo(videoID string) ([]byte, error) {
	if DB == nil {
		return nil, nil
	}

	var data []byte
	err := DB.QueryRow(
		`SELECT data FROM video_cache WHERE video_id = ? ORDER BY expires_at DESC LIMIT 1`,
		videoID,
	).Scan(&data)

	if err == sql.ErrNoRows {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}

	return data, nil
}

// SetCachedVideo stores video data in cache with TTL
func SetCachedVideo(videoID string, data interface{}, ttlSeconds int) error {
	if DB == nil {
		return nil
	}

	// Store raw bytes/strings verbatim so the exact payload is returned on read.
	// Only fall back to JSON marshaling for structured values.
	var stored string
	switch v := data.(type) {
	case string:
		stored = v
	case []byte:
		stored = string(v)
	default:
		jsonData, err := json.Marshal(data)
		if err != nil {
			return err
		}
		stored = string(jsonData)
	}

	expiresAt := time.Now().Add(time.Duration(ttlSeconds) * time.Second)

	CacheMu.Lock()
	_, err := DB.Exec(
		`INSERT OR REPLACE INTO video_cache (video_id, data, expires_at) VALUES (?, ?, ?)`,
		videoID, stored, expiresAt,
	)
	CacheMu.Unlock()

	if err != nil {
		log.Printf("Cache store error: %v", err)
	}

	return err
}

// ClearVideoCache removes all cached yt-dlp data so everything re-fetches
// under a new cookie session (KB §7: clear in-memory caches after any cookie
// refresh so nothing keeps using the stale session).
func ClearVideoCache() {
	if DB == nil {
		return
	}

	CacheMu.Lock()
	_, err := DB.Exec(`DELETE FROM video_cache`)
	CacheMu.Unlock()
	if err != nil {
		log.Printf("Cache clear error: %v", err)
		return
	}
	log.Printf("Cleared video cache after cookie change")
}

// CleanExpiredCache removes expired cache entries
func CleanExpiredCache() {
	if DB == nil {
		return
	}

	result, err := DB.Exec(`DELETE FROM video_cache WHERE expires_at < ?`, time.Now())
	if err != nil {
		log.Printf("Cache cleanup error: %v", err)
		return
	}

	rows, _ := result.RowsAffected()
	if rows > 0 {
		log.Printf("Cleaned %d expired cache entries", rows)
	}
}

// StartCacheCleanupScheduler runs periodic cache cleanup
func StartCacheCleanupScheduler() {
	go func() {
		ticker := time.NewTicker(1 * time.Hour)
		for range ticker.C {
			CleanExpiredCache()
		}
	}()
}
