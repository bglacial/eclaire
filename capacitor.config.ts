import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'fr.eclaire.app',
  appName: 'Éclaire',
  webDir: 'dist',
  backgroundColor: '#f2f7f2',
  appendUserAgent: ' Eclaire (https://github.com/bglacial/eclaire)',
  android: { backgroundColor: '#f2f7f2' },
  plugins: { SystemBars: { initialViewportFitValueHint: 'cover', style: 'LIGHT' } },
};

export default config;
