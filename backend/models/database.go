package models

import (
	"database/sql"
	"log"
	"os"
	"path/filepath"

	_ "github.com/mattn/go-sqlite3"
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
	db, err := sql.Open("sqlite3", dbPath)
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

	for _, stmt := range []string{userTable, userVideosTable, videoCacheTable, subscriptionsTable} {
		if _, err := db.Exec(stmt); err != nil {
			log.Fatalf("Failed to create table: %v - Statement: %s", err, stmt)
		}
	}

	// Insert default user for history tracking
	_, err = db.Exec(`INSERT OR IGNORE INTO users (id, username, password) VALUES (1, 'default_user', 'password')`)
	if err != nil {
		log.Printf("Failed to insert default user: %v", err)
	}

	DB = db
	log.Println("Database initialized successfully at", dbPath)
}
