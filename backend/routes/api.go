package routes

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"

	"kvtube-go/services"

	"github.com/gin-gonic/gin"
)

// getAllowedOrigins returns allowed CORS origins from environment variable or defaults
func getAllowedOrigins() []string {
	originsEnv := os.Getenv("CORS_ALLOWED_ORIGINS")
	if originsEnv == "" {
		// Default: allow localhost for development
		return []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://localhost:5011",
			"http://127.0.0.1:5011",
		}
	}
	origins := strings.Split(originsEnv, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return origins
}

// isAllowedOrigin checks if the given origin is in the allowed list
func isAllowedOrigin(origin string, allowedOrigins []string) bool {
	for _, allowed := range allowedOrigins {
		if allowed == "*" || allowed == origin {
			return true
		}
	}
	return false
}

func SetupRouter() *gin.Engine {
	r := gin.Default()

	// CORS middleware - restrict to specific origins from environment variable
	allowedOrigins := getAllowedOrigins()
	r.Use(func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" && isAllowedOrigin(origin, allowedOrigins) {
			c.Writer.Header().Set("Access-Control-Allow-Origin", origin)
		}
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// API Routes - Using yt-dlp for video operations
	api := r.Group("/api")
	{
		// Health check
		api.GET("/health", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"status": "ok"})
		})

		// Video endpoints
		api.GET("/search", handleSearch)
		api.GET("/trending", handleTrending)
		api.GET("/video/:id", handleGetVideoInfo)
		api.GET("/video/:id/qualities", handleGetQualities)
		api.GET("/video/:id/related", handleRelatedVideos)
		api.GET("/video/:id/comments", handleComments)
		api.GET("/video/:id/download", handleDownload)

		// Video metadata
		api.POST("/videos/dates", handleVideoDates)
		api.POST("/videos/stats", handleVideoStats)

		// Channel endpoints
		api.GET("/channel/info", handleChannelInfo)
		api.GET("/channel/page", handleChannelPage)
		api.GET("/channel/avatars", handleChannelAvatars)
		api.GET("/channel/videos", handleChannelVideos)
		api.POST("/channels/videos-batch", handleChannelVideosBatch)

		// History routes
		api.POST("/history", handlePostHistory)
		api.GET("/history", handleGetHistory)
		api.GET("/liked", handleGetLiked)
		api.GET("/suggestions", handleGetSuggestions)

		// Stream endpoints (self-hosted player)
		api.GET("/video/:id/manifest", handleManifest)
		api.GET("/get_stream_info", handleGetStreamInfo)
		api.GET("/proxy", handleProxy)

		// High-resolution streaming: merge bestvideo+bestaudio → local HLS
		api.GET("/stream", handleStream)
		api.POST("/stream/stop", handleStreamStop)
		api.GET("/hls/:session/*filepath", handleHlsFile)

		// Subscription routes
		api.POST("/subscribe", handleSubscribe)
		api.DELETE("/subscribe", handleUnsubscribe)
		api.GET("/subscribe", handleCheckSubscription)
		api.GET("/subscriptions", handleGetSubscriptions)
		api.GET("/subscriptions/feed", handleSubscriptionsFeed)

		// Import routes
		api.POST("/import/takeout", handleImportTakeout)
		api.POST("/import/debug", handleDebugImport)
	}

	return r
}

// Video search endpoint
func handleSearch(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter 'q' is required"})
		return
	}

	limitStr := c.Query("limit")
	limit := 20
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	results, err := services.SearchVideos(query, limit)
	if err != nil {
		log.Printf("Search error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search videos"})
		return
	}

	c.JSON(http.StatusOK, results)
}

// handleVideoDates resolves real upload dates for a batch of video IDs.
func handleVideoDates(c *gin.Context) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	if len(body.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{})
		return
	}
	if len(body.IDs) > 60 {
		body.IDs = body.IDs[:60]
	}

	dates := services.GetVideoUploadDates(body.IDs)
	c.JSON(http.StatusOK, dates)
}

