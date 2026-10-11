import Foundation

public enum SearchSortBy: String, CaseIterable, Identifiable {
    case relevance = "relevance"
    case uploadDate = "upload_date"
    case viewCount = "view_count"
    case rating = "rating"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .relevance: return "Relevance"
        case .uploadDate: return "Upload Date"
        case .viewCount: return "View Count"
        case .rating: return "Rating"
        }
    }
}

public enum SearchUploadDate: String, CaseIterable, Identifiable {
    case all = ""
    case hour = "hour"
    case today = "today"
    case week = "week"
    case month = "month"
    case year = "year"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .all: return "Any Time"
        case .hour: return "Last Hour"
        case .today: return "Today"
        case .week: return "This Week"
        case .month: return "This Month"
        case .year: return "This Year"
        }
    }
}

public enum SearchType: String, CaseIterable, Identifiable {
    case all = "all"
    case video = "video"
    case channel = "channel"
    case playlist = "playlist"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .all: return "All"
        case .video: return "Videos"
        case .channel: return "Channels"
        case .playlist: return "Playlists"
        }
    }
}

public enum SearchDuration: String, CaseIterable, Identifiable {
    case all = ""
    case short = "short"
    case medium = "medium"
    case long = "long"

    public var id: String { rawValue }

    public var title: String {
        switch self {
        case .all: return "Any Duration"
        case .short: return "Under 4 minutes"
        case .medium: return "4 - 20 minutes"
        case .long: return "Over 20 minutes"
        }
    }
}

public enum SearchResultItem: Identifiable, Hashable {
    case video(VideoData)
    case channel(ChannelInfo)
    case playlist(PlaylistData)

    public var id: String {
        switch self {
        case .video(let v): return "v_\(v.id)"
        case .channel(let c): return "c_\(c.id)"
        case .playlist(let p): return "p_\(p.id)"
        }
    }
}
