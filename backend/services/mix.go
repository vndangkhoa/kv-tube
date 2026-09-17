package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"kvtube-go/models"

	"golang.org/x/sync/singleflight"
)

type MixPlaylistResponse struct {
	Title      string      `json:"title"`
	Author     string      `json:"author"`
	PlaylistID string      `json:"playlistId"`
	Videos     []VideoData `json:"videos"`
}

var (
	mixFlight   singleflight.Group
	mixCacheTTL = 6 * time.Hour
)

// GetMixPlaylist retrieves a dynamic YouTube Mix (Radio) playlist for a seed video.
// It queries YouTube's InnerTube /v1/next endpoint with playlistId=RD<videoID>,
// falling back to an algorithmic related-video queue if YouTube returns no mix.
func GetMixPlaylist(videoID, playlistID string) (*MixPlaylistResponse, error) {
	videoID = strings.TrimSpace(videoID)
	playlistID = strings.TrimSpace(playlistID)

	if videoID == "" && playlistID == "" {
		return nil, fmt.Errorf("videoID or playlistID is required")
	}

	if playlistID == "" {
		playlistID = "RD" + videoID
	}
	if videoID == "" && strings.HasPrefix(playlistID, "RD") {
		videoID = strings.TrimPrefix(playlistID, "RD")
	}

	cacheKey := fmt.Sprintf("mix:%s:%s", videoID, playlistID)
	if cached, err := models.GetCachedVideo(cacheKey); err == nil && len(bytes.TrimSpace(cached)) > 0 {
		var out MixPlaylistResponse
		if json.Unmarshal(cached, &out) == nil && len(out.Videos) > 0 {
			return &out, nil
		}
	}

	v, err, _ := mixFlight.Do(cacheKey, func() (interface{}, error) {
		mix, err := fetchInnertubeMix(videoID, playlistID)
		if err == nil && mix != nil && len(mix.Videos) > 0 {
			if b, jerr := json.Marshal(mix); jerr == nil {
				_ = models.SetCachedVideo(cacheKey, string(b), int(mixCacheTTL.Seconds()))
			}
			return mix, nil
		}

		// Fallback to related-video graph radio
		fallback := generateFallbackMix(videoID, playlistID)
		if fallback != nil && len(fallback.Videos) > 0 {
			if b, jerr := json.Marshal(fallback); jerr == nil {
				_ = models.SetCachedVideo(cacheKey, string(b), int(time.Hour.Seconds()))
			}
			return fallback, nil
		}

		if err != nil {
			return nil, err
		}
		return nil, fmt.Errorf("no mix playlist available")
	})

	if err != nil {
		return nil, err
	}
	out, ok := v.(*MixPlaylistResponse)
	if !ok || out == nil {
		return nil, fmt.Errorf("failed to cast mix response")
	}
	return out, nil
}

// fetchInnertubeMix sends a POST request to /youtubei/v1/next with playlistId=RD...
func fetchInnertubeMix(videoID, playlistID string) (*MixPlaylistResponse, error) {
	key, version, visitorData := innertubeContext()
	url := fmt.Sprintf("https://www.youtube.com/youtubei/v1/next?prettyPrint=false&key=%s", key)

	clientObj := map[string]interface{}{
		"clientName":    "WEB",
		"clientVersion": version,
		"hl":            "en",
		"gl":            "US",
		"timeZone":      "UTC",
	}
	if visitorData != "" {
		clientObj["visitorData"] = visitorData
	}

	payload := map[string]interface{}{
		"context": map[string]interface{}{
			"client": clientObj,
		},
		"videoId":    videoID,
		"playlistId": playlistID,
	}

	bodyBytes, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}

	req, err := http.NewRequest("POST", url, bytes.NewReader(bodyBytes))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", watchPageUA)
	req.Header.Set("Origin", "https://www.youtube.com")
	req.Header.Set("Referer", "https://www.youtube.com/")
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")
	if visitorData != "" {
		req.Header.Set("X-Goog-Visitor-Id", visitorData)
	}
	if ch := youtubeCookieHeader(); ch != "" {
		req.Header.Set("Cookie", ch)
	}

	resp, err := innertubeClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("innertube returned HTTP %d", resp.StatusCode)
	}

	respBody, err := io.ReadAll(io.LimitReader(resp.Body, 10<<20))
	if err != nil {
		return nil, err
	}

	return parseInnertubeMixJSON(respBody, playlistID)
}

