# Quests (parties)

Create, join, lobby, mood check-in, AI candidate generation, swiping, voting,
the reveal, and the morning-after pulse.

**Shipped in:** v0.1 · v0.7 (renamed to Quests, moved to a normal tab) ·
v0.9 (quest from a slot)

Quests are **watch-only** today — the pipeline doesn't do restaurants yet.

---

## Setting up

### RT-QUEST-01 — Start a quest

**Steps:** Quests tab → start. Set type (film or show), a runtime cap, and
whether it must be streamable by everyone.
**Expected:** A party is created with an unambiguous six-character code and you
land in the lobby.

### RT-QUEST-02 — Rejoin instead of duplicating

**Steps:** With a quest already open, go back to the Quests tab.
**Expected:** You're offered your active quest rather than silently starting a
second one.

### RT-QUEST-03 — Join by code and by link [2 users]

**Steps:** As u2, join with the code. Separately, open the shared invite link
directly.
**Expected:** Both work; the link auto-joins without retyping the code.

### RT-QUEST-04 — The lobby is live [2 users]

**Steps:** Keep the lobby open on both accounts while people join and get
ready.
**Expected:** The roster and ready states update on both screens **without a
refresh**. The invite link is copyable.

### RT-QUEST-05 — Mood check-in [2 users]

**Steps:** Each person sets an energy level, picks up to three vibe chips, and
adds free text.
**Expected:** A fourth vibe chip can't be selected. Submissions show in the
lobby as they land.

---

## Generating picks

### RT-QUEST-06 — Only the host generates [2 users]

**Steps:** Look for the generate button on both accounts.
**Expected:** Host only.

### RT-QUEST-07 — Picks respect the rules [live data]

**Steps:** Generate with a runtime cap and streamable-by-all on.
**Expected:** Every candidate fits the runtime, the chosen type, and is
available to everybody. Nothing anyone has already seen or marked Not for me
appears.

### RT-QUEST-08 — Picks are explained [live data]

**Steps:** Look at the generated deck.
**Expected:** Around a dozen candidates, each with a fit score and a one-line
reason that reflects the group's mood.

### RT-QUEST-09 — AI failure can't break a quest

**Steps:** (Verified by construction; re-check after any pipeline change.)
**Expected:** If the Gemini rerank fails, the quest still gets a deck from the
deterministic scores. Generation must never dead-end with an empty deck and no
explanation.

### RT-QUEST-10 — Quest from a slot [live data]

**Steps:** On quest creation, use the **Pick from** row and choose one of your
watch slots (or a saved one) with 2+ items.
**Expected:** Every candidate comes from that slot and nowhere else. Already-
seen titles are still filtered out. The lobby names the source slot. Titles
with unknown availability are allowed through rather than emptying the deck.

---

## Deciding

### RT-QUEST-11 — Swiping [2 users]

**Steps:** Drag cards right and left; also use the buttons.
**Expected:** The card rotates and stamps YES / NOPE, both input methods work,
and people can swipe at different times — nobody is blocked waiting.

### RT-QUEST-12 — Vetoes are anonymous and single-use [2 users]

**Steps:** Veto a title.
**Expected:** It's killed for the group, you can't veto again, and no screen
ever says who vetoed.

### RT-QUEST-13 — Survivors are sensible

**Expected:** Titles with at least half the group swiping right and no vetoes
go through; if that's fewer than three, the deck is topped up with the best
non-vetoed candidates.

### RT-QUEST-14 — Voting [2 users]

**Steps:** Each person spreads three points across the finalists.
**Expected:** You can't spend more than three, votes can be added and removed,
and totals update live for everyone.

### RT-QUEST-15 — The reveal [2 users]

**Steps:** Host reveals.
**Expected:** Confetti, one winner, and a "watch on" link that prefers a
service *you* subscribe to. Everyone's screen advances together.

### RT-QUEST-16 — Start over

**Steps:** Host starts over.
**Expected:** A fresh deck is generated and everyone's screen follows.

### RT-QUEST-17 — The pulse

**Steps:** Twelve hours after a decision, open Radar.
**Expected:** The morning-after card asks whether you watched it. Also in
`titles-and-statuses.md` RT-TITLE-14.

---

## Boundaries

### RT-QUEST-18 — Outsiders can't see a quest [2 users]

**Steps:** As u3, without joining, try to reach the party by URL.
**Expected:** No roster, no candidates, no votes. Nothing about the party
renders.

### RT-QUEST-19 — Reduced motion

**Steps:** Turn on the OS "reduce motion" setting and run a reveal.
**Expected:** No confetti animation, no swipe spring. The flow still completes.
