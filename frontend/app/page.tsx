import Link from 'next/link';
import { cookies } from 'next/headers';
import InfiniteVideoGrid from './components/InfiniteVideoGrid';
import {
  getSearchVideos,
  getHistoryVideos,
  getSuggestedVideos
} from './actions';
import {
  VideoData,
  CATEGORY_MAP,
  ALL_CATEGORY_SECTIONS,
  addRegion,
  getRandomModifier
} from './utils';

export const dynamic = 'force-dynamic';

const REGION_LABELS: Record<string, string> = {
  VN: 'Vietnam',
  US: 'United States',
  JP: 'Japan',
  KR: 'South Korea',
  IN: 'India',
  GB: 'United Kingdom',
  GLOBAL: '',
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
  const awaitParams = await searchParams;
  const currentCategory = (awaitParams.category as string) || 'All';
  const isAllCategory = currentCategory === 'All';

  const cookieStore = await cookies();
  const regionCode = cookieStore.get('region')?.value || 'VN';
  const regionLabel = REGION_LABELS[regionCode] || '';

  let gridVideos: VideoData[] = [];
  const randomMod = getRandomModifier();

  if (isAllCategory) {
    // Fetch top 6 from each category to build a robust recommendation feed
    const promises = ALL_CATEGORY_SECTIONS.map(async (sec) => {
      return await getSearchVideos(addRegion(sec.query, regionLabel) + ' ' + randomMod, 6);
    });

    const results = await Promise.all(promises);

    // Interleave the results: 1st from Trending, 1st from Music, ... 2nd from Trending, etc.
    const maxLen = Math.max(...results.map(arr => arr.length));
    const interleavedList: VideoData[] = [];
    const seenIds = new Set<string>();

    for (let i = 0; i < maxLen; i++) {
      for (const categoryResult of results) {
        if (i < categoryResult.length) {
          const video = categoryResult[i];
          if (!seenIds.has(video.id)) {
            interleavedList.push(video);
            seenIds.add(video.id);
          }
        }
      }
    }
    gridVideos = interleavedList;

  } else if (currentCategory === 'Watched') {
    gridVideos = await getHistoryVideos(50);
  } else if (currentCategory === 'Suggested') {
    gridVideos = await getSuggestedVideos(20);
  } else {
    const searchQuery = CATEGORY_MAP[currentCategory] || CATEGORY_MAP['All'];
    gridVideos = await getSearchVideos(addRegion(searchQuery, regionLabel) + ' ' + randomMod, 30);
  }

  const categoriesList = Object.keys(CATEGORY_MAP);

  return (
    <div style={{ paddingTop: '12px' }}>
      {/* Category Chips Scrollbar */}
      <div style={{ display: 'flex', gap: '12px', padding: '0 12px', marginBottom: '16px', overflowX: 'auto', justifyContent: 'center' }} className="chips-container hide-scrollbox">
        {categoriesList.map((cat) => {
          const isActive = cat === currentCategory;
          return (
            <Link key={cat} href={cat === 'All' ? '/' : `/?category=${encodeURIComponent(cat)}`} style={{ textDecoration: 'none' }}>
              <button
                className={`chip ${isActive ? 'active' : ''}`}
                style={{
                  fontSize: '14px',
                  whiteSpace: 'nowrap',
                  transition: 'var(--yt-transition)',
                  backgroundColor: isActive ? 'var(--foreground)' : 'var(--yt-hover)',
                  color: isActive ? 'var(--background)' : 'var(--yt-text-primary)'
                }}
              >
                {cat}
              </button>
            </Link>
          );
        })}
      </div>

      <div style={{ padding: '0 12px' }} className="main-container-mobile">
        <InfiniteVideoGrid
          initialVideos={gridVideos}
          currentCategory={currentCategory}
          regionLabel={regionLabel}
        />
      </div>
    </div>
  );
}
