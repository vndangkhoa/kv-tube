package services

import (
	"archive/zip"
	"encoding/csv"
	"fmt"
	"html"
	"io"
	"log"
	"net/url"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"kvtube-go/models"
)

type TakeoutResult struct {
	HistoryCount      int `json:"history_count"`
	LikedCount        int `json:"liked_count"`
	SubscriptionCount int `json:"subscription_count"`
}

type TakeoutDebugInfo struct {
	AllFiles      []string          `json:"all_files"`
	MatchedFiles  map[string]string `json:"matched_files"`
	SampleEntries map[string]string `json:"sample_entries"`
}

func extractVideoIDFromURL(rawURL string) string {
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	if v := parsed.Query().Get("v"); v != "" {
		return v
	}
	if strings.HasPrefix(parsed.Path, "/shorts/") {
		return strings.TrimPrefix(parsed.Path, "/shorts/")
	}
	if strings.HasPrefix(parsed.Path, "/embed/") {
		return strings.TrimPrefix(parsed.Path, "/embed/")
	}
	return ""
}

func extractTime(timestr string) string {
	if timestr == "" {
		return time.Now().Format("2006-01-02 15:04:05")
	}
	t, err := time.Parse(time.RFC3339, timestr)
	if err != nil {
		return time.Now().Format("2006-01-02 15:04:05")
	}
	return t.Format("2006-01-02 15:04:05")
}

func readFirstBytes(f *zip.File, maxBytes int) (string, error) {
	rc, err := f.Open()
	if err != nil {
		return "", err
	}
	defer rc.Close()
	data, err := io.ReadAll(io.LimitReader(rc, int64(maxBytes)))
	if err != nil {
		return "", err
	}
	return string(data), nil
}

// findFile prefers non-kids paths
func findFile(files []*zip.File, matcher func(string) bool) *zip.File {
	var fallback *zip.File
	for _, f := range files {
		name := filepath.ToSlash(f.Name)
		lower := strings.ToLower(name)
		if matcher(lower) {
			if !strings.Contains(lower, "/kids/") {
				return f
			}
			if fallback == nil {
				fallback = f
			}
		}
	}
	return fallback
}

func DebugTakeoutZip(zipReader io.ReaderAt, zipSize int64) (*TakeoutDebugInfo, error) {
	reader, err := zip.NewReader(zipReader, zipSize)
	if err != nil {
		return nil, fmt.Errorf("failed to read zip: %w", err)
	}

	debug := &TakeoutDebugInfo{
		AllFiles:      []string{},
		MatchedFiles:  map[string]string{},
		SampleEntries: map[string]string{},
	}

	for _, f := range reader.File {
		name := filepath.ToSlash(f.Name)
		debug.AllFiles = append(debug.AllFiles, name)
	}

	watchHistoryFile := findFile(reader.File, func(lower string) bool {
		return strings.Contains(lower, "watch-history") && strings.HasSuffix(lower, ".html")
	})
	subscriptionsFile := findFile(reader.File, func(lower string) bool {
		return strings.HasSuffix(lower, "subscriptions.csv") && !strings.Contains(lower, "kids/")
	})
	likedFile := findFile(reader.File, func(lower string) bool {
		if !strings.HasSuffix(lower, ".csv") || !strings.Contains(lower, "/playlists/") {
			return false
		}
		base := filepath.Base(lower)
		return strings.Contains(base, "liked") || strings.Contains(base, "favorites")
	})

	if watchHistoryFile != nil {
		debug.MatchedFiles["watch_history"] = watchHistoryFile.Name
		if sample, err := readFirstBytes(watchHistoryFile, 1000); err == nil {
			debug.SampleEntries["watch_history"] = sample
		}
	}
	if subscriptionsFile != nil {
		debug.MatchedFiles["subscriptions"] = subscriptionsFile.Name
		if sample, err := readFirstBytes(subscriptionsFile, 1000); err == nil {
			debug.SampleEntries["subscriptions"] = sample
		}
	}
	if likedFile != nil {
		debug.MatchedFiles["liked"] = likedFile.Name
		if sample, err := readFirstBytes(likedFile, 1000); err == nil {
			debug.SampleEntries["liked"] = sample
		}
	}

	return debug, nil
}

