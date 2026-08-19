'use client';

import React from 'react';
import { useTheme } from '../context/ThemeContext';
import { THEME_PRESETS, ThemeMode } from '../utils/materialTheme';
import { IoCloseOutline, IoColorPaletteOutline, IoMoonOutline, IoSunnyOutline, IoFlashOutline } from 'react-icons/io5';

interface ThemeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export default function ThemeModal({ isOpen, onClose }: ThemeModalProps) {
  const { themeMode, setThemeMode, currentPreset, setPreset, seedColor, setCustomSeedColor } = useTheme();

  if (!isOpen) return null;

  return (
    <div className="drawer-backdrop open" onClick={onClose} style={{ zIndex: 1200, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div 
        className="dropdown-animated"
        onClick={(e) => e.stopPropagation()}
        style={{
          backgroundColor: 'var(--yt-surface)',
          border: '1px solid var(--yt-border)',
          borderRadius: '24px',
          padding: '24px',
          width: '90%',
          maxWidth: '460px',
          boxShadow: '0 12px 36px rgba(0, 0, 0, 0.4)',
          color: 'var(--yt-text-primary)',
        }}
      >
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px',
              height: '36px',
              borderRadius: '50%',
              backgroundColor: 'var(--md-sys-color-primary-container, var(--yt-hover))',
              color: 'var(--md-sys-color-primary, var(--yt-blue))',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}>
              <IoColorPaletteOutline size={20} />
            </div>
            <div>
              <h3 style={{ fontSize: '18px', fontWeight: 600, margin: 0 }}>Theme & Appearance</h3>
              <p style={{ fontSize: '12px', color: 'var(--yt-text-secondary)', margin: 0 }}>Material You 3 Makeover</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="yt-icon-btn"
            style={{ width: '32px', height: '32px' }}
          >
            <IoCloseOutline size={20} />
          </button>
        </div>

        {/* Mode Selector (Dark, AMOLED, Light) */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '8px' }}>
            APPEARANCE MODE
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setThemeMode('dark')}
              style={{
                padding: '10px 12px',
                borderRadius: '16px',
                border: themeMode === 'dark' ? '2px solid var(--md-sys-color-primary, var(--yt-blue))' : '1px solid var(--yt-border)',
                backgroundColor: themeMode === 'dark' ? 'var(--yt-hover)' : 'transparent',
                color: 'var(--yt-text-primary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <IoMoonOutline size={18} />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>Dark</span>
            </button>

            <button
              type="button"
              onClick={() => setThemeMode('amoled')}
              style={{
                padding: '10px 12px',
                borderRadius: '16px',
                border: themeMode === 'amoled' ? '2px solid var(--md-sys-color-primary, var(--yt-blue))' : '1px solid var(--yt-border)',
                backgroundColor: themeMode === 'amoled' ? '#000000' : 'transparent',
                color: 'var(--yt-text-primary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <IoFlashOutline size={18} color="#00ffff" />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>AMOLED</span>
            </button>

            <button
              type="button"
              onClick={() => setThemeMode('light')}
              style={{
                padding: '10px 12px',
                borderRadius: '16px',
                border: themeMode === 'light' ? '2px solid var(--md-sys-color-primary, var(--yt-blue))' : '1px solid var(--yt-border)',
                backgroundColor: themeMode === 'light' ? 'var(--yt-hover)' : 'transparent',
                color: 'var(--yt-text-primary)',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                transition: 'all 0.2s ease',
              }}
            >
              <IoSunnyOutline size={18} color="#ff9800" />
              <span style={{ fontSize: '12px', fontWeight: 500 }}>Light</span>
            </button>
          </div>
        </div>

        {/* Preset Palettes */}
        <div style={{ marginBottom: '20px' }}>
          <label style={{ fontSize: '13px', fontWeight: 600, color: 'var(--yt-text-secondary)', display: 'block', marginBottom: '8px' }}>
            COLOR PALETTE
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
            {THEME_PRESETS.map((preset) => {
              const isActive = currentPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => setPreset(preset.id)}
                  style={{
                    padding: '8px 10px',
                    borderRadius: '14px',
                    border: isActive ? `2px solid ${preset.seedColor}` : '1px solid var(--yt-border)',
                    backgroundColor: isActive ? 'var(--yt-hover)' : 'transparent',
                    color: 'var(--yt-text-primary)',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    cursor: 'pointer',
                    fontSize: '11px',
                    fontWeight: 500,
                    transition: 'all 0.2s ease',
                  }}
                >
                  <span
                    style={{
                      width: '12px',
                      height: '12px',
                      borderRadius: '50%',
                      backgroundColor: preset.seedColor,
                      boxShadow: isActive ? `0 0 8px ${preset.seedColor}` : 'none',
                      flexShrink: 0,
                    }}
                  />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {preset.name.split(' ')[0]}
                  </span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Custom Color Input */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '12px', borderTop: '1px solid var(--yt-border)' }}>
          <span style={{ fontSize: '12px', color: 'var(--yt-text-secondary)' }}>Custom Hex Seed:</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <input
              type="color"
              value={seedColor.startsWith('#') ? seedColor : '#3880ff'}
              onChange={(e) => setCustomSeedColor(e.target.value)}
              style={{
                width: '32px',
                height: '32px',
                borderRadius: '50%',
                border: 'none',
                cursor: 'pointer',
                background: 'transparent',
              }}
            />
            <span style={{ fontSize: '12px', fontFamily: 'monospace', color: 'var(--yt-text-primary)' }}>
              {seedColor}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
