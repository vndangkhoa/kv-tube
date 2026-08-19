'use client';

import { useState, useEffect } from 'react';
import { isSubscribed as checkSubscribed, toggleSubscription } from '../storage';
import { invidious } from '../services/invidious';

interface SubscribeButtonProps {
  channelId?: string;
  channelName?: string;
  initialSubscribed?: boolean;
}

export default function SubscribeButton({ channelId, channelName, initialSubscribed }: SubscribeButtonProps) {
  const [isSub, setIsSub] = useState(initialSubscribed || false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (initialSubscribed !== undefined) {
      setIsSub(initialSubscribed);
      return;
    }
    if (channelId) {
      setIsSub(checkSubscribed(channelId));
    }
  }, [channelId, initialSubscribed]);

  const handleSubscribe = async () => {
    if (loading || !channelId) return;
    setLoading(true);
    try {
      const next = toggleSubscription({
        channelId,
        channelName: channelName || channelId,
      });
      setIsSub(next);
      if (next) {
        invidious.pushSubscriptionToInvidious(channelId).catch(() => {});
      }
    } catch (error) {
      console.error('Failed to toggle subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!channelId) return null;

  return (
    <button
      type="button"
      onClick={handleSubscribe}
      disabled={loading}
      style={{
        backgroundColor: isSub ? 'var(--yt-hover)' : 'var(--md-sys-color-primary, var(--yt-text-primary))',
        color: isSub ? 'var(--yt-text-primary)' : 'var(--md-sys-color-on-primary, var(--yt-background))',
        border: isSub ? '1px solid var(--yt-border)' : 'none',
        borderRadius: '20px',
        padding: '0 18px',
        height: '36px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: loading ? 'wait' : 'pointer',
        transition: 'all 0.2s ease',
      }}
    >
      {loading ? '...' : isSub ? 'Subscribed' : 'Subscribe'}
    </button>
  );
}
