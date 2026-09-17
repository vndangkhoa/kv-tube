'use client';

import { useEffect, useRef } from 'react';
import LoadingSpinner from './LoadingSpinner';

interface InfiniteScrollTriggerProps {
  onLoadMore: () => void | Promise<void>;
  hasMore: boolean;
  isLoading: boolean;
  rootMargin?: string;
  endMessage?: string | null;
  loadingText?: string;
}

export default function InfiniteScrollTrigger({
  onLoadMore,
  hasMore,
  isLoading,
  rootMargin = '600px',
  endMessage = 'No more videos',
  loadingText = 'Loading more videos...',
}: InfiniteScrollTriggerProps) {
  const sentinelRef = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    if (!hasMore || isLoading) return;

    const el = sentinelRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          onLoadMoreRef.current();
        }
      },
      {
        root: null,
        rootMargin,
        threshold: 0.05,
      }
    );

    observer.observe(el);

    return () => {
      observer.disconnect();
    };
  }, [hasMore, isLoading, rootMargin]);

  return (
    <div className="infinite-scroll-trigger-wrapper" style={{ width: '100%', minHeight: '40px' }}>
      {hasMore && (
        <div
          ref={sentinelRef}
          aria-hidden="true"
          style={{ height: '10px', pointerEvents: 'none' }}
        />
      )}

      {isLoading && (
        <div
          style={{
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            padding: '24px 0',
            width: '100%',
          }}
        >
          <LoadingSpinner size="medium" text={loadingText} />
        </div>
      )}

      {!hasMore && endMessage && (
        <div
          style={{
            textAlign: 'center',
            padding: '32px 0 16px',
            color: 'var(--yt-text-secondary)',
            fontSize: '14px',
            fontWeight: 500,
          }}
        >
          {endMessage}
        </div>
      )}
    </div>
  );
}
