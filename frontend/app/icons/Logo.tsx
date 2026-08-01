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
                display: 'flex', 
                alignItems: 'center', 
                gap: '8px',
                userSelect: 'none',
            }}
        >
            {/* Modern KV-Tube Squircle Emblem */}
            <svg 
                width={size} 
                height={size} 
                viewBox="0 0 40 40" 
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                style={{ flexShrink: 0, filter: 'drop-shadow(0 2px 8px rgba(255, 0, 50, 0.4))' }}
            >
                <defs>
                    <linearGradient id="kvTubeGrad" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#FF0238" />
                        <stop offset="50%" stopColor="#E60000" />
                        <stop offset="100%" stopColor="#A80024" />
                    </linearGradient>
                    <linearGradient id="kvGlow" x1="0" y1="0" x2="40" y2="0" gradientUnits="userSpaceOnUse">
                        <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.4" />
                        <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
                    </linearGradient>
                </defs>

                {/* Main Gradient Squircle */}
                <rect x="2" y="2" width="36" height="36" rx="10" fill="url(#kvTubeGrad)" />
                {/* Subtle Top Glass Reflection */}
                <path d="M4 12C4 7.58172 7.58172 4 12 4H28C32.4183 4 36 7.58172 36 12V16C36 16 26 12 4 16V12Z" fill="url(#kvGlow)" />
                
                {/* Play Triangle with Stylized K/V Overlay */}
                <path d="M15 11.5C15 10.6865 15.9189 10.2078 16.5858 10.6746L27.2999 18.1746C27.8824 18.5824 27.8824 19.4176 27.2999 19.8254L16.5858 27.3254C15.9189 27.7922 15 27.3135 15 26.5V11.5Z" fill="white" />
                {/* Accent notch cutting into the play triangle */}
                <path d="M15 19L22 13.5L20 19L24 24.5L15 19Z" fill="#E60000" fillOpacity="0.15" />
            </svg>
            
            {/* Text */}
            {showText && (
                <span style={{ 
                    fontSize: '19px', 
                    fontWeight: '800', 
                    letterSpacing: '-0.6px',
                    fontFamily: 'YouTube Sans, Inter, Roboto, sans-serif',
                    display: 'inline-flex',
                    alignItems: 'center',
                }}>
                    <span style={{ color: '#FF2E55' }}>KV</span>
                    <span style={{ color: 'var(--yt-text-primary, #FFFFFF)', marginLeft: '1px' }}>-Tube</span>
                </span>
            )}
        </div>
    );
}