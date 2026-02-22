package routes

import (
	"bufio"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"

	"kvtube-go/services"

	"github.com/gin-gonic/gin"
)

func SetupRouter() *gin.Engine {
	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	r.GET("/api/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	// API Routes
	api := r.Group("/api")
	{
		api.GET("/search", handleSearch)
		api.GET("/trending", handleTrending)
		api.GET("/get_stream_info", handleGetStreamInfo)
		api.GET("/download", handleDownload)
		api.GET("/transcript", handleTranscript)
		api.GET("/comments", handleComments)
		api.GET("/channel/videos", handleChannelVideos)
		api.GET("/channel/info", handleChannelInfo)
		api.GET("/related", handleRelatedVideos)
		api.GET("/formats", handleGetFormats)
		api.GET("/qualities", handleGetQualities)
		api.GET("/stream", handleGetStreamByQuality)

		// History routes
		api.POST("/history", handlePostHistory)
		api.GET("/history", handleGetHistory)
		api.GET("/suggestions", handleGetSuggestions)

		// Subscription routes
		api.POST("/subscribe", handleSubscribe)
		api.DELETE("/subscribe", handleUnsubscribe)
		api.GET("/subscribe", handleCheckSubscription)
		api.GET("/subscriptions", handleGetSubscriptions)
	}

	r.GET("/video_proxy", handleVideoProxy)

	return r
}

func handleSearch(c *gin.Context) {
	query := c.Query("q")
	if query == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Query parameter 'q' is required"})
		return
	}

	limit := 20
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil {
			limit = parsed
		}
	}

	results, err := services.SearchVideos(query, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to search videos"})
		return
	}

	c.JSON(http.StatusOK, results)
}

func handleTrending(c *gin.Context) {
	// Basic mock implementation for now
	c.JSON(http.StatusOK, gin.H{
		"data": []gin.H{
			{
				"id":     "trending",
				"title":  "Currently Trending",
				"icon":   "fire",
				"videos": []gin.H{},
			},
		},
	})
}

func handleGetStreamInfo(c *gin.Context) {
	videoID := c.Query("v")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID 'v' is required"})
		return
	}

	info, err := services.GetVideoInfo(videoID)
	if err != nil {
		log.Printf("GetVideoInfo Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get video info"})
		return
	}

	// Get available qualities with audio
	qualities, audioURL, _ := services.GetVideoQualitiesWithAudio(videoID)

	// Build quality options for frontend
	var qualityOptions []gin.H
	bestURL := info.StreamURL
	bestHeight := 0

	for _, q := range qualities {
		proxyURL := "/video_proxy?url=" + url.QueryEscape(q.URL)
		audioProxyURL := ""
		if q.AudioURL != "" {
			audioProxyURL = "/video_proxy?url=" + url.QueryEscape(q.AudioURL)
		}
		qualityOptions = append(qualityOptions, gin.H{
			"label":     q.Label,
			"height":    q.Height,
			"url":       proxyURL,
			"audio_url": audioProxyURL,
			"is_hls":    q.IsHLS,
			"has_audio": q.HasAudio,
		})
		if q.Height > bestHeight {
			bestHeight = q.Height
			bestURL = q.URL
		}
	}

	// If we found qualities, use the best one
	streamURL := info.StreamURL
	if bestURL != "" {
		streamURL = bestURL
	}

	proxyURL := "/video_proxy?url=" + url.QueryEscape(streamURL)

	// Get audio URL for the response
	audioProxyURL := ""
	if audioURL != "" {
		audioProxyURL = "/video_proxy?url=" + url.QueryEscape(audioURL)
	}

	c.JSON(http.StatusOK, gin.H{
		"original_url": info.StreamURL,
		"stream_url":   proxyURL,
		"audio_url":    audioProxyURL,
		"title":        info.Title,
		"description":  info.Description,
		"uploader":     info.Uploader,
		"channel_id":   info.ChannelID,
		"uploader_id":  info.UploaderID,
		"view_count":   info.ViewCount,
		"thumbnail":    info.Thumbnail,
		"related":      []interface{}{},
		"subtitle_url": nil,
		"qualities":    qualityOptions,
		"best_quality": bestHeight,
	})
}

