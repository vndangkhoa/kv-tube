package routes

import (
	"fmt"
	"io"
	"log"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"

	"kvtube-go/services"

	"github.com/gin-gonic/gin"
	"regexp"
)

// brangeRe matches a valid byte-range spec like "0-700" or "701-".
var brangeRe = regexp.MustCompile(`^\d+-\d*$`)
// rangeRe parses a client Range header like "bytes=123-456" or "bytes=123-".
var rangeRe = regexp.MustCompile(`bytes=(\d+)-(\d*)`)
// contentRangeRe parses an upstream Content-Range like "bytes 123-456/7890".
var contentRangeRe = regexp.MustCompile(`bytes (\d+)-(\d+)/(\d+)`)

// getAllowedOrigins returns allowed CORS origins from environment variable or defaults
func getAllowedOrigins() []string {
	originsEnv := os.Getenv("CORS_ALLOWED_ORIGINS")
	if originsEnv == "" {
		// Default: allow localhost for development
		return []string{
			"http://localhost:3000",
			"http://127.0.0.1:3000",
			"http://localhost:3003",
			"http://127.0.0.1:3003",
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
		api.GET("/video/:id/download/merge", handleMergeDownload)
		api.GET("/video/:id/download/formats", handleGetDownloadFormats)

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

		// Client-side playback: return a DASH manifest built from YouTube's
		// native MP4 streams (no server transcode). The browser muxes+decodes.
		api.GET("/stream/dash", handleStreamDash)
		api.GET("/stream/mp4", handleStreamMp4)

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

// handleMergeDownload merges video+audio with ffmpeg and streams the MP4.
// GET /api/video/:id/download/merge?height=1080
func handleMergeDownload(c *gin.Context) {
	videoID := c.Param("id")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	heightCap := 1080
	if h := c.Query("height"); h != "" {
		if v, err := strconv.Atoi(h); err == nil && v > 0 {
			heightCap = v
		}
	}

	result, err := services.MergeDownload(videoID, heightCap)
	if err != nil {
		log.Printf("MergeDownload error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start merge download"})
		return
	}
	defer result.Reader.Close()

	safeTitle := strings.ReplaceAll(result.Title, "/", "-")
	safeTitle = strings.ReplaceAll(safeTitle, "\"", "")
	safeTitle = strings.ReplaceAll(safeTitle, "\\", "-")
	if len(safeTitle) > 120 {
		safeTitle = safeTitle[:120]
	}

	filename := fmt.Sprintf("%s.%s", safeTitle, result.Ext)
	c.Header("Content-Type", "video/mp4")
	c.Header("Content-Disposition", fmt.Sprintf(`attachment; filename="%s"`, filename))
	c.Status(http.StatusOK)

	// Stream chunks to client
	buf := make([]byte, 256*1024) // 256 KB chunks
	flusher, canFlush := c.Writer.(http.Flusher)
	for {
		n, readErr := result.Reader.Read(buf)
		if n > 0 {
			if _, writeErr := c.Writer.Write(buf[:n]); writeErr != nil {
				break
			}
			if canFlush {
				flusher.Flush()
			}
		}
		if readErr != nil {
			break
		}
	}
}

// handleGetDownloadFormats returns the raw yt-dlp format list for a video so the
// frontend can present a TypeType-style download sheet (video + audio choices).
func handleGetDownloadFormats(c *gin.Context) {
	videoID := c.Param("id")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}
	formats, err := services.GetVideoFormats(videoID)
	if err != nil {
		log.Printf("GetVideoFormats error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to list download formats"})
		return
	}
	c.JSON(http.StatusOK, formats)
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
	Heights   []int  `json:"heights,omitempty"`
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

	// Collect the video-only heights actually available for this video so the
	// client can offer an accurate resolution menu (avoids offering resolutions
	// the source doesn't have).
	heightSet := map[int]bool{}
	heights := []int{}
	for _, q := range qualities {
		if q.Height > 0 && !q.HasAudio && q.VCodec != "" && q.VCodec != "none" {
			if !heightSet[q.Height] {
				heightSet[q.Height] = true
				heights = append(heights, q.Height)
			}
		}
	}
	sort.Sort(sort.Reverse(sort.IntSlice(heights)))

	_ = video // unused but available for future metadata
	c.JSON(http.StatusOK, StreamInfoResponse{StreamURL: bestURL, Heights: heights})
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

// allowedProxyHosts restricts /api/proxy to YouTube/Google media hosts so the
// endpoint cannot be abused as an open SSRF proxy.
var allowedProxyHosts = []string{
	"googlevideo.com", "youtube.com", "ytimg.com", "googleusercontent.com", "ggpht.com",
}

func isAllowedProxyHost(raw string) bool {
	u, err := url.Parse(raw)
	if err != nil {
		return false
	}
	if u.Scheme != "http" && u.Scheme != "https" {
		return false
	}
	host := strings.ToLower(u.Hostname())
	for _, h := range allowedProxyHosts {
		if host == h || strings.HasSuffix(host, "."+h) {
			return true
		}
	}
	return false
}

func handleProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "url parameter is required"})
		return
	}
	if !isAllowedProxyHost(targetURL) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "proxy target host not allowed"})
		return
	}

	req, err := http.NewRequest(c.Request.Method, targetURL, c.Request.Body)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Forward range header for video seeking. A `brange` query param lets the
	// client fetch a specific byte range directly (used to grab a stream's init
	// box for DASH without downloading the whole file as the init segment).
	// A `boffset` query param shifts the client's Range by a constant so the
	// client can address a media segment that begins partway into the upstream
	// file (e.g. right after the moov box), preserving seeking within it.
	boffset := 0
	if brange := c.Query("brange"); brange != "" {
		if brangeRe.MatchString(brange) {
			req.Header.Set("Range", "bytes="+brange)
		}
	} else if bo := c.Query("boffset"); bo != "" {
		if n, err := strconv.Atoi(bo); err == nil && n >= 0 {
			boffset = n
		}
		if boffset > 0 {
			start, end := 0, -1
			if m := rangeRe.FindStringSubmatch(c.GetHeader("Range")); m != nil {
				start, _ = strconv.Atoi(m[1])
				if m[2] != "" {
					end, _ = strconv.Atoi(m[2])
				}
			}
			us := boffset + start
			if end >= 0 {
				req.Header.Set("Range", fmt.Sprintf("bytes=%d-%d", us, boffset+end))
			} else {
				req.Header.Set("Range", fmt.Sprintf("bytes=%d-", us))
			}
		}
	} else if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
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

	// Copy response headers. Skip Content-Range if we shifted the byte range
	// via `boffset`; we recompute it below relative to the client's view.
	for key, values := range resp.Header {
		for _, value := range values {
			if boffset > 0 && key == "Content-Range" {
				continue
			}
			c.Writer.Header().Add(key, value)
		}
	}

	status := resp.StatusCode
	if boffset > 0 {
		if resp.StatusCode == http.StatusPartialContent {
			if m := contentRangeRe.FindStringSubmatch(resp.Header.Get("Content-Range")); m != nil {
				us, _ := strconv.Atoi(m[1])
				ue, _ := strconv.Atoi(m[2])
				tot, _ := strconv.Atoi(m[3])
				c.Writer.Header().Set("Content-Range",
					fmt.Sprintf("bytes %d-%d/%d", us-boffset, ue-boffset, tot-boffset))
			}
		} else if resp.StatusCode == http.StatusOK {
			// Upstream ignored the Range request (shouldn't happen for YouTube,
			// but guard anyway): we asked for bytes boffset..EOF, so the body is
			// exactly the media segment. Report it as a partial response.
			if cl := resp.Header.Get("Content-Length"); cl != "" {
				if total, err := strconv.Atoi(cl); err == nil && total > 0 {
					c.Writer.Header().Set("Content-Range",
						fmt.Sprintf("bytes 0-%d/%d", total-1, total))
					status = http.StatusPartialContent
				}
			}
		}
	}

	c.Status(status)
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

	// The playlist/manifest only exists after ffmpeg starts writing; wait longer
	// for it than for individual segments.
	isPlaylist := strings.HasSuffix(rel, ".m3u8") || strings.HasSuffix(rel, ".mpd")
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
	if strings.HasSuffix(rel, ".mpd") {
		c.Header("Content-Type", "application/dash+xml")
	}
	c.File(full)
}

