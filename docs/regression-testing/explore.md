# Explore

The discovery browser: filters over everything Radar knows, friend signals,
one-tap adding, and the Slots and People modes.

**Shipped in:** v0.7 (Things browser) · v0.9 (Slots and People modes)

Slots and People modes are covered in detail in `social-slots.md`; the tests
here are the ones about Explore itself.

---

### RT-EXPL-01 — Three modes

**Steps:** Open the Explore tab.
**Expected:** Mode switches for **Things**, **Slots** and **People**, plus the
domain switcher. Things is the default.

### RT-EXPL-02 — Watch filters

**Steps:** In Things → Watch, exercise each filter: type, on-my-services,
hide-seen, friends want / watching / loved, runtime, decade, rating floor,
genre multi-select.
**Expected:** Each narrows the list, the result count updates, **hide-seen** is
on by default, and **Clear all** restores everything.

### RT-EXPL-03 — Sorting

**Steps:** Sort by popular, rating, newest and A–Z.
**Expected:** The order visibly changes and matches the label.

### RT-EXPL-04 — Rows read well

**Steps:** Look at any result row.
**Expected:** Poster, title, a context line (year and vote, or rating, price
and distance), service badges with yours highlighted, your current status if
any, and a one-tap add button.

### RT-EXPL-05 — Friend signals [2 users]

**Steps:** As u2, mark a title Want to, another Watching, and rate a third
highly. Look at those titles in u1's Explore.
**Expected:** Coloured initial chips on each row — gold for wants, green for
watching, violet for loved — showing u2's initial.

### RT-EXPL-06 — One-tap add

**Steps:** Tap add on a result.
**Expected:** It lands on your radar immediately and the row's status updates
in place, without navigating away.

### RT-EXPL-07 — Catalogue tops up as you type [live data]

**Steps:** In Watch, type the name of something obscure that Radar doesn't
already hold.
**Expected:** Results from TMDB appear automatically after a pause; you don't
have to press a search button.

### RT-EXPL-08 — Google pulls are explicit [live data]

**Steps:** Switch to **Eat** and empty the search.
**Expected:** Nearby and text-search are **buttons** you press, not automatic —
these calls are billable. Nothing hits Google until you ask it to.

### RT-EXPL-09 — Eat filters [live data]

**Steps:** Exercise open-now, distance rings, price, rating floor, hide-been,
friends want-to-try / loved, cuisine.
**Expected:** Each narrows the list. Distance rings need location permission;
denying it leaves everything else working, just without distances.

### RT-EXPL-10 — Paging

**Steps:** Scroll to the bottom of a long result list.
**Expected:** A **Show more** control that adds results without resetting your
filters or scroll position.

### RT-EXPL-11 — Domain switch resets sensibly

**Steps:** Set filters on Watch, then switch to Read.
**Expected:** Read's own filters appear (genres, no runtime, no services). You
don't get stranded with a filter that can't apply.