func handleDownload(c *gin.Context) {
	videoID := c.Query("v")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID 'v' is required"})
		return
	}

	formatID := c.Query("f")

	info, err := services.GetDownloadURL(videoID, formatID)
	if err != nil {
		log.Printf("GetDownloadURL Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get download URL"})
		return
	}

	c.JSON(http.StatusOK, info)
}

func handleGetFormats(c *gin.Context) {
	videoID := c.Query("v")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID 'v' is required"})
		return
	}

	formats, err := services.GetVideoFormats(videoID)
	if err != nil {
		log.Printf("GetVideoFormats Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get video formats"})
		return
	}

	c.JSON(http.StatusOK, formats)
}

func handleGetQualities(c *gin.Context) {
	videoID := c.Query("v")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID 'v' is required"})
		return
	}

	qualities, audioURL, err := services.GetVideoQualitiesWithAudio(videoID)
	if err != nil {
		log.Printf("GetVideoQualities Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get video qualities"})
		return
	}

	var result []gin.H
	for _, q := range qualities {
		proxyURL := "/video_proxy?url=" + url.QueryEscape(q.URL)
		audioProxyURL := ""
		if q.AudioURL != "" {
			audioProxyURL = "/video_proxy?url=" + url.QueryEscape(q.AudioURL)
		}
		result = append(result, gin.H{
			"format_id":  q.FormatID,
			"label":      q.Label,
			"resolution": q.Resolution,
			"height":     q.Height,
			"url":        proxyURL,
			"audio_url":  audioProxyURL,
			"is_hls":     q.IsHLS,
			"vcodec":     q.VCodec,
			"acodec":     q.ACodec,
			"filesize":   q.Filesize,
			"has_audio":  q.HasAudio,
		})
	}

	// Also return the best audio URL separately
	audioProxyURL := ""
	if audioURL != "" {
		audioProxyURL = "/video_proxy?url=" + url.QueryEscape(audioURL)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"qualities": result,
		"audio_url": audioProxyURL,
	})
}

func handleGetStreamByQuality(c *gin.Context) {
	videoID := c.Query("v")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID 'v' is required"})
		return
	}

	heightStr := c.Query("q")
	height := 0
	if heightStr != "" {
		if parsed, err := strconv.Atoi(heightStr); err == nil {
			height = parsed
		}
	}

	qualities, audioURL, err := services.GetVideoQualitiesWithAudio(videoID)
	if err != nil {
		log.Printf("GetVideoQualities Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get video qualities"})
		return
	}

	if len(qualities) == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "No qualities available"})
		return
	}

	var selected *services.QualityFormat
	for i := range qualities {
		if qualities[i].Height == height {
			selected = &qualities[i]
			break
		}
	}

	if selected == nil {
		selected = &qualities[0]
	}

	proxyURL := "/video_proxy?url=" + url.QueryEscape(selected.URL)

	audioProxyURL := ""
	if selected.AudioURL != "" {
		audioProxyURL = "/video_proxy?url=" + url.QueryEscape(selected.AudioURL)
	} else if audioURL != "" {
		audioProxyURL = "/video_proxy?url=" + url.QueryEscape(audioURL)
	}

	c.JSON(http.StatusOK, gin.H{
		"success":    true,
		"stream_url": proxyURL,
		"audio_url":  audioProxyURL,
		"has_audio":  selected.HasAudio,
		"quality": gin.H{
			"label":  selected.Label,
			"height": selected.Height,
			"is_hls": selected.IsHLS,
		},
	})
}

func handleRelatedVideos(c *gin.Context) {
	videoID := c.Query("v")
	title := c.Query("title")
	uploader := c.Query("uploader")

	if title == "" && videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID or Title required"})
		return
	}

	limitStr := c.Query("limit")
	limit := 10
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	videos, err := services.GetRelatedVideos(title, uploader, limit)
	if err != nil {
		log.Printf("GetRelatedVideos Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get related videos"})
		return
	}

	c.JSON(http.StatusOK, videos)
}

func handleTranscript(c *gin.Context) {
	c.JSON(http.StatusNotImplemented, gin.H{"error": "Not Implemented"})
}

