# Platform — PWA, updates, native shells

How Radar behaves as an installed app rather than as a feature.

**Shipped in:** v0.1 (PWA + update pill) · v0.7 (full-bleed, safe areas) ·
native shells (Capacitor 7) exist but are paused — see
`docs/NATIVE-PORT-STATUS.md`.

The native shells intentionally have **no release notes of their own**: nothing
user-visible changed in the app when they were added.

---

## Web / PWA

### RT-PLAT-01 — Install to the home screen

**Steps:** Open Radar in mobile Safari or Chrome and add it to the home screen.
**Expected:** It launches standalone (no browser chrome) with the heart-radar
icon.

### RT-PLAT-02 — Full-bleed and safe areas

**Steps:** Run it on a phone with a notch or dynamic island, portrait and
landscape.
**Expected:** The app runs edge to edge. No content, toast or header hides
under the notch, and the bottom nav clears the home indicator.

### RT-PLAT-03 — The update pill

**Steps:** Deploy a new version, then return to an already-open install.
**Expected:** A tappable "Update ready" pill appears near the bottom. Tapping
it loads the new version without a manual cache clear. It sits above the bottom
nav, not under it.

### RT-PLAT-04 — Offline tolerance

**Steps:** Load the app, go offline, navigate around.
**Expected:** Already-loaded screens still render. Actions needing the network
fail with a readable message rather than a blank screen.

### RT-PLAT-05 — 390px is the target

**Steps:** View every main screen at 390px wide.
**Expected:** Nothing overflows horizontally — including the notification
drop-down, the What's-new modal, filter chip rows and the domain switcher.

### RT-PLAT-06 — TMDB attribution

**Steps:** Scroll to the bottom of any screen.
**Expected:** The TMDB attribution footer is present. It is a licence
requirement — never remove it.

---

## Native shells [native]

Run on a simulator at minimum; auth, share and keyboard need a real device.

### RT-PLAT-07 — It launches

**Steps:** `npm run native:run:android` (or open Xcode via `npm run
native:ios`).
**Expected:** The app boots to login or Radar with the status bar styled to
match.

### RT-PLAT-08 — No update pill on native

**Steps:** Look for the update pill in the native shell.
**Expected:** It never appears, and no service worker is registered. Native
updates are Capgo's job. **This gate must not be removed.**

### RT-PLAT-09 — External links

**Steps:** Tap a streaming link, a Maps link, a website link and a Google Books
link.
**Expected:** Each opens in an in-app browser tab and returns you to Radar
where you left it.

### RT-PLAT-10 — Share

**Steps:** Share a party invite and a slot.
**Expected:** The native share sheet opens with a working link.

### RT-PLAT-11 — Haptics

**Steps:** Swipe in a quest and cast a veto.
**Expected:** A light tick on swipe commits, a stronger buzz on a veto.

### RT-PLAT-12 — Android back button

**Steps:** Navigate a few levels deep and press back repeatedly.
**Expected:** It pops history, and at a root tab it minimises the app rather
than closing it dead.

### RT-PLAT-13 — Returning to the foreground

**Steps:** Open a live quest, background the app for a minute, come back.
**Expected:** Party state re-pulls and is current — iOS suspends WebSockets, so
this must not leave a stale screen.

### RT-PLAT-14 — Notifications on native

**Steps:** With unread notifications, launch the native shell.
**Expected:** The badge on the Me tab and the bell both render correctly, the
drop-down fits the screen, and tapping through navigates. (These are in-app
badges — push notifications are not built.)
