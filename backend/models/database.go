package models

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "modernc.org/sqlite"
)

var DB *sql.DB

func InitDB() {
	dataDir := os.Getenv("KVTUBE_DATA_DIR")
	if dataDir == "" {
		dataDir = "../data" // Default mapping assuming running from backend
	}

	if err := os.MkdirAll(dataDir, 0755); err != nil {
		log.Fatalf("Failed to create data directory: %v", err)
	}

	dbPath := filepath.Join(dataDir, "kvtube.db")
	db, err := sql.Open("sqlite", dbPath)
	if err != nil {
		log.Fatalf("Failed to open database: %v", err)
	}

	// Create tables
	userTable := `CREATE TABLE IF NOT EXISTS users (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		username TEXT UNIQUE NOT NULL,
		password TEXT NOT NULL
	);`

	userVideosTable := `CREATE TABLE IF NOT EXISTS user_videos (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		video_id TEXT,
		title TEXT,
		thumbnail TEXT,
		type TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		FOREIGN KEY(user_id) REFERENCES users(id)
	);`

	videoCacheTable := `CREATE TABLE IF NOT EXISTS video_cache (
		video_id TEXT PRIMARY KEY,
		data TEXT,
		expires_at DATETIME
	);`

	subscriptionsTable := `CREATE TABLE IF NOT EXISTS subscriptions (
		id INTEGER PRIMARY KEY AUTOINCREMENT,
		user_id INTEGER,
		channel_id TEXT NOT NULL,
		channel_name TEXT,
		channel_avatar TEXT,
		timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
		UNIQUE(user_id, channel_id),
		FOREIGN KEY(user_id) REFERENCES users(id)
	);`

	channelVideosCacheTable := `CREATE TABLE IF NOT EXISTS channel_videos_cache (
		channel_id TEXT PRIMARY KEY,
		videos_json TEXT NOT NULL,
		fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	videoDatesCacheTable := `CREATE TABLE IF NOT EXISTS video_dates_cache (
		video_id TEXT PRIMARY KEY,
		upload_date TEXT,
		fetched_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);`

	for _, stmt := range []string{userTable, userVideosTable, videoCacheTable, subscriptionsTable, channelVideosCacheTable, videoDatesCacheTable} {
		if _, err := db.Exec(stmt); err != nil {
			log.Fatalf("Failed to create table: %v - Statement: %s", err, stmt)
		}
	}

	// Migrate old unique index to include type (drop old, create new)
	_, _ = db.Exec(`DROP INDEX IF EXISTS idx_user_videos_user_video`)

	// Add uploader column to user_videos if it doesn't exist (stores real channel name)
	_, _ = db.Exec(`ALTER TABLE user_videos ADD COLUMN uploader TEXT`)

	// Create performance indexes
	indexes := []string{
		`CREATE INDEX IF NOT EXISTS idx_user_videos_user_timestamp ON user_videos(user_id, timestamp DESC)`,
		`CREATE UNIQUE INDEX IF NOT EXISTS idx_user_videos_user_video_type ON user_videos(user_id, video_id, type)`,
		`CREATE INDEX IF NOT EXISTS idx_user_videos_user_type ON user_videos(user_id, type)`,
		`CREATE INDEX IF NOT EXISTS idx_subscriptions_user ON subscriptions(user_id)`,
		`CREATE INDEX IF NOT EXISTS idx_video_cache_expires ON video_cache(expires_at)`,
	}
	for _, idx := range indexes {
		if _, err := db.Exec(idx); err != nil {
			log.Printf("Warning: Failed to create index: %v - Statement: %s", err, idx)
		}
	}

	// Insert default user for history tracking (password is not used for authentication)
	_, err = db.Exec(`INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'default_user', '')`)
	if err != nil {
		log.Printf("Failed to insert default user: %v", err)
	}

	// Enable WAL mode for better concurrent read/write performance
	if _, err := db.Exec(`PRAGMA journal_mode=WAL`); err != nil {
		log.Printf("Warning: Failed to enable WAL mode: %v", err)
	}

	// Set busy timeout to avoid "database is locked" errors under concurrent writes
	if _, err := db.Exec(`PRAGMA busy_timeout=5000`); err != nil {
		log.Printf("Warning: Failed to set busy timeout: %v", err)
	}

	DB = db
	log.Println("Database initialized successfully at", dbPath)
}