func handleComments(c *gin.Context) {
	videoID := c.Query("v")
	if videoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID 'v' is required"})
		return
	}

	limit := 20
	if l := c.Query("limit"); l != "" {
		if parsed, err := strconv.Atoi(l); err == nil && parsed > 0 {
			limit = parsed
		}
	}

	comments, err := services.GetComments(videoID, limit)
	if err != nil {
		log.Printf("GetComments Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get comments"})
		return
	}

	c.JSON(http.StatusOK, comments)
}

func handleChannelInfo(c *gin.Context) {
	channelID := c.Query("id")
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel ID 'id' is required"})
		return
	}

	info, err := services.GetChannelInfo(channelID)
	if err != nil {
		log.Printf("GetChannelInfo Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get channel info"})
		return
	}

	c.JSON(http.StatusOK, info)
}

func handleChannelVideos(c *gin.Context) {
	channelID := c.Query("id")
	if channelID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Channel ID 'id' is required"})
		return
	}

	limitStr := c.Query("limit")
	limit := 30
	if l, err := strconv.Atoi(limitStr); err == nil && l > 0 {
		limit = l
	}

	videos, err := services.GetChannelVideos(channelID, limit)
	if err != nil {
		log.Printf("GetChannelVideos Error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get channel videos", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, videos)
}

func handleVideoProxy(c *gin.Context) {
	targetURL := c.Query("url")
	if targetURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No URL provided"})
		return
	}

	req, err := http.NewRequest("GET", targetURL, nil)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create request"})
		return
	}

	// Forward standard headers
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
	req.Header.Set("Referer", "https://www.youtube.com/")
	req.Header.Set("Origin", "https://www.youtube.com")

	if rangeHeader := c.GetHeader("Range"); rangeHeader != "" {
		req.Header.Set("Range", rangeHeader)
	}

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch video stream"})
		return
	}
	defer resp.Body.Close()

	contentType := resp.Header.Get("Content-Type")
	baseURL := targetURL[:strings.LastIndex(targetURL, "/")]

	isManifest := strings.Contains(strings.ToLower(contentType), "mpegurl") ||
		strings.HasSuffix(targetURL, ".m3u8") ||
		strings.Contains(targetURL, ".m3u8")

	if isManifest && (resp.StatusCode == 200 || resp.StatusCode == 206) {
		// Rewrite M3U8 Manifest
		scanner := bufio.NewScanner(resp.Body)
		var newLines []string
		for scanner.Scan() {
			line := strings.TrimSpace(scanner.Text())
			if line != "" && !strings.HasPrefix(line, "#") {
				fullURL := line
				if !strings.HasPrefix(line, "http") {
					fullURL = baseURL + "/" + line
				}
				encodedURL := url.QueryEscape(fullURL)
				newLines = append(newLines, "/video_proxy?url="+encodedURL)
			} else {
				newLines = append(newLines, line)
			}
		}

		rewrittenContent := strings.Join(newLines, "\n")
		c.Data(resp.StatusCode, "application/vnd.apple.mpegurl", []byte(rewrittenContent))
		return
	}

	// Stream binary video data
	for k, v := range resp.Header {
		logKey := strings.ToLower(k)
		if logKey != "content-encoding" && logKey != "transfer-encoding" && logKey != "connection" && !strings.HasPrefix(logKey, "access-control-") {
			c.Writer.Header()[k] = v
		}
	}
	c.Writer.WriteHeader(resp.StatusCode)
	io.Copy(c.Writer, resp.Body)
}

func handlePostHistory(c *gin.Context) {
	var body struct {
		VideoID   string `json:"video_id"`
		Title     string `json:"title"`
		Thumbnail string `json:"thumbnail"`
	}

	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if body.VideoID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Video ID is required"})
		return
	}

	err := services.AddToHistory(body.VideoID, body.Title, body.Thumbnail)
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
	// We'll reconstruct a basic VideoData-like array for the frontend
	var results []services.VideoData
	for _, h := range history {
		results = append(results, services.VideoData{
			ID:        h.ID,
			Title:     h.Title,
			Thumbnail: h.Thumbnail,
			Uploader:  "History", // Just a placeholder
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
