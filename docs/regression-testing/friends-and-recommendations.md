# Friends and recommendations

Friend codes, name search and requests, friend profiles, and sending someone a
title.

**Shipped in:** v0.5 · v0.8 (recommendations route to all four domains) ·
v0.9 (Friends tab includes people you follow) · v0.10 (recommending notifies)

---

## Becoming friends

### RT-FRND-01 — Your friend code

**Steps:** Open the Friends tab.
**Expected:** Your own short code is shown and can be copied or shared.

### RT-FRND-02 — Add by code [2 users]

**Steps:** As u3, enter u1's code.
**Expected:** You're friends **immediately and mutually** — no approval step.
u1 appears in u3's friends list and u3 in u1's, on both accounts, after a
reload. u1 also gets a notification (see `notifications.md` RT-NOTIF-10d).

> Clean-up: this leaves u3 friends with u1, which breaks the "u3 is an
> outsider" fixture the visibility tests rely on. Remove the friendship again
> before running `social-slots.md`.

### RT-FRND-03 — Bad codes fail cleanly

**Steps:** Enter a code that doesn't exist, then your own code.
**Expected:** A readable message each time ("No one has that friend code" /
"That is your own code"). No crash, no silent no-op.

### RT-FRND-04 — Find by name and request [2 users]

**Steps:** Search for a person by display name and send a request. Accept it
from the other account.
**Expected:** The request shows as pending on both sides, accepting makes it
mutual, and both lists update.

---

## Friend profiles

### RT-FRND-05 — What you can see [2 users]

**Steps:** Open a friend's profile.
**Expected:** Their radar, the things they've finished and rated (whatever is
friends-visible), your taste-match percentage, and the parties you've been in
together.

### RT-FRND-06 — Outsiders see nothing [2 users]

**Steps:** As u3 (not a friend), try to open u1's profile while u1 is set to
**Friends**.
**Expected:** A private gate — no slots, no history. Setting u1 to **Public**
reveals only their public slots.

### RT-FRND-07 — The Friends tab lists follows too

**Steps:** Follow a public profile you aren't friends with (see
`social-slots.md`).
**Expected:** They appear in the Friends tab, distinguishable from mutual
friends.

---

## Recommending

### RT-FRND-08 — Send a title [2 users]

**Steps:** As u1, open a film → **Recommend to a friend** → u2.
**Expected:** As u2: the film is in **Recommended to me**, its card shows "via
Test One", and a notification says u1 sent it.

### RT-FRND-09 — Recommendations go to the right domain [2 users]

**Steps:** Recommend one of each — a film, a restaurant, a place, a book.
**Expected:** Each lands in the receiver's **Recommended to me** slot *for that
domain*. A restaurant never appears in the watch list. *(This was a real bug in
v0.7 — check it after any change to `recommend_to_friend`.)*

### RT-FRND-10 — The slot is recreated if deleted [2 users]

**Steps:** As u2, delete your Recommended to me slot. As u1, recommend
something.
**Expected:** The slot comes back with the title in it, rather than the
recommendation vanishing.

### RT-FRND-11 — The first recommender wins [2 users]

**Steps:** Have u1 recommend a title to u2, then have another friend recommend
the same title.
**Expected:** u2's card still credits u1. The original recommender is not
overwritten.

### RT-FRND-12 — You can only recommend to friends

**Steps:** Confirm there's no way to send a title to a non-friend from the UI.
**Expected:** Only friends are offered. (The API rejects it with "You are not
friends" regardless.)

### RT-FRND-13 — The loop closes [2 users]

**Steps:** As u2, start and then finish something u1 recommended.
**Expected:** u1 hears about both, with u2's rating on the finish. Full steps
in `notifications.md` RT-NOTIF-10.
