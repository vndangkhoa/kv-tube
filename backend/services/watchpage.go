package services

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"io/ioutil"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"
)

// Watch-page HTML parsing. yt-dlp full extraction is exactly what YouTube
// bot-blocks first ("Requested format is not available" = the player response
// was downgraded to zero formats), while the raw watch page HTML still loads
// from any residential IP. The page embeds everything we need:
//   - ytInitialPlayerResponse.videoDetails → video metadata
//   - ytInitialData → the real "Up next" related list (2026: lockupViewModel)
var watchPageClient = &http.Client{Timeout: 8 * time.Second}

const watchPageMaxBody = 3 << 20 // 3 MB

const watchPageUA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"

// fetchWatchPageHTML downloads a watch page, returning false when the page is
// not fetchable (bot gate, network failure, removed video).
func fetchWatchPageHTML(videoID string) ([]byte, bool) {
	urlStr := fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID)
	req, err := http.NewRequest("GET", urlStr, nil)
	if err != nil {
		return nil, false
	}
	req.Header.Set("User-Agent", watchPageUA)
	req.Header.Set("Accept-Language", "en-US,en;q=0.9")

	resp, err := watchPageClient.Do(req)
	if err != nil {
		return nil, false
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, false
	}
	body, err := ioutil.ReadAll(io.LimitReader(resp.Body, watchPageMaxBody))
	if err != nil {
		return nil, false
	}
	return body, true
}

// extractEmbeddedJSON finds `var <name> = {...};` in the page HTML and returns
// the balanced JSON object. Uses the full var-name pattern so base64 blobs
// elsewhere in the page (which can contain the bare name as a substring)
// never match.
func extractEmbeddedJSON(body []byte, name string) ([]byte, bool) {
	pattern := []byte("var " + name)
	idx := bytes.Index(body, pattern)
	if idx == -1 {
		return nil, false
	}
	eq := bytes.Index(body[idx:], []byte("="))
	if eq == -1 {
		return nil, false
	}
	start := idx + eq + 1
	for start < len(body) && (body[start] == ' ' || body[start] == '\t' || body[start] == '\n') {
		start++
	}
	if start >= len(body) || body[start] != '{' {
		return nil, false
	}

	depth := 0
	inString := false
	escaped := false
	for i := start; i < len(body); i++ {
		c := body[i]
		if inString {
			if escaped {
				escaped = false
				continue
			}
			if c == '\\' {
				escaped = true
				continue
			}
			if c == '"' {
				inString = false
			}
			continue
		}
		switch c {
		case '"':
			inString = true
		case '{':
			depth++
		case '}':
			depth--
			if depth == 0 {
				return body[start : i+1], true
			}
		}
	}
	return nil, false
}

// ---- video metadata (ytInitialPlayerResponse) ----

// watchPagePlayerResponse mirrors the fields we need from
// ytInitialPlayerResponse.videoDetails.
type watchPagePlayerResponse struct {
	VideoDetails struct {
		VideoID          string `json:"videoId"`
		Title            string `json:"title"`
		Author           string `json:"author"`
		ChannelID        string `json:"channelId"`
		ViewCount        string `json:"viewCount"`
		LengthSeconds    string `json:"lengthSeconds"`
		ShortDescription string `json:"shortDescription"`
	} `json:"videoDetails"`
	Microformat struct {
		PlayerMicroformatRenderer struct {
			UploadDate string `json:"uploadDate"`
		} `json:"playerMicroformatRenderer"`
	} `json:"microformat"`
}

// FetchWatchPageVideoInfo extracts video metadata from the watch page's
// ytInitialPlayerResponse. Returns ok=false when the page is unavailable or
// contains no videoDetails (removed/private video, hard block).
func FetchWatchPageVideoInfo(videoID string) (*VideoData, bool) {
	body, ok := fetchWatchPageHTML(videoID)
	if !ok {
		return nil, false
	}
	obj, ok := extractEmbeddedJSON(body, "ytInitialPlayerResponse")
	if !ok {
		return nil, false
	}
	var raw watchPagePlayerResponse
	if err := json.Unmarshal(obj, &raw); err != nil {
		return nil, false
	}
	vd := raw.VideoDetails
	if vd.VideoID == "" || vd.Title == "" {
		return nil, false
	}

	uploader := vd.Author
	if uploader == "" {
		uploader = "Unknown"
	}
	durationStr := ""
	if secs, err := strconv.Atoi(vd.LengthSeconds); err == nil && secs > 0 {
		hours := secs / 3600
		mins := (secs % 3600) / 60
		secs = secs % 60
		if hours > 0 {
			durationStr = fmt.Sprintf("%d:%02d:%02d", hours, mins, secs)
		} else {
			durationStr = fmt.Sprintf("%d:%02d", mins, secs)
		}
	}
	uploadDate := ""
	if raw.Microformat.PlayerMicroformatRenderer.UploadDate != "" {
		// "2026-06-03T05:00:06-07:00" → "20260603"
		uploadDate = strings.ReplaceAll(raw.Microformat.PlayerMicroformatRenderer.UploadDate[:10], "-", "")
	}
	viewCount, _ := strconv.ParseInt(vd.ViewCount, 10, 64)

	data := &VideoData{
		ID:          vd.VideoID,
		Title:       vd.Title,
		Uploader:    uploader,
		ChannelID:   vd.ChannelID,
		UploaderID:  vd.ChannelID,
		Thumbnail:   fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", vd.VideoID),
		ViewCount:   viewCount,
		UploadDate:  uploadDate,
		Duration:    durationStr,
		Description: vd.ShortDescription,
	}
	log.Printf("[watchpage] video info from watch page for %s: %q by %q", videoID, data.Title, data.Uploader)
	return data, true
}