// handleStreamDash builds a fragmented-MP4 DASH manifest for the client's shaka
// player. The server downloads YouTube's native video+audio and remuxes them into
// fMP4 segments via `ffmpeg -c copy` (no re-encode). shaka then fetches small
// segments on demand and does all decode. We wait for the manifest to be ready
// (the remux runs asynchronously) and return its serving URL.
func handleStreamDash(c *gin.Context) {
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
	forceAvc1 := c.Query("vc") == "avc1"

	if services.DefaultStreamManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Stream manager not initialized"})
		return
	}

	sess, err := services.DefaultStreamManager.CreateDash(videoID, cap, forceAvc1)
	if err != nil {
		log.Printf("[dash] create failed for %s: %v", videoID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start DASH session"})
		return
	}

	// The manifest is written incrementally (live DASH), so respond as soon as it
	// exists with content rather than blocking until the whole file is generated.
	// The client then streams segments on demand while the rest is still produced.
	mpdPath := filepath.Join(sess.Dir, "manifest.mpd")
	deadline := time.Now().Add(120 * time.Second)
	ready := false
	for time.Now().Before(deadline) {
		if info, err := os.Stat(mpdPath); err == nil && !info.IsDir() && info.Size() > 0 {
			ready = true
			break
		}
		// Stop early if generation already failed.
		if done, errored := sess.IsDone(); done && errored {
			break
		}
		time.Sleep(500 * time.Millisecond)
	}
	if !ready {
		// Surface a clear, actionable error when YouTube is bot-checking the
		// server (the common cause of stream failures), so the client can tell
		// the user to configure cookies instead of just "timed out".
		if logBytes, rerr := os.ReadFile(filepath.Join(sess.Dir, "yt-video.log")); rerr == nil {
			if services.IsBotCheckError(string(logBytes)) {
				c.JSON(http.StatusForbidden, gin.H{
					"error": "YouTube is blocking automated access from this server " +
						"(\"confirm you're not a bot\"). Set YTDLP_COOKIES (or " +
						"YTDLP_COOKIES_FROM_BROWSER) so yt-dlp can authenticate.",
				})
				return
			}
		}
		if logBytes, rerr := os.ReadFile(filepath.Join(sess.Dir, "yt-audio.log")); rerr == nil {
			if services.IsBotCheckError(string(logBytes)) {
				c.JSON(http.StatusForbidden, gin.H{
					"error": "YouTube is blocking automated access from this server " +
						"(\"confirm you're not a bot\"). Set YTDLP_COOKIES (or " +
						"YTDLP_COOKIES_FROM_BROWSER) so yt-dlp can authenticate.",
				})
				return
			}
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "DASH generation failed or timed out"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"session_id": sess.ID,
		"mpd_url":    "/api/hls/" + sess.ID + "/manifest.mpd",
	})
}

