# PartyPick Native Port — Claude Code Handoff Document

> **STATUS (2026-07-26): Phases 0–2 are DONE and merged; work is paused.**
> See [NATIVE-PORT-STATUS.md](NATIVE-PORT-STATUS.md) for what was decided,
> what changed vs. this plan (notably: Phase 3 deep links skipped — the app
> uses password auth now), and the exact resume point (Milestone 1 test on
> the Mac).

**Goal:** Wrap the existing Angular PWA in Capacitor so one codebase ships to web (Vercel), iOS (TestFlight), and Android (Play internal track), with OTA updates keeping native testers current without store releases.

**Guiding rule:** The web app is the product; native is a shell. Never fork behavior into the native projects when it can live in the web codebase behind `Capacitor.isNativePlatform()`. The `ios/` and `android/` directories should contain configuration and plugin wiring only — no features.

**Placeholders used throughout (replace globally before starting):**
- Bundle/App ID: `com.partypick.app`
- App name: `PartyPick`
- Repo: `github.com/<owner>/partypick`
- Supabase project ref: `<SUPABASE_REF>`
- Adjust any paths to the actual repo layout; verify the Angular output path from `angular.json` (`dist/<project>/browser` in Angular 17+).

---

## Phase 0 — Preconditions & decisions

1. Confirm the production web build works fully offline-tolerant enough for a WebView (no reliance on being served from the Vercel domain for core function). The native app serves assets from local disk via `capacitor://localhost` (iOS) / `https://localhost` (Android).
2. **CORS/URL audit:** Supabase JS uses fetch — fine. But check for: absolute URLs to the Vercel domain (make them relative or env-driven), cookies (Capacitor WebViews are hostile to cookies; we use Supabase's default localStorage token storage — verify the client isn't configured for cookie sessions), and any `window.open` flows.
3. **Service worker:** the PWA service worker (`ngsw`) must NOT register inside the native app (it fights the native asset loader and Capgo). Gate registration: `provideServiceWorker('ngsw-worker.js', { enabled: !isDevMode() && !Capacitor.isNativePlatform() })`.
4. Decide the four env targets: `web-dev`, `web-prod` (existing Vercel), `native-dev` (local simulator/device pointing at prod Supabase), `native-prod`.

---

## Phase 1 — Capacitor integration (do this first, ship nothing else with it)

```bash
npm i @capacitor/core
npm i -D @capacitor/cli
npx cap init "PartyPick" "com.partypick.app" --web-dir=dist/<project>/browser
npm i @capacitor/ios @capacitor/android
npx cap add ios
npx cap add android
```

`capacitor.config.ts`:
```ts
import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.partypick.app',
  appName: 'PartyPick',
  webDir: 'dist/<project>/browser',
  ios: { contentInset: 'automatic' },
  android: { allowMixedContent: false },
  plugins: {
    SplashScreen: { launchShowDuration: 800, backgroundColor: '#0f0f13' },
  },
};
export default config;
```

Add npm scripts:
```json
"native:sync": "ng build && npx cap sync",
"native:ios": "npm run native:sync && npx cap open ios",
"native:android": "npm run native:sync && npx cap open android",
"native:run:ios": "npm run native:sync && npx cap run ios",
"native:run:android": "npm run native:sync && npx cap run android"
```

`.gitignore` additions: `ios/App/Pods`, `ios/App/build`, `android/.gradle`, `android/app/build`, `android/local.properties`. **Commit the rest of `ios/` and `android/`** — they are source.

**Milestone 1 acceptance:** app boots in iOS Simulator and an Android emulator, login works, a party can be created. No plugins yet.

---

## Phase 2 — Platform abstraction layer

Create `src/app/core/platform/` with a single injectable that the rest of the app uses — features never import Capacitor plugins directly.

```ts
// platform.service.ts (sketch)
readonly isNative = Capacitor.isNativePlatform();
readonly platform = Capacitor.getPlatform(); // 'ios' | 'android' | 'web'
share(data: ShareData): Promise<void>       // native Share plugin ?? navigator.share ?? copy-link fallback
haptic(kind: 'light'|'success'|'warning')   // @capacitor/haptics ?? no-op on web
openExternal(url: string): Promise<void>    // @capacitor/browser (in-app browser tab) ?? window.open
```

Install the minimal plugin set now: `@capacitor/app`, `@capacitor/browser`, `@capacitor/share`, `@capacitor/haptics`, `@capacitor/splash-screen`, `@capacitor/status-bar`. Defer push notifications entirely (separate project; needs APNs/FCM setup and has no POC feature behind it).

Wire haptics into the swipe deck (light tick on swipe commit, success on match/reveal) — cheap and makes the native build feel native.

**WebView polish checklist (do all):**
- Safe areas: ensure `viewport-fit=cover` in index.html and pad fixed headers/footers with `env(safe-area-inset-*)` Tailwind utilities.
- Disable rubber-band overscroll where it fights the swipe deck (`overscroll-behavior: none` on the deck container).
- `StatusBar.setStyle(Dark)` on native boot; background color matched to theme.
- Verify swipe-deck animation smoothness on a real mid-range Android device. If jank: ensure transforms/opacity only (no layout-triggering properties) and `will-change: transform` on the active card.

