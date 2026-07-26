# Social Slots — Analysis & Brainstorm

*2026-07-26 · Rory's vision: Spotify-playlist-style sharing — visible profiles,
subscribe to people and to slots, visibility tiers everywhere, slot metadata
for search/parties, thumbs-up for popularity. Explicitly NOT a social media
app: no feed, no comments, no DMs. This doc analyzes fit against the built
system and proposes a build order; the 15 brainstorm ideas live at the bottom
awaiting approve/deny.*

## The system, restated

1. **Profiles** become viewable pages (like today's friend profile) with
   visibility: `public` / `friends` / `private`. Searchable later.
2. **Subscribe to profiles** — lighter than friendship (one-directional,
   no approval): keep up with someone's radar without being friends.
3. **Slots get visibility too** (`public`/`friends`/`private`) — hide the
   "High movies" slot from coworkers while your Halloween slot is public.
4. **Subscribe to custom slots** — a read-only, live reference that renders
   on your own Radar page (like saving someone's playlist). Built-in role
   slots (Watching now, Up next…) get visibility but are NOT subscribable.
5. **Slot metadata** — tags from the existing vocabulary (genre/cuisine/
   theme/vibe) attached to slots themselves, for search, sorting, and future
   party integration ("quest from this slot").
6. **Thumbs-up on slots** — popularity signal for future discovery.

## Fit against what's built

The reuse story is strong — most of this is columns + junctions + RLS, not
new machinery:

| Piece | What exists | What's needed |
|---|---|---|
| Profile pages | Friend profile page (slots, watches, shared parties) | Generalize to any-profile page gated by visibility; add `profiles.visibility` (default `friends` = today's behavior) |
| Profile subscribe | `connections` (mutual, approval-based) | New `profile_subscriptions (subscriber_id, profile_id)` — one-directional, no approval, allowed on public profiles (friends tier implies you'd just befriend them) |
| Slot visibility | 0008 made ALL slots friend-readable | `radar_slots.visibility` default `friends` (matches today); RLS: `public` → any authenticated, `friends` → `is_friend(owner)`, `private` → owner only |
| Slot subscribe | — | `slot_subscriptions (subscriber_id, slot_id)`; Radar page renders subscribed slots read-only (they're references — always live, "keep up with usage" comes free); RLS lets subscribers keep reading a slot while it stays public |
| Built-in vs custom | `config.role` already distinguishes them | Enforce "no subscribing to role slots" in RPC + UI |
| Slot metadata | One shared `tags` table with kinds genre/cuisine/theme/vibe + per-domain filter chips in Explore | New `slot_tags (slot_id, tag_id)` junction + `radar_slots.description`; tag-picker UI scoped by the slot's domain (same vocabularies Explore filters use) |
| Thumbs-up | — | `slot_likes (slot_id, user_id)`; counts queryable for future "popular slots" |
| Search (future) | Explore's filter engine | Slot search = same pattern over slots (by tag, domain, popularity); profile search = name + visibility='public' |

**Subtleties to respect:**
- **Visibility cascade:** a private profile trumps public slots (nothing shows).
  A public profile still only exposes its public slots to strangers; friends
  additionally see friends-tier slots. History/engagements keep their own
  `visibility` column (already exists) — profile page = gate, per-item
  visibility = contents.
- **Watch out for the 0008 lesson:** every visibility-widening policy comes
  with an audit of client queries for owner filters (already scoped, but new
  "their profile/slots" queries must filter deliberately).
- **Unsubscribe on privatization:** flipping a slot to private should hide it
  from subscribers (reference stays but renders "no longer available" or is
  cleaned up — decide during build).
- **Not-social-media guardrails:** no comments, no DMs, no public follower
  counts on profiles (subscriber counts visible to the OWNER only — see idea
  8), no algorithmic feed. Public user-generated content (slot names/emojis)
  eventually needs a lightweight report/block affordance — park until search
  makes strangers discoverable.

## Suggested build order (piece by piece, matching Rory's framing)

1. **Visibility foundations** — columns on profiles + slots, RLS rewrite,
   toggle UI (profile settings in Me; per-slot visibility control on slot
   pages). Default everything `friends` so nothing changes overnight.
2. **Slot metadata + likes** — `slot_tags`, `description`, tag-picker UI,
   thumbs-up button on slot pages. (Cheap, and future search needs the data
   to exist EARLY so slots are already tagged when discovery ships.)
3. **Subscriptions** — profile + slot subscribe tables, subscribe buttons on
   profile/slot pages, subscribed slots rendered read-only on Radar home
   (own section), "subscriptions" list in Me or Friends tab.
4. **Discovery (future, separate conversation)** — profile search, slot
   search by tag/popularity, featured/trending.

---

## Status (2026-07-26)

**Rory's verdict:** all approved EXCEPT #13 (private notes on subscribed
slots — denied for now). Location-based curation (#15) called out as
especially valuable ("new town → what locals go to").

**Shipped (phases 1–3 + quick ideas), migration 0011:**
- Visibility tiers on profiles + slots (default `friends`); RLS rewritten;
  toggle UI in Me (profile) and on slot pages (owner). Verified live:
  strangers see public slots, private flips hide from subscribers, role
  slots aren't subscribable.
- Slot metadata: description + tags (genre/cuisine/theme **+ vibe**, idea
  #10) with an owner tag-picker; `slot_tags` feeds future search/parties.
- Thumbs-up (`slot_likes`) with owner-only stats line (idea #8).
- Profile subscriptions (Friends tab section) + slot subscriptions: "Saved
  from others" section on Radar home with **+N new** badges (idea #9) and
  **x/y done** completion (idea #4); opening a slot marks it seen.
- Slot pages now open for ANY visible slot: viewer mode has like /
  save-to-radar / **fork with attribution** (idea #5) / share (idea #12,
  link-level; OG image needs SSR later).
- **Taste-match %** on profile pages via `taste_match` RPC (idea #6) —
  server-side cosine, friends or public profiles only.

**Also shipped (Phase 4 discovery + more ideas, 2026-07-26):**
- Explore gains **Things / Slots / People** modes. Slots mode: discover
  public + friends' custom slots (per domain) with **cover collages** (#1),
  owner bylines, 👍 counts, tag chips, popular/new sort, name/description/
  owner search. People mode: public-profile name search + a **⭐ Featured
  curators** rail (#15 — flag a public profile with
  `settings.featured=true` via SQL; the future official account (#7) uses
  this). Verified: strangers see only public slots.
- **Quest from a slot** (#3): party creation offers "Pick from…" (my
  watch-domain slots + saved ones, ≥2 items); the pipeline pools ONLY from
  that slot (host access verified server-side, unknown availability passes,
  all other filters/scoring/AI unchanged); lobby shows "picking from {slot}".
  Verified live: slot-only candidates, seen-titles still filtered.

**Approved, still queued:** #2 blend slots · #7 official curator ACCOUNT
(mechanism ready — needs Rory to create the profile) · #11 seasonal windows ·
#14 slot-context recommendations.

## The 15 ideas (verdicts inline)

1. **Slot cover collages** — auto-generate a 2×2 poster mosaic from a slot's
   top items (Spotify-style). Makes profiles, subscriptions, and future
   search visually scannable with zero owner effort.
2. **Blend slots** — pick a friend, get an auto-generated shared-taste slot
   from your overlapping want-tos and affinities (Spotify Blend). The party
   pipeline's least-misery scoring already knows how.
3. **Quest from a slot** — start a party whose candidate pool is a specific
   slot (yours or one you subscribe to): "swipe night, but only from Dave's
   Halloween slot."
4. **Completion rings on subscribed slots** — YOUR progress through someone
   else's slot (seen 4/12), computed from your own engagements. Turns a
   friend's list into a checklist.
5. **Fork a slot** — "duplicate to my radar" as an editable copy with a
   "forked from @dave" attribution line. Subscribe = live reference; fork =
   snapshot you own.
6. **Taste-match % on profiles** — one privacy-safe number ("72% overlap")
   computed from tag affinities + shared titles. The friend-notes icebreaker,
   without exposing any actual history.
7. **An official Radar curator profile** — we publish starter/seasonal slots
   ("Cozy fall", "Oscar catch-up", "KC date nights") from a first-party
   account everyone can subscribe to. Day-one discovery content, and it
   models what good public slots look like.
8. **Owner-only creator stats** — "14 subscribers · 61 items checked off via
   your slot." Creator dopamine with zero public vanity metrics (keeps the
   not-social-media promise).
9. **New-item badges on subscriptions** — a quiet "+3" on a subscribed slot's
   card when the owner added things since you last opened it. Keeping up
   without a feed.
10. **Vibe tags on slots** — beyond genre/cuisine metadata, let owners tag
    slots with the existing vibe vocabulary (cozy, hype, mind-bending…).
    Future party mood check-ins could then auto-suggest matching slots.
11. **Seasonal slots with an active window** — optional date range on a slot
    (Halloween, awards season); it surfaces prominently in-season and
    auto-archives after. Searchable by season later.
12. **Share cards** — share any public slot as a link with a proper OG
    preview (title, collage, item count) + QR. Spreads the app through group
    chats — distribution without a social feed.
13. ~~**Private notes on subscribed slots**~~ — **DENIED** (Rory, 2026-07-26).
14. **Listen-together, watch-later** — a "send to friend's slot" upgrade:
    recommending FROM a slot context attaches which slot it came from, so
    the receiver sees "Dave sent this from his Halloween slot."
15. **Featured curators (hand-picked)** — when search ships, a small
    editorially-chosen set of public profiles per city/domain ("KC food
    people") instead of follower-count rankings. Quality seeding without
    engagement games.
