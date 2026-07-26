import type { CapacitorConfig } from '@capacitor/cli';

// NOTE: appId is changeable ONLY until the first store upload — after that it
// is permanent identity on both stores. appName (display name) is freely
// changeable anytime, in-repo and in the store consoles.
const config: CapacitorConfig = {
  appId: 'com.rteamtempus.radar',
  appName: 'Radar',
  webDir: 'dist/partypick/browser',
  ios: { contentInset: 'automatic' },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#100c09' },
  },
};

export default config;
