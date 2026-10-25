import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.eclaire.app',
  appName: 'Éclaire',
  webDir: 'dist',
  backgroundColor: '#111719',
  appendUserAgent: ' Eclaire/0.2',
  android: { backgroundColor: '#111719' },
};

export default config;
