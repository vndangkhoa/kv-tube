package services

import (
	"log"

	"kvtube-go/models"
)

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

// GetSubscriptionsFeed builds a single mixed feed of the latest videos across the
// most recently subscribed channels. Channels are fetched in parallel (cached,
// flat-playlist so none get dropped), then round-robin interleaved in
// subscription-recency order so the top of the feed is a blend of the newest
// uploads from recently subscribed channels rather than being grouped per channel.
//
// maxChannels limits how many channels are pulled (subscriptions can number in the
// thousands); offset lets the caller page through older subscriptions.
func GetSubscriptionsFeed(perChannel, maxChannels, offset int) []VideoData {
	subs, err := GetSubscriptions()
	if err != nil || len(subs) == 0 {
		return []VideoData{}
	}

	if offset < 0 {
		offset = 0
	}
	if offset >= len(subs) {
		return []VideoData{}
	}
	end := offset + maxChannels
	if end > len(subs) {
		end = len(subs)
	}
	subs = subs[offset:end]

	channelIDs := make([]string, 0, len(subs))
	for _, s := range subs {
		if s.ChannelID != "" {
			channelIDs = append(channelIDs, s.ChannelID)
		}
	}

	batch := GetChannelVideosBatch(channelIDs, perChannel)

	// Preserve subscription-recency order; attach channel display info.
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

	// Round-robin interleave: newest of every channel first, then the next, etc.
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

	return feed
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
