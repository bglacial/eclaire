import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.eclaire.app',
  appName: 'Éclaire',
  webDir: 'dist',
  backgroundColor: '#f7f8fc',
  appendUserAgent: ' Eclaire (https://github.com/bglacial/eclaire)',
  android: { backgroundColor: '#f7f8fc' },
  plugins: { SystemBars: { initialViewportFitValueHint: 'cover', style: 'LIGHT' } },
};

export default config;
