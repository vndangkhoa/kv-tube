'use client';

export default function HeaderDebug() {
    console.log('HeaderDebug rendered');
    return (
        <header style={{ height: 56, backgroundColor: 'blue', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 500, display: 'flex', alignItems: 'center', padding: '0 16px' }}>
            <button style={{ background: 'red', width: 40, height: 40, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                ☰
            </button>
            <span style={{ color: 'white', marginLeft: 12 }}>KV-Tube Debug</span>
        </header>
    );
}
