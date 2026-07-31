# Netflix watch-history import

Uploading the CSV Netflix exports and turning it into finished titles.

**Shipped in:** v0.2

Getting the file: Netflix → Account → your profile → **Viewing activity** →
"Download all".

---

### RT-IMP-01 — Pick a file

**Steps:** Me → Netflix watch history → choose `NetflixViewingHistory.csv`.
**Expected:** The file is parsed locally and you get a confirmation panel
**before** anything is written.

### RT-IMP-02 — The preview is honest

**Steps:** Read the confirmation panel.
**Expected:** How many titles were found, split into shows and films. For a
large history it says how many older titles are being skipped (the most recent
400 are imported).

### RT-IMP-03 — Episodes group into shows

**Steps:** Use a file containing many episodes of one series.
**Expected:** The series counts as **one** title, not one per episode. Films
keep their full titles.

### RT-IMP-04 — Cancel does nothing

**Steps:** Choose a file, then cancel.
**Expected:** Nothing is imported; your library is untouched.

### RT-IMP-05 — Progress [live data]

**Steps:** Run an import and watch.
**Expected:** A progress bar with a running count and how many matched, plus a
note to keep the screen open. It completes rather than stalling.

### RT-IMP-06 — The summary

**Steps:** Let it finish.
**Expected:** A toast and a summary line: how many were imported and a sample
of anything that couldn't be matched.

### RT-IMP-07 — Imports don't clobber you

**Steps:** Rate a few titles and set some to Want to. Re-run the same import.
**Expected:** Your ratings and want-to entries are **unchanged**. Re-importing
is safe.

### RT-IMP-08 — Imported titles count as seen

**Steps:** After importing, start a quest.
**Expected:** Titles from the import don't appear as candidates, and they show
in your History on the You page.

### RT-IMP-09 — Taste updates

**Steps:** Check **My taste** and party picks after a large import.
**Expected:** The picks reflect the imported history — the affinity recompute
runs at the end of the import.

### RT-IMP-10 — Bad files fail politely

**Steps:** Upload a random CSV, and an empty one.
**Expected:** A readable error. No crash, no partial import.

### RT-IMP-11 — Importing does not flood notifications

**Steps:** On an account with friend recommendations pending, run an import.
**Expected:** The notification bell does **not** fill up. Imports are inserts,
and the notification trigger deliberately ignores them. See
`notifications.md` RT-NOTIF-19.
