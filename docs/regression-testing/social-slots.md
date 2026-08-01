# Social slots

Visibility tiers, slot descriptions and tags, likes, saving and forking other
people's slots, taste match, and the Slots / People discovery modes.

**Shipped in:** v0.9 · v0.10 (finishing a saved slot notifies its owner)

**Fixture note:** these tests rely on **u3 being friends with nobody**. If
`friends-and-recommendations.md` RT-FRND-02 was run, undo that friendship
first.

**Guardrail these tests protect:** Radar is not social media. There is no feed,
no comments, no DMs. Like counts are public; **subscriber counts are visible
only to the slot's owner**. If a test ever shows a viewer someone else's
subscriber numbers, that's a bug.

---

## Visibility

### RT-SOC-01 — Three tiers per slot

**Steps:** On a slot page you own, set visibility to Public, Friends & quests,
then Private.
**Expected:** The control shows the current tier, saves instantly, and a hint
line under the buttons explains the selected tier (v0.14: the middle tier is
labeled "Friends & quests" — friends can browse it AND quest co-members can
pick it; Private promises "never offered in quests").

### RT-SOC-02 — The tiers actually gate [2 users]

| Slot set to | u2 (friend) sees | u3 (stranger) sees |
| --- | --- | --- |
| Public | yes | yes |
| Friends | yes | no |
| Private | no | no |

**Steps:** Set u1's slot to each tier and check from both accounts.
**Expected:** Exactly the table above — for the slot itself, its items, its
tags and its likes.

### RT-SOC-03 — Flipping to private hides it from people who saved it [2 users]

**Steps:** As u2, save one of u1's public slots. As u1, set it to Private.
**Expected:** It disappears from u2's saved section. It comes back if u1 makes
it public again.

### RT-SOC-04 — Profile visibility cascades

**Steps:** Set u1's profile to Private while a slot of theirs is Public.
**Expected:** u1's profile page is gated for others. Covered further in
`accounts-and-onboarding.md` RT-ACCT-14.

---

## Slot metadata and likes

### RT-SOC-05 — Description and tags

**Steps:** As the owner, add a description and a few tags to a slot.
**Expected:** Both save, appear on the slot page and on its card in Explore →
Slots, and are searchable.

### RT-SOC-06 — Likes [2 users]

**Steps:** As u2, thumbs-up one of u1's slots. Tap again.
**Expected:** The count goes up and back down, is the same number for everyone,
and survives a reload. You can't like a slot twice.

### RT-SOC-07 — Subscriber counts stay private [2 users]

**Steps:** As u1 (owner) view your slot's stats. Then view the same slot as u2.
**Expected:** u1 sees how many people have saved it; u2 sees only the like
count. **This must never leak.**

---

## Saving and forking

### RT-SOC-08 — Save a slot to your radar [2 users]

**Steps:** As u2, save one of u1's public slots.
**Expected:** It appears in the **saved from others** section on your Radar
home, clearly separate from your own slots, and it's read-only.

### RT-SOC-09 — Saved slots are live [2 users]

**Steps:** As u1, add a title to that slot. As u2, return to Radar.
**Expected:** The new title is there, and the slot carries a "+N new since you
looked" badge that clears once you open it.

### RT-SOC-10 — Progress through a saved slot [2 users]

**Steps:** As u2, mark some items in a saved slot Done.
**Expected:** The slot shows an x-of-y completion count. Finishing the last one
notifies u1 exactly once (`notifications.md` RT-NOTIF-11).

### RT-SOC-11 — Fork a slot [2 users]

**Steps:** As u2, fork one of u1's slots.
**Expected:** You get your own editable copy with attribution to u1. Editing
your copy does not change u1's, and vice versa.

### RT-SOC-12 — Role slots can't be saved

**Steps:** Try to save someone's Watching now / Recommended to me slot.
**Expected:** Not offered. Only custom slots can be saved. (The API rejects it
too.)

### RT-SOC-13 — Share a slot

**Steps:** Use the share action on a slot.
**Expected:** A link is shared via the native sheet, the web share sheet, or
the clipboard as a fallback. Opening the link lands on that slot page.

---

## Following people and taste match

### RT-SOC-14 — Follow a profile [2 users]

**Steps:** As u2, follow a public profile you aren't friends with.
**Expected:** No approval needed. They appear in your Friends tab, and their
public slots are reachable.

### RT-SOC-15 — Taste match [2 users]

**Steps:** Look at the taste-match percentage on a friend's or public profile.
**Expected:** A single number 0–100. It's absent for strangers with private
profiles and for yourself. Nothing about the underlying ratings is exposed
anywhere in the app or the API response.

---

## Discovery

### RT-SOC-16 — Explore → Slots

**Steps:** Open Explore → Slots on each domain, once as a friend of a slot
owner and once as a stranger.
**Expected:** **Public custom slots only** (v0.14 — friends-only slots never
appear in search, even to friends; they live on the friend's profile and in
quests). Cards show a 2×2 poster collage, owner's name, like count and tags.
Sorting by popular and newest both work. Your own slots and everyone's role
slots are excluded. The 📍 city chip switches to geo results — covered in
`location-and-safety.md` RT-LOC-07.

### RT-SOC-17 — Slot search

**Steps:** Search Slots by name, by a word in a description, and by owner name.
**Expected:** All three find the slot.

### RT-SOC-18 — Popularity uses likes only

**Steps:** Sort Slots by popular.
**Expected:** The ordering reflects like counts. Subscriber counts must not
influence a public ordering — that would leak owner-private data.

### RT-SOC-19 — Explore → People

**Steps:** Open Explore → People and search a name.
**Expected:** Public profiles only. A **Featured** rail appears for curator
accounts. Private and friends-only profiles are not listed to strangers.
Blocked users never appear (RT-SAFE-02); the 📍 city chip switches to
opt-in city discovery — `location-and-safety.md` RT-LOC-08.

### RT-SOC-20 — A stranger's view [2 users]

**Steps:** As u3, browse Explore → Slots and People.
**Expected:** Only public content. No friends-only slot, no friends-only
profile, anywhere.
