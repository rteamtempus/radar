# Adventures

An itinerary of quests with one roster and one code — movie marathons, date
nights, weekend trips.

**Shipped in:** v0.11 · v0.12 (planning-first creation, thumbnails, Whenever)

Quests themselves are in `quests.md`. The rules:

- An adventure is a **planning tool**: it's created standalone from the Quests
  tab, empty, with its own join code. Quests are added to it afterwards.
- Every quest added inherits the whole adventure roster automatically.
- A quest with a date and time sits under a day heading; one without is a
  **Whenever** quest, reorderable in its own bucket.
- Only the adventure's owner can complete or cancel it. Any member can add,
  schedule, reorder and remove quests.

---

## Creating and joining

### RT-ADV-01 — Make it an adventure (planning-first)

**Steps:** On the Quests tab, tap **Make it an adventure!**, name it, create.
**Expected:** A name field appears in place before anything is created;
creating lands you on an empty adventure page with that name, a join code, and
an "Add a quest" control. No quest has to exist first.

### RT-ADV-02 — The button is only on the Quests tab

**Steps:** Finish a quest through to its reveal and look for a make-it-an-
adventure button there.
**Expected:** There isn't one — the decided screen offers start-over and
watch-on only (this moved in v0.12). A quest that belongs to an adventure shows
"← Back to the adventure".

### RT-ADV-03 — One code, every quest [2 users]

**Steps:** Add a second and third quest to the adventure. Then, as u3, join
using the adventure code.
**Expected:** u3 is a member of the adventure **and** of every quest in it,
without joining each one. Check by opening each quest as u3.

### RT-ADV-04 — The join box takes either kind of code

**Steps:** Enter an adventure code and a plain quest code in the same join
field.
**Expected:** An adventure code takes you to the adventure page; a plain quest
code takes you to that quest. An adventure code must **never** drop you into
just its first quest.

### RT-ADV-05 — New quests inherit the roster

**Steps:** Add a quest to an adventure with three members. Open it.
**Expected:** All three are already in the lobby. Nobody has to join.

---

## The itinerary

### RT-ADV-06 — Whenever bucket

**Steps:** Add a quest without giving it a time.
**Expected:** It appears under **🤷 Whenever**, with up/down arrows and a
dashed **📅 Pick a date & time** button — never a bare blank input field.

### RT-ADV-07 — Reordering the Whenever list

**Steps:** Use the arrows on an unscheduled quest.
**Expected:** It moves immediately, the ends are disabled at top and bottom,
and the order survives a reload and shows the same for everyone.

### RT-ADV-08 — Scheduling promotes it

**Steps:** Tap **📅 Pick a date & time** on a Whenever quest, choose a time.
**Expected:** The picker appears only after the tap, closes once you've picked,
and the quest leaves Whenever for its day heading in time order. A second day
gets its own heading. A scheduled quest shows "🕑 day · time" with a *change*
affordance — tapping it reopens the picker.

### RT-ADV-09 — Day grouping and ordering

**Steps:** Schedule several quests across two or three days.
**Expected:** Headings read like "Saturday 15 Aug", days run earliest first,
and quests within a day run in time order.

### RT-ADV-10 — Back to Whenever

**Steps:** Tap **→ Whenever** on a scheduled quest.
**Expected:** It drops back into the Whenever bucket. Nothing else about it
changes — the same quest, same members, same picks.

### RT-ADV-11 — Timezones don't drift

**Steps:** Set a quest for 7:00pm, reload, and reopen.
**Expected:** Still 7:00pm local, and still on the same day. It must not shift
by hours or land on the previous day.

### RT-ADV-12 — Removing a quest

**Steps:** Remove an undecided quest, then remove one that's already decided.
**Expected:** The undecided one is deleted. The decided one is only unlinked —
it disappears from the itinerary but survives as history (it will reappear in
your Quests list).

### RT-ADV-13 — Live for everyone [2 users]

**Steps:** With both accounts on the adventure page, have one add, reschedule
and reorder quests.
**Expected:** The other screen follows without a refresh.

### RT-ADV-14 — Quest status and the winning poster show through

**Steps:** Take one quest in the adventure through to a decision.
**Expected:** Its row shows the status ("picking slots", "swiping", "decided")
while in flight with the domain emoji as its icon; once decided, the emoji is
replaced by a **poster thumbnail of what won** plus the winning title in gold.

---

## Finishing

### RT-ADV-15 — The recap

**Steps:** As the owner, tap **Complete the adventure**.
**Expected:** 🎊 and a recap listing every decided activity with its poster,
which quest it came from, and when — plus who was on the trip. Editing controls
disappear; the recap stays available afterwards.

### RT-ADV-16 — Cancelling

**Steps:** As the owner, tap **Cancel the adventure** and confirm.
**Expected:** The same 😃 → 💩 "Party Pooper!" beat as a quest cancel, then the
adventure is cancelled and you're returned to the Quests tab. Reopening it
shows the 🫠 "Called off" state.

### RT-ADV-17 — Cancelling takes undecided quests with it

**Steps:** Cancel an adventure that has a mix of decided and in-flight quests.
**Expected:** In-flight quests are cancelled; already-decided ones keep their
result.

### RT-ADV-18 — Only the owner can finish it [2 users]

**Steps:** As a non-owner member, look for the complete/cancel buttons.
**Expected:** Not shown. (The API rejects it with "Only the adventure host can
do that" regardless.)

### RT-ADV-19 — A finished adventure can't be joined

**Steps:** After completing or cancelling, try the old code in the join box.
**Expected:** It no longer works — the code is released when the adventure
finishes.

### RT-ADV-20 — Non-members see nothing [2 users]

**Steps:** As a user who was never added, open the adventure URL directly.
**Expected:** Nothing renders — no name, no itinerary, no roster.
