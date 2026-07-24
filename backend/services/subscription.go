package services

import (
	"encoding/json"
	"log"
	"sync"
	"time"

	"kvtube-go/models"
)

var (
	feedMu       sync.RWMutex
	cachedFeed   []VideoData
	cachedFeedAt time.Time
)

const feedCacheTTL = 15 * time.Minute

type Subscription struct {
	ID            int    `json:"id"`
	ChannelID     string `json:"channel_id"`
	ChannelName   string `json:"channel_name"`
	ChannelAvatar string `json:"channel_avatar"`
}

func SubscribeChannel(channelID, channelName, channelAvatar string) error {
	_, err := models.DB.Exec(
		`INSERT OR IGNORE INTO subscriptions (user_id, channel_id, channel_name, channel_avatar) VALUES (1, ?, ?, ?)`,
		channelID, channelName, channelAvatar,
	)
	if err != nil {
		log.Printf("Error subscribing to channel: %v", err)
		return err
	}
	return nil
}

func UnsubscribeChannel(channelID string) error {
	_, err := models.DB.Exec(
		`DELETE FROM subscriptions WHERE user_id = 1 AND channel_id = ?`,
		channelID,
	)
	if err != nil {
		log.Printf("Error unsubscribing from channel: %v", err)
		return err
	}
	return nil
}

func IsSubscribed(channelID string) (bool, error) {
	var count int
	err := models.DB.QueryRow(
		`SELECT COUNT(*) FROM subscriptions WHERE user_id = 1 AND channel_id = ?`,
		channelID,
	).Scan(&count)
	if err != nil {
		return false, err
	}
	return count > 0, nil
}

// StartFeedRefresher launches a background goroutine that pre-computes the
// subscription feed every 15 minutes so that GetSubscriptionsFeed never has to
// call yt-dlp on page load.
func StartFeedRefresher() {
	go func() {
		refreshFeed()
		ticker := time.NewTicker(feedCacheTTL)
		for range ticker.C {
			refreshFeed()
		}
	}()
}

func refreshFeed() {
	// Skip refresh if YouTube is currently blocking this server's IP.
	// This prevents wasting CPU on yt-dlp processes that will timeout.
	if isYtDlpBlocked() {
		log.Printf("[feed] Skipping refresh: YouTube is blocking this server's IP")
		return
	}

	subs, err := GetSubscriptions()
	if err != nil || len(subs) == 0 {
		return
	}

	channelIDs := make([]string, 0, len(subs))
	for _, s := range subs {
		if s.ChannelID != "" {
			channelIDs = append(channelIDs, s.ChannelID)
		}
	}

	batch := GetChannelVideosBatch(channelIDs, 5)

	perChannelLists := make([][]VideoData, 0, len(subs))
	for _, s := range subs {
		vids := batch[s.ChannelID]
		if len(vids) == 0 {
			continue
		}
		cleaned := make([]VideoData, 0, len(vids))
		for _, v := range vids {
			if v.ID == "" {
				continue
			}
			if v.Uploader == "" || v.Uploader == "Unknown" {
				v.Uploader = s.ChannelName
			}
			if v.ChannelID == "" {
				v.ChannelID = s.ChannelID
			}
			cleaned = append(cleaned, v)
		}
		if len(cleaned) > 0 {
			perChannelLists = append(perChannelLists, cleaned)
		}
	}

	var feed []VideoData
	seen := make(map[string]bool)
	for i := 0; ; i++ {
		added := false
		for _, list := range perChannelLists {
			if i < len(list) {
				added = true
				v := list[i]
				if !seen[v.ID] {
					seen[v.ID] = true
					feed = append(feed, v)
				}
			}
		}
		if !added {
			break
		}
	}

	if len(feed) > 0 {
		feedMu.Lock()
		cachedFeed = feed
		cachedFeedAt = time.Now()
		feedMu.Unlock()
		// Also persist to DB for restart survival
		if b, err := json.Marshal(feed); err == nil {
			_ = models.SetCachedVideo("subscription_feed", string(b), int(feedCacheTTL.Seconds()))
		}
	}
}

// GetSubscriptionsFeed returns the pre-computed feed from cache if available
// and fresh. Falls back to on-demand computation only on first run.
func GetSubscriptionsFeed(perChannel, maxChannels, offset int) []VideoData {
	feedMu.RLock()
	feed := cachedFeed
	feedAge := time.Since(cachedFeedAt)
	feedMu.RUnlock()

	if feed == nil || feedAge > feedCacheTTL {
		// Try loading persisted cache from DB
		if cached, err := models.GetCachedVideo("subscription_feed"); err == nil && len(cached) > 0 {
			var restored []VideoData
			if json.Unmarshal(cached, &restored) == nil && len(restored) > 0 {
				feedMu.Lock()
				cachedFeed = restored
				cachedFeedAt = time.Now()
				feedMu.Unlock()
				feed = restored
			}
		}
	}

	if feed == nil {
		return []VideoData{}
	}

	// Apply pagination (offset, maxChannels) in-memory
	if offset < 0 {
		offset = 0
	}
	if offset >= len(feed) {
		return []VideoData{}
	}
	end := offset + maxChannels
	if end > len(feed) {
		end = len(feed)
	}
	return feed[offset:end]
}

func GetSubscriptions() ([]Subscription, error) {
	rows, err := models.DB.Query(
		`SELECT id, channel_id, channel_name, channel_avatar FROM subscriptions WHERE user_id = 1 ORDER BY timestamp DESC`,
	)
	if err != nil {
		log.Printf("Error querying subscriptions: %v", err)
		return nil, err
	}
	defer rows.Close()

	var subs []Subscription
	for rows.Next() {
		var s Subscription
		if err := rows.Scan(&s.ID, &s.ChannelID, &s.ChannelName, &s.ChannelAvatar); err != nil {
			continue
		}
		subs = append(subs, s)
	}

	return subs, nil
}