func ImportTakeout(zipReader io.ReaderAt, zipSize int64) (*TakeoutResult, error) {
	reader, err := zip.NewReader(zipReader, zipSize)
	if err != nil {
		return nil, fmt.Errorf("failed to read zip: %w", err)
	}

	result := &TakeoutResult{}

	watchHistoryFile := findFile(reader.File, func(lower string) bool {
		return strings.Contains(lower, "watch-history") && strings.HasSuffix(lower, ".html")
	})
	subscriptionsFile := findFile(reader.File, func(lower string) bool {
		return strings.HasSuffix(lower, "subscriptions.csv") && !strings.Contains(lower, "kids/")
	})
	likedFile := findFile(reader.File, func(lower string) bool {
		if !strings.HasSuffix(lower, ".csv") || !strings.Contains(lower, "/playlists/") {
			return false
		}
		base := filepath.Base(lower)
		return strings.Contains(base, "liked") || strings.Contains(base, "favorites")
	})

	if watchHistoryFile != nil {
		log.Printf("[Takeout] Watch history: %s (%d bytes compressed)", watchHistoryFile.Name, watchHistoryFile.CompressedSize64)
		// Wipe existing history so re-imports resolve real titles/channels/dates cleanly.
		if _, err := models.DB.Exec(`DELETE FROM user_videos WHERE user_id = 1 AND type = 'history'`); err != nil {
			log.Printf("[Takeout] Error clearing old history: %v", err)
		}
		count, err := importWatchHistoryHTML(watchHistoryFile)
		if err != nil {
			log.Printf("[Takeout] Error importing watch history: %v", err)
		} else {
			result.HistoryCount = count
		}
	}

	if likedFile != nil {
		log.Printf("[Takeout] Liked videos: %s", likedFile.Name)
		if _, err := models.DB.Exec(`DELETE FROM user_videos WHERE user_id = 1 AND type = 'liked'`); err != nil {
			log.Printf("[Takeout] Error clearing old liked: %v", err)
		}
		count, err := importLikedVideosCSV(likedFile)
		if err != nil {
			log.Printf("[Takeout] Error importing liked videos: %v", err)
		} else {
			result.LikedCount = count
		}
	}

	if subscriptionsFile != nil {
		log.Printf("[Takeout] Subscriptions: %s", subscriptionsFile.Name)
		count, err := importSubscriptionsCSV(subscriptionsFile)
		if err != nil {
			log.Printf("[Takeout] Error importing subscriptions: %v", err)
		} else {
			result.SubscriptionCount = count
		}
	}

	return result, nil
}

var watchDateRe = regexp.MustCompile(`[A-Z][a-z]{2} \d{1,2}, \d{4}, \d{1,2}:\d{2}:\d{2}\s*(?:AM|PM)`)
var tagRe = regexp.MustCompile(`<[^>]*>`)