// Resolve view counts (and upload dates) for a batch of video IDs. Used to
// hydrate channel-page videos, whose flat-playlist listing lacks view counts.
func handleVideoStats(c *gin.Context) {
	var body struct {
		IDs []string `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
	if len(body.IDs) == 0 {
		c.JSON(http.StatusOK, gin.H{})
		return
	}
	if len(body.IDs) > 60 {
		body.IDs = body.IDs[:60]
	}

	stats := services.GetVideoStats(body.IDs)
	c.JSON(http.StatusOK, stats)
}

// Trending videos endpoint
func handleTrending(c *gin.Context) {
	limitStr := c.Query("limit")
	limit := 20
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	// Use popular music search as trending
	results, err := services.SearchVideos("popular music trending", limit)
	if err != nil {
		log.Printf("Trending error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get trending videos"})
		return
	}

	c.JSON(http.StatusOK, results)
}

// Get video info
func handleGetVideoInfo(c *gin.Context) {
	videoID := c.Param("id")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	video, err := services.GetVideoInfo(videoID)
	if err != nil {
		log.Printf("GetVideoInfo error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get video info"})
		return
	}

	c.JSON(http.StatusOK, video)
}

// Get video qualities
func handleGetQualities(c *gin.Context) {
	videoID := c.Param("id")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	qualities, audioURL, err := services.GetVideoQualitiesWithAudio(videoID)
	if err != nil {
		log.Printf("GetQualities error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get video qualities"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"qualities": qualities,
		"audio_url": audioURL,
	})
}

// Get related videos
func handleRelatedVideos(c *gin.Context) {
	videoID := c.Param("id")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	limitStr := c.Query("limit")
	limit := 15
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 50 {
		limit = l
	}

	// First get video info to get title and uploader
	video, err := services.GetVideoInfo(videoID)
	if err != nil {
		log.Printf("GetVideoInfo for related error: %v", err)
		// Fallback: search for similar content
		results, err := services.SearchVideos("music", limit)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get related videos"})
			return
		}
		c.JSON(http.StatusOK, results)
		return
	}

	related, err := services.GetRelatedVideos(video.Title, video.Uploader, limit)
	if err != nil {
		log.Printf("GetRelatedVideos error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get related videos"})
		return
	}

	c.JSON(http.StatusOK, related)
}

// Get video comments
func handleComments(c *gin.Context) {
	videoID := c.Param("id")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	limitStr := c.Query("limit")
	limit := 20
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	comments, err := services.GetComments(videoID, limit)
	if err != nil {
		log.Printf("GetComments error: %v", err)
		c.JSON(http.StatusOK, []interface{}{}) // Return empty array instead of error
		return
	}

	c.JSON(http.StatusOK, comments)
}

// Get download URL
func handleDownload(c *gin.Context) {
	videoID := c.Param("id")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	formatID := c.Query("format")

	downloadInfo, err := services.GetDownloadURL(videoID, formatID)
	if err != nil {
		log.Printf("GetDownloadURL error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get download URL"})
		return
	}

	c.JSON(http.StatusOK, downloadInfo)
}

// Get channel info
func handleChannelInfo(c *gin.Context) {
	channelID := c.Query("id")
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel ID is required"})
		return
	}

	channelInfo, err := services.GetChannelInfo(channelID)
	if err != nil {
		log.Printf("GetChannelInfo error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get channel info"})
		return
	}

	c.JSON(http.StatusOK, channelInfo)
}

// Get channel info + latest videos in a single fast call
func handleChannelPage(c *gin.Context) {
	channelID := c.Query("id")
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel ID is required"})
		return
	}

	limit := 48
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 200 {
		limit = l
	}

	page, err := services.GetChannelPage(channelID, limit)
	if err != nil {
		log.Printf("GetChannelPage error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get channel page"})
		return
	}

	c.JSON(http.StatusOK, page)
}

// Get channel avatar URLs for one or more channels (comma-separated ids).
// Lightweight, long-cached; used to lazily hydrate subscription avatars.
func handleChannelAvatars(c *gin.Context) {
	idsParam := c.Query("ids")
	if idsParam == "" {
		idsParam = c.Query("id")
	}
	if idsParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "id(s) required"})
		return
	}

	ids := []string{}
	for _, raw := range strings.Split(idsParam, ",") {
		if s := strings.TrimSpace(raw); s != "" {
			ids = append(ids, s)
		}
	}
	if len(ids) > 30 {
		ids = ids[:30]
	}

	type avatarResult struct {
		AvatarURL string `json:"avatar_url"`
		Name      string `json:"name"`
	}
	results := make(map[string]avatarResult, len(ids))
	var mu sync.Mutex
	var wg sync.WaitGroup
	sem := make(chan struct{}, 6)

	for _, id := range ids {
		wg.Add(1)
		go func(id string) {
			defer wg.Done()
			sem <- struct{}{}
			defer func() { <-sem }()
			url, name, err := services.GetChannelAvatar(id)
			if err != nil || url == "" {
				return
			}
			mu.Lock()
			results[id] = avatarResult{AvatarURL: url, Name: name}
			mu.Unlock()
		}(id)
	}
	wg.Wait()

	c.JSON(http.StatusOK, results)
}

// Get channel videos
func handleChannelVideos(c *gin.Context) {
	channelID := c.Query("id")
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel ID is required"})
		return
	}

	limitStr := c.Query("limit")
	limit := 30
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 && l <= 100 {
		limit = l
	}

	videos, err := services.GetChannelVideos(channelID, limit)
	if err != nil {
		log.Printf("GetChannelVideos error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get channel videos"})
		return
	}

	c.JSON(http.StatusOK, videos)
}

func handleChannelVideosBatch(c *gin.Context) {
	var body struct {
		ChannelIDs []string `json:"channel_ids"`
		Limit      int      `json:"limit"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if len(body.ChannelIDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "channel_ids is required"})
		return
	}

	limit := 30
	if body.Limit > 0 && body.Limit <= 100 {
		limit = body.Limit
	}

	results := services.GetChannelVideosBatch(body.ChannelIDs, limit)
	c.JSON(http.StatusOK, results)
}

