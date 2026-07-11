// Region-aware search queries.
//
// YouTube search results are driven by the *language of the query text*, not by
// geo flags. So to make the home feed actually reflect the selected region we
// search using localized terms (e.g. "nhạc hay" for Vietnam instead of "music").

export interface RegionContent {
    name: string;
    trending: string;
    categories: Record<string, string>;
    topics: string[];
}

const EN: RegionContent = {
    name: '',
    trending: 'trending videos 2026',
    categories: {
        Music: 'music video 2026',
        Gaming: 'gaming 2026',
        News: 'news today',
        Sports: 'sports highlights',
        Live: 'live stream',
        Education: 'educational video',
        Comedy: 'comedy sketch',
        Tech: 'tech review 2026',
        Food: 'cooking recipe',
        Travel: 'travel vlog',
        Fashion: 'fashion style 2026',
        Science: 'science documentary',
    },
    topics: [
        'trending videos 2026', 'viral videos', 'funny moments 2026', 'tech review 2026',
        'cooking recipe easy', 'travel vlog 2026', 'science experiment', 'news today',
        'sports highlights', 'gaming moments 2026', 'music video 2026', 'comedy sketch',
        'nature documentary', 'fitness workout', 'DIY project', 'car review 2026',
    ],
};

const REGION_CONTENT: Record<string, RegionContent> = {
    US: EN,
    GB: EN,
    GLOBAL: EN,

    VN: {
        name: 'Việt Nam',
        trending: 'video thịnh hành việt nam',
        categories: {
            Music: 'nhạc trẻ hay 2026',
            Gaming: 'game gameplay việt nam',
            News: 'tin tức 24h việt nam',
            Sports: 'bóng đá việt nam',
            Live: 'trực tiếp',
            Education: 'giáo dục học tập',
            Comedy: 'phim hài việt nam',
            Tech: 'review công nghệ',
            Food: 'ẩm thực món ăn ngon',
            Travel: 'du lịch việt nam',
            Fashion: 'thời trang',
            Science: 'khoa học khám phá',
        },
        topics: [
            'video thịnh hành việt nam', 'nhạc trẻ remix 2026', 'phim hài việt nam',
            'review công nghệ', 'ẩm thực việt nam', 'du lịch việt nam', 'tin tức 24h',
            'bóng đá việt nam', 'gameplay việt nam', 'vlog cuộc sống', 'khoa học khám phá',
            'phim ngắn việt nam', 'reaction việt nam', 'nhạc trữ tình',
        ],
    },

    JP: {
        name: '日本',
        trending: '急上昇 動画 日本',
        categories: {
            Music: '音楽 MV 2026',
            Gaming: 'ゲーム実況',
            News: 'ニュース 最新',
            Sports: 'スポーツ ハイライト',
            Live: 'ライブ配信',
            Education: '勉強 教育',
            Comedy: 'お笑い',
            Tech: 'ガジェット レビュー',
            Food: '料理 レシピ',
            Travel: '旅行 vlog',
            Fashion: 'ファッション',
            Science: '科学',
        },
        topics: [
            '急上昇 動画 日本', '音楽 MV 2026', 'ゲーム実況', 'お笑い', '料理 レシピ',
            '旅行 vlog', 'ニュース 最新', 'スポーツ ハイライト', 'ガジェット レビュー',
            'アニメ', 'vlog 日常', '科学 実験', 'ドッキリ', 'メイク',
        ],
    },

    KR: {
        name: '대한민국',
        trending: '인기 급상승 동영상',
        categories: {
            Music: '케이팝 음악 2026',
            Gaming: '게임 방송',
            News: '뉴스 속보',
            Sports: '스포츠 하이라이트',
            Live: '라이브 방송',
            Education: '교육 공부',
            Comedy: '예능 코미디',
            Tech: '테크 리뷰',
            Food: '먹방 요리',
            Travel: '여행 브이로그',
            Fashion: '패션',
            Science: '과학',
        },
        topics: [
            '인기 급상승 동영상', '케이팝 2026', '게임 방송', '먹방', '브이로그',
            '예능', '뉴스 속보', '스포츠 하이라이트', '테크 리뷰', '여행 브이로그',
            '요리 레시피', '메이크업', '과학 실험', '리액션',
        ],
    },

    IN: {
        name: 'India',
        trending: 'trending videos india',
        categories: {
            Music: 'hindi songs 2026',
            Gaming: 'gaming india',
            News: 'hindi news today',
            Sports: 'cricket highlights',
            Live: 'live stream india',
            Education: 'education hindi',
            Comedy: 'comedy video hindi',
            Tech: 'tech review hindi',
            Food: 'indian food recipe',
            Travel: 'travel vlog india',
            Fashion: 'fashion india',
            Science: 'science hindi',
        },
        topics: [
            'trending videos india', 'hindi songs 2026', 'bollywood', 'cricket highlights',
            'indian food recipe', 'comedy video hindi', 'tech review hindi', 'vlog india',
            'hindi news today', 'gaming india', 'motivational hindi', 'dance video india',
            'travel vlog india', 'stand up comedy india',
        ],
    },
};

export function getRegionContent(regionCode: string): RegionContent {
    return REGION_CONTENT[regionCode] || EN;
}

// Localized query for a UI category label, falling back to the English label plus
// the region name for anything not explicitly mapped.
export function categoryQuery(regionCode: string, category: string): string {
    const rc = getRegionContent(regionCode);
    if (rc.categories[category]) return rc.categories[category];
    return rc.name ? `${category} ${rc.name}` : category;
}
