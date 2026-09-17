import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

const INNERTUBE_KEY = 'AIzaSyAO_FJ2SlqU8Q4STEHLGCilw_Y9_11qcW8';

const soundCache = new Map<string, { data: any; timestamp: number }>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

const userAgent =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Safari/537.36';

function findObjectByKey(obj: any, key: string): any {
  if (!obj || typeof obj !== 'object') return null;
  if (obj[key]) return obj[key];
  for (const k of Object.keys(obj)) {
    const found = findObjectByKey(obj[k], key);
    if (found) return found;
  }
  return null;
}

/**
 * GET /api/shorts/sound?videoId={id}
 * Extracts sound attribution and high-resolution channel avatar from the short's page.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const videoId = searchParams.get('videoId');

  if (!videoId) {
    return NextResponse.json({ error: 'Missing videoId' }, { status: 400 });
  }

  // Check cache
  const cached = soundCache.get(videoId);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return NextResponse.json(cached.data);
  }

  try {
    const res = await fetch(`https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`, {
      headers: {
        'User-Agent': userAgent,
        'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ sound: null }, { status: 200 });
    }

    const html = await res.text();
    const match = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/);
    if (!match) {
      return NextResponse.json({ sound: null }, { status: 200 });
    }

    const data = JSON.parse(match[1]);

    // 1. Extract sound information from pivotButtonViewModel
    const pivot = findObjectByKey(data, 'pivotButtonViewModel');
    const soundTitle = pivot?.soundAttributionTitle?.content || null;
    const soundThumbSources = pivot?.thumbnail?.sources;
    const soundThumb = Array.isArray(soundThumbSources) && soundThumbSources.length > 0
      ? soundThumbSources[soundThumbSources.length - 1]?.url || soundThumbSources[0]?.url
      : null;

    // 2. Extract continuation token for the audio pivot panel
    let audioPivotToken: string | null = null;
    const panels = data.engagementPanels || [];
    for (const p of panels) {
      const r = p.engagementPanelSectionListRenderer;
      if (r?.targetId === 'engagement-panel-shorts-audio-pivot') {
        audioPivotToken =
          r.content?.richGridRenderer?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;
        break;
      }
    }

    // 3. Extract high-res channel avatar and name from reelChannelBarViewModel
    const channelBar = findObjectByKey(data, 'reelChannelBarViewModel');
    const avatarSources = channelBar?.decoratedAvatarViewModel?.decoratedAvatarViewModel?.avatar?.avatarViewModel?.image?.sources;
    const directAvatar = Array.isArray(avatarSources) && avatarSources.length > 0
      ? avatarSources[avatarSources.length - 1]?.url || avatarSources[0]?.url
      : null;
    const channelName = channelBar?.channelName?.content || null;
    const channelId = channelBar?.channelName?.commandRuns?.[0]?.onTap?.innertubeCommand?.browseEndpoint?.browseId || null;

    const result = {
      sound: {
        title: soundTitle,
        thumbnail: soundThumb || directAvatar,
        audioPivotToken,
      },
      channelAvatar: directAvatar,
      channelName,
      channelId,
    };

    soundCache.set(videoId, { data: result, timestamp: Date.now() });

    return NextResponse.json(result);
  } catch (err) {
    console.error('[Shorts Sound API GET Error]', err);
    return NextResponse.json({ sound: null, error: 'Failed to extract sound' }, { status: 500 });
  }
}

/**
 * POST /api/shorts/sound
 * Retrieves a list of shorts that use the same audio via YouTube InnerTube audio pivot browse API.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { continuationToken, soundTitle, videoId } = body;

    let targetToken = continuationToken;

    // If token wasn't provided but videoId was, try to retrieve it first
    if (!targetToken && videoId) {
      const cached = soundCache.get(videoId);
      if (cached?.data?.sound?.audioPivotToken) {
        targetToken = cached.data.sound.audioPivotToken;
      } else {
        const lookupRes = await fetch(`https://www.youtube.com/shorts/${encodeURIComponent(videoId)}`, {
          headers: { 'User-Agent': userAgent, 'Accept-Language': 'vi-VN,vi;q=0.9,en-US;q=0.8,en;q=0.7' },
        });
        if (lookupRes.ok) {
          const html = await lookupRes.text();
          const match = html.match(/var ytInitialData = ({[\s\S]*?});<\/script>/);
          if (match) {
            const data = JSON.parse(match[1]);
            const panels = data.engagementPanels || [];
            for (const p of panels) {
              const r = p.engagementPanelSectionListRenderer;
              if (r?.targetId === 'engagement-panel-shorts-audio-pivot') {
                targetToken =
                  r.content?.richGridRenderer?.contents?.[0]?.continuationItemRenderer?.continuationEndpoint?.continuationCommand?.token || null;
                break;
              }
            }
          }
        }
      }
    }

    // If we have an InnerTube continuation token, query the browse endpoint
    if (targetToken) {
      const browseRes = await fetch(
        `https://www.youtube.com/youtubei/v1/browse?prettyPrint=false&key=${INNERTUBE_KEY}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': userAgent,
          },
          body: JSON.stringify({
            context: {
              client: {
                clientName: 'WEB',
                clientVersion: '2.20260916.01.00',
                hl: 'vi',
                gl: 'VN',
              },
            },
            continuation: targetToken,
          }),
        }
      );

      if (browseRes.ok) {
        const browseData = await browseRes.json();
        const action = browseData.onResponseReceivedActions?.[0];
        const items =
          action?.reloadContinuationItemsCommand?.continuationItems ||
          action?.appendContinuationItemsAction?.continuationItems ||
          [];

        const headerTitle =
          browseData.header?.pageHeaderViewModel?.title?.dynamicTextViewModel?.text?.content || soundTitle || 'Sound';
        const headerAuthor =
          browseData.header?.pageHeaderViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.avatarStack?.avatarStackViewModel?.text?.content || '';
        const headerThumb =
          browseData.header?.pageHeaderViewModel?.metadata?.contentMetadataViewModel?.metadataRows?.[0]?.metadataParts?.[0]?.avatarStack?.avatarStackViewModel?.avatars?.[0]?.avatarViewModel?.image?.sources?.[0]?.url || '';

        const videos: any[] = [];
        for (const it of items) {
          const vm = it.richItemRenderer?.content?.shortsLockupViewModel;
          if (vm) {
            const vidId = vm.onTap?.innertubeCommand?.reelWatchEndpoint?.videoId;
            if (!vidId) continue;

            const title =
              vm.overlayMetadata?.primaryText?.content ||
              vm.accessibilityText?.split(',')?.[0] ||
              'Short Video';
            const thumbSources = vm.image?.contentPreviewImageViewModel?.image?.sources;
            const thumb =
              Array.isArray(thumbSources) && thumbSources.length > 0
                ? thumbSources[thumbSources.length - 1]?.url || thumbSources[0]?.url
                : `https://i.ytimg.com/vi/${vidId}/hqdefault.jpg`;
            const views =
              vm.overlayMetadata?.secondaryText?.content ||
              vm.accessibilityText?.match(/([\d.,]+(?:\s*[MK triệu nghìn]+)?\s*lượt xem)/i)?.[1] ||
              '';

            videos.push({
              id: vidId,
              title,
              thumbnail: thumb,
              views,
            });
          }
        }

        if (videos.length > 0) {
          return NextResponse.json({
            sound: {
              title: headerTitle,
              author: headerAuthor,
              thumbnail: headerThumb,
            },
            videos,
          });
        }
      }
    }

    // Fallback: search for other shorts with this sound title or creator
    if (soundTitle) {
      const invidiousBase = process.env.INVIDIOUS_URL || 'https://yt.khoavo.myds.me';
      const cleanTitle = soundTitle.replace(/^(?:Âm thanh gốc|Original Sound)\s*[-·:]*\s*/i, '').trim() || soundTitle;
      const searchRes = await fetch(
        `${invidiousBase}/api/v1/search?q=${encodeURIComponent(cleanTitle + ' #shorts')}&type=video&duration=short`,
        { headers: { 'User-Agent': userAgent } }
      );
      if (searchRes.ok) {
        const list = await searchRes.json();
        if (Array.isArray(list)) {
          const videos = list.slice(0, 15).map((v: any) => ({
            id: v.videoId || v.id,
            title: v.title || 'Short Video',
            thumbnail: v.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${v.videoId || v.id}/hqdefault.jpg`,
            views: v.viewCount ? `${(v.viewCount / 1000).toFixed(0)}K views` : '',
          }));
          return NextResponse.json({
            sound: {
              title: soundTitle,
              author: '',
              thumbnail: '',
            },
            videos,
          });
        }
      }
    }

    return NextResponse.json({ sound: { title: soundTitle || 'Sound' }, videos: [] });
  } catch (err) {
    console.error('[Shorts Sound API POST Error]', err);
    return NextResponse.json({ error: 'Failed to fetch sound pivot videos', videos: [] }, { status: 500 });
  }
}
