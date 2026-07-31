# Title pages, statuses, ratings and history

Everything about a single item: its detail page, the five statuses, ratings,
notes, who recommended it, and the History list on the You page.

**Shipped in:** v0.1 (detail pages, ratings) · v0.3 (notes, recommended-by,
stale nudge) · v0.5 (five statuses, would-watch-again, History on You) ·
v0.7 (My Radar toggles)

---

## The title page

### RT-TITLE-01 — A film or show

**Steps:** Open any film from Radar or Explore.
**Expected:** Hero art, title, year, runtime, the blurb, genre tags, where to
stream it with your own services highlighted, your status buttons, your card
(rating, notes, who recommended it) and the My Radar slot toggles.

### RT-TITLE-02 — Watch-on links open externally

**Steps:** Tap a streaming service link.
**Expected:** It opens outside the app (a browser tab; an in-app browser on
native). Coming back leaves Radar where you left it.

### RT-TITLE-03 — Hydration

**Steps:** Add a title from a search result, then open it.
**Expected:** Detail that wasn't in the search result (runtime, availability,
full blurb) fills in shortly after the page opens, without you reloading.

---

## Statuses

### RT-TITLE-04 — The five statuses

**Steps:** Cycle a film through **Want to**, **Watching**, **Done**,
**Stopped**, **Not for me**.
**Expected:** Each sets immediately with the button highlighted. Each survives
a reload — including Stopped and Not for me. *(Those two used to be dropped on
reload; check them specifically.)*

### RT-TITLE-05 — Statuses are fast

**Steps:** Tap through several statuses in a row on an account with a big
library (400+ titles).
**Expected:** Each responds instantly. There's no pause while the app reloads
your library.

### RT-TITLE-06 — Would watch again

**Steps:** Mark something **Done**.
**Expected:** A "Would watch again" toggle appears. Turning it on puts the
title in your Rewatch slot; turning it off removes it.

### RT-TITLE-07 — Per-domain wording

**Steps:** Open a restaurant, a place and a book.
**Expected:** The statuses read correctly for each: Want to try / Been there,
Want to go / Been there, Want to read / Reading / Finished — never "Watching" a
restaurant. See `domains.md`.

---

## Ratings, notes, recommenders

### RT-TITLE-08 — Rate out of ten

**Steps:** Rate a title with the star row, on the title page and again in
History.
**Expected:** Stars fill to your score, it saves without a confirm, and both
places agree after a reload.

### RT-TITLE-09 — Notes

**Steps:** Write a note on a title's card and reload.
**Expected:** It's still there.

### RT-TITLE-10 — Recommended by [2 users]

**Steps:** Have u1 recommend a title to u2. As u2, open it.
**Expected:** The card shows u1's display name as the recommender, and the
History row shows "via Test One". A later recommendation from someone else does
**not** overwrite the original recommender.

---

## History and nudges

### RT-TITLE-11 — History lives on You

**Steps:** Open the Me tab and scroll to **History**.
**Expected:** Everything you've marked Done, newest first, with poster, title,
"via" line where applicable, and an editable star rating. **Show more** pages
through it 20 at a time.

### RT-TITLE-12 — History is yours alone [2 users]

**Steps:** Compare u1's and u2's History.
**Expected:** No overlap except titles you've both genuinely finished. A
friend's watches never appear in your History.

### RT-TITLE-13 — Stale nudge

**Steps:** Find (or arrange) a show set to Watching that hasn't been touched in
60 days.
**Expected:** Radar shows a nudge offering **keep** or **take it off the
radar**, and the choice sticks.

### RT-TITLE-14 — Morning-after pulse

**Steps:** Twelve hours after a party decided on a title, open Radar.
**Expected:** A pulse card asking whether you actually watched it. Answering
updates your history and the card goes away.