---

## Phase 3 — Auth deep links (the one genuinely fiddly part)

Supabase magic links and OAuth redirects must return the user to the app, not a browser tab.

1. **Choose scheme + universal link strategy.** POC: custom scheme `partypick://auth-callback` (fast, no domain verification). TODO later: upgrade to iOS Universal Links / Android App Links on the real domain (removes the "open in app?" friction and is required-ish for production polish).
2. **Supabase dashboard:** add `partypick://auth-callback` to Auth → URL Configuration → Redirect URLs (keep the web URLs too).
3. **Client:** when calling `signInWithOtp` / `signInWithOAuth`, set `options.redirectTo` to `Capacitor.isNativePlatform() ? 'partypick://auth-callback' : location.origin + '/auth/callback'`. For OAuth on native, open the URL with `@capacitor/browser` (`skipBrowserRedirect: true`, then `Browser.open({ url })`).
4. **Handle the return:** listen with `App.addListener('appUrlOpen', ...)`; parse the URL fragment/query; if it contains `code`, call `supabase.auth.exchangeCodeForSession(code)` (PKCE flow — confirm the client is created with `flowType: 'pkce'`, which is the supabase-js default now; if the project is on implicit flow, tokens arrive in the fragment — handle `access_token`/`refresh_token` via `setSession`). Then `Browser.close()` and route into the app.
5. **iOS:** add the URL scheme in `ios/App/App/Info.plist` (`CFBundleURLTypes`). **Android:** add an `<intent-filter>` with the scheme on `MainActivity` in `AndroidManifest.xml` (`android:launchMode="singleTask"` to avoid duplicate activities).

**Milestone 3 acceptance:** magic-link login and Google OAuth complete end-to-end on physical iOS and Android devices (simulators lie about mail/browser handoff).

---

## Phase 4 — OTA live updates (Capgo)

Purpose: JS/CSS/HTML changes reach installed native apps without a store release. Store releases only for: new plugins, permission changes, icon/splash, Capacitor major upgrades.

```bash
npm i @capgo/capacitor-updater
npx cap sync
```

- Sign up at capgo.app, create app `com.partypick.app`, install CLI (`npx @capgo/cli init` walks through it; it adds config to `capacitor.config.ts`).
- Set `CapacitorUpdater` config: `autoUpdate: true`, channel-based. Two channels: `internal` (default for all POC builds) and later `production`.
- In app bootstrap, call `CapacitorUpdater.notifyAppReady()` after the app renders (REQUIRED — without it Capgo assumes the bundle is broken and rolls back).
- CI upload (Phase 6): `npx @capgo/cli bundle upload --channel internal` after the web build.
- **Version discipline:** OTA bundles must never assume a plugin that the installed shell doesn't have. Rule: adding/removing any Capacitor plugin or changing native config ⇒ bump the native app version + store release + `--min-update-version` guard on subsequent OTA uploads. Document this rule in CLAUDE.md.
- Kill switch: Capgo dashboard can revert a channel to a previous bundle instantly — note where in the README.

(Alternative if Capgo is rejected for any reason: Ionic Appflow Live Updates — same concept, pricier.)

---

## Phase 5 — Stores: manual first deploys (human tasks, document in README)

### iOS (individual Apple Developer account, $99/yr)
1. Enroll developer.apple.com with personal Apple ID (org account deferred; app transfer to the business account later is supported).
2. App Store Connect: create app, bundle ID `com.partypick.app`, name (check availability; have a fallback like "PartyPick — Group Decisions").
3. Xcode: team + automatic signing; set version `1.0.0`, build `1`; add icons (1024 master; generate the set — `@capacitor/assets` generates icons+splash for both platforms from one source image: `npx @capacitor/assets generate`).
4. `npm run native:sync` → Xcode → Product → Archive → Distribute → TestFlight internal.
5. Add internal testers (App Store Connect Users & Access → then TestFlight internal group). Internal = no review, instant.

### Android (Google Play Console, $25 once)
1. Create Play Console account, create app.
2. Generate upload keystore:
   `keytool -genkey -v -keystore partypick-upload.keystore -alias partypick -keyalg RSA -keysize 2048 -validity 10000`
   **Immediately** store the keystore file + both passwords in the password manager. Configure signing in `android/app/build.gradle` via `key.properties` pattern (`key.properties` gitignored).
3. Build AAB: `cd android && ./gradlew bundleRelease`.
4. Play Console → Internal testing → create release, upload AAB, add tester emails, share opt-in link.
5. First upload also requires: app icon, short description, privacy policy URL (host a simple page on the Vercel site — required even for internal testing setup screens).

**Milestone 5 acceptance:** both partners running the app from TestFlight + Play internal on their own phones.

---

## Phase 6 — CI/CD automation (GitHub Actions + Fastlane)

Trigger model:
- **Every push to `main`:** existing Vercel deploy (untouched) + new job: build web, upload Capgo bundle to `internal` channel. Native testers get it on next app open.
- **Push a tag `native-v*`:** full native builds → TestFlight internal + Play internal.