// History handlers
func handlePostHistory(c *gin.Context) {
	var body struct {
		VideoID   string `json:"video_id"`
		Title     string `json:"title"`
		Thumbnail string `json:"thumbnail"`
		Uploader  string `json:"uploader"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if body.VideoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	err := services.AddToHistory(body.VideoID, body.Title, body.Thumbnail, body.Uploader)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update history"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "success"})
}

func handleGetHistory(c *gin.Context) {
	limitStr := c.Query("limit")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	history, err := services.GetHistory(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get history"})
		return
	}

	// Make the API response shape match the VideoData shape the frontend expects
	results := make([]services.VideoData, 0, len(history))
	for _, h := range history {
		results = append(results, services.VideoData{
			ID:        h.ID,
			Title:     h.Title,
			Thumbnail: h.Thumbnail,
			Uploader:  h.Uploader,
			WatchedAt: h.WatchedAt,
		})
	}

	c.JSON(http.StatusOK, results)
}

func handleGetLiked(c *gin.Context) {
	limitStr := c.Query("limit")
	limit := 50
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	liked, err := services.GetLikedVideos(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get liked videos"})
		return
	}

	results := make([]services.VideoData, 0, len(liked))
	for _, h := range liked {
		results = append(results, services.VideoData{
			ID:        h.ID,
			Title:     h.Title,
			Thumbnail: h.Thumbnail,
			Uploader:  h.Uploader,
			WatchedAt: h.WatchedAt,
		})
	}

	c.JSON(http.StatusOK, results)
}

func handleGetSuggestions(c *gin.Context) {
	limitStr := c.Query("limit")
	limit := 20
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	suggestions, err := services.GetSuggestions(limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get suggestions"})
		return
	}

	c.JSON(http.StatusOK, suggestions)
}

// Subscription handlers
func handleSubscribe(c *gin.Context) {
	var body struct {
		ChannelID     string `json:"channel_id"`
		ChannelName   string `json:"channel_name"`
		ChannelAvatar string `json:"channel_avatar"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if body.ChannelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel ID is required"})
		return
	}

	err := services.SubscribeChannel(body.ChannelID, body.ChannelName, body.ChannelAvatar)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to subscribe"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "subscribed"})
}

func handleUnsubscribe(c *gin.Context) {
	channelID := c.Query("channel_id")
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel ID is required"})
		return
	}

	err := services.UnsubscribeChannel(channelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to unsubscribe"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"status": "unsubscribed"})
}

func handleCheckSubscription(c *gin.Context) {
	channelID := c.Query("channel_id")
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel ID is required"})
		return
	}

	subscribed, err := services.IsSubscribed(channelID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to check subscription"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"subscribed": subscribed})
}

func handleGetSubscriptions(c *gin.Context) {
	subs, err := services.GetSubscriptions()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get subscriptions"})
		return
	}

	c.JSON(http.StatusOK, subs)
}

// handleSubscriptionsFeed returns a single mixed feed of the latest videos across
// all subscribed channels, interleaved rather than grouped per channel.
func handleSubscriptionsFeed(c *gin.Context) {
	perChannel := 5
	if v := c.Query("per_channel"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 20 {
			perChannel = n
		}
	}

	maxChannels := 20
	if v := c.Query("channels"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 && n <= 40 {
			maxChannels = n
		}
	}

	offset := 0
	if v := c.Query("offset"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n >= 0 {
			offset = n
		}
	}

	feed := services.GetSubscriptionsFeed(perChannel, maxChannels, offset)
	c.JSON(http.StatusOK, feed)
}

