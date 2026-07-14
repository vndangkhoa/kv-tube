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

	// Initialize stream (server-side merge → HLS) manager
	dataDir := os.Getenv("KVTUBE_DATA_DIR")
	if dataDir == "" {
		dataDir = "./data"
	}
	services.InitStreamManager(dataDir)

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