### Shared
- `fastlane` installed per-platform directories (`ios/App/fastlane`, `android/fastlane`).
- Version strategy: derive marketing version from the tag (`native-v1.2.0` → `1.2.0`), build number from `github.run_number`.

### Android workflow (`.github/workflows/native-android.yml`)
Ubuntu runner. Steps: checkout → setup Node + Java 17 → `npm ci` → `ng build` → `npx cap sync android` → decode keystore from secret → `./gradlew bundleRelease` → upload via fastlane `supply` (or `r0adkll/upload-google-play@v1`) to track `internal`.
Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`, `PLAY_SERVICE_ACCOUNT_JSON` (create a GCP service account, grant it release access in Play Console → API access).

### iOS workflow (`.github/workflows/native-ios.yml`)
`macos-latest` runner. Steps: checkout → Node + `npm ci` → `ng build` → `npx cap sync ios` → Ruby/bundler → `fastlane ios beta`.
Fastfile `beta` lane: `match(type: 'appstore', readonly: true)` → `increment_build_number` → `build_app(scheme: 'App')` → `pilot(skip_waiting_for_build_processing: true)`.
- `fastlane match init` with a **private** certs repo; run `match appstore` once locally to generate/store signing assets.
- Auth via App Store Connect API key (Users & Access → Integrations → create key with App Manager role).
Secrets: `MATCH_GIT_BASIC_AUTHORIZATION` (PAT for certs repo), `MATCH_PASSWORD`, `ASC_KEY_ID`, `ASC_ISSUER_ID`, `ASC_KEY_P8_BASE64`.

### Capgo job (append to the existing web workflow or Vercel post-deploy)
`npm ci` → `ng build` → `npx @capgo/cli bundle upload --channel internal --apikey $CAPGO_TOKEN`.
Secret: `CAPGO_TOKEN`.

**Build order note:** set up and succeed at ONE manual archive/upload per platform (Phase 5) before writing these workflows. Debug signing locally, never first in CI.

---

## Phase 7 — CLAUDE.md additions (write these into the repo's CLAUDE.md)

- "This app ships as web (Vercel) AND native shells (Capacitor). Never write platform-specific code outside `core/platform/`. Always use PlatformService, never import `@capacitor/*` in feature code."
- "Adding/removing a Capacitor plugin or touching `ios/`/`android/` config requires: native version bump, store release, and `--min-update-version` on OTA uploads. Flag this loudly in the PR description."
- "Service worker must remain disabled on native (`!Capacitor.isNativePlatform()`)."
- "Deep-link auth flows: web uses `/auth/callback`, native uses `partypick://auth-callback`. Both must remain in the Supabase redirect allowlist."
- "Test definition of done for UI features: verified in browser AND at least one native platform (simulator acceptable, device for anything touching auth, camera, share, or keyboard)."
- Commands cheat-sheet: `native:run:ios`, `native:run:android`, tag format `native-v*` for store builds.

---

## Known gotchas (pre-answered so Claude Code doesn't rediscover them)

1. **Keyboard vs. fixed inputs (iOS):** WebView viewport jumps when the keyboard opens. If chat/inputs misbehave, add `@capacitor/keyboard` and set `resize: 'body'`; test the party free-text field specifically.
2. **`window.matchMedia('(display-mode: standalone)')`** checks used for PWA-install UI must also exclude native (`isNative`) so "Install app" prompts never show inside the native app.
3. **External links** (TMDB attribution, deeplinks to Netflix etc.): route through `PlatformService.openExternal`. Streaming deeplinks (`nflx://…` style) may need `LSApplicationQueriesSchemes` entries on iOS if you check canOpenURL — simpler: just open the https universal link and let the OS route to the installed app.
4. **Supabase Realtime over WebView:** works fine, but iOS suspends WebSocket on background. On `App.addListener('appStateChange')` resume, re-fetch party state rather than trusting the channel caught everything (add a `refreshParty()` on resume).
5. **Vercel-only URLs in Capgo bundles:** the OTA bundle is served locally; any hardcoded absolute asset URLs break. Audit for `https://<vercel-domain>/assets/...` patterns.
6. **Android back button:** handle `App.addListener('backButton')` — pop router history, exit app only at root, and make sure it can't skip out of an in-progress party swipe session accidentally (confirm dialog if mid-party).
7. **First Play Console release UX:** the console demands store listing assets before letting you create even an internal release the first time — budget 30 minutes of screenshot/copy busywork.

## Acceptance checklist (whole project)
- [ ] `main` push → web deploy + native testers receive OTA within minutes (verify Capgo dashboard shows adoption)
- [ ] `native-v*` tag → TestFlight + Play internal builds appear without manual steps
- [ ] Auth (magic link + Google) works on physical iOS + Android
- [ ] Full party flow (create → join → mood → generate → swipe → vote → reveal) runs cross-platform: one member on web, one on iOS, one on Android, realtime included
- [ ] Rollback drill performed once: revert a Capgo channel and confirm the app downgrades
