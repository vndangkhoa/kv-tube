package main

import (
	"log"
	"os"

	"kvtube-go/models"
	"kvtube-go/routes"
	"kvtube-go/services"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Load environment variables (ignore if not found)
	_ = godotenv.Load()

	// Initialize Database
	models.InitDB()

	// Start background cache cleanup
	models.StartCacheCleanupScheduler()

	// Start subscription feed background refresher (runs yt-dlp in background, not on page load)
	services.StartFeedRefresher()

	// Keep yt-dlp on the latest nightly build (runs on startup and every 24h)
	services.StartYtDlpUpdater()

	// Auto-fetch an anonymous YouTube session at boot when no cookies exist,
	// so the first yt-dlp calls are not cookie-less (KB §3)
	services.StartCookieBootstrap()

	// Warm the personalized home feed in the background (refresh every 15 min)
	services.StartHomeFeedRefresher()

	// Setup Gin Engine
	if os.Getenv("GIN_MODE") == "release" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := routes.SetupRouter()

	// Start server
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("KV-Tube Go Backend starting on port %s...", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatalf("Failed to start server: %v", err)
	}
}
