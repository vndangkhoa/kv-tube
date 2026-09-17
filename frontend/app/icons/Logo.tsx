'use client';

interface LogoProps {
  size?: number;
  showText?: boolean;
  region?: string;
  className?: string;
}

export default function Logo({ size = 24, showText = true, region, className }: LogoProps) {
  return (
    <div
      className={className}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: '6px',
        userSelect: 'none',
      }}
    >
      {/* Play Icon */}
      <svg
        width={Math.round(size * 1.35)}
        height={Math.round(size * 0.95)}
        viewBox="0 0 28 20"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        style={{ flexShrink: 0 }}
      >
        <path
          d="M27.4 3.1c-.3-1.2-1.2-2.1-2.4-2.4C22.9.2 14 .2 14 .2s-8.9 0-11 .5c-1.2.3-2.1 1.2-2.4 2.4C.1 5.2.1 10 .1 10s0 4.8.5 6.9c.3 1.2 1.2 2.1 2.4 2.4 2.1.5 11 .5 11 .5s8.9 0 11-.5c1.2-.3 2.1-1.2 2.4-2.4.5-2.1.5-6.9.5-6.9s0-4.8-.5-6.9z"
          fill="#FF0000"
        />
        <path d="M11.2 14.3L18.5 10l-7.3-4.3v8.6z" fill="#FFFFFF" />
      </svg>

      {showText && (
        <div style={{ display: 'inline-flex', alignItems: 'center', position: 'relative' }}>
          <span
            style={{
              fontSize: '19px',
              fontWeight: 800,
              letterSpacing: '-0.5px',
              fontFamily: '"YouTube Sans", Inter, Roboto, sans-serif',
              lineHeight: '20px',
              display: 'inline-flex',
              alignItems: 'center',
            }}
          >
            <span style={{ color: '#FF0033' }}>KV</span>
            <span style={{ color: 'var(--yt-text-primary)' }}>-Tube</span>
          </span>
          {region && (
            <span
              style={{
                fontSize: '10px',
                fontWeight: 400,
                color: 'var(--yt-text-secondary, #606060)',
                marginLeft: '3px',
                lineHeight: '10px',
                transform: 'translateY(-2px)',
              }}
            >
              {region}
            </span>
          )}
        </div>
      )}
    </div>
  );
}