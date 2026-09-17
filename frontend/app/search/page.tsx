import { Suspense } from 'react';
import ClientSearchPage from './ClientSearchPage';

export default function SearchPage() {
    return (
        <Suspense fallback={
            <div style={{ 
                display: 'flex', 
                justifyContent: 'center', 
                alignItems: 'center', 
                height: '100vh',
                backgroundColor: 'var(--yt-background)',
                color: 'var(--yt-text-primary)',
            }}>
                Searching...
            </div>
        }>
            <ClientSearchPage />
        </Suspense>
    );
}