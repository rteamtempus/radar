# Notifications, What's new, and release notes

Covers the bell on the You page, the badge on the Me tab, the notification
drop-down, the What's-new modal, and the release-notes archive.

**Shipped in:** v0.10

**Under the hood:** notification rows are written only by database triggers and
RPCs (`supabase/migrations/0012_notifications.sql`). Release notes are *not*
rows — they ship inside the build from `docs/release-notes/*.md`, and the only
stored state is `profiles.last_seen_release_seq`.

---

## Badges and the bell

### RT-NOTIF-01 — The bell appears with a count

**Steps:** Sign in as u1. Go to the **Me** tab.
**Expected:** A header row with "You", a bell button, and a circular avatar
with your first initial. If anything is unread, the bell is coral and carries a
count bubble; the Me tab in the bottom nav carries the same bubble.

### RT-NOTIF-02 — The badge is visible from anywhere in the app

**Steps:** With at least one unread notification, visit Radar, Explore, Quests
and Friends.
**Expected:** The bubble on the **Me** tab is visible on every screen. You
never have to open the profile to know something is waiting.

### RT-NOTIF-03 — The count caps at 9+

**Steps:** Accumulate more than nine unread items (or check with a large inbox).
**Expected:** The bubble reads `9+`, not a number that breaks the layout.

### RT-NOTIF-04 — Zero state

**Steps:** Mark everything read (RT-NOTIF-07) and open the What's-new entry
(RT-NOTIF-12). Reload.
**Expected:** No bubble anywhere. The bell is muted grey, not coral.

---

## The drop-down

### RT-NOTIF-05 — Opening and dismissing

**Steps:** Tap the bell. Then tap anywhere outside the panel.
**Expected:** A panel opens below the bell, fits the phone width without
horizontal scrolling, and closes on an outside tap. Tapping the bell again also
closes it.

### RT-NOTIF-06 — A notification reads like a sentence

**Steps:** Open the panel with at least one social notification present.
**Expected:** Each row has an icon or a poster, a bold one-line headline naming
the person and the thing ("Test Two finished Arrival"), a supporting line, and
a relative time ("2h ago"). Unread rows have a tinted background and a coral
dot; read rows don't.

### RT-NOTIF-07 — Mark all read

**Steps:** With unread items, tap **Mark all read**.
**Expected:** Every dot and tint clears, the count drops to zero (or to 1 if
the What's-new entry is still unopened), and it stays cleared after a reload.

### RT-NOTIF-08 — Tapping a notification navigates

**Steps:** Tap a recommendation notification.
**Expected:** The panel closes, you land on that title's page, and the
notification is now marked read. Tap a slot notification and you land on that
slot's page.

### RT-NOTIF-09 — Empty state

**Steps:** Sign in as a fresh account with nothing waiting and open the bell.
**Expected:** A short line explaining there's nothing yet — not a blank panel.

---

## Social notifications [2 users]

Use u1 and u2 in two windows. They are already friends.

### RT-NOTIF-10 — The four social verbs

| # | As | Do this | Then check |
| --- | --- | --- | --- |
| a | u1 | Open any title → **Recommend to a friend** → u2 | **u2** gets "Test One sent you *title*" with the poster |
| b | u2 | Set that title to **Watching** | **u1** gets "Test Two started *title* — the one you recommended" |
| c | u2 | Set it to **Done**, rate it 9 | **u1** gets "Test Two finished *title* — they rated it 9/10" |
| d | u3 | Add u1's friend code | **u1** gets "Test Three added you as a friend" |

**Expected throughout:** the notification arrives without a manual refresh
(realtime), and nobody is ever notified about their own action.

### RT-NOTIF-11 — Finishing someone's slot notifies them

**Steps:** As u2, save one of u1's slots to your radar. Mark every item in it
Done.
**Expected:** u1 gets exactly **one** "Test Two finished 🎬 *slot name*"
notification — one for the slot, not one per title. Marking a further title
Done does not produce a second copy.

### RT-NOTIF-13 — Trip nudge (`friend_trip`, v0.14)

**Steps:** Covered as `location-and-safety.md` RT-LOC-14 — run it from here
when doing a notifications pass.
**Expected:** 🧳 "<friend> is planning <name> — <city>" with the
saved-places count; re-firing updates in place (group_key), never stacks.

---

## What's new

### RT-NOTIF-12 — One entry opens every unread release note

**Steps:** With unread release notes, open the bell.
**Expected:** The top entry is a gold "What's new in Radar" row with a count of
how many releases are waiting. Tap it once.
**Expected:** A modal opens containing **every** unread release note, newest
first — not one release, and not one tap per release.

### RT-NOTIF-13 — Opening it clears it

**Steps:** Close the What's-new modal. Reload the app.
**Expected:** The What's-new entry is gone from the drop-down and no longer
counts toward the badge. It stays gone across a cold start and on a second
device signed into the same account.

### RT-NOTIF-14 — A release note reads correctly

**Steps:** Look at any note in the modal.
**Expected:** A version pill (`v0.10`), a date, a title, a one-line summary,
then sections — **Added** in gold, **Changed** in violet, **Fixed** in green —
with bolded lead-ins. No raw markdown (`**`, `-`, backticks) anywhere.

### RT-NOTIF-15 — The archive

**Steps:** From the You page tap **What's new**, or use the link at the bottom
of the drop-down.
**Expected:** Every release Radar has shipped, newest first, back to v0.1
"Movie night, decided". Visiting this page also clears the What's-new badge.

### RT-NOTIF-16 — New accounts start caught up

**Steps:** Create a brand-new account and finish onboarding.
**Expected:** No What's-new badge. A first-time user is not shown a backlog of
releases they were never around for. The archive page still lists everything.

---

## Boundaries

### RT-NOTIF-17 — You only ever see your own inbox

**Steps:** Sign in as u1 and u2 in turn.
**Expected:** Each sees only their own notifications. Nothing from the other
account appears, including after a reload.

### RT-NOTIF-18 — Notifications can't be faked

Verified over the API rather than the UI: a signed-in user attempting to
`POST /rest/v1/notifications` for anybody (including themselves) is rejected
with **403**. Only database triggers and RPCs create notifications. Re-run this
after any change to the notifications RLS policies.

### RT-NOTIF-19 — Bulk imports stay quiet

**Steps:** Run a Netflix import (see `netflix-import.md`) on an account whose
friend has recommended things.
**Expected:** The import completes and the bell does **not** fill with
hundreds of "finished" notifications. The trigger only fires on status changes
made in the app, never on imported rows.
