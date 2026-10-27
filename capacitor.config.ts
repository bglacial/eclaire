import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.eclaire.app',
  appName: 'Éclaire',
  webDir: 'dist',
  backgroundColor: '#f7f8fc',
  appendUserAgent: ' Eclaire/1.1.0-alpha.3',
  android: { backgroundColor: '#f7f8fc' },
  plugins: { SystemBars: { initialViewportFitValueHint: 'cover', style: 'LIGHT' } },
};

export default config;
