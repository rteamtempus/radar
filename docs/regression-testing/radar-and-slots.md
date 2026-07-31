# Radar home and slots

The home screen, slots as living queues, slot pages, reordering, and the
completion behaviour that makes a slot a playlist rather than a list.

**Shipped in:** v0.4 (slots, Radar home) · v0.5 (status-driven role slots) ·
v0.7 (slot pages, poster rails, declutter) · v0.9 (saved slots section)

Related: `social-slots.md` for sharing, `domains.md` for per-domain slots.

---

## The home screen

### RT-SLOT-01 — Radar is home

**Steps:** Sign in, or open the app cold.
**Expected:** You land on Radar. It's the first tab, and its icon is gold while
you're on it.

### RT-SLOT-02 — What's on the page

**Steps:** Look at Radar with a few slots populated.
**Expected:** In order: the domain switcher (Watch / Eat / Do / Read), any
pulse cards, your slots as cards, a section for slots you've saved from other
people, and slot creation. There is **no** search bar — search lives in Explore
and a hint links there.

### RT-SLOT-03 — Slot cards are poster rails

**Steps:** Look at a slot with more than eight items.
**Expected:** The card shows a horizontal rail of up to eight posters plus an
overflow count. Tapping the card opens the slot's own page.

### RT-SLOT-04 — Starter slots exist

**Steps:** Look at a brand-new account on the Watch domain.
**Expected:** Watching now, Up next, Rewatch and Recommended to me are already
there.

---

## Creating and editing slots

### RT-SLOT-05 — Create a custom slot

**Steps:** Create a slot, name it, give it an emoji, choose loop mode.
**Expected:** It appears immediately, in the current domain, and survives a
reload.

### RT-SLOT-06 — Delete takes two taps

**Steps:** Delete a slot.
**Expected:** It takes a confirming second tap — one stray tap can't destroy a
queue. The slot and its items disappear; the titles themselves stay in your
library.

### RT-SLOT-07 — Reordering

**Steps:** On a slot page in **Queue order** with no filters active, move an
item up and down.
**Expected:** Reorder controls are visible and work, and the new order sticks
after a reload. Apply a filter or change the sort and the reorder controls
disappear (you can't reorder a view that isn't the real queue).

---

## Completion behaviour

### RT-SLOT-08 — Remove-mode slots clear out

**Steps:** Put a title in a normal slot (e.g. Up next) and mark it **Done**.
**Expected:** It leaves the slot straight away. It's still in your history with
its rating.

### RT-SLOT-09 — Loop-mode slots cycle

**Steps:** Mark a title in **Rewatch** as Done.
**Expected:** It moves to the back of the Rewatch queue instead of leaving.

### RT-SLOT-10 — Keep-mode slots hold

**Steps:** Mark something in **Go-to spots** (Eat) as Been there.
**Expected:** It stays where it is.

### RT-SLOT-11 — Statuses drive the role slots

**Steps:** From a title page set **Want to**, then **Watching**, then **Done**.
**Expected:** The title moves between Up next → Watching now → out, without you
touching a slot. Setting **Would watch again** on a Done title puts it in
Rewatch.

---

## Slot pages

### RT-SLOT-12 — Opening a slot

**Steps:** Tap a slot card.
**Expected:** A page with the full queue, search, per-domain filters, and
sorting by queue / rating / newest / A–Z (and closest for Eat and Do).

### RT-SLOT-13 — Filtering inside a slot

**Steps:** On a Watch slot, filter by on-my-services, runtime, vote floor and
genre.
**Expected:** The list narrows, the result count updates, and clearing the
filters restores the full queue.

### RT-SLOT-14 — Removing from a slot

**Steps:** Remove an item from the slot page.
**Expected:** It goes immediately and stays gone after a reload. The title
remains in your library.

### RT-SLOT-15 — My Radar toggles on title pages

**Steps:** Open any title page and find the **My Radar** section.
**Expected:** Your custom slots for that title's domain appear as toggle chips
(role slots don't — they're status-driven). Five are shown with a "+N more"
expander. Toggling one adds or removes the title from that slot. The section is
hidden entirely if you have no custom slots.

### RT-SLOT-16 — Isolation [2 users]

**Steps:** Sign in as u1 and u2 and compare Radar screens.
**Expected:** Each sees only their own slots in the main section. A friend's
Recommended-to-me slot never appears on your radar, and their history never
appears in yours. *(This was a real bug in v0.5 — worth re-checking after any
change to visibility rules.)*
