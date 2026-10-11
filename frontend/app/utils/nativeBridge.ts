import { Capacitor } from '@capacitor/core';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { StatusBar, Style } from '@capacitor/status-bar';

export const isNativePlatform = (): boolean => {
  return Capacitor.isNativePlatform();
};

export const getPlatform = (): string => {
  return Capacitor.getPlatform();
};

export const triggerHapticImpact = async (style: ImpactStyle = ImpactStyle.Light): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.impact({ style });
  } catch {
    // Ignore in unsupported environments
  }
};

export const triggerHapticNotification = async (type: NotificationType = NotificationType.Success): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.notification({ type });
  } catch {
    // Ignore in unsupported environments
  }
};

export const triggerHapticSelection = async (): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await Haptics.selectionStart();
    await Haptics.selectionChanged();
    await Haptics.selectionEnd();
  } catch {
    // Ignore
  }
};

export const updateStatusBarTheme = async (isDark: boolean): Promise<void> => {
  if (!Capacitor.isNativePlatform()) return;
  try {
    await StatusBar.setStyle({
      style: isDark ? Style.Dark : Style.Light,
    });
    if (Capacitor.getPlatform() === 'android') {
      await StatusBar.setBackgroundColor({
        color: isDark ? '#000000' : '#ffffff',
      });
    }
  } catch {
    // Ignore
  }
};

export const saveVideoToDevice = async (filename: string, url: string): Promise<string | null> => {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const { Filesystem, Directory } = await import('@capacitor/filesystem');
    const res = await Filesystem.downloadFile({
      url,
      path: `videos/${filename}`,
      directory: Directory.Documents,
      recursive: true,
    });
    return res.path || null;
  } catch (e) {
    console.error('[NativeBridge] Failed to save video to device:', e);
    return null;
  }
};
