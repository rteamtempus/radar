# Location Suite — Analysis & Decision Pass

*2026-08-01 · Rory's vision: location becomes a first-class concept — profiles
and slots get location settings; Explore gets a custom-location picker for
slots, people, and eat/do activities; adventures double as trips ("things to
do/eat on the trip"); discovery like "most popular slots in this city" and
"high-taste-match locals and their favorite places". This doc holds the
analysis, the idea list with verdicts, and the gotchas. **Decision pass
COMPLETE (2026-08-01):** approved 2–10, 12, 13 · denied 11, 14 ·
deferred 1, 15.*

## The core feature (approved direction)

1. **Profile location** — home city on `profiles` (schema has `home_location`
   jsonb since 0001, never written by the app).
2. **Slot location** — optional location setting on any slot, always available
   (no trip or adventure required — see idea 2's verdict).
3. **Explore custom location** — override the GPS/home default with a picked
   city, applying to eat/do activities, slot search, and people search.
4. Discovery on top: popular slots in an area; people in a city ranked by
   taste match, and their favorite places. (Gated by G1 prerequisites.)

## API findings — verified 2026-08-01, live against our key

**No new Google setup is required for the core suite.**

- **Places Autocomplete (New)** works with the existing API-restricted key
  [verified: `"Tokyo"` + `includedPrimaryTypes:["locality"]` → clean city
  predictions with placeId]. It is part of Places API (New), already enabled.
- **Locality text search** works [verified: `"Kyoto"` +
  `includedType:"locality"` → one locality row with lat/lng].
- **Design rule that keeps it zero-setup:** locations are always *picked from
  autocomplete*, never free-typed or reverse-geocoded. We store
  `{name, place_id, lat, lng}` at pick time — so the separate Geocoding API
  (forward AND reverse) is never needed.

Would need GCP/setup work later, none blocking now:

| Need | API | When |
|---|---|---|
| Reverse geocoding (label a raw GPS fix) | Geocoding API | Only if we auto-label GPS; avoidable by design |
| Real routing / walk times | Routes API | Post-POC; haversine + neighborhood clustering suffices |
| Events vertical (idea 15) | Ticketmaster Discovery (non-Google, free key) | If approved |
| PostGIS | — (Supabase migration only; 0001's TODOs anticipate it) | Phase 1 |

## Idea list & verdicts

Verdicts: ✅ approved · 🚫 denied · ⏸ deferred · ⏳ awaiting Rory.

| # | Idea | Verdict |
|---|---|---|
| 1 | **Trip mode** — set "Tokyo, Mar 3–10" once; Explore re-anchors for the window, auto-reverts | ⏸ **Deferred** (2026-08-01): scheduled location anchors not wanted now; revisit later |
| 2 | **Location on slots, always** — any slot can carry a location ("Tokyo someday"); location-matched slots get offered when an adventure in that city is created | ✅ **Approved** (2026-08-01): matches Rory's own intent. Slots have location settings unconditionally — no trip/adventure prerequisite |
| 3 | **Friends see upcoming trips/adventures** | ✅ **Approved with constraints** (2026-08-01): adventures get a visibility toggle — **friends-visible** vs **members-only** (for surprise/secret trips). **Adventures are NEVER public** — no stranger discovery of adventures, ever |
| 4 | **Route-aware itinerary ordering** — order an adventure's quests geographically (neighborhood clusters, rough walking order); haversine, no new API | ✅ **Approved** (2026-08-01) |
| 5 | **Post-trip recap** — location-stamped engagements → "your Tokyo trip: 9 places, 3 five-stars" shareable summary | ✅ **Approved** (2026-08-01) |
| 6 | **City guides from slot aggregation** — a city page assembling the most-saved public slot items there; completes HANDOFF queue #15 second half | ✅ **Approved** (2026-08-01, "really love") |
| 7 | **Locals vs visitors signal** — rank city results by whether the slot owner's home is that city; "popular with locals" | ✅ **Approved** (2026-08-01 — Rory had the same idea independently) |
| 8 | **Taste-weighted city ranking** — "popular in Tokyo *among people like you*"; rides on the match-% subsystem the locals search needs anyway | ✅ **Approved** (2026-08-01) — with the caveat that the matching algorithm itself needs real work first (G7); ship on the v1 matcher, improves as matching improves |
| 9 | **Location-triggered friend recs** — "Dave has a trip to Austin — you have 12 Austin places saved"; extends approved #14 slot-context recs | ✅ **Approved** (2026-08-01) |
| 10 | **Curated city starter slots** — official curator account (#7, mechanism live) stocked per city; doubles as the cold-start fallback (G6) | ✅ **Approved** (2026-08-01) — requires the curator account to actually be created (needs-Rory list; it unblocks this + future curation features) |
| 11 | **"On your radar nearby"** — passive: open the app, a want-to place from your slots is 400m away; own data + haversine (geofenced push = native-era upgrade, not now) | 🚫 **Denied** (2026-08-01, "not sure — skip it") |
| 12 | **Map view** — pins for slot items / Explore results / itineraries | ✅ **Approved on the free path** (2026-08-01): build with **Leaflet/MapLibre + OpenStreetMap tiles** — genuinely $0, no key, no Google billing exposure (Google Maps JS SDK has a monthly free quota but means enabling a new API; avoid). Cost concern stands: **gate map view behind the premium subscription before extensive-tester rollout** |
| 13 | **Saved places** — "home / work / parents'" quick-toggle locations in Explore; gives `home_location` a UX | ✅ **Approved** (2026-08-01) — with a bloat warning: keep the search/picker UI lean; **Rory reviews the UI** before it ships |
| 14 | **Seasonal × location slots** — queue #11 seasonal slots + place: "cherry blossom Kyoto" surfaces in-season and in-place | 🚫 **Denied** (2026-08-01, "too niche") — note this does NOT deny plain seasonal slots (SOCIAL-SLOTS #11), only the location crossover |
| 15 | **Events vertical** — Ticketmaster Discovery is location-first; "artist in town during your trip"; merges queue #10 with the location layer | ⏸ **Deferred** (2026-08-01): Rory wants to think more before committing; noted for future work (HANDOFF queue #10 remains the home for it) |

Note: ideas 6, 9, 10, 14, 15 complete existing approved HANDOFF queue items —
the location layer is the substrate several of them were waiting on.

## Decisions log

- **2026-08-01 (batch 1, ideas 1–3):**
  - No trip mode / scheduled location anchors for now (idea 1 deferred).
  - Slot location is unconditional — a first-class optional setting on every
    slot, usable with or without any adventure (idea 2).
  - Trips ARE adventures — no separate trip entity. Adventures gain an
    optional location and are shareable to friends via a per-adventure
    visibility toggle: `friends` (friends can see the upcoming
    trip/adventure) vs `members` (only participants know it exists — the
    surprise-party case). There is deliberately NO `public` tier for
    adventures.
- **2026-08-01 (batch 2, ideas 4–12):** 4–10 and 12 approved, 11 denied —
  details in the table. Two decisions with reach beyond this suite:
  - **Premium subscription tier is coming** ("should add soon") — billable
    premium features behind a subscription. Map view (12) is the first
    feature earmarked to sit behind it before extensive-tester rollout.
    Recorded in HANDOFF's queue as its own item.
  - **Maps are OSM-based, not Google** — Leaflet/MapLibre + OSM tiles, $0,
    keeping Google spend confined to Places search.

## Gotchas (the ass-bite list, ranked)

**G1 — This suite IS stranger-facing discovery; two prerequisites are already
flagged as blocking that.** CLAUDE.md § Quests 2's interim visibility rule
leaks friends-only slot contents to code-joiners ("revisit before
stranger-facing discovery grows"), and HANDOFF lists report/block as needed
before real stranger discovery. "Popular slots in an area" and "find people in
a city" are exactly that. **The quest-slot visibility redesign and a minimal
report/block are prerequisites (phase 0), not parallel work.**

**G2 — Geo-searchable people is a stalking surface.** City search + home
location + "their favorite places" composes into "where does this person hang
out". Day-one design rules: profile home location is stored **city-granularity
only** (snap to locality centroid at save; never store a raw GPS fix on a
profile); geo-discoverability is **opt-in, default off**; visibility gates
geo-search everywhere (a friends-only slot must never surface in a stranger's
city browse).

**G3 — Google ToS: coordinates are cacheable for 30 days; place_id forever.**
`upsertPlace` writes lat/lng into `activities.location` permanently — was
incidental, but distance search *depends* on stored coords, entrenching it.
Plan of record: **(b) a ~30-day refresh sweep** re-fetching coords by place_id
for geo-queried activities (legal, cheap); accept POC risk (a) until built.
Also: autocomplete must use **session tokens + debounce** (per-keystroke
billing), no live map-pan search, and **confirm the Google billing alert
exists** (HANDOFF: "advised, unknown if done") before shipping.

**G4 — Slot location semantics: decide before the migration.** Owner-set can
go stale; item-derived means a slot "moves" and multi-city slots get a
meaningless centroid. **Decision: explicit, optional, city-granularity slot
location** (autocomplete-picked `{name, place_id, lat, lng}`) as the search
field; item-derived geography for map display only; never auto-assigned.

**G5 — Distance search must be RPC-shaped; PostGIS touches real things.**
Cross-member slot reads go through SECURITY DEFINER RPCs, never widened RLS
(CLAUDE.md § Quests 1) — "slots near X" is a new cross-member read and belongs
in that pattern. jsonb→geography migration changes generated types, needs GiST
indexes, and any policy change triggers the RLS-widening audit
(memory: rls-widening-audit-lesson).

**G6 — Cold start: geo-social looks dead in cities with no users.** Fallback
tiers: local slots → curated city slots (idea 10) → plain Google results.
Never render an empty state that advertises how small the network is.

**G7 — Match % doesn't exist yet and is easy to build wrong.** Needs a
definition (cosine over shared-tag affinity subspace) **plus a confidence
floor** — 3 shared sparse tags can cosine to "97% match". Show "not enough
data" below threshold. Cache results (table or on-demand RPC); N×M live
computation won't survive a city browse.

**G8 — Places billing is set by FIELD MASK, not by filters — and ours puts
every search in the worst tier.** Since Google's March-2025 repricing, each
Places SKU has its own monthly free quota by field tier: **Essentials ≈10K ·
Pro ≈5K · Enterprise ≈1K · Enterprise+Atmosphere ≈1K** free calls/month. The
tier of a request = the most expensive field in its mask. Our search masks
([places.ts:14-31](../supabase/functions/_shared/places.ts#L14-L31)) request
`rating`, `userRatingCount`, `priceLevel`, `currentOpeningHours.openNow`
(Enterprise) **and `editorialSummary` (Enterprise+Atmosphere)** — so every
text/nearby search bills at the ~1K-free tier today.

**Fix (decided 2026-08-01): split the masks.**
- **Search masks → Pro tier** (~5K free): keep id, displayName,
  formattedAddress, location, primaryType, photos, googleMapsUri,
  nextPageToken (+ add businessStatus for G3's staleness check); STRIP
  rating, userRatingCount, priceLevel, openNow, editorialSummary.
- **Detail mask stays rich** (Enterprise+Atmosphere, ~1K free) — detail
  views are far rarer than searches; refresh-on-view already funnels rich
  fields through it.
- **Consequence:** brand-new places lose rating/price/open-now on search
  cards until first detail view. Mitigation: `upsertPlace` must **merge**
  metadata instead of overwriting it wholesale, so previously-detailed
  places keep their cached rating on search cards. (Today's upsert would
  null them back out — this merge is REQUIRED, not optional, or the mask
  split visibly degrades existing cards.)
- **City picker stays cheap:** autocomplete with session tokens + a
  location-only follow-up sits in the ~10K-free tiers; a locality text
  search with a lean mask is Pro. Either is fine.
- Structural comfort: most of the location suite reads OUR database (slots,
  city guides, saved activities) — Google is only hit on fresh Explore
  searches, the city picker, and the G3 refresh sweep. Volume is bounded.
- ⚠ Tier membership above is from documented pricing as of the knowledge
  cutoff — **verify the live SKU table before relying on exact quotas**
  (googleMapsUri/photos tier placement and the Photo-media SKU quota are
  the ones worth double-checking).

**G9 — Smaller but real:**
- Custom location applies to eat/do (+ slots/people) and must never leak into
  watch/read. A Tokyo trip also exposes that TMDB availability is US-flatrate
  (hard rule 5) — expected, but expect "Watch looks wrong abroad" reports.
- **Location precedence needs one explicit rule**: custom pick > GPS > home,
  visibly indicated. (Trip mode would have slotted between custom and GPS —
  deferred with idea 1.)
- **Native**: iOS WKWebView geolocation needs Info.plist purpose strings and
  possibly `@capacitor/geolocation` — plugin change ⇒ version bump + store
  release (CLAUDE.md § Native 3). Web-first unaffected.
- **Stale places**: city aggregation amplifies closed restaurants — include
  `business_status` in refresh-on-view (pairs with the G3 sweep).
- **Trip dates are `date`s, not timestamps** — no timezone math.
- **Units**: km vs miles by locale (`home_region` exists, defaults `'US'`).
- **Google caps**: nearby = 20/no pagination, text = 60 — don't promise deep
  browse of Google results; our own slot data has no such cap.

## Phasing (verdict pass complete — this is the shape of the build)

- **Phase 0 — prerequisites:** quest-slot visibility redesign + minimal
  report/block (G1); **field-mask split + metadata merge (G8)** — pure cost
  hygiene, do it first regardless of the rest; confirm Google billing alert
  (Rory).
- **Phase 1 — location layer:** PostGIS migration (profiles.home_location →
  geography, activities.location → geography, NEW radar_slots location +
  adventures location); autocomplete city-picker component (session tokens,
  G8); profile home-city setting (city-granularity, G2); slot location
  setting (idea 2); Explore custom-location override for eat/do with the
  precedence rule (G9); saved places quick-toggles in the picker (idea 13,
  UI to Rory for review).
- **Phase 2 — adventures as trips:** adventure location + date range +
  friends/members visibility toggle (idea 3, never public); location-matched
  slot suggestions at adventure creation (idea 2's payoff); route-aware
  itinerary ordering (idea 4, haversine); post-trip recap (idea 5);
  trip-triggered friend recs (idea 9).
- **Phase 3 — discovery & social:** geo search RPCs (SECURITY DEFINER, G5)
  for slots/people near a city; match-% subsystem (G7); city guides (idea 6);
  locals signal (idea 7); taste-weighted ranking (idea 8); curated city
  slots (idea 10, needs curator account); map view (idea 12, OSM/Leaflet,
  premium-gated before extensive testers).

## Needs-Rory checklist (things only Rory can do)

- [ ] Confirm a Google Cloud **billing alert** exists on the Places key's
      project (G3) — blocking for shipping autocomplete, not for building.
- [ ] **Create the official curator account** (unblocks idea 10 + HANDOFF
      queue #7; account creation is Rory's, stocking/flagging is ours).
- [ ] Review the saved-places / location-picker UI before it ships (idea 13
      bloat concern).
- [ ] (Later, if idea 15 graduates from deferred) Ticketmaster Discovery API
      key signup.
