import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.kvtube.ios',
  appName: 'KV-Tube',
  webDir: 'www',
  server: {
    // Allows local HTTP / private network connections (e.g. Synology NAS / Invidious)
    cleartext: true,
    androidScheme: 'https',
    iosScheme: 'ionic'
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#000000'
    }
  },
  ios: {
    contentInset: 'always',
    allowsLinkPreview: false,
    scrollEnabled: true
  }
};

export default config;
