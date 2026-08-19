// Region-aware search queries.
//
// YouTube search results are driven by the language and keywords of the query text.
// To make the feed match the selected region, we query using localized terms.

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
    Music: 'official music video top hits',
    Gaming: 'gaming walkthrough gameplay highlights',
    Movies: 'movie official trailers teaser',
    News: 'news today breaking live',
    Tech: 'technology gadgets smartphone review',
    Coding: 'software programming web development tutorial',
    Sports: 'sports highlights top plays matches',
    Podcasts: 'podcast full episode interview',
    Live: 'live stream',
    Education: 'educational video science history',
    Comedy: 'comedy sketch standup funny',
    Food: 'cooking recipes delicious street food',
    Travel: 'travel vlog city explore guide',
    Fashion: 'fashion style lookbook',
    Science: 'science space physics documentary',
  },
  topics: [
    'trending videos 2026',
    'viral videos',
    'tech review 2026',
    'cooking recipe easy',
    'travel vlog 2026',
    'science experiment',
    'news today',
    'sports highlights',
    'gaming moments 2026',
    'music video 2026',
    'comedy sketch',
    'nature documentary',
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
      Music: 'nhạc trẻ hay 2026 official mv',
      Gaming: 'game gameplay highlights việt nam',
      Movies: 'trailer phim việt nam chiếu rạp teaser',
      News: 'tin tức 24h việt nam thời sự',
      Tech: 'review công nghệ điện thoại máy tính',
      Coding: 'lập trình web tutorial việt nam',
      Sports: 'bóng đá việt nam highlights',
      Podcasts: 'podcast việt nam trò chuyện',
      Live: 'trực tiếp live stream',
      Education: 'giáo dục học tập kỹ năng',
      Comedy: 'phim hài tiểu phẩm hài việt nam',
      Food: 'ẩm thực món ăn ngon đường phố',
      Travel: 'du lịch khám phá việt nam',
      Fashion: 'thời trang phối đồ',
      Science: 'khoa học vũ trụ khám phá',
    },
    topics: [
      'video thịnh hành việt nam',
      'nhạc trẻ remix 2026',
      'phim hài việt nam',
      'review công nghệ',
      'ẩm thực việt nam',
      'du lịch việt nam',
      'tin tức 24h',
      'bóng đá việt nam',
      'gameplay việt nam',
      'vlog cuộc sống',
    ],
  },

  JP: {
    name: '日本',
    trending: '急上昇 動画 日本',
    categories: {
      Music: '音楽 MV 2026 最新',
      Gaming: 'ゲーム実況 プレイ動画',
      Movies: '映画 予告編 公式',
      News: 'ニュース 最新 速報',
      Tech: 'ガジェット レビュー テック',
      Coding: 'プログラミング 入門 開発',
      Sports: 'スポーツ ハイライト',
      Podcasts: 'ポッドキャスト 日本 ラジオ',
      Live: 'ライブ配信 配信中',
      Education: '勉強 教育 解説',
      Comedy: 'お笑い コント 漫才',
      Food: '料理 レシピ グルメ',
      Travel: '旅行 vlog 日本',
      Fashion: 'ファッション コーデ',
      Science: '科学 実験 宇宙',
    },
    topics: [
      '急上昇 動画 日本',
      '音楽 MV 2026',
      'ゲーム実況',
      'お笑い',
      '料理 レシピ',
      '旅行 vlog',
      'ニュース 最新',
      'スポーツ ハイライト',
    ],
  },

  KR: {
    name: '대한민국',
    trending: '인기 급상승 동영상 한국',
    categories: {
      Music: '케이팝 음악 2026 K-POP MV',
      Gaming: '게임 방송 하이라이트',
      Movies: '영화 공식 예고편 티저',
      News: '뉴스 속보 헤드라인',
      Tech: '테크 IT 기기 리뷰',
      Coding: '코딩 프로그래밍 개발',
      Sports: '스포츠 하이라이트 경기',
      Podcasts: '팟캐스트 인터뷰 토크',
      Live: '라이브 방송 생방송',
      Education: '교육 공부 강의',
      Comedy: '예능 코미디 숏박스',
      Food: '먹방 요리 레시피 맛집',
      Travel: '여행 브이로그',
      Fashion: '패션 룩북 코디',
      Science: '과학 다큐멘터리',
    },
    topics: [
      '인기 급상승 동영상',
      '케이팝 2026',
      '게임 방송',
      '먹방',
      '브이로그',
      '예능',
      '뉴스 속보',
      '스포츠 하이라이트',
    ],
  },

  IN: {
    name: 'India',
    trending: 'trending videos india',
    categories: {
      Music: 'hindi songs top hits 2026',
      Gaming: 'gaming india gameplay',
      Movies: 'official movie trailer bollywood',
      News: 'hindi news today live',
      Tech: 'tech review smartphone hindi',
      Coding: 'coding programming tutorial hindi',
      Sports: 'cricket match highlights',
      Podcasts: 'podcast full episode hindi',
      Live: 'live stream india',
      Education: 'education study hindi',
      Comedy: 'comedy video standup hindi',
      Food: 'indian street food recipe',
      Travel: 'travel vlog india explore',
      Fashion: 'fashion style india',
      Science: 'science facts hindi documentary',
    },
    topics: [
      'trending videos india',
      'hindi songs 2026',
      'bollywood',
      'cricket highlights',
      'indian food recipe',
      'comedy video hindi',
      'tech review hindi',
      'vlog india',
    ],
  },
};

export function getRegionContent(regionCode: string): RegionContent {
  return REGION_CONTENT[regionCode] || EN;
}

export function categoryQuery(regionCode: string, category: string): string {
  const rc = getRegionContent(regionCode);
  if (rc.categories[category]) return rc.categories[category];
  return rc.name ? `${category} ${rc.name}` : category;
}
