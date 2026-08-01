# Location & safety

The location suite (v0.14, `docs/LOCATION-ANALYSIS.md`): locations are always
**picked from Places autocomplete** and stored as `{name, place_id, lat, lng}`
at **city granularity** — profiles, slots and adventures never hold a raw GPS
fix. Explore's precedence rule is **custom pick > GPS > home**. All discovery
RPCs (`slots_near`, `people_in_city`, `city_guide`, `friend_trips`) are
SECURITY DEFINER, return **public content only**, and filter blocks both
directions. Report/block (migration 0016) is UX hiding, not access
revocation.

**Shipped in:** v0.14

---

## The city picker

### RT-LOC-01 — Autocomplete picker

**Steps:** Explore → Eat → tap the 📍 chip. Type "Tok".
**Expected:** A bottom sheet ("Explore location") with live city suggestions
(Tokyo, Japan …). Tapping one closes the sheet, the chip shows the city, and
it survives a reload (sessionStorage). The suggestion list is cities only —
no restaurants, no streets.

### RT-LOC-02 — Quick picks

**Steps:** Re-open the picker after picking a city or two. Set a home city
first (RT-LOC-05).
**Expected:** With an empty query: "📍 Near me" (Eat/Do wording; Slots/People
say "🌍 Any city"), "🏠 <home>" when set, and up to 4 recent cities. One tap
applies any of them.

### RT-LOC-03 — Precedence: custom > GPS > home

**Steps:** In Eat, pick Tokyo. Note distances on rows. Tap 📍 → "Near me".
**Expected:** With Tokyo picked, every distance and "Pull nearby" anchors on
Tokyo (Austin spots show ~6,000 mi). "Near me" reverts to GPS; with GPS
denied and a home city set, home is used. The active source is always
visible on the chip.

### RT-LOC-04 — Location never leaks into Watch/Read

**Steps:** Pick a city in Eat, switch to Watch and Read.
**Expected:** No location chip in Watch/Read; TMDB/Open Library results are
unaffected by the picked city.

## Profile location

### RT-LOC-05 — Home city is city-level and clearable

**Steps:** You → Location → set a home city, reload, then clear it.
**Expected:** Picker has no "Near me" option (a home is a city, not a
position). The saved value is the city name; the hint says it's city-level
only. Clearing works and survives reload.

### RT-LOC-06 — Geo discoverability is opt-in, default OFF

**Steps:** Fresh account: check You → Location. Toggle it on with profile
visibility ≠ public.
**Expected:** "Discoverable by city" starts **Off**. Turning it on with a
non-public profile shows the gold heads-up that only public profiles appear
in city search.

## Discovery (public only)

### RT-LOC-07 — Slots near a city [2 users]

**Steps:** User A: public slot with items, pinned to a city, home city set to
the same city, discoverable ON. User B: Explore → Slots → 📍 that city.
**Expected:** B sees A's slot with distance, city name and a green "local's
list" badge. B does NOT see: A's friends-only or private slots, A's role
slots, or B's own slots. With no custom city, the regular popularity list
shows instead.

### RT-LOC-08 — People in a city [2 users]

**Steps:** User B: Explore → People → 📍 A's home city.
**Expected:** A appears ONLY if A is geo-discoverable AND profile-public.
Match % shows when there's enough shared taste data (≥5 shared tags), else
"new-ish". A never appears to a user A blocked or who blocked A.

### RT-LOC-09 — City guide + maps

**Steps:** Seed: a public slot holding places in a city. Explore → Eat → 📍
that city.
**Expected:** A gold "🏆 <city> — most saved on Radar" strip: places ranked
by how many public slots hold them, each showing 💾 saves. The 🗺 Map toggle
renders an OpenStreetMap map (NOT Google) with tappable markers → the place
page. No strip renders when the city has no saved places (no sad empty
state).

### RT-LOC-10 — Slot map

**Steps:** Open a food/outing slot with located items → "Map these N spots".
**Expected:** OSM map with one marker per item that has coordinates; tapping
a marker opens the place. Watch/Read slots never show the map button.

## Slots & locations

### RT-LOC-11 — Pinning a slot

**Steps:** On your own slot: set a location, reload, clear it.
**Expected:** "📍 Set a location" row under visibility; picked city shows in
the header meta ("3 in the queue · 📍 Austin") and in Explore geo results
once public. Clearing removes it everywhere. Viewers see the pin but no
edit controls.

## Trips (adventures)

### RT-LOC-12 — Trip details card

**Steps:** As adventure owner: set destination, start/end dates, toggle
visibility both ways. As a non-owner member: view the same adventure.
**Expected:** Owner sees the Trip details card (destination picker without
"Near me", date → date, 🤫 Members only / 👥 Friends can see with explainer).
Default is **Members only**. Members see 📍 city · dates in the header but no
edit card. There is NO public option.

### RT-LOC-13 — Friends see friends-visible trips [2 users]

**Steps:** A (friend of B) sets a destination on an adventure and marks it
"Friends can see". B opens the Quests tab.
**Expected:** "Friends' upcoming trips" section shows the trip (name, owner,
📍 city, dates, headcount) linking to A's profile — NOT into the adventure.
Members-only trips never appear. Past trips (end date gone by) drop out.

### RT-LOC-14 — Trip nudge notification [2 users]

**Steps:** B has saved places (slot items) near the destination city. A sets
the destination on a friends-visible adventure.
**Expected:** B gets one 🧳 notification: "A is planning <name> — <city> ·
you have N saved places near <city>". Re-setting the location updates the
same row (no duplicates) and re-unreads it. Friends with nothing saved near
the city get nothing.

### RT-LOC-15 — Slot suggestions at planning

**Steps:** Owner with a slot pinned within ~60 mi of the destination (with
items) opens the adventure.
**Expected:** "Your slots near <city> — turn one into a quest" chips; tapping
one creates a quest in that slot's domain named after the slot.

## Report & block

### RT-SAFE-01 — Report a profile / slot

**Steps:** On someone else's profile: ⚑ Report → reason → send. On someone
else's slot: ⚑ Report this slot.
**Expected:** Understated links (no report UI on your own pages). Success
toast; a row lands in `content_reports` (verify as postgres). Users can't
read others' reports.

### RT-SAFE-02 — Block hides, unblock restores

**Steps:** Block a user from their profile. Check Explore (Slots, People,
featured, city search). Unblock from You → Location.
**Expected:** Their slots and profile disappear from every discovery surface
(client lists and geo RPCs) in both directions — you also stop appearing in
theirs. Blocking does NOT revoke access to public content via direct link
(documented POC limitation). Unblock restores everything.
