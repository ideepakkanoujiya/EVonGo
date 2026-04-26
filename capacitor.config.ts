import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.moveonev.app',
  appName: 'MoveOnEV',
  webDir: 'out',
  server: {
    url: 'https://evon-go.vercel.app',
    cleartext: true
  }
};

export default config;
