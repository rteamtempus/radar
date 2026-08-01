# Quests

Start a quest, pick the slots it runs on, swipe, vote, reveal. Plus cancelling
and the morning-after pulse.

**Shipped in:** v0.1 (the original flow) · v0.7 (renamed to Quests) ·
v0.11 (**rebuilt** — slot-driven, no AI, no constraints, all four domains)

Adventures are in `adventures.md`. The rules a quest runs on:

- The deck is **every activity in every picked slot**, deduplicated. No
  filtering, no cap, no scoring — if it's in a picked slot, you'll swipe it.
- Each person may pick **up to 3** slots. Zero is fine as long as somebody
  picks one. The cap is enforced on the server, not just in the UI.
- You can pick **any quest member's** slots, plus ones they've saved from other
  people. **Private slots are never offered** — not to other members and not
  even to their owner in a quest. (Interim rule; the full visibility system is
  still to be designed.)

---

## Starting

### RT-QUEST-01 — Start a quest

**Steps:** Quests tab → pick one of the four kinds (watch / eat / do / read),
optionally name it, start.
**Expected:** You land in the quest with a six-character code. There are **no**
runtime, type, or streamable-by-all options anywhere — that's the point of the
rebuild.

### RT-QUEST-02 — Jump back in

**Steps:** With a quest already open, return to the Quests tab.
**Expected:** It's listed under "Still going" with its status, and opening it
resumes where you were. Quests that belong to an adventure are **not** listed
here — they live on the adventure page.

### RT-QUEST-03 — Join by code and by link [2 users]

**Steps:** As u2, join with the code. Separately, open the shared invite link.
**Expected:** Both work; the link auto-joins.

### RT-QUEST-04 — The lobby is live [2 users]

**Steps:** Keep the lobby open on both accounts while people join.
**Expected:** The roster updates without a refresh, and each person shows
either "browsing…" or "✓ N in" depending on whether they've contributed slots.

---

## Picking slots

### RT-QUEST-05 — What's on offer [2 users]

**Steps:** Open a watch quest with u1 and u2 in it.
**Expected:** Slots from **both** members, each showing a cover collage, the
item count, and whose it is. Slots saved from other people are labelled "saved
by <name>". Only slots matching the quest's domain appear, and empty slots
don't.

### RT-QUEST-06 — Peek inside without leaving

**Steps:** Tap a slot's collage.
**Expected:** A sheet slides up listing every activity in it with posters. You
can add or drop the slot from the sheet, and closing it returns you to the
quest exactly where you were — you never navigate away.

### RT-QUEST-07 — Picks are live [2 users]

**Steps:** As u2, add a slot. Watch u1's screen.
**Expected:** It appears in "In the pot" on u1's screen without a refresh, with
the running total of things to swipe.

### RT-QUEST-08 — Three each, and only your own to remove [2 users]

**Steps:** As u2, add three slots, then try a fourth. Then try to remove one of
u1's picks.
**Expected:** The fourth is refused ("That's your 3"). u1's picks show in the
pot but have no ✕ for u2 — only the person who added a slot can take it out.

### RT-QUEST-09 — Someone else got there first [2 users]

**Steps:** Have u1 add a slot that u2 can also see.
**Expected:** For u2 that slot reads "Already in the pot" and can't be added
again. It counts once toward the deck, not twice.

### RT-QUEST-10 — Private slots are never on the table [2 users]

**Steps:** As u1, set one of your slots to **Private**. As u2 (and as u1),
reopen the quest's slot list.
**Expected:** That slot appears for **nobody**, including u1. Set it back to
friends or public and it returns. *This is a privacy boundary — re-check it
after any change to the slot picker or its RPC.*

### RT-QUEST-11 — Nobody outside the quest can see the options

Verified over the API: calling the slot-options endpoint for a quest you're not
in is rejected with "Not in this quest". Re-run after any change to
`quest_slot_options`.

### RT-QUEST-12 — Explore is unaffected [2 users]

**Steps:** After being in a quest with u1, sign in as u3 (not a friend of
anyone) and browse Explore → Slots.
**Expected:** Still only public slots. **Being in a quest with someone must not
make their friends-only slots discoverable in Explore.** This was the specific
trap the design avoided; check it whenever slot visibility changes.

---

## Swiping and deciding

### RT-QUEST-13 — Only the host starts [2 users]

**Steps:** Look for the start button on both accounts, then start as host.
**Expected:** Host only. With nothing in the pot it's disabled and says so.
Starting builds the deck and moves everyone to swiping.

### RT-QUEST-14 — The deck is exactly the picked slots

**Steps:** Note the totals of the picked slots, then count the deck.
**Expected:** The deck equals the number of **distinct** activities across
them — a title in two picked slots appears once. Nothing has been filtered out,
including things you've already seen.

### RT-QUEST-15 — Swiping [2 users]

**Steps:** Drag right and left; also use the buttons.
**Expected:** The card rotates and stamps YES / NOPE, both inputs work, the
counter shows how many are left, and people can swipe at different times.

### RT-QUEST-16 — Vetoes are anonymous and single-use [2 users]

**Steps:** Veto a title.
**Expected:** It's killed for the group, you can't veto again, and no screen
says who did it.

### RT-QUEST-17 — Voting [2 users]

**Steps:** Each person spreads three points across the finalists.
**Expected:** You can't spend more than three, votes can be added and removed,
totals update live.

### RT-QUEST-18 — The reveal, and the coin flip [2 users]

**Steps:** Host reveals. Then run a second quest where you deliberately make
two finalists tie on points, and reveal several times (start over between).
**Expected:** Most points wins. On a genuine tie the winner varies between runs
— it's a random draw, not always the same one. Confetti either way.

### RT-QUEST-19 — Start over goes back to picking

**Steps:** After a reveal, host taps start over.
**Expected:** Everyone returns to slot picking with the previous picks still
in the pot to adjust. The old deck, swipes and votes are gone.

---

## Cancelling

### RT-QUEST-20 — Party Pooper

**Steps:** As host, tap "Cancel this quest" during picking, swiping, or voting.
**Expected:** A modal with a 😃 asking if you're sure. Tapping **Yes** does
**not** close it immediately — the face turns to 💩, the heading changes to
"Party Pooper!", it sits there for about a second, and then the quest cancels.
"Never mind" backs out with nothing changed.

### RT-QUEST-21 — Cancelled is visible to everyone [2 users]

**Steps:** Cancel while u2 has the quest open.
**Expected:** u2's screen becomes the 💩 "This quest got pooped" state without
a refresh, with a link to start a new one.

### RT-QUEST-22 — Only the host can cancel [2 users]

**Steps:** As u2, look for a cancel control.
**Expected:** There isn't one. (The API rejects it with "Only the host can
cancel the quest" regardless.)

### RT-QUEST-23 — No cancelling after the reveal

**Steps:** Look for the cancel control on a decided quest.
**Expected:** Gone. A decided quest is history; use start-over instead.

---

## Afterwards

### RT-QUEST-24 — The pulse

**Steps:** Twelve hours after a decision, open Radar.
**Expected:** The morning-after card asks whether you did it.

### RT-QUEST-25 — Outsiders can't see a quest [2 users]

**Steps:** As u3, without joining, try to reach the quest by URL.
**Expected:** No roster, no slots, no deck.

### RT-QUEST-26 — Reduced motion

**Steps:** Turn on the OS "reduce motion" setting and run a reveal and a cancel.
**Expected:** No confetti, no swipe spring, no bouncing 💩. Both flows still
complete.
