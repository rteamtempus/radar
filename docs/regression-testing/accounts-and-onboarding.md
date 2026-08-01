# Accounts and onboarding

Sign up, sign in, the three-step onboarding, taste calibration, display name,
streaming services, profile visibility, sign out.

**Shipped in:** v0.1 (accounts, onboarding, calibration, services) ·
v0.3 (taste chips) · v0.9 (profile visibility) · v0.10 (profile header)

Auth is **email + password only**. Confirm-email is off in Supabase, so no
email is ever sent. Google sign-in exists in the code but is not enabled.

---

### RT-ACCT-01 — Create an account

**Steps:** Sign out. On the login page choose **Create account**, enter a fresh
email and password, submit.
**Expected:** You're signed in immediately (no email, no confirmation step) and
land on **/onboarding**.

### RT-ACCT-02 — Sign in

**Steps:** Sign out, then sign in with an existing account.
**Expected:** You land on **/radar**, not onboarding. Your slots and history
are there.

### RT-ACCT-03 — Bad credentials

**Steps:** Sign in with a wrong password.
**Expected:** A readable error. No blank screen, no infinite spinner.

### RT-ACCT-04 — The session survives a restart

**Steps:** Sign in, force-quit the app / close the tab, reopen it.
**Expected:** Still signed in, straight to Radar. You are not asked to log in
again.

### RT-ACCT-05 — Guarded routes

**Steps:** While signed out, paste `/radar`, `/explore`, `/friends` and
`/profile/whats-new` into the address bar.
**Expected:** Each bounces you to the login page rather than rendering an empty
screen.

---

## Onboarding

### RT-ACCT-06 — Step 1: display name

**Steps:** On a new account, look at the first step.
**Expected:** The name field is pre-filled from the email address. You can
change it and continue.

### RT-ACCT-07 — Step 2: taste calibration

**Steps:** Work through the calibration deck.
**Expected:** Up to 24 well-known titles with poster art, each offering
**Loved / Meh / Haven't seen / Never would**. Posters load as you go rather
than all at once. After 12 answers a **Skip** option appears.

### RT-ACCT-08 — Calibration teaches the app

**Steps:** Mark several titles of one genre as Loved and several of another as
Never would. Finish onboarding, then go to **Me → My taste**.
**Expected:** The genres you loved and avoided are reflected in your taste.
Since v0.11 this feeds the **taste match** percentage on friends' profiles, not
quest picks.

### RT-ACCT-09 — Step 3: streaming services

**Steps:** Tick a few services and finish.
**Expected:** You land on Radar. On any title page, badges for services you
picked are highlighted and the rest are dimmed.

### RT-ACCT-10 — Onboarding happens once

**Steps:** Sign out and back in on the same account.
**Expected:** Straight to Radar. Onboarding does not reappear. Navigating to
`/onboarding` by hand still works if you want to redo it.

---

## The You page

### RT-ACCT-11 — Header

**Steps:** Open the Me tab.
**Expected:** "You", the notification bell, and a coral-to-gold avatar circle
with your first initial, all on one row. See `notifications.md` for the bell.

### RT-ACCT-12 — Change your display name

**Steps:** Edit the name, tap **Save**.
**Expected:** A tick confirms. Your new name appears to friends (check a
friend's Friends list) and on anything you recommend.

### RT-ACCT-13 — Streaming services stay in sync

**Steps:** Toggle a service on the You page.
**Expected:** It updates instantly, survives a reload, and changes which badges
are highlighted on title pages and which "watch on" link the party reveal
prefers.

### RT-ACCT-14 — Profile visibility

**Steps:** Set your profile to **Public**, **Friends**, then **Private**, and
each time view your profile as u3 (an outsider) and as a friend.
**Expected:** Public — an outsider can see your page and your public slots.
Friends — only friends see your content. Private — neither sees your slots or
history, but your display name still appears in parties and friend lists.

### RT-ACCT-15 — Taste chips

**Steps:** On **My taste**, tap a genre chip repeatedly.
**Expected:** It cycles neutral → love (green, ♥) → avoid (coral, struck
through) → neutral, and sticks after a reload. The copy says it shapes your
**taste match** with friends — since v0.11 removed the AI picks, it must not
claim quests use it.

### RT-ACCT-16 — Sign out

**Steps:** Tap **Sign out**.
**Expected:** You land on the login page, the bottom nav disappears, and the
next account to sign in on the device sees none of the previous account's
notifications, slots or history.
