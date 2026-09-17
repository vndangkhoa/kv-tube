package services

import (
	"testing"
)

func TestGetMixPlaylist(t *testing.T) {
	// Video from the user's screenshot: JEONSOMI 'Fast Forward'
	videoID := "fwYfY5hxpos"
	playlistID := "RDfwYfY5hxpos"

	mix, err := GetMixPlaylist(videoID, playlistID)
	if err != nil {
		t.Fatalf("GetMixPlaylist failed: %v", err)
	}

	if mix == nil {
		t.Fatalf("Expected non-nil mix playlist")
	}

	if len(mix.Videos) == 0 {
		t.Fatalf("Expected mix videos to be non-empty")
	}

	t.Logf("Mix Title: %s", mix.Title)
	t.Logf("Mix Author: %s", mix.Author)
	t.Logf("Total Videos in Mix: %d", len(mix.Videos))

	// Verify first video
	first := mix.Videos[0]
	t.Logf("First video: [%s] %s by %s (%s)", first.ID, first.Title, first.Uploader, first.Duration)

	if first.ID == "" || first.Title == "" {
		t.Errorf("First video has missing id or title")
	}
}

func TestGetMixPlaylistFallback(t *testing.T) {
	// Me at the zoo (no official YouTube RD music mix)
	videoID := "jNQXAC9IVRw"
	mix, err := GetMixPlaylist(videoID, "")
	if err != nil {
		t.Fatalf("Fallback mix failed: %v", err)
	}

	if mix == nil || len(mix.Videos) == 0 {
		t.Fatalf("Expected fallback mix to return videos")
	}

	t.Logf("Fallback Mix Title: %s", mix.Title)
	t.Logf("Total Fallback Videos: %d", len(mix.Videos))
}
