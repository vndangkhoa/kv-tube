'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import { getVideoComments, CommentData } from '../actions';

interface CommentsProps {
    videoId: string;
}

export default function Comments({ videoId }: CommentsProps) {
    const [comments, setComments] = useState<CommentData[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(false);
    const [isExpanded, setIsExpanded] = useState(false);

    useEffect(() => {
        let isMounted = true;
        setIsLoading(true);
        setError(false);
        setIsExpanded(false);

        getVideoComments(videoId, 40)
            .then(data => {
                if (isMounted) {
                    if (data.length === 0) {
                        setError(true);
                    } else {
                        const topLevel = data.filter(c => !c.is_reply);
                        setComments(topLevel);
                    }
                    setIsLoading(false);
                }
            })
            .catch(err => {
                if (isMounted) {
                    console.error('Failed to load comments:', err);
                    setError(true);
                    setIsLoading(false);
                }
            });

        return () => {
            isMounted = false;
        };
    }, [videoId]);

    if (error) {
        return (
            <div className="comments-section" style={{ marginTop: '24px', color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
                Comments are turned off or unavailable.
            </div>
        );
    }

    if (isLoading) {
        return (
            <div className="comments-section" style={{ marginTop: '24px' }}>
                <h3 style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px' }}>Comments</h3>
                {[...Array(3)].map((_, i) => (
                    <div key={i} style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                        <div className="skeleton" style={{ width: '40px', height: '40px', borderRadius: '50%', flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                            <div className="skeleton" style={{ height: '14px', width: '120px', marginBottom: '8px' }} />
                            <div className="skeleton" style={{ height: '14px', width: '80%', marginBottom: '4px' }} />
                            <div className="skeleton" style={{ height: '14px', width: '60%' }} />
                        </div>
                    </div>
                ))}
            </div>
        );
    }

    // Always render all comments; CSS handles mobile collapse via max-height

    return (
        <div className="comments-section" style={{ marginTop: '24px' }}>
            {/* Collapsed header for mobile - tappable to expand */}
            {!isExpanded && comments.length > 0 && (
                <div 
                    className="comments-collapsed-header"
                    onClick={() => setIsExpanded(true)}
                    style={{
                        cursor: 'pointer',
                        display: 'none', // Hidden on desktop, shown via CSS on mobile
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        padding: '12px 16px',
                        backgroundColor: 'var(--yt-hover)',
                        borderRadius: '12px',
                        marginBottom: '16px'
                    }}
                >
                    <div>
                        <span style={{ fontSize: '16px', fontWeight: 600, color: 'var(--yt-text-primary)' }}>
                            Comments
                        </span>
                        <span style={{ fontSize: '14px', color: 'var(--yt-text-secondary)', marginLeft: '8px' }}>
                            {comments.length}
                        </span>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        {comments[0] && (
                            <span style={{ fontSize: '13px', color: 'var(--yt-text-secondary)', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {comments[0].text.slice(0, 60)}...
                            </span>
                        )}
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--yt-text-secondary)"><path d="M7.41 8.59L12 13.17l4.59-4.58L18 10l-6 6-6-6z"/></svg>
                    </div>
                </div>
            )}

            {/* Desktop: always show full title. Mobile: hidden when collapsed */}
            <h3 className="comments-full-header" style={{ fontSize: '20px', fontWeight: 700, marginBottom: '24px', color: 'var(--yt-text-primary)' }}>
                {comments.length} Comments
            </h3>

            <div className={`comments-list ${isExpanded ? 'expanded' : ''}`}>
                {comments.map((c) => (
                    <div key={c.id} style={{ display: 'flex', gap: '16px', marginBottom: '20px' }}>
                        <div style={{ position: 'relative', width: '40px', height: '40px', borderRadius: '50%', overflow: 'hidden', flexShrink: 0, backgroundColor: 'var(--yt-hover)' }}>
                             <Image
                                 src={c.author_thumbnail || 'https://i.ytimg.com/img/channels/c_ip_m_default.jpg'}
                                 alt={c.author}
                                 fill
                                 sizes="40px"
                                 style={{ objectFit: 'cover' }}
                                 onError={(e) => {
                                     const img = e.target as HTMLImageElement;
                                     img.onerror = null;
                                     img.src = 'https://i.ytimg.com/img/channels/c_ip_m_default.jpg'; // Fallback to YouTube's default channel avatar
                                 }}
                             />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0, gap: '4px' }}>
                            <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                                <span style={{ fontSize: '13px', fontWeight: 500, color: 'var(--yt-text-primary)' }}>
                                    {c.author}
                                </span>
                                <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>
                                    {c.timestamp}
                                </span>
                            </div>
                            <div style={{ 
                                fontSize: '14px', 
                                lineHeight: '20px', 
                                color: 'var(--yt-text-primary)', 
                                whiteSpace: 'pre-wrap', 
                                overflowWrap: 'break-word',
                                wordBreak: 'break-word'
                            }}>
                                <span dangerouslySetInnerHTML={{ __html: c.text }} />
                            </div>
                            
                            {c.likes > 0 && (
                                <div style={{ display: 'flex', alignItems: 'center', gap: '16px', marginTop: '4px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', color: 'var(--yt-text-secondary)', fontSize: '12px' }}>
                                        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M1 21h4V9H1v12zm22-11c0-1.1-.9-2-2-2h-6.31l.95-4.57.03-.32c0-.41-.17-.79-.44-1.06L14.17 1 7.59 7.59C7.22 7.95 7 8.45 7 9v10c0 1.1.9 2 2 2h9c.83 0 1.54-.5 1.84-1.22l3.02-7.05c.09-.23.14-.47.14-.73v-2z"></path></svg>
                                        {c.likes}
                                    </div>
                                </div>
                            )}
                        </div>
                    </div>
                ))}
            </div>
            
            {/* Show more / collapse toggle on mobile */}
            {comments.length > 2 && (
                <button
                    className="comments-toggle-btn"
                    onClick={() => setIsExpanded(!isExpanded)}
                    style={{
                        display: 'none', // Hidden on desktop, shown via CSS on mobile
                        width: '100%',
                        padding: '12px',
                        backgroundColor: 'transparent',
                        border: '1px solid var(--yt-border)',
                        borderRadius: '20px',
                        color: 'var(--yt-text-primary)',
                        fontSize: '14px',
                        fontWeight: 500,
                        cursor: 'pointer',
                        marginTop: '8px'
                    }}
                >
                    {isExpanded ? 'Show less' : `Show ${comments.length - 2} more comments`}
                </button>
            )}
            
            {comments.length === 0 && (
                <div style={{ color: 'var(--yt-text-secondary)', fontSize: '14px' }}>
                    No comments found.
                </div>
            )}
        </div>
    );
}
