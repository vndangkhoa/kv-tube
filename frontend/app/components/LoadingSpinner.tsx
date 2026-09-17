'use client';

import { useState, useEffect } from 'react';

interface LoadingSpinnerProps {
    size?: 'small' | 'medium' | 'large';
    fullScreen?: boolean;
    text?: string;
    color?: 'primary' | 'white';
}

const sizeMap = {
    small: { spinner: 24, border: 2.5 },
    medium: { spinner: 36, border: 3 },
    large: { spinner: 48, border: 3.5 },
};

export default function LoadingSpinner({ 
    size = 'medium', 
    fullScreen = false, 
    text,
    color = 'primary' 
}: LoadingSpinnerProps) {
    const { spinner, border } = sizeMap[size];
    const [elapsedSlow, setElapsedSlow] = useState(false);

    useEffect(() => {
        if (!text) return;
        setElapsedSlow(false);
        const timer = setTimeout(() => {
            setElapsedSlow(true);
        }, 4000);
        return () => clearTimeout(timer);
    }, [text]);

    const spinnerColor = color === 'white' ? '#ffffff' : 'var(--yt-brand-red, #ff0000)';
    const trackColor = color === 'white' ? 'rgba(255, 255, 255, 0.2)' : 'var(--yt-border, rgba(128, 128, 128, 0.2))';

    const content = (
        <div 
            role="status" 
            aria-live="polite"
            style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '12px',
                textAlign: 'center',
            }}
        >
            <div
                style={{
                    width: `${spinner}px`,
                    height: `${spinner}px`,
                    border: `${border}px solid ${trackColor}`,
                    borderTopColor: spinnerColor,
                    borderRadius: '50%',
                    animation: 'kv-spin 0.8s linear infinite',
                    boxSizing: 'border-box',
                }}
            />
            {text && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                    <span style={{
                        fontSize: '14px',
                        fontWeight: 500,
                        color: color === 'white' ? '#ffffff' : 'var(--yt-text-primary)',
                        letterSpacing: '0.1px',
                    }}>
                        {text}
                    </span>
                    {elapsedSlow && (
                        <span style={{
                            fontSize: '12px',
                            color: color === 'white' ? 'rgba(255,255,255,0.7)' : 'var(--yt-text-secondary)',
                            animation: 'fadeIn 0.3s ease-in',
                        }}>
                            Connecting to server, please wait...
                        </span>
                    )}
                </div>
            )}
            <style jsx>{`
                @keyframes kv-spin {
                    to { transform: rotate(360deg); }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: translateY(-2px); }
                    to { opacity: 1; transform: translateY(0); }
                }
            `}</style>
        </div>
    );
    
    if (fullScreen) {
        return (
            <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '100%',
                height: '100vh',
                backgroundColor: 'var(--yt-background)',
            }}>
                {content}
            </div>
        );
    }
    
    return content;
}