// parseInnertubeMixJSON decodes the InnerTube watch-next playlist panel into VideoData items.
func parseInnertubeMixJSON(data []byte, requestedPlaylistID string) (*MixPlaylistResponse, error) {
	var raw struct {
		Contents struct {
			TwoColumnWatchNextResults struct {
				Playlist struct {
					Playlist struct {
						Title           string `json:"title"`
						TitleText       struct {
							SimpleText string `json:"simpleText"`
						} `json:"titleText"`
						ShortBylineText struct {
							SimpleText string `json:"simpleText"`
							Runs       []struct {
								Text string `json:"text"`
							} `json:"runs"`
						} `json:"shortBylineText"`
						PlaylistID string `json:"playlistId"`
						Contents   []struct {
							PlaylistPanelVideoRenderer struct {
								VideoID string `json:"videoId"`
								Title   struct {
									SimpleText string `json:"simpleText"`
									Runs       []struct {
										Text string `json:"text"`
									} `json:"runs"`
								} `json:"title"`
								ShortBylineText struct {
									Runs []struct {
										Text               string `json:"text"`
										NavigationEndpoint struct {
											BrowseEndpoint struct {
												BrowseID string `json:"browseId"`
											} `json:"browseEndpoint"`
										} `json:"navigationEndpoint"`
									} `json:"runs"`
								} `json:"shortBylineText"`
								LengthText struct {
									SimpleText string `json:"simpleText"`
									Runs       []struct {
										Text string `json:"text"`
									} `json:"runs"`
								} `json:"lengthText"`
								Thumbnail struct {
									Thumbnails []struct {
										URL    string `json:"url"`
										Width  int    `json:"width"`
										Height int    `json:"height"`
									} `json:"thumbnails"`
								} `json:"thumbnail"`
							} `json:"playlistPanelVideoRenderer"`
						} `json:"contents"`
					} `json:"playlist"`
				} `json:"playlist"`
			} `json:"twoColumnWatchNextResults"`
		} `json:"contents"`
	}

	if err := json.Unmarshal(data, &raw); err != nil {
		return nil, err
	}

	pl := raw.Contents.TwoColumnWatchNextResults.Playlist.Playlist
	title := pl.Title
	if title == "" {
		title = pl.TitleText.SimpleText
	}

	author := pl.ShortBylineText.SimpleText
	if author == "" && len(pl.ShortBylineText.Runs) > 0 {
		author = pl.ShortBylineText.Runs[0].Text
	}
	if author == "" {
		author = "YouTube"
	}

	playlistID := pl.PlaylistID
	if playlistID == "" {
		playlistID = requestedPlaylistID
	}

	videos := make([]VideoData, 0, len(pl.Contents))
	seen := make(map[string]bool)

	for _, item := range pl.Contents {
		rend := item.PlaylistPanelVideoRenderer
		if rend.VideoID == "" || seen[rend.VideoID] {
			continue
		}
		seen[rend.VideoID] = true

		videoTitle := rend.Title.SimpleText
		if videoTitle == "" && len(rend.Title.Runs) > 0 {
			videoTitle = rend.Title.Runs[0].Text
		}
		if videoTitle == "" {
			videoTitle = "Untitled Video"
		}

		uploader := ""
		channelID := ""
		if len(rend.ShortBylineText.Runs) > 0 {
			uploader = rend.ShortBylineText.Runs[0].Text
			channelID = rend.ShortBylineText.Runs[0].NavigationEndpoint.BrowseEndpoint.BrowseID
		}
		if uploader == "" {
			uploader = "Unknown"
		}

		duration := rend.LengthText.SimpleText
		if duration == "" && len(rend.LengthText.Runs) > 0 {
			duration = rend.LengthText.Runs[0].Text
		}

		thumb := fmt.Sprintf("https://i.ytimg.com/vi/%s/mqdefault.jpg", rend.VideoID)
		if len(rend.Thumbnail.Thumbnails) > 0 {
			thumb = rend.Thumbnail.Thumbnails[len(rend.Thumbnail.Thumbnails)-1].URL
		}

		videos = append(videos, VideoData{
			ID:         rend.VideoID,
			Title:      videoTitle,
			Uploader:   uploader,
			ChannelID:  channelID,
			UploaderID: channelID,
			Thumbnail:  thumb,
			Duration:   duration,
		})
	}

	if len(videos) == 0 {
		return nil, fmt.Errorf("playlistPanelVideoRenderer contained 0 videos")
	}

	log.Printf("[mix] fetched Innertube mix for %s: %q (%d videos)", playlistID, title, len(videos))
	return &MixPlaylistResponse{
		Title:      title,
		Author:     author,
		PlaylistID: playlistID,
		Videos:     videos,
	}, nil
}

// generateFallbackMix constructs an algorithmic radio from related videos when YouTube does not provide an official RD mix.
func generateFallbackMix(videoID, playlistID string) *MixPlaylistResponse {
	related := GetRelatedVideos(videoID, 25)
	if len(related) == 0 {
		return nil
	}

	title := "Mix Playlist"
	author := "KV-Tube"

	// Try to get seed video details for title
	if seedInfo, ok := FetchWatchPageVideoInfo(videoID); ok && seedInfo != nil {
		title = fmt.Sprintf("Mix - %s", seedInfo.Title)
		author = seedInfo.Uploader
		// Prepend seed video if not in related list
		videos := make([]VideoData, 0, len(related)+1)
		videos = append(videos, *seedInfo)
		for _, v := range related {
			if v.ID != videoID {
				videos = append(videos, v)
			}
		}
		return &MixPlaylistResponse{
			Title:      title,
			Author:     author,
			PlaylistID: playlistID,
			Videos:     videos,
		}
	}

	log.Printf("[mix] fallback generated for %s (%d videos)", videoID, len(related))
	return &MixPlaylistResponse{
		Title:      title,
		Author:     author,
		PlaylistID: playlistID,
		Videos:     related,
	}
}
