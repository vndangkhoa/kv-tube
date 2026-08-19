'use client';

import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import {
  ThemeMode,
  THEME_PRESETS,
  generateMaterial3Theme,
  applyMaterial3Theme,
  extractDominantColor,
  ThemeColors,
} from '../utils/materialTheme';

interface ThemeContextType {
  theme: 'light' | 'dark'; // for backward compatibility
  themeMode: ThemeMode;
  currentPreset: string;
  seedColor: string;
  colors: ThemeColors;
  toggleTheme: () => void;
  setThemeMode: (mode: ThemeMode) => void;
  setPreset: (presetId: string) => void;
  setCustomSeedColor: (hex: string) => void;
  adaptToThumbnail: (thumbnailUrl: string) => Promise<void>;
  resetDynamicColor: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [themeMode, setThemeModeState] = useState<ThemeMode>('dark');
  const [currentPreset, setCurrentPreset] = useState<string>('dynamic');
  const [seedColor, setSeedColor] = useState<string>('#3880ff');
  const [dynamicColor, setDynamicColor] = useState<string | null>(null);

  const activeSeed = dynamicColor || seedColor;
  const colors = generateMaterial3Theme(activeSeed, themeMode);

  // Initialize from LocalStorage
  useEffect(() => {
    try {
      const savedMode = (localStorage.getItem('kv_theme_mode') as ThemeMode) || 
                        (localStorage.getItem('theme') === 'light' ? 'light' : 'dark');
      const savedPreset = localStorage.getItem('kv_theme_preset') || 'dynamic';
      const savedSeed = localStorage.getItem('kv_theme_seed') || '#3880ff';

      if (savedMode) setThemeModeState(savedMode);
      if (savedPreset) setCurrentPreset(savedPreset);
      if (savedSeed) setSeedColor(savedSeed);

      const initialColors = generateMaterial3Theme(savedSeed, savedMode);
      applyMaterial3Theme(initialColors, savedMode);
    } catch (e) {
      console.error('Failed to load theme preference', e);
    }
  }, []);

  // Sync theme changes to DOM and LocalStorage
  useEffect(() => {
    applyMaterial3Theme(colors, themeMode);
    try {
      localStorage.setItem('kv_theme_mode', themeMode);
      localStorage.setItem('theme', themeMode === 'light' ? 'light' : 'dark');
      localStorage.setItem('kv_theme_preset', currentPreset);
      localStorage.setItem('kv_theme_seed', seedColor);
    } catch (e) {
      // ignore localstorage errors
    }
  }, [colors, themeMode, currentPreset, seedColor]);

  const setThemeMode = useCallback((mode: ThemeMode) => {
    setThemeModeState(mode);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeModeState((prev) => (prev === 'light' ? 'dark' : 'light'));
  }, []);

  const setPreset = useCallback((presetId: string) => {
    setCurrentPreset(presetId);
    setDynamicColor(null);
    const found = THEME_PRESETS.find((p) => p.id === presetId);
    if (found) {
      setSeedColor(found.seedColor);
    }
  }, []);

  const setCustomSeedColor = useCallback((hex: string) => {
    setCurrentPreset('custom');
    setDynamicColor(null);
    setSeedColor(hex);
  }, []);

  const adaptToThumbnail = useCallback(async (thumbnailUrl: string) => {
    if (currentPreset !== 'dynamic' && currentPreset !== 'custom') return;
    try {
      const dominant = await extractDominantColor(thumbnailUrl);
      if (dominant) {
        setDynamicColor(dominant);
      }
    } catch (e) {
      // fallback silently
    }
  }, [currentPreset]);

  const resetDynamicColor = useCallback(() => {
    setDynamicColor(null);
  }, []);

  return (
    <ThemeContext.Provider
      value={{
        theme: themeMode === 'light' ? 'light' : 'dark',
        themeMode,
        currentPreset,
        seedColor: activeSeed,
        colors,
        toggleTheme,
        setThemeMode,
        setPreset,
        setCustomSeedColor,
        adaptToThumbnail,
        resetDynamicColor,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