func logPrintf(format string, v ...interface{}) {
	log.Printf(format, v...)
}

// Manifest response for self-hosted player
type ManifestResponse struct {
	VideoID  string                  `json:"video_id"`
	Title    string                  `json:"title"`
	HlsURL   string                  `json:"hls_url"`
	Formats  []services.QualityFormat `json:"formats"`
	BestURL  string                  `json:"best_url"`
	AudioURL string                  `json:"audio_url"`
}

func handleManifest(c *gin.Context) {
	videoID := c.Param("id")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	video, qualities, audioURL, err := services.GetFullStreamData(videoID)
	if err != nil {
		log.Printf("GetFullStreamData error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get stream data"})
		return
	}

	// Find HLS URL from qualities
	var hlsURL string
	var bestURL string
	for _, q := range qualities {
		if q.IsHLS && hlsURL == "" {
			hlsURL = q.URL
		}
		if q.HasAudio && bestURL == "" {
			bestURL = q.URL
		}
	}
	// Fallback bestURL to first quality
	if bestURL == "" && len(qualities) > 0 {
		bestURL = qualities[0].URL
	}

	c.JSON(http.StatusOK, ManifestResponse{
		VideoID:  video.ID,
		Title:    video.Title,
		HlsURL:   hlsURL,
		Formats:  qualities,
		BestURL:  bestURL,
		AudioURL: audioURL,
	})
}

type StreamInfoResponse struct {
	StreamURL string `json:"stream_url"`
	Error     string `json:"error,omitempty"`
}

func handleGetStreamInfo(c *gin.Context) {
	videoID := c.Query("v")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID parameter 'v' is required"})
		return
	}

	// Use GetFullStreamData (same as manifest endpoint — proven reliable)
	video, qualities, _, err := services.GetFullStreamData(videoID)
	if err != nil {
		log.Printf("GetStreamInfo error: %v", err)
		c.JSON(http.StatusInternalServerError, StreamInfoResponse{Error: "Failed to get stream info"})
		return
	}

	if len(qualities) == 0 {
		c.JSON(http.StatusNotFound, StreamInfoResponse{Error: "No stream found"})
		return
	}

	// Best combined format (highest res with audio)
	var bestURL string
	var bestHeight int
	for _, q := range qualities {
		if q.HasAudio && q.Height > bestHeight {
			bestURL = q.URL
			bestHeight = q.Height
			break
		}
	}
	// Fallback: first format with audio_url, or first format overall
	if bestURL == "" {
		for _, q := range qualities {
			if q.AudioURL != "" {
				bestURL = q.URL
				break
			}
		}
	}
	if bestURL == "" && len(qualities) > 0 {
		bestURL = qualities[0].URL
	}

	if bestURL == "" {
		c.JSON(http.StatusNotFound, StreamInfoResponse{Error: "No stream URL found"})
		return
	}

	_ = video // unused but available for future metadata
	c.JSON(http.StatusOK, StreamInfoResponse{StreamURL: bestURL})
}

func handleImportTakeout(c *gin.Context) {
	log.Printf("[Takeout] Import request received from %s", c.ClientIP())
	defer func() {
		if r := recover(); r != nil {
			log.Printf("[Takeout] PANIC recovered: %v", r)
			c.JSON(http.StatusInternalServerError, gin.H{"error": fmt.Sprintf("Internal error: %v", r)})
		}
	}()

	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File upload required"})
		return
	}
	defer file.Close()

	if header.Size == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Empty file"})
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read uploaded file"})
		return
	}

	readerAt := &bytesReaderAt{data: data}

	result, err := services.ImportTakeout(readerAt, int64(len(data)))
	if err != nil {
		log.Printf("[Takeout] Import error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to import Takeout data: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"status":             "success",
		"history_count":      result.HistoryCount,
		"liked_count":        result.LikedCount,
		"subscription_count": result.SubscriptionCount,
	})
}

func handleDebugImport(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "File upload required"})
		return
	}
	defer file.Close()

	if header.Size == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Empty file"})
		return
	}

	data, err := io.ReadAll(file)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to read uploaded file"})
		return
	}

	readerAt := &bytesReaderAt{data: data}

	debug, err := services.DebugTakeoutZip(readerAt, int64(len(data)))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	c.JSON(http.StatusOK, debug)
}

