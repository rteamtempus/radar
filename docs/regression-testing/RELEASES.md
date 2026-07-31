# What to retest, per release

Newest first. Each entry lists the feature files a release touched — running
those files **is** the regression pass for that release.

Every release note in `docs/release-notes/` must have a matching entry here.
See `CLAUDE.md` → *Release notes & regression testing*.

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