// ---- related videos (ytInitialData) ----

// watchPageRelatedData mirrors the 2026 watch-page layout: the real "Up
// next" list lives at contents.twoColumnWatchNextResults.secondaryResults
// .secondaryResults.results, where each item is an itemSectionRenderer whose
// contents are lockupViewModel entries.
type watchPageRelatedData struct {
	Contents struct {
		TwoColumnWatchNextResults struct {
			SecondaryResults struct {
				SecondaryResults struct {
					Results []struct {
						ItemSectionRenderer struct {
							Contents []struct {
								LockupViewModel struct {
									ContentID string `json:"contentId"`
									ContentImage struct {
										ThumbnailViewModel struct {
											Overlays []struct {
												ThumbnailBottomOverlayViewModel struct {
													Badges []struct {
														ThumbnailBadgeViewModel struct {
															Text string `json:"text"`
														} `json:"thumbnailBadgeViewModel"`
													} `json:"badges"`
												} `json:"thumbnailBottomOverlayViewModel"`
											} `json:"overlays"`
										} `json:"thumbnailViewModel"`
									} `json:"contentImage"`
									Metadata struct {
										LockupMetadataViewModel struct {
											Title struct {
												Content string `json:"content"`
											} `json:"title"`
											Metadata struct {
												ContentMetadataViewModel struct {
													MetadataRows []struct {
														MetadataParts []struct {
															Text struct {
																Content string `json:"content"`
															} `json:"text"`
														} `json:"metadataParts"`
													} `json:"metadataRows"`
												} `json:"contentMetadataViewModel"`
											} `json:"metadata"`
										} `json:"lockupMetadataViewModel"`
									} `json:"metadata"`
								} `json:"lockupViewModel"`
							} `json:"contents"`
						} `json:"itemSectionRenderer"`
					} `json:"results"`
				} `json:"secondaryResults"`
			} `json:"secondaryResults"`
		} `json:"twoColumnWatchNextResults"`
	} `json:"contents"`
}

// fetchWatchPageRelated parses YouTube's own "Up next" list from the watch
// page HTML. Returns ok=false when the page is unavailable or contains no
// related entries (bot gate, removed video).
func fetchWatchPageRelated(videoID string, limit int) ([]VideoData, bool) {
	body, ok := fetchWatchPageHTML(videoID)
	if !ok {
		return nil, false
	}
	obj, ok := extractEmbeddedJSON(body, "ytInitialData")
	if !ok {
		return nil, false
	}
	var raw watchPageRelatedData
	if err := json.Unmarshal(obj, &raw); err != nil {
		return nil, false
	}

	related := make([]VideoData, 0, limit)
	for _, r := range raw.Contents.TwoColumnWatchNextResults.SecondaryResults.SecondaryResults.Results {
		for _, c := range r.ItemSectionRenderer.Contents {
			lv := c.LockupViewModel
			if lv.ContentID == "" || lv.ContentID == videoID {
				continue
			}
			title := lv.Metadata.LockupMetadataViewModel.Title.Content
			if title == "" {
				continue
			}
			uploader := ""
			rows := lv.Metadata.LockupMetadataViewModel.Metadata.ContentMetadataViewModel.MetadataRows
			for _, row := range rows {
				for _, part := range row.MetadataParts {
					if text := strings.TrimSpace(part.Text.Content); text != "" {
						uploader = text
						break
					}
				}
				if uploader != "" {
					break
				}
			}
			if uploader == "" {
				uploader = "Unknown"
			}
			duration := ""
			for _, o := range lv.ContentImage.ThumbnailViewModel.Overlays {
				for _, b := range o.ThumbnailBottomOverlayViewModel.Badges {
					if text := strings.TrimSpace(b.ThumbnailBadgeViewModel.Text); text != "" {
						duration = text
						break
					}
				}
				if duration != "" {
					break
				}
			}
			related = append(related, VideoData{
				ID:        lv.ContentID,
				Title:     title,
				Uploader:  uploader,
				Thumbnail: fmt.Sprintf("https://i.ytimg.com/vi/%s/hqdefault.jpg", lv.ContentID),
				Duration:  duration,
			})
			if len(related) >= limit {
				break
			}
		}
		if len(related) >= limit {
			break
		}
	}
	if len(related) == 0 {
		return nil, false
	}
	log.Printf("[related] watch-page related for %s: %d items", videoID, len(related))
	return related, true
}
