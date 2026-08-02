# What to retest, per release

Newest first. Each entry lists the feature files a release touched — running
those files **is** the regression pass for that release.

Every release note in `docs/release-notes/` must have a matching entry here.
See `CLAUDE.md` → *Release notes & regression testing*.

---

## v0.15 — Search results that stay where you're looking (2026-08-02)

**Retest:**

| File | Why |
| --- | --- |
| `explore.md` | RT-EXPL-09 rewritten (books title/author-scoped); RT-EXPL-16/17/18 new (anchored 30-mi catalog default + 🌍 Everywhere; hard city fence on Google searches). Run the Eat/Do and Read sections. |
| `location-and-safety.md` | RT-LOC-03 (precedence) now interacts with the 30-mi default — with a city picked the *list* changes, not just the distances. Re-run RT-LOC-01…04. |
| `domains.md` | books-search query construction changed (fielded Solr syntax) — confirm book detail/hydration unaffected. |

**Also:** `books-search` and `places-search` redeployed. `placesTextSearch`
gained a `restrict` mode (rectangle `locationRestriction`, ~40 km) used only
when the client passes `restrict: true` (= a custom city is picked); GPS
searches keep the 15 km soft bias. No schema changes.

---

## v0.14 — Radar learns where things are (2026-08-01)

**New:** `location-and-safety.md` — the whole file is this release's core
(city picker, precedence, geo discovery, city guides, maps, trips,
report/block).

**Retest, because this release changed code they depend on:**

| File | Why |
| --- | --- |
| `location-and-safety.md` | Everything new — run the whole file. |
| `social-slots.md` | RT-SOC-01 rewritten ("Friends & quests" labels + hints); RT-SOC-16 rewritten (slot discovery is now PUBLIC-ONLY — friends-only slots must vanish from search); RT-SOC-19 gains block/city notes. Run the Visibility and Discovery sections. |
| `explore.md` | Eat/Do gained the 📍 chip; `location.effective()` now feeds distances and Places calls (custom > GPS > home). Run RT-EXPL-11…13 to confirm pulls/filters still work with NO city picked (GPS path unchanged). |
| `adventures.md` | Adventure select strings gained location/dates/visibility columns; trip card sits on the planning screen. Run RT-ADV-01/02 + smoke the itinerary. |
| `notifications.md` | New `friend_trip` verb (RT-NOTIF-13); describe() fallback must still handle unknown verbs. |
| `radar-and-slots.md` | Slot SELECT gained `location`; slot pages gained location row + map. Smoke-load slots in all four domains. |
| `friends-and-recommendations.md` | Profile pages gained home-city line, report and block; taste match now returns null under 5 shared tags ("not enough data" path). Run the profile-page tests. |

**Also:** migrations 0016–0019 (report/block + taste-match floor · location
layer + geo RPCs + trip trigger · trigger actor_name repair · city_guide enum
cast). New edge function `places-autocomplete`; `places-search`/`place-detail`
redeployed with **Pro-tier search field masks** (G8 cost fix) — verify a fresh
Places pull still upserts and that a previously-detailed place keeps its
rating on search cards (metadata merge). `pp-test-1/2/3` untouched;
`radar-auto` gained an "ATX eats" public slot, Austin home city,
public+discoverable profile, and an "Austin Weekend" adventure (test data).

---

## v0.13 — Search that actually searches (2026-08-01)

**Rewritten:** `explore.md` (two result models — run the whole file).

**Retest, because this release changed code they depend on:**

| File | Why |
| --- | --- |
| `explore.md` | Server-driven search, curated chips, person pill, Places pagination — the whole file. |
| `domains.md` | Read switched to Open Library (RT-DOM-06 rewritten); place tagging switched to primaryType. Check book detail hydration and that pre-v0.13 Google-sourced books still render. |
| `radar-and-slots.md` | Slot pages and role slots consume the same activities/tags tables that migration 0015 cleaned and the new taggers write. Spot-check slot filters still work per domain. |
| `titles-and-statuses.md` | `hydrate()` gained an Open Library branch. Statuses/ratings unaffected but run RT-TITLE-01/03 to confirm detail pages still hydrate for movies, places and books. |
| `quests.md` | Quest slot decks read the same catalog rows. Smoke-run one watch quest to confirm nothing regressed (RT-QUEST-13/14). |

