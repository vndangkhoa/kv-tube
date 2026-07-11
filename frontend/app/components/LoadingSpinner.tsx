'use client';

interface LoadingSpinnerProps {
    size?: 'small' | 'medium' | 'large';
    fullScreen?: boolean;
    text?: string;
    color?: 'primary' | 'white';
}

const sizeMap = {
    small: { spinner: 24, border: 2 },
    medium: { spinner: 36, border: 3 },
    large: { spinner: 48, border: 4 },
};

export default function LoadingSpinner({ 
    size = 'medium', 
    fullScreen = false, 
    text,
    color = 'primary' 
}: LoadingSpinnerProps) {
    const { spinner } = sizeMap[size];

    const content = (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '12px',
        }}>
            <img
                src="/loading.gif"
                alt="Loading"
                width={spinner}
                height={spinner}
                className={color === 'white' ? 'kv-loading-gif kv-loading-gif--white' : 'kv-loading-gif'}
                style={{
                    width: `${spinner}px`,
                    height: `${spinner}px`,
                    objectFit: 'contain',
                }}
            />
            {text && (
                <span style={{
                    fontSize: '14px',
                    color: 'var(--yt-text-secondary)',
                }}>
                    {text}
                </span>
            )}
            <style jsx>{`
                /* GIF art is white: shown as-is on the dark theme.
                   On the light theme, invert primary spinners to black so
                   they stay visible. "white" spinners sit over dark surfaces
                   regardless of theme, so they are never inverted. */
                :global([data-theme='light']) .kv-loading-gif:not(.kv-loading-gif--white) {
                    filter: invert(1);
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