func isValidVideoID(id string) bool {
	if len(id) != 11 {
		return false
	}
	for _, c := range id {
		if !((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '_') {
			return false
		}
	}
	return true
}

func stripTags(s string) string {
	return tagRe.ReplaceAllString(s, "")
}

var unicodeSpaceReplacer = strings.NewReplacer(
	"\u00a0", " ", // no-break space
	"\u202f", " ", // narrow no-break space
	"\u2009", " ", // thin space
	"\u2007", " ", // figure space
)

// parseWatchDate finds a Takeout date string in the window and returns it in DB format.
func parseWatchDate(window string) string {
	normalized := unicodeSpaceReplacer.Replace(window)
	match := watchDateRe.FindString(normalized)
	if match == "" {
		return time.Now().Format("2006-01-02 15:04:05")
	}
	match = strings.Join(strings.Fields(match), " ")
	t, err := time.Parse("Jan 2, 2006, 3:04:05 PM", match)
	if err != nil {
		return time.Now().Format("2006-01-02 15:04:05")
	}
	return t.Format("2006-01-02 15:04:05")
}

// importWatchHistoryHTML parses the Takeout watch-history HTML, extracting the
// video ID, real title, channel name and watch timestamp for each entry.
func importWatchHistoryHTML(f *zip.File) (int, error) {
	rc, err := f.Open()
	if err != nil {
		return 0, err
	}
	defer rc.Close()

	data, err := io.ReadAll(rc)
	if err != nil {
		return 0, err
	}
	content := string(data)

	seenIDs := make(map[string]bool)
	count := 0

	pos := 0
	for {
		idx := strings.Index(content[pos:], "watch?v=")
		if idx < 0 {
			break
		}
		abs := pos + idx
		rest := content[abs+8:]
		if len(rest) < 11 {
			break
		}
		videoID := rest[:11]
		pos = abs + 8

		if !isValidVideoID(videoID) || seenIDs[videoID] {
			continue
		}
		seenIDs[videoID] = true

		// Bound the entry window: from this anchor up to the next video link (or a cap).
		windowEnd := len(content)
		if next := strings.Index(content[pos:], "watch?v="); next >= 0 {
			windowEnd = pos + next
		}
		if windowEnd > abs+2500 {
			windowEnd = abs + 2500
		}
		window := content[abs:windowEnd]

		// Title: anchor text of the video link.
		title := "Video"
		if gt := strings.Index(window, ">"); gt >= 0 {
			tagEnd := gt + 1
			if close := strings.Index(window[tagEnd:], "</a>"); close >= 0 && close < 400 {
				if t := strings.TrimSpace(html.UnescapeString(stripTags(window[tagEnd : tagEnd+close]))); t != "" {
					title = t
				}
			}
		}

		// Channel: the next anchor pointing at a channel/user page.
		uploader := ""
		for _, marker := range []string{"/channel/", "/user/", "/@", "/c/"} {
			if ci := strings.Index(window, marker); ci >= 0 {
				if g := strings.Index(window[ci:], ">"); g >= 0 {
					s := ci + g + 1
					if ce := strings.Index(window[s:], "</a>"); ce >= 0 && ce < 200 {
						if u := strings.TrimSpace(html.UnescapeString(stripTags(window[s : s+ce]))); u != "" {
							uploader = u
							break
						}
					}
				}
			}
		}

		watchTime := parseWatchDate(window)
		insertHistory(videoID, title, uploader, watchTime)
		count++
	}

	log.Printf("[Takeout] Found %d unique videos in watch history", count)
	return count, nil
}

func insertHistory(videoID, title, uploader, timestamp string) {
	thumbnail := fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", videoID)
	_, err := models.DB.Exec(
		`INSERT OR IGNORE INTO user_videos (user_id, video_id, title, thumbnail, uploader, type, timestamp) VALUES (1, ?, ?, ?, ?, 'history', ?)`,
		videoID, title, thumbnail, uploader, timestamp,
	)
	if err != nil {
		log.Printf("[Takeout] Error inserting history %s: %v", videoID, err)
	}
}

func importLikedVideosCSV(f *zip.File) (int, error) {
	rc, err := f.Open()
	if err != nil {
		return 0, err
	}
	defer rc.Close()

	reader := csv.NewReader(rc)
	records, err := reader.ReadAll()
	if err != nil {
		return 0, fmt.Errorf("failed to parse CSV: %w", err)
	}

	if len(records) < 2 {
		return 0, nil
	}

	header := records[0]
	videoIDIdx := -1
	titleIdx := -1
	addedAtIdx := -1

	for i, col := range header {
		colLower := strings.ToLower(strings.TrimSpace(col))
		if colLower == "video id" || colLower == "videoid" {
			videoIDIdx = i
		}
		if colLower == "title" {
			titleIdx = i
		}
		if colLower == "playlist video creation timestamp" || colLower == "added at" || colLower == "date" {
			addedAtIdx = i
		}
	}

	log.Printf("[Takeout] Liked CSV: %d rows, header: %v", len(records)-1, header)

	if videoIDIdx < 0 {
		return 0, fmt.Errorf("no 'Video ID' column in CSV, header: %v", header)
	}

	count := 0
	for _, record := range records[1:] {
		if videoIDIdx >= len(record) {
			continue
		}
		videoID := strings.TrimSpace(record[videoIDIdx])
		if videoID == "" {
			continue
		}

		title := "Video"
		if titleIdx >= 0 && titleIdx < len(record) {
			if t := strings.TrimSpace(record[titleIdx]); t != "" {
				title = t
			}
		}

		timestamp := time.Now().Format("2006-01-02 15:04:05")
		if addedAtIdx >= 0 && addedAtIdx < len(record) {
			timestamp = extractTime(strings.TrimSpace(record[addedAtIdx]))
		}

		thumbnail := fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", videoID)
		_, err := models.DB.Exec(
			`INSERT OR IGNORE INTO user_videos (user_id, video_id, title, thumbnail, type, timestamp) VALUES (1, ?, ?, ?, 'liked', ?)`,
			videoID, title, thumbnail, timestamp,
		)
		if err != nil {
			log.Printf("[Takeout] Error inserting liked video %s: %v", videoID, err)
			continue
		}
		count++
	}

	log.Printf("[Takeout] Imported %d liked videos", count)
	return count, nil
}

func importSubscriptionsCSV(f *zip.File) (int, error) {
	rc, err := f.Open()
	if err != nil {
		return 0, err
	}
	defer rc.Close()

	reader := csv.NewReader(rc)
	records, err := reader.ReadAll()
	if err != nil {
		return 0, fmt.Errorf("failed to parse CSV: %w", err)
	}

	if len(records) < 2 {
		return 0, nil
	}

	header := records[0]
	channelIDIdx := -1
	channelNameIdx := -1
	channelURLIdx := -1

	for i, col := range header {
		colLower := strings.ToLower(strings.TrimSpace(col))
		if colLower == "channel id" || colLower == "channelid" {
			channelIDIdx = i
		}
		if colLower == "channel name" || colLower == "channelname" || colLower == "channel title" || colLower == "name" {
			channelNameIdx = i
		}
		if colLower == "channel url" || colLower == "channelurl" || colLower == "url" {
			channelURLIdx = i
		}
	}

	log.Printf("[Takeout] Subscriptions CSV: %d rows, header: %v", len(records)-1, header)

	count := 0
	for _, record := range records[1:] {
		channelID := ""
		if channelIDIdx >= 0 && channelIDIdx < len(record) {
			channelID = strings.TrimSpace(record[channelIDIdx])
		}
		if channelID == "" && channelURLIdx >= 0 && channelURLIdx < len(record) {
			channelID = extractChannelIDFromURL(strings.TrimSpace(record[channelURLIdx]))
		}
		if channelID == "" {
			continue
		}

		channelName := ""
		if channelNameIdx >= 0 && channelNameIdx < len(record) {
			channelName = strings.TrimSpace(record[channelNameIdx])
		}

		_, err := models.DB.Exec(
			`INSERT OR IGNORE INTO subscriptions (user_id, channel_id, channel_name, channel_avatar) VALUES (1, ?, ?, ?)`,
			channelID, channelName, "",
		)
		if err != nil {
			log.Printf("[Takeout] Error inserting subscription %s: %v", channelID, err)
			continue
		}
		count++
	}

	log.Printf("[Takeout] Imported %d subscriptions", count)
	return count, nil
}

func extractChannelIDFromURL(rawURL string) string {
	if rawURL == "" {
		return ""
	}
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return ""
	}
	if strings.HasPrefix(parsed.Path, "/channel/") {
		return strings.TrimPrefix(parsed.Path, "/channel/")
	}
	return ""
}
