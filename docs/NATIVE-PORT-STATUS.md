# Native Port — Status & Resume Point

*Paused 2026-07-26 with Phases 0–2 complete and shipped (`461e151`). The full
plan is [partypick-native-port-handoff.md](partypick-native-port-handoff.md);
this doc is the delta — what's done, what was decided, and the exact next
steps when work resumes.*

## Done ✅ (Phases 0–2)

- **Capacitor 7** (not 8 — v8 requires Node ≥22, dev machine runs Node 20).
  `ios/` and `android/` are generated and **committed as source**; build
  artifacts gitignored. `npx cap sync` verified working on Windows for both
  platforms (iOS *builds* still need the Mac, of course).
- **Identity (provisional):** `appId: com.rteamtempus.radar` — permanent only
  after the first store upload, flagged in `capacitor.config.ts`.
  `appName: "Radar"` — display name, freely changeable; **final app name
  still undecided** (Rory is thinking on it).
- **Phase 0 gates:** service worker AND the update pill disabled on native
  (`app.config.ts` + `UpdateService`); audit clean — no cookies, no absolute
  Vercel URLs, Supabase on localStorage tokens.
- **Phase 2 platform layer:** `core/platform/platform.service.ts` is the ONLY
  Capacitor boundary (rule recorded in CLAUDE.md). Wired: status-bar style on
  boot, `openExternal` on every outbound link (maps/website/books/streaming/
  watch-on), native share sheet for party invites (web-share → clipboard
  fallbacks), haptics (light on swipe commit, warning on veto), Android back
  button (pop history, minimize at root), and **realtime resume** —
  `PartyService` re-pulls party state on foreground (handoff gotcha #4).
  Swipe deck has `overscroll-none` + `will-change-transform` (gotcha re:
  WebView jank). Safe areas were already done pre-port.
- npm scripts: `native:sync`, `native:ios`, `native:android`,
  `native:run:ios`, `native:run:android`.

## Simplifications vs. the original handoff

- **Phase 3 (auth deep links) is SKIPPED for now** — the app moved to
  email+password auth, which needs no redirects. Deep links only become
  necessary if/when Google OAuth is enabled in Supabase; the handoff's
  Phase 3 applies unchanged at that point.
- Gotcha #2 (PWA-install prompts on native): N/A, no install-prompt UI exists.

## ▶ Resume here — Milestone 1 acceptance (needs the Mac)

1. On the Mac: clone the repo, `npm install`, create `.env` with the two
   `NG_APP_SUPABASE_*` values (copy from the Windows machine's `radar/.env`).
2. Prereqs: Xcode + CocoaPods (`sudo gem install cocoapods` or `brew install cocoapods`).
3. `npm run native:ios` → first run in Xcode: select the team under
   Signing & Capabilities, run on a simulator.
4. **Acceptance:** boots, login works, a party can be created. (Android
   equivalent whenever Android Studio exists somewhere: `npm run native:run:android`.)

## Then, in order (all per the handoff doc)

| Step | Needs from Rory | Doc section |
|---|---|---|
| 1. Milestone 1 test on Mac | the Mac | above |
| 2. Icons/splash from the heart-radar source (`npx @capacitor/assets generate` from `public/icons/icon-source.png`) | — | Phase 5.3 |
| 3. Capgo OTA | capgo.app account + `CAPGO_TOKEN` | Phase 4 |
| 4. Apple Developer enrollment + first manual TestFlight archive | $99/yr account, done on the Mac | Phase 5 iOS |
| 5. Play Console + keystore + first manual internal release | $25 account; **store keystore + passwords in password manager immediately** | Phase 5 Android |
| 6. CI workflows (Capgo on main-push; `native-v*` tags → stores) | GitHub secrets listed in Phase 6 | Phase 6 |
| 7. Decide final app name → update `appName`, store listings (any time before public launch) | the decision | — |

## Standing rules already in force (CLAUDE.md)

No `@capacitor/*` imports outside `core/platform/` · SW/pill stay gated off
native · plugin or native-config changes ⇒ native version bump + store
release (+ `--min-update-version` once Capgo exists) · UI definition of done
includes at least one native platform.