**Also:** migration 0015 deleted junk cuisine/theme/book-genre tags (kept
anything a slot uses). `tmdb-discover` and `book-detail` are new edge
functions; `generate-candidates` remains deleted.

---

## v0.12 — Adventures, planning-first (2026-07-31)

**Retest:**

| File | Why |
| --- | --- |
| `adventures.md` | RT-ADV-01/02 rewritten (creation moved to the Quests tab, standalone `adventure_create` RPC), RT-ADV-06/08/10 rewritten (Whenever bucket + explicit picker), RT-ADV-14 gains the poster-thumbnail check. Run the whole file. |
| `quests.md` | The decided screen lost its make-it-an-adventure button — confirm reveal/start-over/back-to-adventure still behave (RT-QUEST-18/19). Nothing else touched. |

---

## v0.11 — Quests, rebuilt — and adventures (2026-07-31)

**New:** `adventures.md`. **Rewritten:** `quests.md` (the flow changed
completely — old test IDs no longer describe the product).

**Retest, because this release changed code they depend on:**

| File | Why |
| --- | --- |
| `quests.md` | Rebuilt end to end — run the whole file. Pay special attention to RT-QUEST-10 (private slots are never offered) and RT-QUEST-12 (a quest must not make friends-only slots discoverable in Explore). |
| `adventures.md` | New feature — run the whole file. |
| `social-slots.md` | Slots are now the input to quests. Visibility tiers, saving, and forking must behave exactly as before, and **RT-SOC-16/18/20 (Explore discovery) are the leak check** for the new cross-member slot access. |
| `explore.md` | `searchSlots` relies on slot RLS alone. This release deliberately did NOT widen that policy — confirm Explore still shows only public + friends' slots (RT-EXPL-01, and RT-SOC-20 as u3). |
| `domains.md` | Quests stopped being watch-only; RT-DOM-09 was inverted. Check a quest in each of the four domains, and that per-domain starter slots and statuses are untouched. |
| `radar-and-slots.md` | Slots feed the quest picker now. Creating, deleting, reordering and the completion behaviour must be unchanged, and a deleted slot must not break a quest that picked it. |
| `accounts-and-onboarding.md` | The taste-chip copy changed (RT-ACCT-08, RT-ACCT-15) now that AI picks are gone. Calibration and taste match must still work. |
| `notifications.md` | Unchanged by this release, but `parties` gained columns and quests write to new tables — a smoke pass on the inbox confirms nothing regressed. |

**Not covered by a test, worth knowing:** the `generate-candidates` edge
function and its scoring module were deleted and the deployed function removed.
Nothing in the app calls Gemini any more.

---

## v0.10 — Notifications and What's new (2026-07-31)

**New:** `notifications.md`

**Retest, because this release changed code they depend on:**

| File | Why |
| --- | --- |
| `notifications.md` | New feature — run the whole file. |
| `friends-and-recommendations.md` | `recommend_to_friend` was rewritten to also send a notification. Recommending must still put the title in the right domain's slot and stamp the sender's name. `add_friend_by_code` was rewritten too — adding by code must still work and stay mutual. |
| `titles-and-statuses.md` | A trigger now fires on every engagement status change. Setting statuses must stay fast and correct, and must not error when nobody recommended the title. |
| `social-slots.md` | Finishing the last item in a slot you saved now notifies its owner. Saving, un-saving and progress counts must be unaffected. |
| `netflix-import.md` | The trigger deliberately ignores INSERTs so a big import doesn't produce hundreds of notifications. Import and confirm the bell does **not** fill up. |
| `accounts-and-onboarding.md` | A brand-new account is stamped as caught-up on release notes, so a first-time user must not see a What's-new badge. |

---

## v0.1 – v0.9 — everything before this system existed

These releases were backfilled into `docs/release-notes/` on 2026-07-31 from
the git history; the feature files in this folder were written at the same time
and describe the app **as it stands today**, which is the sum of all of them.

There is no per-release retest list for v0.1–v0.9 — for a full sweep of that
history, run every file in this folder.
