'use client';

interface IconProps {
    size?: number;
    className?: string;
    style?: React.CSSProperties;
    color?: string;
    filled?: boolean;
}

export default function ShortsIcon({ size = 24, className, style, color, filled = false }: IconProps) {
    if (filled) {
        return (
            <svg 
                width={size} 
                height={size} 
                viewBox="0 0 24 24" 
                fill="none"
                xmlns="http://www.w3.org/2000/svg"
                className={className}
                style={style}
            >
                <path 
                    d="M17.77 10.32l-1.2-.57 1.25-.73c1.68-.99 2.24-3.17 1.25-4.85l-.12-.2A3.593 3.593 0 0 0 14.88 2.5c-.97 0-1.89.39-2.56 1.07L4.74 11.15c-1.41 1.41-1.41 3.71 0 5.12l1.2.57-1.25.73c-1.68.99-2.24 3.17-1.25 4.85.67 1.15 1.88 1.86 3.19 1.86.97 0 1.89-.39 2.56-1.07l7.58-7.58c1.41-1.41 1.41-3.71 0-5.12z" 
                    fill={color || "#ff0000"}
                />
                <polygon points="10 15 15 12 10 9" fill="white"/>
            </svg>
        );
    }

    return (
        <svg 
            width={size} 
            height={size} 
            viewBox="0 0 24 24" 
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
            style={style}
        >
            <path 
                d="M17.77 10.32c-.77-.32-1.2-.59-1.2-.59s.48-.2.72-.32c1.47-.73 2.12-2.52 1.45-4.01-.68-1.48-2.43-2.15-3.92-1.48L5.8 8.64c-1.49.68-2.16 2.45-1.48 3.94.67 1.48 2.43 2.15 3.92 1.48.24-.11.72-.32.72-.32s-.43.27-1.2.59c-1.47.73-2.12 2.52-1.45 4.01.68 1.48 2.43 2.15 3.92 1.48l11.02-4.72c1.49-.67 2.16-2.44 1.48-3.93-.68-1.49-2.44-2.16-3.96-1.47z" 
                stroke={color || "currentColor"} 
                strokeWidth="1.8" 
                strokeLinejoin="round" 
                fill="none"
            />
            <polygon points="10 9 15 12 10 15" fill={color || "currentColor"}/>
        </svg>
    );
}