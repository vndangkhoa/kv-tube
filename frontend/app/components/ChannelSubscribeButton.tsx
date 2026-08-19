'use client';

import { useState, useEffect } from 'react';
import { isSubscribed, toggleSubscription } from '../storage';
import { invidious } from '../services/invidious';

export default function ChannelSubscribeButton({
  channelId,
  channelName,
  channelAvatar,
}: {
  channelId: string;
  channelName: string;
  channelAvatar?: string;
}) {
  const [subscribed, setSubscribed] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (channelId) {
      setSubscribed(isSubscribed(channelId));
    }
  }, [channelId]);

  const handleSubscribe = async () => {
    if (loading || !channelId) return;
    setLoading(true);
    try {
      const next = toggleSubscription({
        channelId,
        channelName: channelName || channelId,
        channelAvatar: channelAvatar || '',
      });
      setSubscribed(next);
      if (next) {
        invidious.pushSubscriptionToInvidious(channelId).catch(() => {});
      }
    } catch (error) {
      console.error('Subscribe error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      className={`channel-subscribe-btn ${subscribed ? 'subscribed' : ''}`}
      onClick={handleSubscribe}
      disabled={loading}
      style={{
        padding: '8px 18px',
        borderRadius: '20px',
        border: subscribed ? '1px solid var(--yt-border)' : 'none',
        backgroundColor: subscribed ? 'var(--yt-surface)' : 'var(--md-sys-color-primary, var(--yt-text-primary))',
        color: subscribed ? 'var(--yt-text-primary)' : 'var(--md-sys-color-on-primary, var(--yt-background))',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
      }}
    >
      {loading ? '...' : subscribed ? 'Subscribed' : 'Subscribe'}
    </button>
  );
}