// handleStreamMp4 streams a self-hosted progressive MP4 to the client. ffmpeg
// writes a fragmented MP4 (moov at the front) to stdout; we relay those bytes
// incrementally so the browser's native <video> starts playing within seconds.
// This replaces the fragile DASH/dash.js path with a plain media element.
func handleStreamMp4(c *gin.Context) {
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
	forceAvc1 := c.Query("vc") == "avc1"

	// Reliable, fast path: for resolutions supported by YouTube's combined
	// progressive formats (≤ ~1080p, which is also the default), resolve the
	// direct CDN URL and let the browser stream from YouTube itself. This avoids
	// the fragile server-side FIFO/ffmpeg remux that frequently stalls or gets
	// bot-checked. "Best" (cap 0) also takes this path (highest progressive).
	if cap == 0 || (cap > 0 && cap <= 1080) {
		streamURL, rerr := services.ResolveStreamURL(videoID, cap, forceAvc1)
		if rerr != nil {
			log.Printf("[mp4] resolve failed for %s (h=%d): %v", videoID, cap, rerr)
			c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to resolve stream URL"})
			return
		}
		c.Redirect(http.StatusFound, streamURL)
		return
	}

	if services.DefaultStreamManager == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Stream manager not initialized"})
		return
	}

	sess, err := services.DefaultStreamManager.CreateMp4(videoID, cap, forceAvc1)
	if err != nil {
		log.Printf("[mp4] create failed for %s: %v", videoID, err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to start MP4 session"})
		return
	}

	// Wait briefly for ffmpeg to open its stdout so we can surface hard errors
	// (e.g. YouTube bot-check) with a proper status instead of a dead stream.
	mp4Out := sess.WaitMp4Out(8 * time.Second)
	if mp4Out == nil {
		services.DefaultStreamManager.Stop(sess.ID)
		if mp4BotCheck(sess) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "YouTube is blocking automated access from this server " +
					"(\"confirm you're not a bot\"). Set YTDLP_COOKIES (or " +
					"YTDLP_COOKIES_FROM_BROWSER) so yt-dlp can authenticate.",
			})
			return
		}
		c.JSON(http.StatusBadGateway, gin.H{"error": "Failed to start video stream"})
		return
	}

	// Read the first chunk under a deadline. ffmpeg only emits output once it
	// has parsed both input pipes; if yt-dlp is slow or blocked (a very large
	// 4K source, a throttle, or a bot-check that slipped past the 8s window)
	// the pipe stays empty and the client would hang on the loading spinner
	// forever. Fail fast so the player can fall back to the YouTube iframe.
	firstBuf := make([]byte, 32*1024)
	type readRes struct {
		n   int
		err error
	}
	readCh := make(chan readRes, 1)
	go func() {
		n, rerr := mp4Out.Read(firstBuf)
		readCh <- readRes{n, rerr}
	}()

	select {
	case res := <-readCh:
		if res.n == 0 {
			services.DefaultStreamManager.Stop(sess.ID)
			if mp4BotCheck(sess) {
				c.JSON(http.StatusForbidden, gin.H{
					"error": "YouTube is blocking automated access from this server " +
						"(\"confirm you're not a bot\"). Set YTDLP_COOKIES (or " +
						"YTDLP_COOKIES_FROM_BROWSER) so yt-dlp can authenticate.",
				})
				return
			}
			c.JSON(http.StatusBadGateway, gin.H{"error": "Video stream produced no data"})
			return
		}
		c.Header("Content-Type", "video/mp4")
		c.Header("Cache-Control", "no-cache, no-transform")
		c.Header("Accept-Ranges", "none")
		c.Status(http.StatusOK)
		flusher, ok := c.Writer.(http.Flusher)
		if !ok {
			_, _ = c.Writer.Write(firstBuf[:res.n])
			_, _ = io.Copy(c.Writer, mp4Out)
			services.DefaultStreamManager.Stop(sess.ID)
			return
		}
		_, _ = c.Writer.Write(firstBuf[:res.n])
		flusher.Flush()
		buf := make([]byte, 32*1024)
		for {
			select {
			case <-c.Request.Context().Done():
				services.DefaultStreamManager.Stop(sess.ID)
				return
			default:
			}
			n, readErr := mp4Out.Read(buf)
			if n > 0 {
				if _, werr := c.Writer.Write(buf[:n]); werr != nil {
					services.DefaultStreamManager.Stop(sess.ID)
					return
				}
				flusher.Flush()
			}
			if readErr != nil {
				break
			}
		}
		services.DefaultStreamManager.Stop(sess.ID)
	case <-time.After(30 * time.Second):
		services.DefaultStreamManager.Stop(sess.ID)
		if mp4BotCheck(sess) {
			c.JSON(http.StatusForbidden, gin.H{
				"error": "YouTube is blocking automated access from this server " +
					"(\"confirm you're not a bot\"). Set YTDLP_COOKIES (or " +
					"YTDLP_COOKIES_FROM_BROWSER) so yt-dlp can authenticate.",
			})
			return
		}
		c.JSON(http.StatusGatewayTimeout, gin.H{"error": "Video stream timed out starting"})
		return
	}
}

// mp4BotCheck reports whether either yt-dlp download log for the session
// shows a YouTube "confirm you're not a bot" interstitial.
func mp4BotCheck(sess *services.StreamSession) bool {
	if logBytes, rerr := os.ReadFile(filepath.Join(sess.Dir, "yt-video.log")); rerr == nil {
		if services.IsBotCheckError(string(logBytes)) {
			return true
		}
	}
	if logBytes, rerr := os.ReadFile(filepath.Join(sess.Dir, "yt-audio.log")); rerr == nil {
		if services.IsBotCheckError(string(logBytes)) {
			return true
		}
	}
	return false
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
