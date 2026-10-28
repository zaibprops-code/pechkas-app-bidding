# Working on the Pechkas app

An open-bidding app for home repairs in Islamabad: a customer posts a job and
names a price, checked technicians accept or counter, the customer picks one.
The full brief is `APP_BUILD_PROMPT.md` in `zaibprops-code/Pechkas`; the
approved design is the canvas "Pechkas App Look"
(https://claude.ai/artifact/42Sb6DBfcN9pP1kLnvBqBr). Where this file and the
brief disagree, ask.

## Working with the owner

- **Commit and push straight to `main`.** No branches or pull requests unless
  he asks for one by name.
- He is not an experienced developer. Plain words, numbered steps, and say
  which screen and which button. **Never ask him to paste a secret into the
  chat** — tell him where to put it instead.
- He tests on an Android phone and has no Mac. Builds run on Expo's servers
  from this repository (base directory `apps/mobile`, profile `preview` for a
  test APK, `production` for the Play Store).
- **He runs migrations himself**, in the Supabase SQL editor, following
  `docs/OWNER.md`. So every migration must be safe to run twice, wrapped in
  `BEGIN … COMMIT`, and must end by recording itself in
  `public.applied_migrations`.
- Each phase: short plan → his yes → build with tests → steps to try it on his
  phone → stop. When something touches safety, money or the law, stop and ask.
- Keep `docs/OWNER.md` current, including the open decisions at the top.

## Before you commit

```bash
npm run check   # both apps type-check, money tests, database break-in tests
```

And for anything that changes a screen, bundle it and look at it:

```bash
cd apps/mobile && EXPO_OFFLINE=1 npx expo export --platform android
```

## Rules that are not negotiable

### Trust and safety
- **A CNIC number or CNIC image never enters this repository or the
  database.** Only that it was checked, when, by whom and how. `db:test` fails
  on anything shaped like one.
- **Never invent** prices, ratings, reviews, job counts or statistics. A new
  technician shows "New". Unknown values are visible placeholders in square
  brackets.
- A customer's address and phone reach only the chosen technician, only while
  the job is active. A technician sees a customer's first name only.

### The database decides
- Every change is a numbered file in `supabase/migrations/`. Nothing is ever
  typed into the dashboard that is not also in a file.
- **The door is locked by default.** The first migration reverses Postgres's
  defaults: no new table or function in `public` is reachable with the public
  key until a migration grants it on purpose. Never add a policy for `anon`;
  add a function and say which columns come back.
- `ALTER DEFAULT PRIVILEGES … IN SCHEMA` **cannot** revoke `EXECUTE` from
  `PUBLIC` — that default is global and the per-schema revoke is silently
  ignored. The foundations migration revokes it database-wide; `db:test`
  proves a new function stays closed. Do not "tidy" that line into the schema
  block.
- Every `security definer` function has `set search_path = ''` and spells
  every name in full (`public.jobs`, `extensions.gen_random_bytes`).
- A refusal that must be remembered returns `{ ok: false, why, field }`
  instead of raising, because a raise undoes the row recording the attempt.
- The apps never write a price, a status or a balance. They ask a function.
- Two technicians can never win the same job: lock the row, check the status,
  then assign, in one transaction.
- **An empty test result must be empty for the right reason.** Use
  `nothing()` / `denied()` from `supabase/tests/harness.mjs`; a broken query
  also returns no rows.

### Money
- **Integer paisa, always.** Rs 2,500 is `250000`. Never a float.
- Commission is basis points, rounded **down**, so odd paisa stay with the
  technician. `packages/shared` and the database must give the same answer.
- No agreed price shows "no price yet", never `Rs 0`.
- Version 1 holds nobody's money: cash goes customer → technician; commission
  is owed and settled outside the app. A prepaid wallet needs a lawyer first.

### Accounts (phase 1)
- Customers and technicians sign in with a **mobile number and a code**,
  or — the owner's choice, after the brief — an **email code**.
  `pakistaniMobile()` in `packages/shared` and `tidy_mobile()` in the
  database are the one rule for what a number is, and `email.test.mjs`
  checks they agree.
- **An email account has no checked number**, so it types one
  (`set_my_phone()`, kept in `profiles.phone`) before it can post or apply
  — the `needs_a_phone` triggers are the lock behind the welcome screen.
  `phone_of()` is the one place a number to ring comes from: checked by SMS
  first, typed otherwise. Every function that hands a number to somebody
  asks it; `u.phone` straight from `auth.users` is a bug, because it is
  empty for an email account. The office sees a typed number marked
  "(not checked)" (`admin_unchecked_phones()`, `phones.ts`). **The office's
  own alerts match only a number checked by SMS** (`alert_needs_you`,
  `tell_office`, `admin_alerts`): a typed number proves nothing, and
  nobody may type the owner's number to receive his alerts.
- **The email holds a code and a link; both work, on the asking phone
  only.** The client uses `flowType: 'pkce'`, `sendEmailCode()` sets
  `emailRedirectTo` to `pechkas://auth-callback`, and that screen trades the
  link's `?code=` with `exchangeCodeForSession()`. `readSignInLink()` never
  accepts a link carrying `#access_token`: any website can open a
  `pechkas://` address, and taking its tokens would sign the phone into a
  stranger's account, where her address would be posted for him to read.
  Supabase must have `pechkas://auth-callback` under Redirect URLs, or the
  link opens the Site URL instead.
- **Nothing opens until somebody has signed in**, like every big app. The
  `Gate` in `app/_layout.tsx` is the one rule: signed out → `/start` (the
  welcome screen) unless already on `start`, `sign-in`, `verify` or
  `auth-callback`; signed in on `start` or `sign-in` → `routeFor()`; an
  account with no mode yet → `/choose`; an email account with no number →
  `/welcome`. The splash stays up until
  it has decided, so the home screen never flashes first. Sign-up and
  sign-in are one step: a new number or email becomes a new account. A
  screen that finds nobody signed in redirects to `/start`, never to
  `/sign-in`, so it cannot race the gate. Apple accepts a login-first app
  only because every feature belongs to an account — keep it that way.
- **One account, two modes, like inDrive's passenger and driver.**
  `profiles.role` is the mode in use — which side of the app this phone
  shows — and nothing about a job reads it: every job function works out
  the asker's side from the job's own `customer_id` and `pro_id`. The first
  question is `app/choose.tsx` (two big cards), then `welcome.tsx` takes
  the name with the choice as `as`. Changing it later is only
  `switch_mode()` (`src/mode.ts`, `ModeSwitch` at the foot of the menu and
  on Me), never `start_as()`, which refuses a different mode. Technician
  mode needs an application on record (`field: 'apply'` opens one).
  **Nobody switches out of the middle of a job**: open or assigned as the
  customer, assigned as the technician. Leaving technician mode is going
  off duty — offline, waiting offers withdrawn, a job held for him by name
  released through `pass_asked()` — and never touches his approval. The
  office's flags count a customer by the jobs they posted, not the mode
  they are in. `modes.test.mjs` breaks if any of that goes.
- **A code is `CODE_DIGITS` (6) digits, email and SMS alike**, and the
  code screen always draws exactly that many boxes; the sixth digit sends
  it. Supabase decides the real length ("Email OTP Length", "SMS OTP
  Length") and must say 6 — set to 8, the old screen grew a box per digit.
  `readCode()` reports a longer paste instead of cutting it short, and the
  screen never sends the first six of a longer code. Do not go back to
  guessing the length from what arrives. **The owner's decision (October
  2026): codes are 6 and only 6.** A version accepting 6 to 10 was built
  and he reverted it; the length is fixed in Supabase, not in the app, and
  no migration can set it.
- **Continue with Google is Supabase's Google provider through the same
  door as the email link**: `signInWithGoogle()` opens Google in
  `expo-web-browser`'s secure sheet with `redirectTo` `pechkas://auth-callback`
  (PKCE), and the one-time code is traded by `tradeCode()`, which the
  auth-callback screen uses too — Android hands the code to both, only the
  first trade can work, and a refusal while a session exists is that, not a
  failure. The button is drawn **only when `googleReady()` reads
  `/auth/v1/settings` and Google is on**, so no copy of the app shows a
  button that does nothing, and never on iOS (Apple 4.8 wants Sign in with
  Apple beside it; not built). A Google account is an email account with no
  checked number: the welcome screen asks for one, with the first name
  prefilled by `firstNameFrom()`. What Google sends (email, name, picture
  link, account number) is in the privacy page and the Play answers;
  change all three together.
- Every sign-in failure shows `explainAuthError()` plus Supabase's own
  words and the project's host. Never go back to "check your signal" for
  everything: it hid a Supabase refusal for a whole afternoon.
- The office signs in with **email and password**, one login each, made
  by the owner in Supabase; `make_owner()` is granted to nobody and run by
  hand in the SQL editor.
- Being signed in is never enough for the office. Every `admin_*` function
  asks `is_staff()` again, so switching someone off works on their next tap.
- **Approval needs three checks on record**: identity (in person or video
  call, never a photo of a card), a trial job, the rules. `pro_checks` keeps
  who checked by name too, so the record survives them leaving.
- A technician can edit his application until he is approved, never after:
  it is then the owner's record. He can never set his own status.
- `delete_my_account()` deletes the `auth.users` row and everything cascades.
  Both stores require it inside the app.
- Database refusals are English. On the technician side `proError()` picks
  the matching line for the `field` — put the words in `words.ts`, not the SQL.
- The `EXPO_PUBLIC_*` and `VITE_*` values are baked in **at build time**.
  Without them the app says it is not connected and the admin panel says so
  too; Vite even drops the code that would use them. Set them in Expo and
  Vercel, then rebuild.

### Jobs (phase 2)
- **Price guidance is the website's prices, never ours.** `job_types` is
  seeded from `src/data/services.js` in the website repository; a job the
  website does not price says "Price after a look" rather than a number.
  **The screens never say "website"** (the owner's decision): the figure is
  "Usual price" / "the usual Pechkas price". Where the prices come from is
  for this file, not for customers.
  The lowest offer is the `min_offer_paisa` setting (Rs 1,000, the website's
  inspection fee). If the website's prices change, a migration updates
  `job_types`.
- **Only `live` sectors take jobs.** Nobody is promised a visit where Pechkas
  has nobody.
- **The address is map first** (the owner's choice, replacing typed-in
  sector, street and house). The Address card is a map box with **Set the
  address on the map** (the pin picker) — or **Use my location** in a build
  without the Google key — and nothing else until there is a pin: **the pin
  is required** (`early.location`). Then `readPlace()` (Map.tsx: the phone's
  own geocoder through `expo-location`, which needs the location
  permission on Android and never asks for it) and `sectorIn()` /
  `streetIn()` in `packages/shared` (`place.test.ts`) read the sector and
  the street: only a sector on the list can come back, never a guess, and
  "F-1" is never read out of "F-11". A live sector shows as "Sector F‑11 ·
  read from the map" with Change; one Pechkas does not serve is said
  plainly with the same `ask_for_sector()` button; nothing read means the
  live sectors as chips. Then **House or flat** (required) and **Street**
  (filled from the pin, required by the database — `jobs.street` is NOT
  NULL — and correctable), landmark and gate note behind a link, and
  **Save this address as** Home / Office / Other. Saved addresses and the
  last one used live **on the phone only** (`src/post/places.ts`, four at
  most) and a new form starts at the last one, pin and all; **signing out
  forgets them** and the draft (`account.tsx`), because the next person on
  that phone must not see them. The privacy page and both stores' answers
  say the pin is required and that the pin goes to the phone's map service
  to read the sector.
- **A job is wanted as soon as possible, or on a day and in a window**
  (migration `…_days_profiles_again`, the owner's request): today and the
  six days after it, two hours at a time from 8–10am to 8–10pm
  (`WINDOWS`, `DAYS_AHEAD`, `openWindows()` in `packages/shared`; the
  database checks the same seven in `post_job()` and words them in
  `window_text()`). Everything is on **Pakistan's clock** (`pkNow()`,
  `Asia/Karachi`), never the phone's. A window that has started cannot be
  chosen. The day is kept as `when_date`, so "tomorrow" no longer stays
  tomorrow for ever; `when_kind` / `when_part` are still filled
  (today / tomorrow / **later**, and the part of the day) for anything that
  reads them, and older copies still post the old way and get a date.
  **Every screen says it with `whenLabel()`** ("Sat 1 Nov, 10am–12pm"),
  and notifications with `when_text()`, in the same words — never a screen's
  own wording. A job booked for a later day stays in `pro_feed()` until its
  day; one wanted now still leaves after two days. Older copies cannot read
  'later', so `APP_EDITION` is 2.
- **Book again** (a finished, stopped or cancelled job's foot card) opens
  Post a job with `again=<job id>`: the trade, job type, words, address,
  pin and price from `my_jobs()` (which gives a customer her own job's
  `job_type_id`, `lat` and `lng`); never the files, the day or the time,
  which belong to that visit. Open to everyone, unlike Ask again.
- **Files live in the private `job-media` bucket under `<user id>/…`.** The
  storage policies let a person write and read only their own folder and the
  office read all of it — no policy for `anon`, ever. `post_job()` checks every
  path is in the caller's folder and really uploaded. Phase 3 lets a
  technician read a job's files only through `pro_may_see_file()`, which asks
  the same `pro_may_see()` as the feed.
- The database cannot delete stored files. Deleting an account empties the
  customer's folder **from the phone first**, then deletes the account.
- The post form is saved on the phone as it is typed (`post/draft.ts`), and
  an uploaded file keeps its `path`, so a post that fails on bad signal
  neither loses the voice note nor uploads it twice.
- **The media tiles must work on a real phone, not only in a browser.**
  Every camera or gallery opened from a `Sheet` goes through `afterSheet()`
  (media.ts) so it opens after the sheet has closed; Post a job calls
  `recoverLostPick()` on opening, because Android may close the app while
  the camera is open and keeps the picture for `getPendingResultAsync()`;
  media changes go through `changeMedia()`, from the newest list, never a
  copy from before the camera opened; `VoiceTile` keeps its own clock and
  recording flag instead of trusting the recorder's lagging reports. Any
  failure shows its words in a "(Details: …)" line, so the owner's
  screenshot says what the phone said. `LIMITS.bytes` (50 MB) equals the
  `job-media` bucket's `file_size_limit` (migration `…_bigger_videos`,
  checked in `jobs.test.mjs`): change both together. Videos are 20 s.
  **Every tile says its limit** (Up to 1 min, Up to 20 sec, Up to 4), the
  voice tile counts down while it records ("0:48 left", a bar filling by
  transform) and stops itself at the minute, and a finished video reads
  "0:14 of 0:20". **Photos from the camera go through Pechkas' own camera
  too** (`capture('photo')` in `src/post/recorded.ts`, which `takePhoto(true)`
  uses on a phone, customers and technicians alike): the photo picker's
  camera refuses to start on Android 9 and older without the storage
  permission app.json blocks, so "Take a photo" could never work there and
  a technician could not take his start or finish photos. Our camera needs
  only the camera permission; it shows its own card after any refusal
  (**Allow the camera** while the phone still lets us ask, **Open
  settings** after) and reads the permission again on coming back from
  Settings. **A video is recorded on Pechkas' own camera screen**
  (`app/record.tsx`, `expo-camera`, the owner's request): the camera fills
  the screen, a big clock counts down from 0:20, a bar fills by transform,
  and recording stops itself at `LIMITS.videoSeconds` (`maxDuration`, and
  the clock as a second guard). 720p on purpose, so 20 seconds is far
  inside `LIMITS.bytes`. It hands the video back through
  `capture('video')` in `src/post/recorded.ts`, which waits for what the
  camera hands back (null if it was closed). Its
  trouble is shown above the record button (`Notice inline`), never as the
  top banner, which would cover the close button and the clock. A browser
  cannot record, so the browser copy keeps the picker. `expo-camera` brings
  no new permission (camera and microphone were there); its barcode scanner
  is switched off in app.json, and its permission strings are the same
  words as the other plugins'. Choosing from the gallery is unchanged.
- Permissions: microphone, camera, photos and location **while using**.
  Background location and background audio are switched off in `app.json`;
  Google Play asks questions about both.

### Bidding (phase 3)
- **One rule for what a technician may see: `pro_may_see(job)`.** The feed,
  the storage policy for voice notes and photos, and `make_offer()` all ask
  it, so they cannot drift. Approved, the job's trade and sector are his,
  and the job is open — or he is the one chosen for it. Being online only
  decides whether `pro_feed()` lists jobs; it is not a permission.
- **Before he is chosen he gets the sector and the customer's first name,
  never the street, house, landmark, location or phone.** `pro_feed()` names
  every field it returns; `bidding.test.mjs` checks the address and phone
  are not in it. After he is chosen, `pro_my_jobs()` gives him those, only
  while the job is `assigned`.
- **Choosing locks the job row (`FOR UPDATE`), checks it is still `open`,
  then the offer, then assigns, in one transaction.** Two customers' taps or
  a choice racing a cancel can never give one job two technicians. There is
  a test that breaks if the status check is removed.
- An offer is whole rupees, at least `min_offer_paisa`, at most
  `max_counter_bps` of the customer's price, lives `offer_minutes`, and must
  say how soon for an "as soon as possible" job. Its note refuses phone
  numbers and CNICs: contact details pass only once he is chosen.
- **His profile, before she chooses**: "See Bilal's profile" on each offer
  opens `ProProfile.tsx`, which asks `offer_profile(offer)` — only for the
  customer whose job he offered on. First name, years, trades, which checks
  were done and since when, jobs done, the rating ("New" until
  `rating_min_count`), jobs done for her before, and the last five things
  customers wrote, **revealed ones only, with no writer's name**. Never his
  surname, number or sectors (`days.test.mjs`). Rating words can be shown
  this way, so the rating form says so, and the privacy page too.
- One offer per technician per job (unique), changed in place. The customer
  sees first name, years in the trade and whether it is the customer's own price or his —
  never his surname or number until he is chosen.
- Screens still poll while focused (`jobs.tsx` 10 s, `Work.tsx` 15 s, admin
  30 s) and stop when left; notifications are for when the app is closed. `useFocusEffect` callbacks
  keyed on a context function need that function to be stable: `refresh` in
  `account.tsx` is a `useCallback` because the unstable one looped forever.
- `online` stays on until he switches it off; the office sees it and
  `last_seen_at` in `admin_pros()`.

### Notifications (phase 3b)
- **The database sends them, not the apps.** Triggers on `jobs` and
  `offers` call `send_push()`, which queues a request to Expo's push service
  with Supabase's `pg_net`. An app that has to remember to send one is an
  app that one day forgets, and a raise-free trigger catches every path —
  the customer, the office, a future function.
- **What a notification may say:** trade, sector, first name, price, job
  number. **Never** a street, house, landmark, location, gate note, phone
  number, surname, or anything the office typed (the office's cancel reason
  stays in the app). It crosses Expo's and Google's servers and sits on a
  lock screen. `notifications.test.mjs` reads every message the tests
  provoke and fails on any of those.
- **A notification that cannot go never undoes anything.** `send_push()`
  catches every error and writes it to `push_log` instead. A test makes the
  push service fail and checks the job still posts.
- Who is told: `pro_may_see_as(job, pro)` — the same rule as the feed —
  and `online`. A price nudge on a live offer does not buzz the customer
  again; a new or renewed offer does. A technician whose offer was **live**
  is told when someone else is chosen or the job is called off; one whose
  offer had run out, or who took it back, is not — he has moved on.
- **The office is told once per job** when it has waited
  `escalate_minutes` with no live offer: `alert_needs_you()`, run every
  minute by `pg_cron`, marks `needs_you_told_at` first. It goes to the app
  signed in as each active staff member's `alert_phone`, set in the admin
  panel. Jobs older than a day are never announced.
- **Every word is in `push_words.en`**, filled by `say()` with `{slots}`.
  Change wording with a migration that updates the table.
- **English only, everywhere — the owner's decision.** Roman Urdu read as
  informal and unofficial, so the screens, the notifications and the store
  copy are formal English for customers and technicians alike. There is no
  language switch. The `push_tokens_english` trigger stores every phone as
  `'en'` whatever it asks, so an older app cannot bring Roman Urdu back;
  `push_words.ur` still holds the old lines, unused, only so the older
  migrations can be run a second time. Do not add a translation without
  being asked; a real Urdu version would need Urdu script and a native
  speaker to check every line. Customers may still send a voice note in
  Urdu — that is how they describe a fault, not how the app speaks.
- `push_tokens` is keyed by token, so a phone signed in as somebody else
  moves to them. `signOut()` calls `forget()` **before** signing out, while
  the database still knows who is asking. Five phones per person at most.
- The phone asks permission only on a deliberate act — going online, or a
  customer with a job waiting — never on launch. `useNotify()` re-registers
  whenever a screen that wants notifications opens or the app returns to
  the front, so a changed token heals itself.
- A tapped notification may only open `/pro` or `/jobs` (`PLACES` in
  `src/notifications.ts`). Its `data.url` came over the network.
- `google-services.json` is not in the repository: the owner uploads it to
  Expo as the file variable `GOOGLE_SERVICES_JSON`, read by
  `apps/mobile/app.config.js`. The FCM V1 key lives only in Expo's
  credentials. Without either, the app builds and works and nobody is
  buzzed; `admin_pros()` shows who cannot be reached.
- `supabase/local/bootstrap.sql` stands in for `pg_net` with a function of
  the real signature that records each request in `net.sent`, and fails on
  demand through `net.fail`; and for `pg_cron` with a `cron.schedule()` that
  writes `cron.job`. Tests call `alert_needs_you()` themselves.
- **Settings (`app/me.tsx`, "Me" in older notes) is laid out as the menu
  is**, redesigned at the owner's request: the person on a green card
  (initial on a yellow disc, name, the bare number — "(not checked)" is said
  on the number's row, where it has room — Customer or Technician), then
  white cards of rows — two-tone icon on a
  soft yellow tile, words, chevron — with no group headings: number and
  email; the `ModeSwitch pill`; Notifications (an On / Off chip, the
  sentence saying what this phone does), the legal page for that side;
  Sign out and Delete my account (brick tile and words). `ThisCopy` is a
  white card at the foot.
- **Help (`app/help.tsx`) is in the same style**: the office on a green
  card (hours, number, **WhatsApp** and **Call** side by side, stacked
  under 360 wide), **Common questions** that open one at a time (the
  chevron turns by transform and snaps), then the legal pages and Safety as
  `DuoRow`s from `src/components/Rows.tsx`, which Settings uses too. The
  answers are different for each side and are only rules the app already
  keeps, in its screens' own words; a number that can vary or is still
  undecided (the credit limit and visit fee the office may set, the
  guarantee's 15-or-30 days) is never written there — the answer points to
  the screen showing the real figure. The 10% and 7% are locked
  settings, as in the terms: change them and this page in the same week.
- **Safety (`app/safety.tsx`) is in the same style**, and still open
  signed out and never covered by a pause: the four numbers from
  `src/emergency.ts` as big white tiles two by two (the number large in
  brick, a brick call disc, the service under it; a tap rings it), the
  office as a `DuoRow`, then "How Pechkas keeps a visit safe" with a
  two-tone icon per line. Only the look changed: the words are safety
  advice and stay exactly as they were.
- The Me screen shows and turns on notifications for anyone, so the owner's
  own phone can receive the office alerts without having a job open.
  `useNotify(null)` waits: a technician's language must be read from the
  phone before his token is saved, or it is saved in the wrong one.

### A job, live (`app/job/[id].tsx`)
- **Posting lands on the job's own screen**, the way a ride app lands on
  the search: `Searching` (the screw turning in rings that only grow) while
  it is open, the offers right under it, then the same screen follows the
  visit. It renders `JobCard` from `src/customer/JobCard.tsx`, and is the
  one place a job is acted on: choosing, declining, cancelling, the start
  code, a new price, paying, rating, blocking. It asks `my_jobs()` every
  5 s while open and 10 s after, only while in front.
- **The job's screen is a stack of white cards**, redesigned at the
  owner's request in the same style, from the pieces in
  `src/customer/bits.tsx` (`TradeTile`, `Steps`, `Panel`, `Action`) that
  My jobs shares. Top to bottom: the search (while open); with offers,
  **Offers** first with a yellow count, one card each, then **Your job**;
  the job card (drawing, trade · ref, title, the price with what it is —
  Your price, Agreed, Total, Visit fee — and when, where and the files as
  icon lines); once chosen, **his card** (initial, where he has got to,
  checked and years, the four steps, Call / Chat / Family / Report as
  square two-tone buttons, Emergency full-width red, never a tile), the
  start code in ink, a new price as a soft-yellow card with Approve over
  Decline; once over, **what to pay** large on soft yellow (his work and
  parts split when there were parts), Photos, Rate, and the guarantee or
  "something not right"; and at the foot one card for ask again, block
  and cancel, where nobody taps them by mistake. On a phone under 360
  wide the price moves under the title and long button labels drop the
  price or the word "Pechkas", so nothing is cut or wrapped mid-figure.
  Every action is the same database call as before.
- **My jobs (`app/jobs.tsx`) is the history, laid out like a ride app's**
  — redesigned at the owner's request in the menu's and home's style. No
  buttons on it but the cards themselves, each opening the job's screen.
  **Happening now**: one white card per open or assigned job — the trade's
  drawing on a cream tile (`artFor()` in `Art.tsx`, shared with Post a
  job), trade · ref, title, the price she will pay; then a grey status
  row read from the job (the screw turning while nobody has offered, a
  yellow disc with the number of offers, his initial once chosen); four
  steps (Chosen, On the way, Arrived, Working) once he is chosen; and a
  yellow pill only when she has something to do (**Choose a technician**,
  **Answer the new price**). **Earlier**: one sheet of rows — drawing,
  title and price on one line (the title gets the width, never cut on a
  320 phone), date · trade · ref, a status chip, and **Rate …** only while
  `can_rate` says she still may. Then the green **Post a new job** card,
  the same as home's. Every word comes from `my_jobs()`; nothing
  estimated.
- **Home shows what is still happening** (`LiveCard` in `app/index.tsx`),
  from `my_jobs()` every 10 s while focused; finished jobs are the recent
  list under the question. Every headline is read from the job's own status
  and step — nothing estimated, no "usually replies in" figure.
- After posting, `post.tsx` dismisses to home and **pushes** the job, so
  Back from it is home, never the empty form.
- **"No thanks" is `decline_offer()`** (migration `…_declining_an_offer`):
  her own job, open, the offer live, behind the same job-row lock as
  `choose_offer()`. The offer becomes `declined`; `on_offer()` tells him
  once ("Your offer was not taken", trade, sector and ref only); and
  `pro_may_see_as()` closes that one job to him — feed, new offer, files,
  notifications — without blocking him from her other jobs. It is logged
  as `offer_declined`. `declining.test.mjs` breaks if that rule goes.
- Not built, waiting on the owner (`docs/OWNER.md`): raising her price
  while waiting (money).

### Doing the job (phase 4)
- **Status and step are separate.** `status` is open → assigned → done |
  stopped | cancelled; while `assigned`, `stage` is chosen → on_way →
  arrived → working. The `job_steps` BEFORE trigger gives every newly
  assigned job its first step and a start code, and clears the step when it
  leaves `assigned`, whichever function moved it.
- **Every step starts from `my_assigned_job()`** (his, assigned, approved,
  row locked) and names the step the screen was showing; a repeated tap
  finds the job moved and changes nothing. Forward only.
- **The start code is the customer's.** It is never in `pro_my_jobs()`, a
  notification or the history. A wrong code is counted and **refused, not
  raised**, so the count survives; `code_tries` wrong locks it and
  `tell_office()` alerts the owner's phone. Only `admin_unlock_code()`
  clears it.
- **Photos are required to start and to finish**, must be the asker's own
  uploads, really in storage, and never reused (`own_uploads()`). The
  customer reads her job's photos through `customer_may_see_file()` in the
  storage policy.
- **A new price is a request.** `ask_change()` needs a reason and a photo;
  only the customer's `decide_change()` changes `agreed_paisa`. Declined,
  the job is `stopped` and `collect_paisa` is `visit_fee()`. One pending at
  a time, and none may be pending to finish.
- **`visit_fee()` is the one place the fee is worked out**, and today
  returns `visit_fee_min_paisa` because there is no measured distance. The
  owner's rule (petrol for the trip, Google Maps distance, Rs 300 to
  Rs 1,000) goes in there when Google Maps is connected. Never guess a
  distance, a mileage or a petrol price.
- `collect_paisa` is fixed when the job ends, so a later settings change
  cannot rewrite what somebody paid. The customer's card shows it.
- A customer may cancel until he arrives; after that it is Decline or the
  office (`cancel_job()` refuses; an open decision in `docs/OWNER.md`).
- **Chat** is text only, between the customer and the chosen technician,
  readable for a day after the job, written while it is on. The office
  reads it in `admin_job_detail()` and the screen says so. A message's words
  never go in a notification — only that one came, at most once a minute.
- **`job_events` is the record**: `on_job_logged` writes posting, every
  status and step, the functions add codes, prices and problems, each with
  who did it. Nobody can write or read it directly.
- `push_words.who` says who reads each message.
- The office number in the app is `src/office.ts`, copied from the
  website's `site.js` — never invent one.

### Money and trust (phase 5)
- **Commission is 10% of the LABOUR**: `agreed_paisa − parts_paisa`, through
  `commission_on()`, rounded down, the same as `commission()` in
  `packages/shared`. Parts need a receipt photo (`job_photos.stage =
  'receipt'`). `parts_paisa` and `commission_paisa` are fixed on the job
  when it is done. A visit fee (`stopped`) carries no commission.
- **The ledger is double-entry and written once.** `ledger_txns` +
  `ledger_entries`; every transaction's lines sum to zero (checked by
  `post_txn()` and by a deferred constraint trigger); UPDATE, DELETE and
  TRUNCATE raise for everyone, the database owner included. No foreign keys:
  the record outlives deleted accounts, so it copies the job ref and the
  technician's name. Every transaction has an `idempotency_key`
  (`commission:<job>`, `settle:<form key>`, `reverse:<txn>`). A mistake is a
  **reversal**, never an edit.
- **No balance is stored.** `pro_owed()` sums his `pro_owes` lines. Accounts:
  `pro_owes`, `commission`, `reserve` (`reserve_bps` of each commission),
  `received`.
- Commission is posted by the `job_done_commission` trigger the moment a
  job becomes `done`, whoever marked it.
- **Credit limit**: `make_offer()` refuses (`field: 'owed'`) while
  `pro_owed() > credit_limit_paisa`. He is told once, when he crosses it.
- **Payments are recorded by the office only** (`admin_settle()`), with a
  method, a reference and the form's own key; more than he owes is refused
  as a typing mistake; concurrent payments for one man are serialised with
  an advisory lock. `pay_to` is whatever the office typed, shown exactly;
  empty means "ask the office" — never an invented account.
- **Ratings**: one each way per job, within `rating_days`. Hidden until both
  have rated or 48 hours pass (`rating_revealed()`). `pro_rating()` returns
  `avg` NULL — shown as "New" — until `rating_min_count`. A technician's
  rating of a customer is seen by the office only. `jobs_done` is a real
  count.
- **Problems** (`problems` table): `report()` for a problem (either side,
  during the job or a day after) or a guarantee claim (customer, done,
  within `guarantee_days`); one open per person, job and kind. Closing needs
  a note.
- **The emergency button** alerts the office FIRST (`emergency()`), then the
  phone sends where it is (`emergency_where()`), never the other way round.
  A second press within a minute is the same emergency. The numbers are in
  `apps/mobile/src/emergency.ts`, confirmed by the owner — never change one
  from memory.

### The stores (phase 6)
- **The privacy policy and delete-account page are on the website**,
  `src/pages/app/` in `zaibprops-code/Pechkas` (noindex, out of the
  sitemap, run that repo's checks before pushing). They, the Data safety
  answers in `docs/store/data-safety.md` and the app must say the same
  thing: a change to what the app collects changes all three.
- **The app shows those pages itself, and never opens a browser for
  them.** Privacy policy, terms, technician agreement and deleting an
  account are `app/legal/[doc].tsx`, open to people not signed in (the
  welcome screen asks them to agree to two). The words are the website's:
  `node scripts/copy-legal.mjs ../Pechkas` reads the website's BUILT
  pages and writes `packages/shared/src/legal-docs.ts`, so the store's link
  and the app cannot disagree. Never edit that file or type legal words in
  a screen; change the website's page, build it, copy, commit both. The
  script refuses an element it does not know rather than dropping it, and
  leaves out only the draft box's "Edit this page at …" note to the owner.
  A link to another of the four opens it in the app (`legalLink()`);
  `legal.test.ts` checks every link goes somewhere real and that the pages
  name screens the app really has. `openLegal()` is the only way in.
- **Legal is a list, then a reader**, the owner's reference app's way: the
  menu's **Legal** row opens **Legal documents** (`app/legal/index.tsx`),
  one card per page with the page's own `title` and `lede` (never typed
  there) and a **Contact Pechkas** card to Help; Settings and Help each
  have one **Legal documents** row instead of a row per page. The reader
  pins **Last updated** (the page's first `meta` line) at the foot, colours
  its headings green, and shows a × that closes every legal page at once
  when more than one is open. **The guarantee button is named in the
  terms** ("tap **It has failed again**"): `legal.test.ts` reads
  `UnderWay.tsx` and fails if the button is renamed without the terms —
  it once was, to "The fault has come back".
- **Permissions are only what is used.** `app.json` blocks storage, media,
  overlay and background-location permissions; the gallery uses the
  system photo picker, which needs none, so `media.ts` asks only for the
  camera. Check the merged list with `npx expo prebuild --platform android
  --no-install` (then delete `android/` and restore `package.json`) before
  adding a library that might bring its own.
- Store builds: `eas.json` takes versions from EAS (`appVersionSource:
  remote`) and `production` auto-increments, so two uploads can never share
  a version code. The owner uploads the `.aab` himself in Play Console.
- Store copy (`docs/store/listing.md`) claims nothing the app does not do and
  no numbers: no ratings, job counts or customers until they are real.
  Screenshots are of the real app with test accounts and no stars.
- Reviewer sign-in uses Supabase test numbers, typed only into Supabase and
  Play Console, never into this repository.

### iPhone (phase 6b)
- **Every iOS permission string says exactly why**, and unused ones are
  removed: `expo-location` is given `false` for the always-on location and
  motion strings, which otherwise ship with a vague default Apple rejects.
  The microphone string is set the same in `expo-audio` and
  `expo-image-picker`, because whichever plugin runs last wins. Check with
  `npx expo prebuild --platform ios --no-install` and read
  `ios/Pechkas/Info.plist` (then delete `ios/` and restore `package.json`).
- `ios.config.usesNonExemptEncryption: false` (HTTPS only), and
  `ios.privacyManifests` declares the required-reason APIs React Native
  uses. A new native library may need its own entry.
- The gallery uses the iOS photo picker, which needs no photo-library
  permission; only the camera is asked for.
- The first iOS build is started by the owner from his own computer, where
  he signs in to Apple; Expo keeps the certificates, the profile, the push
  key and the App Store Connect API key. Apple credentials are never typed
  into this repository or a chat.
- Sold in Pakistan only. App Store answers live in `docs/store/app-store.md`
  and must agree with the Play answers and pechkas.net/app/privacy.

### After launch (phase 7)
- **"Ask again" holds a job for one technician through `pro_may_see()`**,
  nothing else: while `preferred_until > now()` the feed, the offer, the
  files and the notification cannot reach anybody else, and the moment it
  passes the job is everyone's whether or not the clock has run.
  `release_preferred()` (pg_cron, every minute), `release_now()` (the
  customer) and `pass_asked()` (him) only announce it, through
  `release_job()`, which marks the row in the statement that finds it, so
  it is announced once.
- The request lives in `asked_for` and is used by the `job_preferred`
  BEFORE INSERT trigger on her next job in that trade within the hour. It
  is never held for a man who could not take it right now: offline, not
  approved, over the credit limit, or not in that trade and sector. Then it
  goes to everyone at once, and `my_jobs().asked_for` tells the screen the
  difference between "he passed" and "he was never asked".
- **The repeat fee is `commission_rate(customer, pro, job)`:** 7%
  (`repeat_commission_bps`) when the pair has a **done** job, 10% otherwise.
  Stopped and cancelled jobs do not count. A done job never becomes undone,
  so the rate shown in the feed can only stay or fall by the time he
  finishes. `finish_work()` fixes `commission_bps` on the job with the
  commission; `commission_at()` is the same rounding as `commission()` in
  `packages/shared`. The screens take the per-job `commission_bps`, never
  the standard one, for "you keep".
- **The demand report counts rows, nothing else.** "No offer" means no
  offer ever AND (placed by hand, or waited `escalate_minutes`): a job
  cancelled a minute after posting says nothing about supply.
  `sector_asks` is one line per customer, sector and trade, refuses live
  sectors, and promises the customer nothing.
- **Fraud flags are flags only.** `admin_flags()` reads; nothing in phase 7
  suspends, blocks or charges anybody, and must not start to. Every limit
  is a `flag_*` setting — the owner set none of them from data, so they are
  guesses to be tuned by migration. Notes (`flag_notes`) are deleted with
  the account they are about, like everything else. The sentences live in
  `apps/admin/src/Flags.tsx`, not the SQL.
- What the app keeps changed (who a customer asked for, a sector she asked
  about, office notes), so the privacy page and both stores' answers
  changed with it. Keep it that way.

### Settings, blocking and terms (phase 8)
- **What the office may change is the `setting_limits` table, and leaving
  a key out is the lock.** `commission_bps`, `repeat_commission_bps`,
  `credit_limit_paisa`, `reserve_bps` and `guarantee_days` are left out on
  purpose — money, and a promise the store pages and the terms make — and
  the migration deletes them from that table if they ever appear. A new
  setting is locked until a migration gives it a range.
  `admin_set_setting()` checks the range, whole rupees, and the visit fee's
  min ≤ max; `setting_changes` records every change and cannot be edited
  or deleted by anyone.
- **A sector opens only with an approved technician in it**
  (`admin_set_sector()`); closing one leaves posted jobs alone. The website
  and the store listing name the live sectors, so the screen tells the
  owner to say when he changes one.
- **Blocking is in `pro_may_see_as()`**, the one visibility rule, and in
  `job_preferred()`: a blocked man's feed, offers, files, notifications and
  "ask again" all stop together. Only after a job is over (done, stopped,
  or cancelled after he was chosen); during a job it is a problem for the
  office. **He is never told** — that is the safety of it; nothing may
  ever tell him, including a count. The office reads who and why through
  `admin_blocks()`; two blocks are a flag (`flag_blocked`).
- **The app's terms (`/app/terms`) and technician agreement
  (`/app/technician-agreement`)** are on the website, noindex, drafts for a
  lawyer. They state the LOCKED numbers (10%, 7%, Rs 3,000, 30 days) and
  deliberately not the ones the office can change. Changing a locked
  setting by migration changes those pages in the same week. Every legal
  choice is a visible `[DECIDE WITH A LAWYER]`, never a guess.
- **Two promises disagree and are the owner's to settle:** the website's
  guarantee is 15 days (`SITE.guaranteeDays`), the app's is 30. Do not
  quietly change either.

### Which copy is which
- **`NEWEST_MIGRATION` in `apps/mobile/src/version.ts` names the newest
  migration file**, and `npm run version:check` (part of `npm run check`)
  fails if it does not. Add a migration, change that line in the same
  commit. The Me screen compares it with `db_version()` and tells the owner
  in plain words when the database is behind the app — he runs migrations
  by hand, and a skipped one makes whole features quietly do nothing.
- `supabase/checks/1_which_migrations_ran.sql` lists every migration by name
  for the owner to paste into the SQL editor; `version:check` fails if a
  migration is missing from it, so add the line in the same commit.
- `app.config.js` stamps every EAS build with `EAS_BUILD_GIT_COMMIT_HASH`;
  Me shows it. "Something is missing" starts there, not with guessing.

### Secrets
- Nothing secret is ever committed (`.gitignore` blocks keystores). Only
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` may be in the
  app's code, and `GOOGLE_MAPS_API_KEY` in its Android manifest; all three
  are set in Expo's environment variables, not in a file here.
- The Android upload keystore lives in Expo's credentials and in the owner's
  private storage. Never in the repository.

## The look (`apps/mobile/src/theme.ts`)

- **The design rules are `docs/DESIGN.md`. Read it before touching any
  screen.** The same text is the Claude skill
  `.claude/skills/pechkas-design/SKILL.md`, and `npm run design:check`
  (part of `npm run check`) fails if the two differ — change both
  together. Colours by name only (`colour.cream`, `colour.softYellow`,
  `colour.softBrick`, `shadow.card` were added so no screen types a hex
  code); the shared pieces are `Panel` / `Action`
  (`components/Panel.tsx`), `RowCard` / `DuoRow` (`components/Rows.tsx`),
  `EmergencyTiles`, `TradeTile` / `Steps` (`customer/bits.tsx`). Every
  screen now follows the rules: Emergency draws the same `EmergencyTiles`
  as Safety; Notifications is a status card (green when on, soft yellow
  when off) and tick rows; the technician's application and its "received"
  screen are `Panel`s and `DuoRow`s under a ☰ hero; Chat has a white
  messenger header with his initial and a round yellow send button. A
  `Select` in Post a job shows its price **under** the name, never beside
  it — beside it squeezed "Something else, or not sure" into "Somethin /
  g else" at 320.
- **The office panel (`apps/admin`) follows the same rules** (DESIGN.md
  section 12), from the same sources: colours and the card shadow are
  `packages/shared/src/tokens.ts` (the app's `theme.ts` re-exports them;
  `look.ts` turns them into CSS variables for `admin.css`, which may not
  type a hex code — `design:check` fails if it does), the two-tone icons'
  shapes are `packages/shared/src/duo-icons.ts` (the app's `DuoIcon` and
  the panel's `Duo` both draw them), and the panel bundles the app's own
  font files. Its menu is the app's menu — mark, the staff member on a
  green card, one plain list of icon rows, Sign out at the foot — on the
  left, and a drawer behind ☰ under 900 px wide, `inert` while closed.
  Cards and form boxes are `minmax(0, 1fr)` grids: a long drop-down once
  made a job card scroll sideways on a phone.
- The website's colours: green `#0b5148` trust, yellow `#ffc53d` action and
  money, ink, paper, brick for warnings only. Every text pair ≥ 4.5:1.
- **No decoration.** The owner rejected truck-art and ajrak as unprofessional.
  The app is Pakistani in how it works: voice notes in Urdu, landmarks beside
  the pin, load-shedding asked about, parts with a shop receipt, the
  guard at the gate, family told who is coming. The words are formal
  English throughout.
- **Both sides are light, like inDrive** — the owner's decision, replacing the
  original dark technician side. Technician screens sit on the same
  `colour.canvas` with white cards; nothing passes `dark` any more (the
  components still accept it). On a light screen yellow is a background,
  never text: amounts a technician keeps or owes are green or ink.
- **Laid out the way inDrive is — the owner's reference.** No tab bar: the
  ☰ `MenuButton` (`src/components/Menu.tsx`) opens a side menu laid out as
  inDrive's, redesigned at the owner's request — **one plain list, no
  group headings** (he asked for a better design, not categories): the
  Pechkas mark and a close button on top; the person on a green card with
  their initial on a yellow disc and Customer or Technician (tap for
  Settings); then Home or Jobs, My jobs or My account, Notifications,
  Safety, Help, Support, Settings, Legal — each row a **two-tone icon**
  (`DuoIcon.tsx`: ink outline, yellow fill on the part that matters), the
  words and a light chevron, the current screen on soft yellow; at the
  foot **Tell a friend about Pechkas** (the phone's share sheet, words
  that claim only what is true) and the big yellow **Technician mode /
  Customer mode** button (`ModeSwitch pill`: swap icon and one line saying
  what it does), with the version and edition under it. Below the mark and
  the ×, **the menu is one scrolling page**: on a short phone the person,
  the rows and the buttons scroll together, because a fixed foot once hid
  the last four rows behind the buttons at 320 × 640. **It is drawn by
  `MenuHost` at the root (`_layout.tsx`), never in a Modal**: a Modal is
  its own window, and on the owner's Android 9 phone it stopped short of
  the status bar and the button bar, so the dimming did not reach the
  edges. The phone's Back button closes it. Every item goes to a real screen:
  `/notifications` says whether this phone is told and lists only what
  `push_words` really sends to that side (change the two together), and
  Support opens the office on WhatsApp. Customer screens are a light grey
  `colour.canvas` with white rounded cards, bold black headings, yellow as
  the one highlight. **Home is inDrive's home** (the owner's screenshot):
  over the map, the ☰ button, a yellow **"We could not find you — Tap to
  turn on location"** bar while the phone's location is off (a tap asks;
  once refused, it opens the phone's settings), a pin in the middle with
  **"Set the job's address ›"** (opens the post screen straight on the
  pin, starting where the map was), and the locate button at the map's
  lower right. Then the sheet, redesigned at the owner's request in the
  menu's style: a greeting by the phone's clock and the person's first name
  over **"What needs fixing?"**; any job still happening; one big tile (AC),
  one wide (Electrician), two small (Plumber, UPS) on warm cream, the big
  two with a small arrow in a white disc; **every other trade in a 4 × 2
  grid** with All trades last — never a sideways row, which cut "Ca…" off
  the edge — whose gaps close on a narrow phone so every name stays whole;
  the question **"What needs fixing & for how much?"** as the one green
  call to action; **Recent jobs** with See all and a status label; and
  "Describe it your way" and "Why Pechkas" with two-tone icons
  (`DuoIcon.tsx`) on soft yellow tiles. No discount or count on any
  tile. The drawings are `src/components/Art.tsx` — objects, never people,
  over a yellow sweep; every trade in `public.trades` has one.
- **The technician side is inDrive's driver side** (`src/pro/Work.tsx`):
  the ☰ menu, the **Online / Offline switch** in the middle of the top bar
  and what he owes on the right (tap: his account); under it a greeting by
  the phone's clock and his first name over the screen's heading (**My
  jobs** while he has one, otherwise **Jobs in your areas**, or **Ready for
  work?** offline); offline, one green card with a big yellow **Go
  online**; online, the request cards — the customer's initial on a yellow
  disc, first name, when, how long ago (`created_at`), the price large,
  the job and the sector, tags for "Asked for you", his live offer and the
  media, and a yellow **Make an offer** pill until he has one — with "No
  new jobs yet" as a card of its own. On a job, **Call, Chat, Map and
  Report are a row of square two-tone buttons** (`Action` in
  `OnTheJob.tsx`, the full name for screen readers) and **Emergency stays
  a full-width red button**, never one tile among four. My account heads
  each card with a two-tone icon. A tap on a request opens the job in a
  **sheet from the bottom** with
  **"Accept for Rs …"**, steps to ask for more (+Rs 200 / 500 / 1,000 above
  her price, within `max_counter_bps`: plain steps, never a price we
  suggest), the − / + stepper, how soon, and the note. The switch's colours
  snap; only the sheet moves, by transform. Every rule in the offer is the
  database's, unchanged.
- **Maps are `src/components/Map.tsx`, and only there.** Android draws
  Google's map, which stops the app the moment it opens without a key, so
  `mapsReady()` is false unless the build has `GOOGLE_MAPS_API_KEY` (read in
  `app.config.js`, which also adds the key to Android through the
  `react-native-maps` plugin). **The map's box is always there** — the
  owner's request, so nothing changes shape when the key arrives: without
  the key `MapBox` draws a street plan (`MapDrawing.tsx`: Islamabad-style
  grid and green belts, no names, never "you are here") with the pin on it.
  Home keeps its map layout, locate button and yellow bar (finding the phone
  needs no key); "Set the job's address" goes to the Address card instead of
  the pin picker, which needs a real map to move; Post a job and the
  technician's job show the box once there is a spot, and his tap still
  opens directions in Google Maps. Never render `MapView` on Android
  without the key. The iPhone uses Apple's maps and needs no key.
  `Map.web.tsx` is the browser's stand-in, the same drawing — never shipped. Location is
  asked for only when a button is pressed (`askPosition()`); the home map
  uses `knownPosition()`, which never asks. The pin a customer places is
  the same `lat`/`lng` the job always had, now required (see "The address
  is map first"). The
  Maps key is inside the app on purpose, as every Android map key is,
  protected by its restriction to `net.pechkas.app` and the signing SHA-1.
  The visit fee does not use distance yet: that is money, and waits on the
  owner (`docs/OWNER.md`).
- **Every screen is built from the same few pieces in `src/components/ui.tsx`**
  so they look like one app: `Screen` with a `hero` (a round back or menu
  button, then a big bold title on the screen's own background), `useArrive()` for the gentle
  slide-in, `Button` with an optional icon (an arrow always after the
  words), `Field` (green outline while typing, snapped), `ListGroup` and
  `ListRow` for settings-style lists, `Avatar` for a first letter in a
  circle. A new screen uses them rather than inventing its own header.
  **The first two screens are inDrive's, the owner's reference.** The
  welcome screen (`app/start.tsx`) is white: the name at the top, three
  pages to swipe (a `WelcomeArt` drawing — objects, never people — a
  headline and one line each), dots, then **Continue with phone** (black)
  and **Continue with email** (light grey) and the terms line. Every page
  says only what is true today: no numbers, no ratings, and the pages never
  turn by themselves. The number screen (`sign-in.tsx`) is one big
  `PhoneBox` with the flag and **+92** fixed in front — a label, not a
  menu, since only Pakistani numbers work — and **Next** at the foot. The
  welcome screen's number box is the same `PhoneBox`. No passkey: it needs
  its own set-up and is not well supported on the phones customers have.
- **The typeface is Plus Jakarta Sans** (`font` in `theme.ts`, loaded in
  `_layout.tsx`): the owner found the first pair, Bricolage Grotesque and
  IBM Plex Sans, not professional enough for an app. `font.brand` keeps
  Bricolage only for the word "Pechkas" beside the mark — the logo's own
  lettering, as BRAND.md has it — and `font.mono` stays IBM Plex Mono for
  details and codes. Every screen takes its font from those names; never
  write a family name in a screen.
- **Only `transform` moves.** `Press` sinks on tap and buzzes; it never eases
  a colour. A control whose text colour changes between states eases no
  colour at all — halfway through, text and background are the same grey.
- **The screw is the app's one moving picture**, the owner's request. Three
  places: `LaunchScrew` on opening (it draws the phone's splash again, hides
  the real one, turns the slot until the gate has decided, then the head
  seats and the green lifts off — loading is never made longer to show it);
  `ScrewSpinner` wherever something is working (every `Button busy`,
  `Loading`, a job waiting for offers) — there is no `ActivityIndicator`
  any more; and the welcome screen's one turn in. Rules: `Mark turn={…}`
  turns the **slot only** — the rim is round, so its lit side stays with the
  light, and spinning the whole drawing would swing the highlight round,
  which no screw does; it rests only on **whole turns**, because after half
  a turn the slot's lit wall is on the dark side; and clockwise, because
  that is the way a screw goes in. Native driver, so it keeps turning while
  JavaScript is busy loading.
- One line-icon set (`Icon.tsx`), no emoji. No stock photos of strangers.
- **The logo is the website's machined screw head** (the owner's choice,
  October 2026): bevel lit from the upper left, a slot with a floor and a
  bronze wall, one glint. Its shapes live in ONE place, `src/lib/mark.js`
  in `zaibprops-code/Pechkas`; `node scripts/copy-mark.mjs ../Pechkas`
  copies them to `packages/shared/src/mark-paths.ts`, which `Mark.tsx`,
  the admin panel and `scripts/make-icons.mjs` all read. Nobody types a
  path. Below `machinedFromPx` (28) it is drawn flat — same outline, no
  mush — and so are the themed, notification and favicon icons. Never edit
  `apps/mobile/assets/` or `docs/store/graphics/` by hand; run
  `node scripts/make-icons.mjs`, then `node scripts/make-store.mjs`.
- No button may do nothing, and nothing says "coming soon": the stores reject
  both. The `/soon` screen was deleted before the first store build; a
  feature that is not built has no button.
- Every tap target is at least 44 × 44.
- **Post a job is one page in white cards** (`app/post.tsx`) — the owner
  chose that over a page per step. Redesigned in the menu's and home's
  style at his request: a one-line subtitle under the title; every card
  headed by a two-tone icon on a soft yellow tile (`Card icon=…`); the
  chosen trade's home-tile drawing inside "Kind of work"; Voice, Video and
  Photo on warm cream with two-tone icons in white discs; "Your price" as
  the one soft-yellow card, its stepper in a white pill; an arrow on
  **Post job**. On a narrow phone the stepper and the tiles' limits shrink
  a little and sector names never break at their hyphen. The job is two drop-downs (kind of work,
  then which job with its price) opening a `Sheet` (`src/components/Sheet.tsx`,
  shared with the technician's job sheet); "What is wrong?" is one row of
  tiles (Voice, Video, Photo — a tile goes once it is used up, so none does
  nothing) and one text box; the address is map first (see Jobs), with
  House or flat and Street side by side under the pin, and the
  landmark and gate note behind a link until wanted or filled; the
  footer says **Post job · Rs …**. A refusal for a box the page does not
  draw is shown in full, never as "fix what is marked above". **A refusal
  scrolls the page up to the first card that needs fixing** (`CARD_OF`,
  `CARDS`, `Jump` and `useScreenScroll()` in `ui.tsx`), and each red line
  goes the moment its box is answered (`ANSWERS`): somebody pressing Post
  at the foot of a long page must never be left there looking at a
  sentence about boxes they cannot see. A new box on the form needs its
  field in `CARD_OF` and `ANSWERS`.
- **Trouble is said at the top of the screen, never only at the foot.**
  `Notice` (ui.tsx) shows its message as a card sliding down over the
  top of whatever screen is open (`src/components/Toast.tsx`, `ToastHost`
  in `_layout.tsx`) — the owner chose a video, it was refused, and the box
  saying so was at the bottom of a long page he was not looking at.
  **Every message has a kind** (`src/message.ts`): error (brick), warning
  — something the person must do — (yellow), success and info (green);
  a short title, a sentence, at most one button that puts it right, and
  the phone's own words behind **Show details**, never in the sentence
  (the owner was once shown "Call to function
  'ExponentImagePicker.launchCameraAsync' has been rejected" as the whole
  message). A plain string still works: it is an error, and a trailing
  "(Details: …)" is lifted into the details by `asMessage()`. Something
  the phone has switched off is `switchedOff()` — a warning with **Open
  settings**, never "try again", which would be refused again. Use
  `done()` for a short success after an action that changes nothing on
  screen by itself. Errors and warnings stay until × is tapped, the next
  one replaces them, the screen clears its message, or the person leaves
  the screen; a success or info goes after 5 s. Inside a `Sheet` (a Modal, drawn above everything) pass
  `inline`, or the banner would be underneath. A refusal about one box
  still goes beside that box as well. To show the same sentence again after
  it was closed, give the `Notice` a new `key`.
- **Trouble has its own screens, like every big app** (`Trouble.tsx`):
  *No internet connection*, *Pechkas is not answering*, *Something went
  wrong* (the crash screen, `ErrorBoundary` in `app/_layout.tsx`) and *This
  page is not in the app* (`app/+not-found.tsx`). Each says what happened,
  what to do, and has a button that does it; offline and not answering
  also offer **Call the office**, because a call needs no internet.
  `src/net.ts` asks the phone through `expo-network` (its Wi-Fi permission
  is blocked in app.json; only the network-state one is used), and only a
  phone that is SURE it is offline counts as offline. The two "no answer"
  kinds follow the phone live, and offline retries the moment it is back.
  **No answer is never "signed out"**: `AccountProvider` sets `trouble`
  when `getSession()` fails with a retryable error or `my_account()` gets
  no answer, keeps an account it already knew, and the Gate moves nobody
  while `trouble` is set; `LaunchTrouble` covers the screen instead. It
  says so after 4 s if the phone is offline and 10 s otherwise, rather
  than waiting out Supabase's half-minute of retries. A screen whose first
  load fails shows the card version under its own header (My jobs, a job,
  the technician's list); once it has something on screen, a failed
  refresh is only the top banner.
- **The office has two switches every phone obeys** (migration
  `…_update_and_pause`, `src/control.tsx`, admin **Settings → App
  switches**): *paused*, with a short note, and *min_edition*, below which
  a copy must update. `public.app_status()` is the only way in — open to
  `anon`, because the app asks before anybody signs in — and returns
  exactly three things. The app asks on opening (the launch cover waits up
  to 3 s for it), on coming back to the front, and every 30 s while a
  switch is on, so lifting it lets everybody back in by itself. **Being
  unable to ask never stops anybody**: no answer, or a database without the
  function, counts as both off. `OfficeSwitches` in `_layout.tsx` draws
  `Trouble` kind `update` or `paused` over everything **except the
  `emergency` and `safety` screens**, and both offer **Emergency numbers**
  (the safety page is in `OPEN`, so it works signed out). An office login
  sees through a pause, never through "please update". **`APP_EDITION`
  in `packages/shared`** is this code's edition; raise it by one in the
  same commit as any change older copies would get wrong, and tell the
  owner to ask for the update **only once that edition is in the stores**
  — asking sooner stops everybody with an update they cannot get. The
  pause note refuses phone numbers and CNICs (it is on every phone), and
  every move is in `setting_changes`. `control.test.mjs` breaks if any of
  that goes.
- **Nothing is read through Android's bars.** The app is drawn edge to
  edge, under a see-through status bar and button bar. Every screen that
  scrolls draws `SystemBars` (`ui.tsx`, a strip of the screen's own colour
  over each bar, touches pass through) and ends its scrolling with
  `insets.bottom` of room (`useScrollEnd()`); `Screen` does both itself.
  Without them the privacy policy's last line sat behind the Back and Home
  buttons and could never be scrolled clear, and every long page ran under
  the clock. A fixed top bar (chat, the technician's bar) covers the clock
  on its own; home's map may show under the clock but its sheet may not, so
  a strip follows the sheet's edge up (transform only). Check any new
  screen with Android's bars in place, at 320 wide too.
