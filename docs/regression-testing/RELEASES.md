# What to retest, per release

Newest first. Each entry lists the feature files a release touched — running
those files **is** the regression pass for that release.

Every release note in `docs/release-notes/` must have a matching entry here.
See `CLAUDE.md` → *Release notes & regression testing*.

---

## v0.12 — Adventures, planning-first (2026-07-31)

**Retest:**

| File | Why |
| --- | --- |
| `adventures.md` | RT-ADV-01/02 rewritten (creation moved to the Quests tab, standalone `adventure_create` RPC), RT-ADV-06/08/10 rewritten (Whenever bucket + explicit picker), RT-ADV-14 gains the poster-thumbnail check. Run the whole file. |
| `quests.md` | The decided screen lost its make-it-an-adventure button — confirm reveal/start-over/back-to-adventure still behave (RT-QUEST-18/19). Nothing else touched. |

---

## v0.11 — Quests, rebuilt — and adventures (2026-07-31)

**New:** `adventures.md`. **Rewritten:** `quests.md` (the flow changed
completely — old test IDs no longer describe the product).

**Retest, because this release changed code they depend on:**

| File | Why |
| --- | --- |
| `quests.md` | Rebuilt end to end — run the whole file. Pay special attention to RT-QUEST-10 (private slots are never offered) and RT-QUEST-12 (a quest must not make friends-only slots discoverable in Explore). |
| `adventures.md` | New feature — run the whole file. |
| `social-slots.md` | Slots are now the input to quests. Visibility tiers, saving, and forking must behave exactly as before, and **RT-SOC-16/18/20 (Explore discovery) are the leak check** for the new cross-member slot access. |
| `explore.md` | `searchSlots` relies on slot RLS alone. This release deliberately did NOT widen that policy — confirm Explore still shows only public + friends' slots (RT-EXPL-01, and RT-SOC-20 as u3). |
| `domains.md` | Quests stopped being watch-only; RT-DOM-09 was inverted. Check a quest in each of the four domains, and that per-domain starter slots and statuses are untouched. |
| `radar-and-slots.md` | Slots feed the quest picker now. Creating, deleting, reordering and the completion behaviour must be unchanged, and a deleted slot must not break a quest that picked it. |
| `accounts-and-onboarding.md` | The taste-chip copy changed (RT-ACCT-08, RT-ACCT-15) now that AI picks are gone. Calibration and taste match must still work. |
| `notifications.md` | Unchanged by this release, but `parties` gained columns and quests write to new tables — a smoke pass on the inbox confirms nothing regressed. |

**Not covered by a test, worth knowing:** the `generate-candidates` edge
function and its scoring module were deleted and the deployed function removed.
Nothing in the app calls Gemini any more.

---

## v0.10 — Notifications and What's new (2026-07-31)

**New:** `notifications.md`

**Retest, because this release changed code they depend on:**

| File | Why |
| --- | --- |
| `notifications.md` | New feature — run the whole file. |
| `friends-and-recommendations.md` | `recommend_to_friend` was rewritten to also send a notification. Recommending must still put the title in the right domain's slot and stamp the sender's name. `add_friend_by_code` was rewritten too — adding by code must still work and stay mutual. |
| `titles-and-statuses.md` | A trigger now fires on every engagement status change. Setting statuses must stay fast and correct, and must not error when nobody recommended the title. |
| `social-slots.md` | Finishing the last item in a slot you saved now notifies its owner. Saving, un-saving and progress counts must be unaffected. |
| `netflix-import.md` | The trigger deliberately ignores INSERTs so a big import doesn't produce hundreds of notifications. Import and confirm the bell does **not** fill up. |
| `accounts-and-onboarding.md` | A brand-new account is stamped as caught-up on release notes, so a first-time user must not see a What's-new badge. |

---

## v0.1 – v0.9 — everything before this system existed

These releases were backfilled into `docs/release-notes/` on 2026-07-31 from
the git history; the feature files in this folder were written at the same time
and describe the app **as it stands today**, which is the sum of all of them.

There is no per-release retest list for v0.1–v0.9 — for a full sweep of that
history, run every file in this folder.