// bytesReaderAt implements io.ReaderAt for a byte slice
type bytesReaderAt struct {
	data []byte
}

func (b *bytesReaderAt) ReadAt(p []byte, off int64) (int, error) {
	if off >= int64(len(b.data)) {
		return 0, io.EOF
	}
	n := copy(p, b.data[off:])
	if n < len(p) {
		return n, io.EOF
	}
	return n, nil
}

func handleProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url parameter is required"})
		return
	}

	req, err := http.NewRequest(c.Request.Method, targetURL, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Forward range header for video seeking
	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")
	req.Header.Set("Referer", "https://www.youtube.com/")
	req.Header.Set("Origin", "https://www.youtube.com")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Proxy error fetching %s: %v", targetURL[:min(len(targetURL), 100)], err)
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to fetch URL"})
		return
	}
	defer resp.Body.Close()

	// Copy response headers
	for key, values := range resp.Header {
		for _, value := range values {
			c.Writer.Header().Add(key, value)
		}
	}

	c.Status(resp.StatusCode)
	if _, err := io.Copy(c.Writer, resp.Body); err != nil {
		log.Printf("Proxy copy error: %v", err)
	}
}

// handleStream kicks off a server-side merge of the highest-resolution
// video-only format with the best audio-only format, producing a local HLS
// playlist. This is how we reach 1080p/1440p/4K (YouTube only muxes audio into
// <=720p progressive files). Returns the playlist path to play via hls.js.
func handleStream(c *gin.Context) {
	videoID := c.Query("v")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID parameter 'v' is required"})
		return
	}

	cap := 0
	if capStr := c.Query("h"); capStr != "" {
		if n, err := strconv.Atoi(capStr); err == nil && n > 0 {
			cap = n
		}
	}

	// forceAvc1 restricts to H.264 (Safari/iOS can't play AV1/VP9 in fMP4 HLS).
	forceAvc1 := c.Query("vc") == "avc1"

	if services.DefaultStreamManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Stream manager not initialized"})
		return
	}

	sess, err := services.DefaultStreamManager.Create(videoID, cap, forceAvc1)
	if err != nil {
		log.Printf("Stream create error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start stream"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id": sess.ID,
		"playlist":   "/api/hls/" + sess.ID + "/index.m3u8",
	})
}

// handleHlsFile serves generated HLS playlist/segment files. It polls briefly
// for not-yet-written segments so the player doesn't 404 while ffmpeg is still
// producing them.
func handleHlsFile(c *gin.Context) {
	sessionID := c.Param("session")
	rel := c.Param("filepath") // e.g. "/index.m3u8" or "/index0.ts"

	sess := services.DefaultStreamManager.Get(sessionID)
	if sess == nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Stream session not found"})
		return
	}

	full := filepath.Join(sess.Dir, filepath.Clean(rel))
	// Prevent path traversal outside the session directory.
	if !strings.HasPrefix(full, sess.Dir+string(os.PathSeparator)) && full != sess.Dir {
		c.JSON(http.StatusForbidden, gin.H{"error": "Forbidden"})
		return
	}

	// The playlist only exists after yt-dlp downloads+merges and ffmpeg starts
	// segmenting; that can take a while for high resolutions. Wait longer for the
	// playlist than for individual segments.
	isPlaylist := strings.HasSuffix(rel, ".m3u8")
	waitLimit := 30 * time.Second
	if isPlaylist {
		waitLimit = 5 * time.Minute
	}
	var found bool
	deadline := time.Now().Add(waitLimit)
	for time.Now().Before(deadline) {
		if info, err := os.Stat(full); err == nil && !info.IsDir() && info.Size() > 0 {
			found = true
			break
		}
		// Stop early once the session errored and the file will never appear.
		if done, errored := sess.IsDone(); done && errored {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}

	if !found {
		c.JSON(http.StatusNotFound, gin.H{"error": "Segment not ready"})
		return
	}

	c.Header("Cache-Control", "no-cache")
	c.File(full)
}

// handleStreamStop kills a running stream session (e.g. when the user switches
// quality or leaves the page) to avoid leaving yt-dlp/ffmpeg processes running.
func handleStreamStop(c *gin.Context) {
	sessionID := c.Query("session")
	if sessionID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "session is required"})
		return
	}
	if services.DefaultStreamManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Stream manager not initialized"})
		return
	}
	services.DefaultStreamManager.Stop(sessionID)
	c.JSON(http.StatusOK, gin.H{"status": "stopped"})
}
