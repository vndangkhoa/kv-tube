'use client';

interface LogoProps {
    size?: number;
    showText?: boolean;
    className?: string;
}

export default function Logo({ size = 28, showText = true, className }: LogoProps) {
    return (
        <div 
            className={className}
            style={{ 
                display: 'inline-flex', 
                alignItems: 'center', 
                gap: '8px',
                userSelect: 'none',
            }}
        >
            {/* Super Simple Minimal Red Play Badge */}
            <svg 
                width={size} 
                height={size} 
                viewBox="0 0 32 32" 
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0 }}
            >
                <rect width="32" height="32" rx="8" fill="#FF0033" />
                <path d="M12 9.5V22.5L22.5 16L12 9.5Z" fill="white" />
            </svg>
            
            {showText && (
                <span style={{ 
                    fontSize: '19px', 
                    fontWeight: '800', 
                    letterSpacing: '-0.5px',
                    fontFamily: 'Inter, system-ui, -apple-system, sans-serif',
                    display: 'inline-flex',
                    alignItems: 'center',
                }}>
                    <span style={{ color: '#FF0033' }}>KV</span>
                    <span style={{ color: 'var(--yt-text-primary, #FFFFFF)' }}>-Tube</span>
                </span>
            )}
        </div>
    );
}