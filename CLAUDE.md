# Working on the Pechkas app

An open-bidding app for home repairs in Islamabad: a customer posts a job and
names a price, checked technicians accept or counter, the customer picks one.
The full brief is `APP_BUILD_PROMPT.md` in `zaibprops-code/Pechkas`; the
approved design is the canvas "Pechkas App Look"
(https://claude.ai/artifact/42Sb6DBfcN9pP1kLnvBqBr). Where this file and the
brief disagree, ask.

## How Pechkas must work (the owner's standing rule, 13 November 2026)

Apply this to every decision, every design and every review of an old one.

- The app runs by its own logic and rules. The aim is that everyone is
  treated fairly and kept safe without a person deciding each case.
- The owner cannot be present anywhere. He cannot travel to watch a
  technician work, and he has no homes of friends or family to use.
- Keep the office out of routine steps too. A person is needed only for
  exceptions: a safety report, a dispute, an appeal.
- Whenever a design needs the owner or the office to do something, first
  look for a rule, a check in the app, the customer's confirmation or
  another technician's check that can do it instead. If a human step truly
  cannot be avoided, say so and explain why.
- Never promise on the website or in the app something the app cannot
  actually do.
- No calls. The owner cannot take or attend phone or video calls either,
  and no design may depend on a call with him. An exception he handles
  reaches him as a written item in the office panel, which he answers in
  his own time.
- **Everything between a person and the office happens inside the app**
  (the owner's rule, 25 November 2026). No call and no WhatsApp, either
  way: people write to the office in the app, and the office's answers,
  decisions and replies reach them only in the app, with a notification
  that says only that something came. No screen, refusal, notification
  or legal page may tell anybody to call or WhatsApp the office, or
  promise that the office will call or WhatsApp them. Customers and
  technicians may still call each other about a job, and anybody may
  call the emergency services; neither is the office.

## The app is the product; the website is marketing (the owner, 16 November 2026)

- **Building the app is the only purpose.** The website
  (`zaibprops-code/Pechkas`) was built first, but from now on it is for
  marketing only: it tells people about Pechkas and sends them to the app.
- **Never follow the website.** Do not take a rule, price, flow, screen,
  wording or decision from it and treat it as how the app must work. Decide
  every app question on its own merits, with the owner. Where the two
  disagree, the app is right; the website is changed to match later, because
  it must still never promise what the app does not do.
- **Do not build on the website** (its booking page, job book, technician
  pages, new features) and do not plan a phase around it, unless the owner
  asks for that work by name. Website-only questions are marketing, not
  launch blockers for the app.
- Some things still physically live in the website's repository: the price
  list `job_types` was seeded from, the four legal pages
  (`copy-legal.mjs`), the logo's shapes (`copy-mark.mjs`) and the office
  number. That is where the files are, not who decides: change them for the
  app's sake. Whether any of them should move into this repository is the
  owner's call; ask before moving one.

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
- Keep `docs/OWNER.md` current. **Business decisions live in
  `docs/DECISIONS.md`**: open ones numbered D1…, decided ones A1…. When the
  owner decides one, build it, then move it to the decided list with the
  date in the same commit. Never record a decision he has not made.
- **Every decided or built decision also updates the decision map and the
  briefing, in the same round, without being asked** (the owner's standing
  request, 22 November 2026). The map is the artifact
  https://claude.ai/artifact/YBZXKEJ1QUo39BNK4k8Ha4: read it with the
  Artifact tool, mark the D… as decided (its `Object.assign(D.Dxx, {status:
  'building', decided: […], today: …})`), its track step, a new "Already
  decided" group for the A… rows, and the foot's "Updated" line; check the
  script parses; publish to the same URL. The briefing is
  `docs/BRIEFING.md` (its date, the decided list, the open list, the money
  table and launch steps as they change), and its PDF
  `docs/Pechkas-briefing.pdf`, rebuilt with `node scripts/briefing-pdf.mjs`
  and sent to him. Then tell him both are done.

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
  question is `app/choose.tsx` (two cards side by side, a house and a toolbox,
  picked with a tick and confirmed by a button naming the choice, on the
  sign-in screen with no back button), then `welcome.tsx` takes
  the name with the choice as `as`. Changing it later is only
  `switch_mode()` (`src/mode.ts`, `ModeSwitch` at the foot of the menu), never `start_as()`, which refuses a different mode. Technician
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
- **Codes are sent by Supabase, through Twilio (SMS, A107) and Resend
  (email, A108)**, both connected in the Supabase dashboard, never in this
  repository. Every phone code goes through `sendPhoneCode()` in
  `src/supabase.ts`, with `PHONE_CODE_CHANNEL` (`'sms'`): WhatsApp, through
  the same Twilio provider, is switched on there and only once Meta has
  approved Pechkas' sender and template, with "Send by SMS instead"
  beside it. A phone *change* (`updateUser({ phone })`) can only be SMS.
  The sign-in email is `supabase/email/sign-in-code.html`, pasted into
  Supabase's Magic Link and Confirm signup templates; it carries only the
  code and the link, nothing the person typed. No CAPTCHA: it would need a
  web view on the sign-in screens and a new build; Twilio's Pakistan-only
  geo permission, pumping protection and Supabase's rate limits stand in.
- Every sign-in failure shows `explainAuthError()` plus Supabase's own
  words and the project's host. Never go back to "check your signal" for
  everything: it hid a Supabase refusal for a whole afternoon.
- The office signs in with **email and password**, one login each, made
  by the owner in Supabase; `make_owner()` is granted to nobody and run by
  hand in the SQL editor.
- Being signed in is never enough for the office. Every `admin_*` function
  asks `is_staff()` again, so switching someone off works on their next tap.
- **Approval is by rule (D37), never by the office**: see "A new
  technician's first jobs" below. `pro_checks` (identity, trial job, rules,
  recorded by the office) is history from before D37 and approves nobody;
  its form is gone from the panel.
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
- **Price guidance is the usual Pechkas price list, never a guess.**
  `job_types` was first seeded from `src/data/services.js` in the website
  repository; it is the app's own list now (see "The app is the product").
  A job with no usual price says "Price after a look" rather than a number.
  **The screens never say "website"** (the owner's decision): the figure is
  "Usual price" / "the usual Pechkas price". Where the prices come from is
  for this file, not for customers.
  The lowest offer is the `min_offer_paisa` setting (Rs 1,000, first taken
  from the website's inspection fee). The app's prices change only by a
  migration to `job_types` when the owner decides; the website follows the
  app, never the other way round.
- **Anywhere in Islamabad, nowhere else yet** (the owner, 25 November
  2026; migration `…_fast_posting`). `sectors.city` says which city a place
  is in; `post_job()` refuses only a place outside Islamabad ("Pechkas works
  in Islamabad only, for now", field `sector`). **Bahria Town and DHA count
  as Islamabad** (the owner's decision). Rawalpindi's places stay on the list
  so `ask_for_sector()` records who asked ("Tell me when you come to
  Rawalpindi"). `live` is no longer a posting rule; older copies still offer
  only the live sectors, a true subset. Which technicians see a job is still
  their sectors until Part 2 (distance) is built.
- **The lowest price is a share of the usual price** (the owner: 60%,
  changeable by the office). `price_floor(job type)` is the one rule:
  `min_price_bps` (6000, `setting_limits` 3000–10000) of the usual price,
  rounded UP to a whole Rs 50, never below `min_offer_paisa`; "Something
  else" keeps `min_offer_paisa`. `post_job()` refuses below it (field
  `offer`); `app_lists()` gives every job type its `floor_paisa`, so the
  phone's − stops at the same figure. Tests: `fastposting.test.mjs`.
- **Post a job is three steps** (the owner's design, 25 November 2026,
  replacing the one long page: "people don't like filling large forms"),
  `app/post.tsx`, one thing per screen and one black button at the foot;
  the step is kept in the draft (`step`), so a form left halfway opens
  there; Back and the phone's Back go one step back; a refusal takes her to
  its step (`STEP_OF`) with the red line beside its box.
  1. **Show us the problem**: `VoiceTile big` (the big record button), Photo
     and Video as big tiles, big thumbnails with ✕, typing behind **Rather
     type it?** (with Good to know's chips). Next stays pale until there is
     a voice note, photo, video or 10 letters — the database's own rule.
  2. **Where** (`src/post/Where.tsx`): the map fills the screen
     (`MapStage` in Map.tsx), the pin stays in the middle and lifts while
     the map moves; when it stops, `readPlace()` and `sectorIn()` /
     `streetIn()` read the street and sector, said big, then **Confirm this
     spot** — or, outside Islamabad, "Pechkas works in Islamabad only, for
     now" with no way on. Then the house card: **House or flat** (the only
     typing), Street (filled, correctable), the sector as chips only when
     the map could not read it, **Save as** Home / Office / Other, landmark
     and gate note behind a link. Her last address opens under the pin with
     **Edit** and **Next**. The search box shows her saved places first;
     typed words go to the phone's own map service (`geocodeAsync`) — no
     paid search. A build without the Google key cannot move a map: it
     finds her with **Use my location**. Saved addresses and the last one
     live **on the phone only** (`src/post/places.ts`, four at most);
     **signing out forgets them** and the draft (`account.tsx`). The privacy
     page says the pin, and any words typed in the search, go to the
     phone's map service.
  3. **Your price**: the stepper starts at the usual price, Rs 50 a tap;
     − stops at the floor ("Rs 1,200 is the lowest for this job"); a bar
     shows Lowest and Usual; `PriceRangeCard` under it once real jobs give a
     range; one line "Pay him after the work · Visit fee Rs … only if you
     say no" opens how paying works (`VisitFeeNote` there); then three
     lines — **As soon as possible** (no day to pick; after the last window
     is 9pm it says tomorrow morning), what she showed, where —
     the last two open their step and come straight back. **Post job · Rs …**.
- **Every job is as soon as possible; Google's minutes say when he is due** (Part 2c, below)
  (the owner, 25 November 2026: "a fast service app, not a delayed one").
  The app no longer asks for a day: it posts today while a window can
  still start, tomorrow after that, and `NoOffers` no longer offers
  **Choose another day**. The history of the rule below still holds for
  the database, which accepts a day from older copies.
- *(Earlier:)* **The customer chooses the day; the technician says when he will come**
  (migration `…_offer_says_when`, the owner's decision). No "as soon as
  possible" and no time for the customer to pick: a home repair is not a
  ride — nobody waits round the corner — and she does not know the
  technicians' days, so a time she chose often got no offers. Post a job
  asks only for **the day**: today (while a window is still open — the last
  starts at 8pm), tomorrow, or a day of the coming week (`DAYS_AHEAD`).
  **Every offer on such a job names the two hours he will arrive in**
  (`offers.arrive_from`, one of `WINDOWS` 8–10am … 8–10pm, never one that
  has started; `make_offer(…, p_arrive_from)` refuses with `field: 'arrive'`
  otherwise), and the offer card says "Arrives Sat 31 Oct, 2–4pm". **When
  she chooses, the `offer_time_to_job` trigger copies his window to the
  job's `when_from`**, so every screen and the office show it from then on.
  Everything is on **Pakistan's clock** (`pkNow()`, `Asia/Karachi`), never
  the phone's. The day is `when_date`; `when_kind` is today / tomorrow /
  later (or `now` from older copies). **Every screen says it with
  `whenLabel()`**, notifications with `when_text()`, in the same words. A
  job leaves `pro_feed()` the day after its day. Older copies still post
  and offer the old ways (now with minutes; a time or part of the day the
  customer chose, which then needs no time in the offer); the technician
  side of an older copy cannot offer on a day-only job, so `APP_EDITION`
  became 3; it is 4 since `…_checks_and_guarantee`, because an older copy
  cannot show "Is it working?" (its jobs close by the clock after 24 hours). (`…_days_profiles_again` briefly let the customer pick the
  window; its rules are still accepted from those copies.)
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

### Jobs near him, the waiting screen, the automatic choice (Part 2a, migration `…_jobs_near_him`)
- **The owner's decisions A114–A115 (25 November 2026).** A technician
  **needs location to be online**: Work.tsx explains once (`WhereCard`),
  then the phone's own question; `pro_here()` sends where he is when he goes
  online and every 3 minutes while Jobs is open (`WHERE_EVERY`), never in
  the background; `pro_set_online(true)` refuses without a position from the
  last 10 minutes (field `location`). If the phone stops giving it, he is
  taken offline at once; jobs he has go on. Only his latest position is kept
  (`pro_positions`), deleted by `forget_positions()` after twice
  `position_fresh_minutes`. His **home area** (`set_home_area()`, "Make where
  I am now my home area" under Go online) stands in when his position is
  older than `position_fresh_minutes`. Customers never see his home area;
  since A117 a waiting customer nearby sees an unnamed dot, rounded to
  about 100 m (`job_search().near`, below).
- **`pro_may_see_as()` is still the one rule**, with "in one of his sectors"
  replaced by `within_reach(job, pro)`: the job's pin within `reach_at(job,
  now)` of `pro_point(pro)` — `search_start_m` (5 km) at announcement,
  growing evenly to `search_full_m` (40 km: all of Islamabad) over
  `search_full_minutes` (8), after which every technician in the trade may
  see it. No pin, or no position and no home area: his sectors, as before.
  `widen_reach()` (pg_cron, every minute) tells the online technicians the
  growing reach has just come to, once each (`push_log` is who was told).
  The four numbers are the office's (setting_limits). Older tests set
  `online` directly; going online properly is `nearhim.test.mjs`.
- He sees **"About 3 km away"** on each job (`pro_distances()`: a straight
  line, rounded, never a route or a time). Opening a job is
  `pro_saw_job()`; she sees **how many technicians have looked and their
  first letters**, never a name, face or place (`job_search()`).
- **Her waiting screen** (since A117 `src/customer/Waiting.tsx`; before it `Search.tsx`, on the job's screen
  while open): her map with soft waves of colour and a soft area drawn to
  the share of the search done (not to scale; the chip says the real km),
  the countdown to all of Islamabad with the bar emptying, who has looked,
  "You don't have to wait here" once it has reached everyone, **Still
  looking?** once, and the **automatic choice**: `set_auto_choose(job, on)`,
  off by default; while on, the first live offer AT HER PRICE is chosen by
  `choose_offer()` itself, as her, from the `offers_auto_choose` trigger
  (`auto_choose_offer()`), so every rule it keeps still applies; switched on
  with such an offer waiting, that one is chosen. Waves move by transform
  only and carry no words.
- `APP_EDITION` is 9: an older copy cannot go online (it sends no position).
  Tests: `nearhim.test.mjs`.

### Minutes from Google Maps, and his route (Part 2b, migration `…_google_minutes`)
- **He never types how long he will take** (A115). When he makes or renews
  an offer, `offer_where()` (BEFORE trigger) puts where his phone is (a
  position from the last 10 minutes, never his home area) and the straight
  line to her pin on the offer, and `ask_route()` asks Google's Routes
  service (`computeRoutes`, DRIVE, TRAFFIC_AWARE) through `pg_net`;
  `collect_routes()` (pg_cron every minute, and before every read) puts the
  answer on the offer (`eta_seconds`, `route_m`). Renewing in place (the
  insert that becomes an update) asks again only if he has moved 300 m or
  the minutes are 30 minutes old.
- **The key is Supabase's**: Vault secret `google_routes_key`, read only by
  `routes_key()`, sent only in the request header. The app never has it.
  **Without it nothing is asked** and every screen shows only the straight
  line ("About 2 km away") — never made-up minutes. A failed answer changes
  nothing.
- Her offers (`offer_extras(job)`, her own job only): minutes and road km,
  or the straight line; nearest first; never his position.
- Choosing keeps his minutes on the job (`chosen_eta_seconds`,
  `chosen_distance_m`, trigger `offers_chosen_eta`): Part 2c measures
  lateness from them.
- **While he is on his way, and only then** (stage `on_way`),
  `job_live(job)` gives her his position (from the last 3 minutes), the road
  as Google's polyline and fresh minutes, asked at most every
  `route_every_seconds` (120, office setting 60–900). Work.tsx sends his
  position every 15 s while a job of his is on the way and the screen is
  open. `src/customer/Live.tsx` (`OnHisWay`) draws it: her pin, his disc,
  the road, "4 min away · 1.0 km by road · from Google Maps". Before he
  sets off and once he has arrived she sees nothing of where he is.
- `supabase/local/bootstrap.sql` stands in for `net._http_response` and
  `vault.decrypted_secrets`; tests write Google's answers. Tests:
  `googleminutes.test.mjs`. The privacy page, technician agreement and
  data-safety answers say all of this; change them together.

### When he is due, and late (Part 2c, migration `…_late_from_minutes`)
- **He names no time** (A116). An offer on an as-soon-as-possible job sends
  no window; `make_offer()` still accepts one from an older copy, and that
  job then keeps every old window rule (30 minutes into it is late, 30
  minutes after it ends a possible no-show). The offer sheet shows one line
  (`dueNote`) instead of the window chips.
- **`due_at` is fixed when she chooses him** (`fix_due()`, BEFORE trigger
  `jobs_due`, named to run after `job_steps`): her choice (`assigned_at`, or
  7am of the job's day if that is later) plus `chosen_eta_seconds`, or
  `due_fallback_minutes` (60, office 30–180) when Google gave none — never
  called Google's on a screen (`due_by_google`). A Google answer within five
  minutes of the choice replaces the fallback (`offers_chosen_eta` now also
  fires on `eta_seconds`). Going back to everyone clears `due_at` and the
  minutes of the man who left.
- **`due_of()`, `late_from()`, `no_show_from()`, `eta_latest()` are the one
  rule**, window or due time alike; `cancel_kind_of(at, job, arrived,
  stage, chosen)` is `cancel_kind()` for any job (a due-time job: no-show,
  his lateness, then hers only at the door or after an On my way tapped
  within 3 hours of his time — before he sets off it is normal). Late is
  `late_grace_minutes` (15, locked: the terms say it) after he was due; a
  possible no-show `no_show_minutes` (60, office 30–180; D40) after. Every
  function that read `window_start()` for lateness now asks these —
  `my_jobs`, `pro_my_jobs` (both give `due_at`, `late_from`,
  `due_by_google`), `record_cancellation`, `customer_find_another`,
  `no_show_clock`, `record_late_arrival`, `pro_running_late`,
  `pro_cannot_get_in`. `withdraw_kind()` and `not_home_from()` needed no
  change: with no window they already go by the step.
- **Jobs run 7am to 10pm** (`day_opens_hour`, `day_closes_hour`, locked;
  `DAY_OPENS_HOUR`, `LAST_POST_HOUR`, `asapDay()` in `packages/shared`). A
  job is for today until 9pm (`last_post_hour()`), then tomorrow; a job
  nobody took closes at 10pm; `reopen_job()` moves to tomorrow from 9pm.
- Screens: her job card says "Due by 3:40pm, from Google Maps" (`dueText`),
  `LateCard` names his due time; his job says `dueBy` / `dueByRule`. The
  terms, technician agreement, privacy page and Help say the same; change
  them together. Tests: `latefrom.test.mjs`.

### The screens exactly as the approved mocks (A117, migration `…_as_the_mocks`)
- **The owner's words: "build exactly as those approved mocks pages".**
  The mocks are sheets 1–3 of 25 November 2026 (Post a job; waiting,
  choosing and him arriving; the technician). Compare a change to them.
- **Waiting** (`src/customer/Waiting.tsx`, `WaitingView`): the map fills
  the top (`MapBox dots`), waves from her home, "× Cancel job", the chip;
  "N technicians near you are looking" with first-letter discs
  (`near_count`, `near_letters`; once all of Islamabad, the ones who looked);
  a sheet: "Finding a technician" and the countdown to all of Islamabad,
  then "Reaching more technicians" and a second countdown to
  `nudge_at`; her price with − and + through the database's steps
  (+200, +500, +1,000), "Usual price", "N raises left", **Raise my
  price** (`raise_price()`); the automatic choice. "Still looking?" at the
  first countdown's end and "No offer yet. You don't have to wait here."
  at the second, each once (`Ask`); `CancelSheet` (the owner's design, 27
  November 2026): the job's picture and name under "Cancel this job?",
  "Tell us why" over one card of five text rows with a round selector and
  no icons (fixed_myself, someone_else, other + "It took too long" /
  "Price too high", and "Something else", which opens a box for her own
  words, sent as the reason: 200 letters, no CNIC, as `cancel_job()`
  checks), a red **Confirm** and a soft **Keep looking**; "cancel" is said
  once, and no "Nothing is charged" line (the owner's no). On a phone under
  720 tall the rows and gaps shrink so both buttons stay in view. Choose.tsx
  uses the same sheet. An offer drops in from the top (`OfferBanner`, See).
- **Choose a technician** (`Choose.tsx`, `/job/<id>?view=choose`): short
  cards, nearest first, the price and minutes big, his initial, name,
  rating or New, jobs, trade and years, **No thanks** / **Choose Bilal**
  side by side (no confirm step), the darker part shrinking as the offer
  runs out; his name opens `ProProfile`; parts, the door photo, a checked
  first job and his note only when they apply.
- **Him coming** (`Coming.tsx`, chosen / on_way / arrived): the map with
  his disc and Google's road while `job_live()` has him, a round back
  button; a sheet with his initial, "Bilal is on his way", "5 min away"
  (or "Due by 3:40pm" without live minutes), "1.3 km · arrives about
  3:40pm", Call / Chat / Family; then `JobCard coming` (UnderWay without
  its own header: steps, Report, Emergency, the start code, everything
  else). At the door: "He has arrived", his disc at her home.
- **Technicians on her map** (`job_search().near`): online, approved, a
  position from the last 10 minutes, `pro_may_see_as()` for her open job;
  rounded to 3 decimals (about 100 m), 30 at most, never a name or id
  (`mocks.test.mjs`). The owner's choice, knowing the privacy cost; the
  privacy page, agreement and store answers say it.
- **Minutes in his list** (`pro_nearby()`, `feed_routes`): the straight
  line for every job he may see, Google's minutes once answered; asked
  again only when he moves 300 m or `feed_route_minutes` (10, office
  5–60) pass, five asks at most per read, never without the key, never
  from his home area. `forget_feed_routes()` hourly. "Around F‑11 ·
  within 5 km" under Jobs near you is his phone's own reading of the
  sector (`readPlace`, `sectorIn`).
- `DrawnMarks` (`components/MapMarks.tsx`) puts dots, his disc and the road
  on the drawn plan where a real map would, for builds without the key
  and the browser.

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
- **The office is no longer told about jobs without offers** (the owner's
  choice, `…_when_nobody_offers`: the customer is told instead, above).
  `alert_needs_you()` still exists and works if it is ever scheduled again
  — when it ran, it told the office once per job when it had waited
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
- **Settings (`app/me.tsx`) is the person's own page** (the owner's design,
  25 November 2026, after many rounds): the side's own coloured top
  (yellow customer, green technician, `Glow`), the back button and
  "Settings", a big initial in a solid white ring (a pencil on it lets a
  customer correct her first name: `set_my_name()`, letters only, never a
  number; a technician's approved full name is never changed), "With
  Pechkas since …" and a chip (Customer, or his trades); then **one white
  strip of three real numbers with their two-tone icons**, each a door —
  customer: jobs done (→ Past), under guarantee (→ Past filtered,
  `jobs?tab=past&what=covered`), spent this year (→ Past); technician: jobs
  done (→ My account), his rating ("New" below `rating_min_count`; → the
  "Your rating" sheet, `my_ratings()`: revealed words only, never who wrote
  them), kept this month after Pechkas' share (→ My account). All from
  `my_settings()` (migration `…_settings_page`, tests `settingspage.test.mjs`).
  Then "Your account": Mobile number with ✓ Checked (or Change when typed),
  Email if any, **Saved addresses** (the phone's own list from
  `post/places.ts`, a sheet with × to forget one) or **Your checks**, and
  Notifications (On / Off, opens the inbox); Sign out and **Delete my
  account** side by side (the delete-account page names that button —
  keep the label); one quiet "Version … · details" line that opens
  `ThisCopy` in a sheet. The mode switch and the legal pages are not here:
  they are in the menu (no duplicates).
- **Delete account (`app/delete.tsx`) is its own page** (the owner's
  design, 25 November 2026; migration `…_delete_account`, tests
  `deleting.test.mjs`): Settings' **Delete my account** opens it. The
  side's coloured top with the person (as Settings), one white strip of
  their own numbers from `my_delete_summary()` (customer: jobs, photos and
  videos, voice notes; technician: jobs, photos, messages), "Also deleted,
  at once" as a list with red ✕, what Pechkas keeps without their name as
  one grey note (a technician's money record only when he has one), and a
  red **Delete my account**; the sheet's red button must be HELD for 2
  seconds (`HoldToDelete`: the fill moves by transform, letting go snaps
  it back; a screen reader double-taps instead). **Never in the middle of a
  job** (the owner's yes): `delete_blocker()` — her job open or assigned,
  his job assigned — and `delete_my_account()` refuses with `field: 'job'`;
  the page shows that job's card with "Finish or cancel this job first".
  The person's storage folder is emptied first, then the account, then
  `app/goodbye.tsx` (in `OPEN`, because they are signed out). **Without the
  app**, pechkas.net/app/delete-account does the same with the app's own
  sign-in code (never creating an account) and the same two functions; its
  form is outside the page's `.legal` section, so `copy-legal.mjs` (which
  now passes over empty elements such as `<input>`) copies only the text.
  The delete-account page names **Delete my account** and **Hold to
  delete**: change them together.
- **Help (`app/help/index.tsx`, `app/help/[topic].tsx`) is topics, then
  answers** (the owner's design, 25 November 2026): the side's coloured
  top (yellow customer, green technician) with "How can we help?" and a
  search box; every topic as a `DuoRow` — icon, name, what is inside, how
  many answers — each opening its own page (the topic on the top, its
  questions in one card, the first open, one at a time, the chevron turned
  by transform and snapped; then two other topics and the office); and
  **Write to the office** (in the app) as the last row. Nothing about one job (the job's
  own screen says what to do next) and no legal or Safety rows (they are
  in the menu). Typing searches every answer of that side, each result
  naming its topic. The words are `src/help.ts` (`CUSTOMER_HELP`,
  `TECHNICIAN_HELP`): only rules the app already keeps, in its screens'
  own words, a button's name in `**bold**` — and `help.test.ts` fails if a
  bold name is not a label some screen really draws, if an answer has a
  phone number or says "call the office", or if the guarantee answer stops
  naming **It has failed again**. A number that can vary or is undecided
  (the credit limit and visit fee the office may set, the lowest offer) is
  never written there — the answer points to the screen showing the real
  figure. The 10%, 7%, 30 and 7 days and 14 + 3 days are locked settings,
  as in the terms: change them and this file in the same week.
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
  the search: `Searching` while it is open — one compact white card: the screw
  turning in a round radar whose rings grow only to the radar's own edge
  (a rectangle once cut them in half), the words beside it, and a thin
  yellow bar running along its foot, all by transform — the offers right under it, then the same screen follows the
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
  Decline; and at the foot one card for find another and cancel, where
  nobody taps them by mistake. Once the job is over the screen is
  `PastJob.tsx` instead (below). On a phone under 360
  wide the price moves under the title and long button labels drop the
  price or the word "Pechkas", so nothing is cut or wrapped mid-figure.
  Every action is the same database call as before.
- **My jobs (`app/jobs.tsx`) is two tabs on the yellow top, Now and Past**
  (the owner's design, 24 November 2026, after many rounds), so nobody
  scrolls past a hundred old jobs to find today's. It always opens on
  **Now**, from `my_jobs()` every 10 s: **Needs you** (a yellow count; a
  live job where she must act — choose, answer a new price, check the
  work, he is at the door — and a finished one with a D35 payment question
  or money owed, each with a yellow bar saying it, `todoOf()` / `payOf()`),
  then **On its way** (calm: who, the steps), then quietly **When you have
  a moment** (a rating `can_rate` still allows). Nothing on: one card,
  "Nothing happening right now", with the way to home and to Past. The
  green "Post a new job" card is gone (home has it: no duplicates).
  **Past** (`src/customer/Past.tsx`) never reads `my_jobs()`: it asks
  `my_history()` for twenty finished jobs at a time (the next twenty as she
  nears the foot) and `my_history_facets()` for what the filters may offer
  (migration `…_job_history`, tests `history.test.mjs`): her own jobs only,
  no address, pin or phone, the technician a first name on jobs he worked,
  searched and counted by the database. One box searches what the job was,
  what she wrote herself, who came, the sector and the job number; the
  filter button at its end opens one sheet of rows — **What happened**,
  **Kind of work**, **Who came**, **Where**, **When** — each a page of its
  own, never a drop-down (the owner: a list of 30 must still work). **Who
  came** (migration `…_history_who_where`) lists the men who worked on her
  jobs by first name, with counts and the kinds of work, chosen by a key
  that is md5(his id : her id) — two Bilals are two choices, the key means
  nothing to anyone else, and no technician's account id reaches her phone.
  **Where** is the sectors of her own jobs and is drawn only when there is
  more than one. The two history migrations make the same functions, so
  they run in either order or again. Kind of work offers only kinds she has had, with counts,
  her three most used first, then A to Z, and a search box once it is
  long; When is a calendar (`Calendar.tsx`: any two days, This month /
  Last 3 months / This year / Last year, green dots on days she had a job,
  the month's name opens every month of a year, Pakistan's days). The
  sheet's black button always says how many jobs she will see. Filters on
  show as green tags with ✕ and a count on the button. With nothing
  searched, **Still under guarantee** sits on top in green (days left),
  then month by month with each month's count and what she paid. Rows:
  drawing, the whole title (never cut, even at 320), day · who · ref, how
  it ended (Guaranteed · Done, Visit fee only, Cancelled, Nobody took it),
  what she paid (Free on a Pechkas repair, — when nothing). A tap opens
  the job's screen.
- **A job that is over has its own clean page** (`src/customer/PastJob.tsx`,
  the owner's design of 25 November 2026; `app/job/[id].tsx` draws it for
  done, stopped and cancelled jobs instead of `JobCard`, whose old `Ended`
  is gone). Two cards and two buttons, every tap target 56 tall, nothing
  said twice: the yellow top (trade · ref, title, how it ended and the ONE
  date, on Pakistan's clock, the trade's drawing); anything she must
  answer first (`PaymentCard`, `FeeCard` only while `feeNeedsHer()`, an
  open `ClaimCard`, `NotHomeEnded`); the **money card** — the figure large
  (`feeHead()` for a visit fee, the same rule as `FeeCard`), work · parts
  · the time, "Agreed Rs a → Rs b, with your OK", Pechkas' decision,
  **Share receipt** (the phone's share sheet, plain words, never the
  address or a number), the guarantee with **It has failed again** (the
  terms quote that label; `legal.test.ts` now reads `PastJob.tsx`), or how
  a closed claim ended with a link to the repair it led to; the **visit
  card** — who came (or "A technician who has left Pechkas"), five 56-tall
  star buttons while she may rate, else "You gave ★★★★★ · her words",
  his note for her, Took, Address, **See every step** (a `Sheet`: the
  record to the minute, what she wrote, her messages while `chat_until`)
  and the photos as 96-tall tiles (Before, After, Shop receipt, Video);
  then **Ask … again** and **Book again** side by side (Book again alone
  is black), and rows: **Get help with this job** (Write to the office,
  with this job chosen), **Report something unsafe**, **Never send me
  …**. A cancelled job's card says what happened in a sentence the top has
  not said, her or the office's words, "Nothing was charged", Posted,
  Offers, Your price, Address. Everything is `my_jobs()` plus
  **`my_job_story(job)`** (migration `…_job_story`, tests
  `story.test.mjs`): her own job only; the steps from `job_events` as a
  fixed list of kinds with only safe fields (never an office note, his
  withdrawal or refusal reason, an address or a phone), turned into words
  by `stepWords()`; arrival, start, "work finished" and how long the work
  took; first and chosen price; the new prices and who said yes; her
  rating words; the cancellation; `pro_left`; his note; `chat_until`; the
  job a free repair was for and the repair a claim led to. A new kind of
  step needs a line in that list and in `stepWords()`, or it is not shown.
- **Notifications is an inbox** (`app/notifications.tsx`, the owner's
  choice of 25 November 2026, migration `…_notifications_inbox`, tests
  `inbox.test.mjs`): what Pechkas actually told this person in the **last
  90 days** (the owner's number), newest first, **30 at a time** with
  "Show older notifications", under Today / Yesterday / the day. It reads
  `push_log`, which `send_push()` always wrote, even to a phone with
  notifications off; the only new thing kept is `push_log.read_at`.
  `my_notifications()` names every field and only the asker's rows;
  `state` says what became of an offer (chose / closed), a new price
  (`job_changes.status`) or a new job for a technician (open / offered /
  yours / gone — "No longer open", never "taken by someone else", which a
  block or a cancellation would make untrue). Repeats on one job, kind and
  day are one row ("and 2 more like it", `merge()`). A tap marks read and
  opens the job (`/job/<id>` for her, `/pro` or `/pro/money` for him).
  All / Unread, Mark all read; the menu row shows the unread count, 99+
  at most (`my_unread_notifications()`). On top, one card: on for this
  phone, or the button that turns it on — never a switch, the app cannot
  turn a phone's notifications off. At the foot, "What Pechkas tells you
  about" opens a sheet with the `CUSTOMER` / `TECHNICIAN` lines in five
  groups each; those lines still say only what `push_words` really sends
  (change the two together). Older `push_log` rows are not shown but are
  kept: they are the office's proof in a nobody-home dispute, and how long
  to keep them is the owner's decision. No quiet hours (the owner's no).
  The privacy page says a copy is kept and shown for 90 days.
- **His note for her** is `pro_set_note(job, note)`: his own job, while
  working, checking or disputed, or within a day of it ending; 300 letters,
  no phone number, no CNIC, empty takes it away, logged as `pro_note`. The
  finish form saves it before `finish_work()`, so a refused note never
  leaves a finished job without it. She sees it only once the job is over,
  never in a notification. The privacy page says so.
- **Home shows what is still happening** (`LiveCard` in `app/index.tsx`),
  from `my_jobs()` every 10 s while focused; finished jobs are on My jobs
  only. Every headline is read from the job's own status
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
- **When nobody offers, she decides and the job closes itself** (migration
  `…_when_nobody_offers`, the owner's rule; the office is not involved).
  `nudge_no_offers()` (pg_cron, every minute) tells her once when nobody
  has offered since the job was announced: `nudge_today_minutes` (20) for
  a job on today, `nudge_later_minutes` (180) for a later day, never while
  it is held for the man she asked for. Her job screen then shows
  `NoOffers.tsx`: **raise my price** by +Rs 200 / 500 / 1,000 only
  (`raise_price()`, the technicians' steps — never a price we suggest; the
  usual price is shown only when hers is below it), at most `max_raises`
  (3), upwards only and only while no offer is live; or **keep
  waiting**. (**Choose another day**, `change_day()`, went from the screen
  when every job became as soon as possible; the function stays for older
  copies.) **Nothing the customer reads names a sector or an area** —
  not the card, the search line under it, nor the `no_offers` and
  `unclaimed` messages (the owner's rule: who can take her job is the
  database's business, and a place on the card only makes her rush;
  `nooffers.test.mjs` checks the messages). Her own address is the only
  place a sector appears. The money card is the one soft-yellow card:
  her price now beside the new one, three equal step pills, and a button
  that says the new figure. Either
  change announces the job again (`announce_again()`, the feed's rule,
  kind `job_again`) and restarts the clock (`announced_at`). **A job nobody
  took closes at 10pm on its day** (`close_unclaimed()`, every minute),
  `cancelled_by = 'nobody'`, and she is told; Book again reposts it. The
  `pechkas-needs-you` office alert is taken off the clock; the admin
  Demand page shows where it keeps happening. `my_jobs()` is two
  `jsonb_build_object`s joined with `||` because one may take at most 100
  arguments (`nooffers.test.mjs`).

### Prices — what jobs really go for (migration `…_prices`)
- **The owner's decision: Pechkas keeps what every finished job went for,
  and uses it carefully.** The `job_done_price` trigger writes each newly
  `done` job into `price_record`: trade, `job_type_id`, sector, day, the
  customer's first price, the agreed price, parts, the price for the work
  (`agreed − parts`) and the usual price of the day. **No foreign keys and
  no person**: no customer, technician, address, phone or ref — so it
  survives account deletion (the jobs themselves cascade away), and
  `prices.test.mjs` fails if a personal column appears. Nobody can read the
  table; it is written by the trigger only, and a failure to write it
  never undoes the finished job (caught, `RAISE WARNING`).
- **A range is `price_range_of(type)`, the one rule**: the middle half
  (25th–75th percentile) of the price for the WORK, finished jobs in the
  last `price_window_days` (90), ends rounded out to Rs 100. **NULL below
  `price_min_jobs`, and never below 10 whatever the setting says** — a
  "range" of a handful of jobs is one customer's price. "Something else"
  (`job_type_id` NULL) never has one. Granted to nobody; the three
  functions below decide who sees it.
- **Customers**: `price_ranges()` (signed in) → `PriceRangeCard` on Post a
  job, inside "Your price". **One answer first, then the picture** (the
  owner found the first version confusing): a dot and a verdict read from
  the range — "In line with / Below / Above most jobs like this" and one
  line of what it means — then the bar with the green middle, her price as
  the marker and the two ends written under it, then where it comes from
  ("From 15 finished Pechkas jobs in the last 90 days. For the work only;
  parts are extra."). Without a range the same box says the old
  usual-price sentence and "Usual Pechkas price Rs …". How paying works is
  three short ticked lines under it, not paragraphs.
- **Technicians**: `pro_price_help(job)` — only for a job `pro_may_see()` —
  gives the range while `price_range_to_pros` is 1 (the office can switch
  it off from Settings if quotes start bunching at the middle), and his
  own last price for that kind of job, from his own jobs. **Not shown in
  the offer sheet since A117** (the approved mock has no such card); the
  function stays for when the owner wants it back. The sheet's top figure
  is **her** price ("Customer's offer") and "You keep".
- **The office**: `admin_prices()` and the admin **Prices** page — per kind
  of job, jobs, usual price, middle price, cheapest–dearest, what
  customers first asked, and the range shown or "Not yet: n of 10".
  Changing a usual price is still a migration to `job_types`.
- **The flag `price_over`**: a technician whose price for the work was more
  than `flag_price_over_bps` (50%) above the top of the range on
  `flag_price_over_jobs` (3) jobs in `flag_days`. A flag only, like the
  rest. Its sentence is in `Flags.tsx`.
- The privacy page, the delete-account page and both stores' notes say the
  record exists and outlives an account. Change them together.

### Checked before it counts, and the guarantee (migration `…_checks_and_guarantee`)
- **"Work finished" no longer closes a job.** `finish_work()` (now with an
  optional `p_video`, "Show it working") fixes the photos, parts, collect
  and commission figures as before but sets `stage = 'checking'`; status
  stays `assigned`. Only `confirm_work()` (her **Yes, it works**),
  `check_clock()` after `check_hours` (24, reminders at 2 h and 4 h before
  the end, `confirmed_by = 'clock'`) or the office closes it — so the
  commission, the price record and the guarantee clock all start at the
  moment it counts as done (`close_checked()`).
- **"Not finished yet"** (`not_finished()`) needs one of four reasons
  (`check_reason_text()`), may carry a note and her photo, and sends it back
  to `working`; he is told the reason (a fixed phrase, never her note) and
  may answer in one line (`reply_check()`). Every round is a `job_checks`
  row. **The second time** the job is `disputed` and goes to the office,
  which decides with `admin_decide_dispute()`: `done`, `stopped` (visit fee,
  no commission) or `return` (back to working). Its note is read by both in
  the app, never in a notification. The patterns are flags: `unchecked`
  (his jobs mostly closed by the clock), `overruled` (a customer the office
  found wrong twice).
- **The guarantee is `guarantee_days_of(job)`: 30 days for repairs and
  installations, 7 for services** (`job_types.guarantee = 'service'`:
  servicing, cleaning, top-ups, descaling, drain clearing, virus clean-ups,
  check-ups). Both lengths, the answer time (24 h), the visit time (48 h)
  and the appeal time (7 days) are locked settings: promises in the terms.
  The website says the same (`SITE.guaranteeDays` 30,
  `guaranteeServiceDays` 7) — the old 15-or-30 disagreement is settled.
- **A claim** (`claim_guarantee()`, screen `app/claim/[id].tsx`, reached
  only by the button **It has failed again**, whose label the terms quote)
  needs words and at least one photo or video. `guarantee_claims` holds it:
  `waiting` → he answers within 24 h (reminded at 12 and 20) with
  `answer_claim()`: **I'll come** (a window starting within 48 h) → `coming`
  → **It's fixed** with a photo (`claim_fixed()`) → `checking` → she
  confirms (`check_claim()`) or it closes after 24 h; **This isn't my work**
  → `refused` → the office (`admin_decide_claim()`); "still broken" after
  his visit → `disputed` → the office.
- **No answer, or a missed visit (window + 4 h): `replacing`, and his new
  offers stop** — `claim_blocks()` is checked in `make_offer()` (field
  `guarantee`) and shown in `pro_feed().guarantee_block`. They come back
  when he answers late (allowed until she books), the claim closes, or the
  office lifts it (`admin_lift_block()`). **She books the replacement**
  (`book_replacement()`): a new job, `paid_by_pechkas`, `guarantee_of` the
  claim, offered at — and offers capped by `pay_cap_paisa` at — the
  original labour, her claim media copied into `job_media`, never visible to
  the original man (`pro_may_see_as`). No commission, nothing for her to
  pay, not in `price_record`.
- **The money** (`on_replacement_done()`): the replacement technician is
  paid from the reserve (`guarantee_pay`: his `pro_owes` down, the reserve
  spent); a negative balance means Pechkas owes him, paid by the office with
  `admin_pay_pro()` (`payout`). The original man is charged only when
  `charge_original` — no answer, missed visit, or office found it covered —
  never more than his original labour, parts never.
- **A charge is final only after the chance to appeal** (migration
  `…_guarantee_followups`, the owner's condition). `on_replacement_done()`
  only RECORDS it (`charge_paisa`, `charge_due` = 7 days on) and tells him
  the amount and the date (`charge_pending`). `charge_clock()` (pg_cron)
  posts it through `post_guarantee_charge()` at `charge_due` if he has not
  appealed; while an appeal waits nothing is posted. The office's
  `admin_decide_appeal()`: kept → posted that day; cancelled → never posted
  (a charge posted by the older migration is still reversed, never edited).
  Posted, it is ordinary debt: past the credit limit his offers stop and
  he is told once (`over_limit`). Never post a guarantee charge any other
  way.
- **Raise the limit** (`admin_raise_cap()`, the office's button on
  Guarantee and disputes): a replacement nobody offers on is announced to
  the office, never to her (`nudge_no_offers()` tells the office for a
  `paid_by_pechkas` job; `raise_price()` refuses one and `my_jobs()` says
  `can_raise` false). Upwards only, whole rupees, at most 3× the first
  limit (a typing guard), with a note on record; the job is announced again.
  The extra is Pechkas' cost: the charge stays at the original labour and
  she pays nothing. A replacement nobody took by 10pm closes and she
  chooses another day on her claim (`replacement_unclaimed`), never Book
  again (hidden on paid jobs); rebooking keeps the raised limit and moves
  her media to the new job. Tests: `followups.test.mjs`.
- Who sees what: before he accepts, her first name, the sector, her words
  and media (`pro_may_see_file` includes claim media and her "not finished"
  photo); once coming, the address and number. She never sees his refusal
  reason. The office sees everything in **Guarantee and disputes**
  (`admin_guarantee()`, with the reserve). Repeated claims are the flags
  `guarantee` (2 in 60 days) and `guarantee_review` (3 in 90). Tests:
  `checks.test.mjs`, `guarantee.test.mjs`, `followups.test.mjs`.

### A new technician's first jobs (D37, migrations `…_first_jobs`, `…_quiz_questions`)
- **The owner's standing rule made this**: nobody watches a trial, the office
  is never in a routine step. Read `docs/DECISIONS.md` A85–A98 before
  changing any of it.
- **`pro_gate(pro, trade, type, sector, customer, job)` is the one rule** for
  whether he may take a job, and `trade_level()` the one answer to "what may
  he take": none / trial / basic / full. Every door asks the gate: the feed
  (`pro_may_see_as`), `make_offer`, `choose_offer` (again as she taps),
  `admin_assign`, `job_preferred`. The price cap is the offer's and lives in
  `trial_cap_why()`. Never test `j.trade = ANY (r.trades)` again: that is
  what he applied for, not what he may do (`pro_trades`).
- **The person is approved by `promote_person()`**: SMS-checked number, face
  photo, rules quiz if on. Called from `set_my_face`, `finish_quiz` and the
  clock; it sets `pechkas.by_rule` so the `sync_pro_trades` trigger can tell
  a rule approval from a hand one. Approved any other way (inserted as
  approved, or by hand in the SQL editor) is `legacy`: works as before until
  `sort_legacy()` sorts it by record once both legacy numbers are set.
  `admin_decide('approve')` works only after `rejected_at`.
- **His photo** (`pro_faces`) locks when his first job is assigned; a change
  is `face_changes`, decided by `is_owner()` only. At her door
  `customer_face_answer()` (stage `arrived` only): yes sets
  `face_confirmed_at`, which `start_work` requires whenever he has a photo;
  no reopens the job (`ended = 'not_the_man'`), pauses every trade and files
  a `safety_reports` row of kind `face`.
- **Identity is a plug-in**: `identity_start()` (him), `identity_result()`
  (granted to `service_role` only, refuses a CNIC-shaped reference),
  `admin_identity_service()` (owner). `identity_ok()` is the one rule;
  `identity_line()` is what may be said, and **nothing says "identity
  checked" unless kind is `verified`**. **A119 (the owner, 26 November
  2026): the check is CNIC against NADRA's records plus a live face match,
  by an outside company, and comes before the first job** — once the
  service is on, `trade_level()` gives `none` to anybody whose
  `identity_ok()` is false (`identity_needed()`); off, nothing changes.
  Opening the check is `identity_start()`, three times a day at most
  (`identity_opens`, recorded before the refusal). **The only thing that
  talks to the company is the Edge Function `supabase/functions/identity/
  index.ts`** (one file, pasted into Supabase's editor, Verify JWT off):
  `/start` asks the database as the technician, then the company for a
  session (`identity_session()` remembers it, service role only), and the
  app opens the company's page (`openIdentityCheck()` in `src/identity.ts`,
  back to `pechkas://identity-done`); `/result` checks the company's
  signature before reading anything and passes only verified / failed and
  the company's reference to `identity_result()` (or finds the check
  through `identity_check_of()`). It never logs. The company's key and
  signing secret are Supabase secrets (`IDENTITY_PROVIDER`,
  `IDENTITY_API_KEY`, `IDENTITY_WEBHOOK_SECRET`). Each company is one entry
  in `PROVIDERS`, written from its own documentation once the owner has
  chosen it (D37.2); `example` exists only for `identity.test.ts`
  (`npm run test:functions`).
- **A trial job counts only through `trial_review()`**: all four answers
  yes, before and after photos, no claim, no payment case, its
  `commission:<job>` posting paid by final money (`fee_paid_final()`, A5:
  his own payment is final 3 days after he sends it), the gap setting set, and
  `trial_customer_why()` NULL. Anything not yet known waits; anything
  permanent is `not_counted` with its `why`. A covered claim later flips a
  good one and can put an approved trade back on trial. Pauses by rule are
  `trial_pause_check()`; a lifted pause forgives the answers behind it.
- **Risky work**: `job_types.risky`, `trades.something_else_risky`,
  `trades.opens_with` (UPS → Electrician). `risk_ready()` is the bar; the
  checker is `pick_checker()` and nowhere else; `arrange_check()` runs inside
  `choose_offer` and refuses the choice if nobody can check. The fee is
  ledger kind `checker_fee` on account `checks`, a credit in `pay_items`.
  Strikes come from the clock. `type_open()` closes a risky kind in a
  sector where nobody can do it; `post_job` refuses with `field: 'job_type'`.
- **The price limit is on his WORK (A104, migration `…_first_job_labour`).**
  `trial_cap_why(pro, trade, labour)` is always given price less parts: his
  offer on a first job may carry `p_parts_paisa` (`offers.parts_paisa`,
  only while the trade is on trial, NULL from older copies, so they are held
  to the whole price), checked in `make_offer` and again in `choose_offer`.
  **A new price over the limit is never refused**: `ask_change(…,
  p_parts_paisa)` records `job_changes.over_first_limit`, both sides are
  warned (`pending_change()`), and her approval sets `trial_jobs.over_limit`
  (trigger `change_over_first_limit`, whoever approves). `trial_review()`
  marks such a job, and one whose `agreed − parts` at the finish exceeds the
  limit, `not_counted` / `over_limit`. Each first job keeps the limit in
  force when given (`trial_jobs.cap_paisa`). Money is unchanged: commission
  is still on price less the receipted parts. Tests: `labour.test.mjs`.
- **`first_jobs_clock()`** (pg_cron, every 10 minutes) does every timed
  step. Tests call it directly.
- **Every new number starts at 0, "not set"**, and whatever needs it waits or
  is refused. Never put a default in a migration: the owner sets them.
- **Quizzes**: questions only in `…_quiz_questions.sql` (key stays the same
  when a question changes). Urdu is a draft until a native speaker checks
  it; a safety quiz goes on only with the checker's name, and nothing public
  mentions a safety test while they are off. The answer key never leaves
  the database. "Hear it" uses `expo-speech` and is drawn only when the
  phone has an Urdu voice.
- Screens: `app/pro/first-jobs.tsx`, `quiz.tsx`, `checks.tsx`,
  `check-number.tsx` (and `verify.tsx`'s `change` mode, Supabase's
  `phone_change`); the customer's `src/customer/Face.tsx` and `FirstJobs.tsx`
  (door card, the three questions, safety report); the office's
  `apps/admin/src/Exceptions.tsx`. The technician agreement, terms, privacy
  and delete-account pages say the same; change them together. Tests:
  `firstjobs.test.mjs`, `quizzes.test.mjs`. `APP_EDITION` is 8.

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
- **The visit fee is flat** (the owner's decision D12, 9 November 2026,
  migration `…_visit_fee`): `visit_fee_min_paisa` (Rs 300), office Settings
  ("Visit fee"); `visit_fee_max_paisa` is kept for a distance fee and not
  shown. **`visit_fee()` is the one place it is read**: the figure fixed on
  the job when she chooses him (`jobs.visit_fee_paisa`, set by
  `fix_visit_fee`), else today's setting. Shown before she chooses (Post a
  job, above the offers — `VisitFeeNote`) and before he offers
  (`pro_feed().visit_fee_paisa`). No distance, GPS or petrol: never guess
  one.
- **A fee is owed only after a real visit.** `ask_change()` needs stage
  `working`, i.e. the customer's start code (the only proof he is at her
  door). Only her `decide_change()` (or the office's
  `admin_decide_change()`, with a reason) stops a job with a fee; he can only
  say `pro_reports_no()`, which asks her and, after 20 minutes
  (`visit_fee_clock`), the office. On a `paid_by_pechkas` job the office
  answers the new price, never her. Every stop has a `stop_reason`
  (`declined`, `office_declined`, `office_fee`, `office_no_fee`); the
  office's "not finished" is `stopped` (not his fault: fee) or
  `stopped_no_fee` (his fault: none).
- **`visit_fees` is the record, one row per stopped job** (`record_visit_fee`
  trigger): amount, payer (customer or Pechkas), reason, the declined change
  as proof, status `due → paid | unpaid | disputed | waived | covered`, and
  every step in `job_events`. He says paid / not paid (`pro_visit_fee`;
  paid is final); she disagrees once within 24 hours or says "I have paid
  him" (`customer_visit_fee`); while a fee is `unpaid` (or covered by
  Pechkas and not cleared) she cannot post (`no_post_while_fee_unpaid`).
  The office (`admin_visit_fee`, a reason every time) keeps, waives, marks
  paid, covers (Pechkas pays him: ledger `visit_fee_cover:<fee>`), clears
  her, or settles a refund (`visit_fee_refund:<fee>`). No commission and no
  ledger line on a fee she pays him; money moves only on those two keys
  and the guarantee's `guarantee_pay:<job>`. Tests: `visitfee.test.mjs`.
- `collect_paisa` is fixed when the job ends, so a later settings change
  cannot rewrite what somebody paid. The customer's card shows it.
- A customer may cancel until she gives him the start code, at the door
  too; after that it is the office's (see Cancellations below).
- **Chat** is text only, between the customer and the chosen technician,
  readable for a day after the job, written while it is on. The office
  reads it in `admin_job_detail()` and the screen says so. A message's words
  never go in a notification — only that one came, at most once a minute.
- **`job_events` is the record**: `on_job_logged` writes posting, every
  status and step, the functions add codes, prices and problems, each with
  who did it. Nobody can write or read it directly.
- `push_words.who` says who reads each message.
- **There is no office number or office WhatsApp link in the app.**
  `src/office.ts` has `toOffice(job)`, which opens Write to the office
  (`app/office.tsx`); `help.test.ts` fails if `OFFICE_PHONE` or
  `OFFICE_WHATSAPP` comes back, or any screen tells somebody to call,
  ring or WhatsApp the office.

### Cancellations, late arrivals and no-shows (migration `…_cancellations`)
- **The owner's decision D10 (10 November 2026): cancelling is always free
  for the customer and never creates a visit fee.** `cancel_job(job,
  reason, code)` works while the job is open or assigned at `chosen`,
  `on_way` or `arrived` (**I no longer need this service** at the door);
  after the start code it refuses and the office's `admin_cancel_job(job,
  reason, for)` (`for` customer / pro / other) stops the job, with no fee
  either. Keep D10 and D12 apart: nothing about a cancellation may write
  `visit_fees`, `stop_reason` or `collect_paisa`.
- **`cancel_kind()` is the one rule** for what a customer's cancellation
  is, on the database's clock (`now()`, never the phone's), in the owner's
  order so one cancellation never counts against both: before_choosing;
  no_show (not arrived at window start + 2h30, i.e. 30 minutes after the
  two-hour window); pro_late (not arrived at start + 30m, or arrived after
  it); late (stage `arrived`; within 2 hours of the start; or after an On
  my way tapped no more than 3 hours before the start); normal. A job with
  no window (`when_from` NULL, older copies) is only ever before_choosing,
  late or normal. `window_start()` turns `when_date` + `when_from` into a
  time on Pakistan's clock. `my_jobs().cancel_kind_now` asks the same rule,
  so the sentence above **Yes, cancel it** is what will be recorded.
- **`cancellations` is the record, one row per cancelled job**, written by
  the `job_cancellation` trigger whoever cancels (office → `office`, the
  10pm clock → `unclaimed`). Rows that existed before the migration were
  copied in as `before_rules` and are counted nowhere; never reinterpret
  them. **`pro_incidents` is his record**, one per job: a `late_arrival`
  (the `job_late_arrival` trigger on Arrived more than 30 minutes in, or her
  cancelling as `pro_late`) or a `no_show` written `potential` by
  `no_show_clock()` (pg_cron, every minute, once per job). A potential
  no-show tells her, him and the office; if he then arrives it becomes a
  late arrival. The office's `admin_incident()` confirms or dismisses with
  a note he reads; he disputes once with `pro_dispute_incident()`; he reads
  all of it in `pro_record()` (My account → Arriving on time). Both tables
  are readable by nobody and are deleted with the account they are about.
- **Flags, never penalties**: `late_cancels` (3, `flag_late_cancels`),
  `late_arrivals` (3, dismissed ones do not count) and `no_shows` (1
  confirmed), over `flag_days`. The old `cancelled` and `cancels` flags
  are **retired**: `flag_cancelled` and `flag_customer_cancels` stay in
  `settings` only so older migrations run, are out of `setting_limits`, and
  are hidden from `admin_flags().limits`. The office reviews a customer with
  `admin_review_cancellations()`; she is not told. **Only a potential
  no-show or his dispute reaches the office's phone**; other cancellations
  wait on the admin **Cancellations** page (`admin_cancellations()`).
- The customer's screens are `src/customer/Cancel.tsx` (`CancelPanel`,
  `LateCard`, `cancelledNote`); his is `src/pro/Record.tsx`; the office's
  is `apps/admin/src/Cancellations.tsx`. The app's terms, technician
  agreement and privacy page, and the website's /guarantee and /terms, say
  the same rule: change them together. Tests: `cancellations.test.mjs`
  (which drops `jobs_when_from_check` in its throwaway database to set a
  window at any hour).

### Nobody home (migration `…_nobody_home`)
- **The owner's decision D34 (11 November 2026): a report protects the
  technician without blaming the customer.** At `arrived`, he may ask
  Pechkas to tell her (`pro_cannot_get_in(job, reason)`): `nobody_home`
  only once his window has started and 15 minutes after the later of
  `arrived_at` and the window's start; `guard` once the window has started,
  at once. `not_home_from()` is that rule; `pro_my_jobs()` gives
  `not_home_from` / `guard_from` for the countdown. She has 10 minutes;
  `customer_not_home_coming()` gives 10 more, once. After the deadline he
  reports it with a fresh photo (`pro_report_not_home()`, `own_uploads()`,
  `job_photos.stage = 'gate'`): the job is **cancelled** with
  `cancelled_by = 'pro'`, D10's record labels it `not_home` or `guard`,
  never `late`. The proof is now GPS first (see "Arrival checked by
  location"), the photo when that fails, the database's timestamps and
  `push_log`.
- **`not_home_reports` is the record**, one per job: `asking → coming →
  (answered | closed)`, or `submitted → disputed → confirmed | rejected`.
  The start code ends the asking (`answered`), any other end of the job
  closes it (`job_not_home_asking` trigger). She disputes once within 24
  hours (`customer_dispute_not_home()`, nobody_home only); the office
  confirms or rejects with a note (`admin_not_home()`), and reads every
  report with its history and notifications in `admin_not_home_reports()`.
- **No money, ever, from a report**: cancelled, never stopped, so no
  `visit_fees` row, no `collect_paisa`, no ledger line. Each report writes
  one row to **`uncompensated_visits`** — no customer, `pro_id` cleared on
  his deletion, outliving her account — with the job's `visit_fee()` as a
  reference only, so the owner can decide whether Pechkas should pay for
  these visits (D34.6).
- **What counts**: `not_home` for her — confirmed, `nobody_home`, and not
  `pro_was_late` (he tapped Arrived 30+ minutes into his window) — at
  `flag_not_home` (3); `not_home_reports` for him — his nobody_home reports
  that are not disputed — at `flag_not_home_reports` (3). A disputed report
  counts for nobody; a guard report never counts. Flags only.
- Screens: the technician's `CantGetIn` in `pro/OnTheJob.tsx` and his
  reports in `pro/Record.tsx`; the customer's `AtDoorCard` / `NotHomeEnded`
  in `customer/NotHome.tsx`; the office's `apps/admin/src/NotHome.tsx` on
  the Cancellations page. Times are said with `pkClock()` (Pakistan's clock,
  `packages/shared`). Rescheduling is not built (D34.7). Tests:
  `nobodyhome.test.mjs`.

### Arrival checked by location (migration `…_arrival_by_location`)
- **The owner's decision (11 November 2026, revising D34): GPS-first, as
  ONE location service.** `check_location(job, event, loc)` is the only
  place a position is judged and `distance_m()` the only distance formula;
  `fixNow()` in `components/Map.tsx` (and `Map.web.tsx`) the only way the
  phone takes a reading. A new event (On my way, a guarantee visit,
  matching) adds a value to `location_checks.event`, never its own maths.
  The rules are `docs/DESIGN.md` section 13; read them before anything that
  touches a map, a pin or a phone's position.
- **Results**: verified (within `arrival_radius_m` 100 of `jobs.lat/lng`,
  accuracy within `gps_accuracy_m` 50, age within `gps_max_age_s` 120 by the
  phone's own clock — `sent_at − fix_at`, so a wrong phone clock is not
  failed — not `mocked`, not a reused or earlier `fix_at`), else too_far,
  poor_accuracy, stale, faked, no_pin, no_location (`app_reason` denied /
  unavailable / older_app), outside_pakistan (coordinates not kept). Every
  check is recorded, even when the call is then refused.
- **A tap is not an arrival.** `tech_step(job, 'on_way', loc)` always
  records the tap (`arrived_at`); `arrival_review_status` is pending /
  verified / approved (office) / rejected / code (her start code, set by
  the `job_arrival_code` trigger) / before_checks (older arrivals).
  **`arrival_at(job)` is the one rule for when an arrival counts** and
  everything reads it: `no_show_clock()` still watches an unverified
  `arrived` job (telling him and the office, not her), `cancel_kind()` gets
  it (so her cancellation is not "at the door" and his lateness is his),
  `record_late_arrival` (now on every update) counts lateness from it.
  `pro_check_arrival()` checks again at the door.
- **The office**: `admin_arrivals()` / `admin_arrival(job, approve, note)`
  and `location_evidence(job)`; every decision, here and in
  `admin_not_home()`, writes `location_reviews`, which nobody can update.
  Flag `unverified_arrivals` (pending or rejected) at
  `flag_unverified_arrivals` (3).
- **Nobody home** (`pro_report_not_home(job, photo, note, loc, no_camera)`):
  a second check; a photo is required unless it verifies, or a reason
  (≥10 characters) when the camera does not work; `evidence` strong /
  partial / unverified.
- **Privacy**: event-based only; `erase_old_locations()` (pg_cron nightly)
  nulls coordinates after `location_keep_days` (90 at most, its setting
  limit); only the office sees coordinates (Google Maps links, no embedded
  map); he sees his result and distance; she sees `arrival_verified` only
  when verified; no notification carries a coordinate. The permission
  string in `app.json`, the privacy page, the terms, the technician
  agreement and both stores' answers say this; change them together.
  `APP_EDITION` is 5 for this. Tests: `location.test.mjs`.

### A technician who cannot come (migration `…_reliability`)
- **The owner's decision D11 (11 November 2026): the same job goes back,
  never a copy.** `reopen_job()` is the one way a job leaves its technician
  for others: it writes his assignment to `job_assignments` (who, when
  chosen, agreed price, window, arrival, estimate, how it ended) and only
  then clears what was his — `agreed_paisa`, the window if it came from his
  offer (or has already begun), `visit_fee_paisa`, the code tries, arrival
  fields, `eta_at` — and opens it, moving the day to tomorrow when less than
  an hour is left before `close_unclaimed()` shuts it at 10pm, with
  `announce_again()`. Her words,
  media, address, pin and price are never touched; no job is ever copied.
  `pro_may_see_as()` shuts the man who left out of that job for good (any
  `job_assignments` row for him on it); `make_offer()` now lets a
  `rejected` offer come back, because on an open job it only means somebody
  else was chosen first. `job_chat()` shows messages since `assigned_at`
  only, so the next man never reads what was said before.
- **"I can't come" is `pro_withdraw(job, reason, note)`**: from
  `my_assigned_job()` (his, assigned, row locked — so if she cancelled first
  it finds nothing), only while `withdraw_kind()` is not null (stage chosen
  or on_way, or arrived with `arrival_at()` null). A reason code is
  required (`other` needs words; no phone numbers). **Normal more than 2
  hours before `window_start()`, late after**, by `now()`; a job with no
  window is late once he is on his way. One `pro_withdrawals` row each.
  She is told `pro_withdrew` (with an apology), or `pro_withdrew.moved` when
  the day changed.
- **"I'm running late" is `pro_running_late(job, eta)`**: same door; at
  least now + 5 min, at most window start + 4 h (2 h after a two-hour
  window ends), **twice per job** (`eta_reports`); `jobs.eta_at` holds the
  latest and she is told `running_late` with `pk_clock()`. It never
  touches his window or `record_late_arrival`.
- **"Find another technician" is `customer_find_another(job)`**, open
  while `can_find_another()` (assigned and not arrived — the owner's
  rule, wider than "late"). Never a cancellation. `cancel_kind()` decides
  what it counts as, exactly as cancelling now would: `pro_late` /
  `no_show` write his `pro_incidents` row (`how = 'replaced_waiting'`);
  `late` with no `eta_at` is stored as `job_assignments.kind = 'late'` and
  counted in `admin_flags()` with her late cancellations; with an
  estimate it is `excused`. He is told `replaced_pro`.
- **Pause**: `admin_pause_pro(pro, 1|3|7, note)` / `admin_lift_pause(pro,
  note)` write `pro_pause_log`, which no one can update. `pro_paused()` /
  `pro_pause_until()` read the latest pause with no later lift. It is in
  `pro_may_see_as()` (open jobs only — his assigned jobs go on),
  `make_offer()` (`field: 'paused'`, with the date), `job_preferred()` and
  `pro_feed().paused_until`; his pending offers are withdrawn when it
  starts. `admin_reliability()` gives the counts and the ladder as
  `suggestion` (contact / pause / review) — **never applied by the
  database**. Flag `late_withdrawals` at `flag_late_withdrawals` (3).
- **D10/D34 records are one per technician per job** (`UNIQUE (job_id,
  pro_id)` on `pro_incidents` and `not_home_reports`); every function that
  looked one up by job alone now also names the technician
  (`record_late_arrival`, `no_show_clock`, `record_cancellation`,
  `not_home_view`, the four nobody-home functions, `my_jobs().no_show`,
  `arrival_view`). Unverified arrivals on assignments that ended still
  count (`admin_flags`, `pro_record`).
- **No money anywhere**: no `visit_fees`, `collect_paisa`, ledger line or
  credit. No compensation at launch (A64). Screens: `pro/CantCome.tsx`,
  `customer/Replace.tsx` (`FindAnother`, `RunningLateCard`,
  `ReopenedNote`; `LateCard` offers it first), `apps/admin/src/Reliability.tsx`
  on Cancellations. The app's terms, technician agreement and privacy page
  say the same. Tests: `reliability.test.mjs`.

### Paying Pechkas by a date (migration `…_pay_by_date`)
- **The owner's decision D36 (11 November 2026).** A final debt —
  `commission`, `guarantee_charge`, `visit_fee_refund` — is due
  `pay_due_days` (14) after it is posted, has `pay_grace_days` (3), and from
  `pk_midnight(due + 4)` his NEW offers stop while it is unpaid
  (`pay_blocked()`, checked in `make_offer()` with `field: 'overdue'`, in
  `job_preferred()` and `pro_feed().pay_blocked`). Jobs he has go on. The
  Rs 3,000 limit is a separate check. Days are `pk_day()`; debts from before
  D36 count from `pay_policy.started_at`. All the D36 settings are locked
  (not in `setting_limits`): the technician agreement states them.
- **`pay_allocations` is what paid what**, lines only ever added
  (`written_once()`), never a balance. `pay_items(pro)` classifies every
  `pro_owes` posting: fees, `payout` (a debt that never falls due, so paid-out
  money can never also clear a fee) and the credits that may pay them —
  `settlement`, `guarantee_pay`, `visit_fee_cover`. A new ledger kind is in
  none of them until the owner decides. **`pay_rebalance()` is the one
  step**, run by `post_txn()` (the one writer) under `pay_lock(pro)` after
  every money change: release every allocation touching something reversed
  or not yet payable, then free credit pays the oldest unpaid debt first.
  So reversals work in any order with no special cases. The rule tested
  after every step (several hundred random sequences in `paydate.test.mjs`):
  unpaid debts − free credit = `pro_owed()`.
- **`pay_lock(pro)` serialises everything that can change his position**:
  `post_txn`, `make_offer`, `claim_payment`, `admin_reject_claim`,
  `admin_extend_pay`. Take it after any other lock, never before.
- **`pay_fees(pro)` is the one place a fee's dates and status are worked
  out** (not_due, due, grace, stopped, protected, extended, paid, appeal);
  `pay_state(pro)` is the whole position for both screens. A pending
  `payment_claims` row protects only its amount, oldest fees first, until
  the office decides. `pay_clock()` (pg_cron, 05:00 UTC = 10:00 Islamabad)
  sends at most one reminder per technician per day (`pay_reminders`) and
  tells the office about claims waiting `pay_verify_business_days` (3)
  business days — Monday to Friday minus `pk_holidays`, the office's list —
  once each business day.
- **Extensions** (`admin_extend_pay`, `pay_extensions`,
  `pay_extension_fees` keyed by fee, so never twice): only fees already
  `stopped`, 3–14 days, once per spell, ending at the midnight after
  `until_day` with no second grace.
- **A visit-fee refund charged to him is recorded, then appealed, then
  posted** (`refund = 'charge_pending'` → `pro_appeal_refund()` →
  `refund_clock()` / the office's `refund_keep` / `refund_cancel` →
  `post_refund_charge()`). Old-rule `charged` rows without
  `refund_finalized_at` are waiting for that appeal and are not payable.
  `APP_EDITION` is 6 for this. Screens: `pro/PayDates.tsx` on My account,
  the banner on Jobs, admin Money (`PayDates`, Give more time…), Visit fees
  (refund appeals), Settings → Public holidays, Flags `overdue`.

### A customer who does not pay the technician (migration `…_payment_disputes`)
- **The owner's decision D35 (12 November 2026).** `payment_cases` is the
  record, one per job, readable by nobody: `pro_report_unpaid()` within
  `unpaid_report_days` (7) of `finished_at`, only on `done` jobs that are
  not `paid_by_pechkas`; `pro_correct_unpaid()` only while `asked` and
  unanswered; `customer_answer_unpaid()` once (`agrees` → `owed`,
  `paid` → `office`); `payment_clock()` (pg_cron, every 10 minutes) moves
  an unanswered case to `office` after `unpaid_answer_days` (3) — **silence
  never blocks her**; `pro_now_paid()`; the office's
  `admin_payment_case(case, action, note, amount, false_report)` and
  `admin_payment_cases()`. Both day counts are locked (the terms and
  agreement state them).
- **Held = the `commission:<job>` posting reversed line for line**
  (`held_txn`), so every D36 and limit check ignores it with no special
  case. **Released only through `release_commission()`**: target =
  `commission_at(max(received − parts, 0), case.commission_bps)`, reserve
  at `case.reserve_bps`, posting the difference from `posted_commission` /
  `posted_reserve` as kind `commission`, keyed `commission_paid:<case>:<n>`
  — each release is a new D36 fee. Nothing was held (no commission, or it
  was already reversed) → nothing is ever released. A downward office
  correction goes through `unrelease_commission()` (reverses every release,
  then releases again). Never post a D35 commission any other way, and
  never reverse a `commission_paid:` line by hand: the case's totals would
  no longer match the ledger.
- **The posting block** is in `no_post_while_fee_unpaid()`: `owed` and not
  `cleared_at`, never while asked or with the office; `paid_by_pechkas`
  jobs (replacements) are never blocked. The app shows the trigger's own
  sentence because `ask()` passes a `P0001` message through.
- **Guarantee while a case is open** (`payment_case_open()`): a new claim
  is `office_review` with `sent_to_pro = false`; a waiting or coming claim
  moves there through `claims_to_office()` (no clock runs on it).
  `admin_review_claim()`: `replace` (no charge), `replace_charge` (only on
  the office's own finding; then the usual A21 charge and appeal),
  `not_covered`, `to_pro` (fresh `claim_answer_hours`). A payment case
  never creates a charge by itself.
- **What each side sees** is `payment_view(job, side)`: her words and
  screenshot never reach him; the notification is `payment_question`, a
  job number only. Flags `unpaid_reports`, `false_unpaid`, `unpaid_jobs`.
  Screens: `pro/Unpaid.tsx` on My account, `customer/Payment.tsx` on her
  job, `apps/admin/src/PaymentDisputes.tsx`, the held-claim card in
  `Guarantee.tsx`. `APP_EDITION` is 7. The terms, technician agreement and
  privacy page say the same, with the D35 lawyer markers. Tests:
  `paydispute.test.mjs`.

### Money and trust (phase 5)
- **Commission is 10% of the LABOUR**: `agreed_paisa − parts_paisa`, through
  `commission_on()`, rounded down, the same as `commission()` in
  `packages/shared`. Parts need a receipt photo (`job_photos.stage =
  'receipt'`). `parts_paisa` and `commission_paisa` are fixed on the job
  when it is done. A visit fee (`stopped`) carries no commission.
- **The owner's rule for every commission (D13, A67): Pechkas earns
  commission only on completed repair labour the customer has paid for**
  — a job that counts as `done`. Never on a visit fee, parts with a
  receipt, a `paid_by_pechkas` repair, a cancellation, a no-show or an
  unsuccessful visit. A new kind of money starts at no commission unless
  the owner decides otherwise.
- **`visit_fee_report()`** (migration `…_visit_fee_report`, granted to
  nobody, read through `admin_visit_fees().report`) puts every fee in ONE
  bucket by its status today — paid, outstanding (due/unpaid), disputed,
  waived, covered — so the buckets add up to `recorded` by count and
  rupees, per Pakistan month and in total; kept = paid + covered. Its
  `potential_commission_paisa` is `commission_at()` at the locked
  `commission_bps` on **paid** fees only, per fee: a figure on a report,
  never a ledger line or a balance. `feereport.test.mjs` moves fees
  through every state and checks nothing is counted twice.
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
- **Pay Pechkas** (migration `…_pay_pechkas`, the owner's request instead
  of a wallet): on My account, `PayPechkas.tsx` shows where to send the
  money (`pay_to`, selectable so a long press copies it) and **I have
  paid** — amount, JazzCash / Easypaisa / bank, the transaction ID and a
  screenshot from the gallery, uploaded to his own folder. `claim_payment()`
  refuses more than he owes, a screenshot that is not his, not uploaded or
  used before, and a second claim while one waits; the office's phones are
  told. Since A5 (below) a claim counts at once; claims still `pending` from
  before it are the office's, under this old rule: Confirm goes through
  `admin_settle()` keyed `claim:<id>`, **Not received** needs a reason.
  Cash is still given in person and recorded by hand.
- **A5 (the owner, 17 November 2026; migration `…_payments_count_at_once`):
  his "I have paid" counts at once.** `claim_payment()` writes the same
  `settle:claim:<id>` line Confirm wrote, so D36 and the limit see it at
  once, and tells nobody: the office has **Money → Payments to check**
  (`admin_payments_to_check()`, oldest first, days left of the 30) and
  `payments_to_check_clock()` tells it once a day at most. **A transaction
  number is used once, ever** (`tx_key()`: letters and digits, capitals;
  `payment_claims_ref_once`). **Never call it "verified"** — the tests read
  every refusal and message. **Final after `claim_final_days` (3, calendar
  days — no holiday list)** for counting trial jobs only: `credit_final()`,
  `fee_paid_final()`, which `trial_review()` asks instead of `pay_fees`.
  **`admin_claim_correct(claim, received, note)`** within
  `claim_correct_days` (30): reverses the claim's line in full and, for
  "Received less", posts what arrived as a new line (`settle:claim:<id>:
  received`) — the ledger knows a line as live or reversed, never half, so
  never post a partial reversal. A flag (`short_payments`) every time;
  `trial_after_shortfall()` sends a first job that counted on that money
  back to waiting and its trade back to trial, and the clock counts it
  again once the missing amount is paid and final. **The second within
  `claim_strike_days` (90) pauses his new offers by rule** (`pay_pauses`,
  `pay_paused()`, folded into `pro_paused()` so every door stops him;
  `pro_pause_until()` stays the office's dated pause alone). No end date:
  he writes `pro_pay_appeal()`, the office answers `admin_pay_pause(lift |
  keep, note)` under **Exceptions**, and an appeal unanswered for
  `pay_appeal_remind_days` (3) is a reminder there. All four numbers are
  locked: the technician agreement states them. A payment company can make
  a claim final later through `payment_provider_result()`, granted to
  `service_role` only; nothing calls it yet. Tests: `pay.test.mjs`, and the
  A5 section of `firstjobs.test.mjs`.
- **D38, launch offers (A99–A101, migration `…_launch_offers`).**
  **`commission_rate()` is still the one place a rate is decided**: the
  usual 10% or 7%, lowered to `launch_bps` (5%) when `launch_applies(pro,
  trade, at)`. That needs the cut-off set (`launch_apply_by`, YYYYMMDD, 0 =
  off), `applied_at` by that day, still `trial_jobs` good jobs in the trade,
  and `at` between `launch_marks.third_good_at` and `launch_until()`: 90
  days (`launch_days`) after the trade's first approval, never later than
  `launch_cap_months` (12) after the 3rd good job, ending at midnight in
  Islamabad. The marks are set once by triggers (`trial_launch_mark`,
  `trade_launch_mark`) and never moved. **The rate is fixed when she
  chooses him** (`job_launch_rate` trigger → `jobs.launch_bps`), so it can
  only stay or fall before he finishes. `repeat_pair()` is the 7% test on
  its own: a launch rate must never be labelled "repeat customer".
  **Referrals**: `pros.ref_code` (`referral_code()`), `set_referrer()` until
  his application is approved, `referral_credits` (pending → earned |
  over_cap) worked by `launch_clock()` every 10 minutes through
  `referral_review()`: 3 good first jobs in a trade, each commission paid
  by final money of his (`fee_paid_final()`), and past `correct_until` on
  every claim of his that paid them. Ledger kind `referral_credit`, account
  `promotions`. **Never cash**: `pay_rebalance()` never lets it pay a
  payout, `admin_owed_to_pros()` and `admin_pay_pro()` subtract
  `promo_free()`, and `fee_paid_final()` ignores it, so it never proves the
  referrer paid for a first job of his own. The share message (Urdu then
  English, `shareUr*` / `shareEn*` in `words.ts`, `shareMessage()` in
  `src/pro/Launch.tsx`) says he gets a small credit, drops the 5% lines
  while the offer is closed, drops the credit line once he is at the cap,
  and the button is drawn only with `office_info.app_link`. **Its Urdu is a
  draft for a native speaker.** All six numbers are locked: the technician
  agreement states them. Tests: `launch.test.mjs`.
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
  a note. **The office answers in writing, in the app, never by a call**
  (the owner's rule; migration `…_office_answers`, tests
  `answers.test.mjs`): `admin_answer_problem(id, answer)` writes
  `problems.answer` for the person who sent it (500 letters, no CNIC,
  correctable, the latest shown) and tells them with `office_answer` — the
  job number only, never the answer. They read it through `my_reports(job)`
  (their own rows only, never `office_note`, which stays the office's
  record): `JobReports` under the Report box on the job (`UnderWay`,
  `PastJob`, the technician's `OnTheJob`) and under "Your messages" on
  Write to the office (`ReportItem`, `src/components/Reports.tsx`). A
  tapped `office_answer` or `office_wrote` notification opens `/office`.
- **Write to the office (`app/office.tsx`) is the one way to reach the
  office** (the owner's rule: everything with the office happens inside the
  app; migration `…_in_the_app`, tests `inapp.test.mjs`). Help's last row,
  Support in the menu, Safety, Emergency and every "Write to the office"
  button on a job open it, the job already chosen (`toOffice(job)`). The
  person picks the job (`office_jobs()`, their last 60 days) or "Not about
  a job", writes, and sends (`write_to_office(job, text)`: their own job
  only, 5–500 letters, no CNIC, 10 a day): a `problems` row of kind
  `message`, `job_id` empty when it is about no job. The office's phones
  are told who wrote and the job number, never the words
  (`office_message`). The office answers on Problems
  (`admin_answer_problem`), and can write first wherever the panel used
  to offer "Call" (`WriteTo` in `apps/admin/src/WriteTo.tsx`,
  `admin_write_to(job, side, user, text)`: a row of kind `office`, closed,
  told with `office_wrote`, no words). `admin_problems()` carries no phone
  number. No function, refusal, notification or office alert may tell
  anybody to call, ring or WhatsApp the office: `inapp.test.mjs` reads
  every function and every `push_words` line, and `help.test.ts` every
  screen. Customers and technicians may still call each other, and the
  emergency numbers are calls; neither is the office.
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
  there) and a **Contact Pechkas** card to Help; Settings and Help have no
  row per page (the menu's Legal row is the way in). The reader
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
  (`repeat_commission_bps`) when the pair has a **done** job finished in the
  `repeat_window_months` (12, locked; A105, migration `…_repeat_window`)
  before she chose him — `repeat_pair()`, the one test, measures from the
  job's `assigned_at`, or from now while it is open — 10% otherwise.
  **Online is his own switch (A106)**: nothing turns it off by itself.
  Stopped and cancelled jobs do not count. Once she has chosen him the
  window is fixed at `assigned_at`, so the rate can only stay or fall by
  the time he finishes; before that the feed shows the rate "if she chose
  him now", which can rise only if an old job passes the 12 months first. `finish_work()` fixes `commission_bps` on the job with the
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
- **The guarantee promise is settled (November 2026):** 30 days for
  repairs and installations, 7 for services, the same on the website and in
  the app. Change it in both, and the terms, in the same week.

### Which copy is which
- **Every screen shown to the owner looks as it will on his phone** (his
  standing rule, 25 November 2026: "I always want to see how the real
  screens will appear on the app"). Screenshots, galleries, the map's App
  screens and any picture sent to him show the app alone: the phone's
  status bar (9:41, signal, battery) and the space Android leaves for it
  (safe-area insets, set through Chromium's
  `Emulation.setSafeAreaInsetsOverride`), a **real street map**
  (`TileMap.web.tsx`, OpenStreetMap's own tiles, switched on only by
  `window.__pechkasRealMap` in the screenshot script — the published demo
  cannot load outside pictures and keeps the drawing), and real-looking
  minutes (the demo answers Google's asks itself, `answerRoutes()` in
  `scripts/demo/server.mjs`, and its help panel says so). **Never** the demo
  page's green bar, its sign-in help, the drawn street plan or a frame of
  anything that is not the app. The approved mocks are the standard: put
  the screenshot beside the mock before calling a screen done.
- **The clickable demo** (https://claude.ai/artifact/C5cHrZkaysrbB16jkGiqNG,
  the owner's request) is this app's web version with a real Postgres
  (PGlite, every migration) running inside the page: made-up people, pretend
  sign-in (any number, code 123456), nothing sent anywhere. Built by
  `scripts/demo/build.sh`, checked by `scripts/demo/serve.mjs` and
  `check.mjs`, then published to the same URL. **Refresh it after a change to
  a screen or a migration**, or it shows him an older app. The example jobs
  are added in the browser (`server.mjs`), so their days are always
  tomorrow. The page cannot use a camera, a real map, location or
  notifications, and says so.
- **The decision map carries the demo and the screens too** (the owner's
  request, 24 November 2026). Three buttons at its top: **Decision map**,
  **App screens** (`#screens`: every screen as a screenshot, with review
  notes; the same pictures as https://claude.ai/artifact/Cwq32rcn2JGAbbbYan9yMD)
  and **Try the demo** (`demo/index.html` inside the map's own artifact: the
  built demo as a full HTML page, with links back, keeping the map's `pk-…`
  settings when it clears its storage). When the demo is refreshed, publish
  its files under `demo/` of the map as well; when screens change a lot,
  retake the screenshots (Playwright over the local demo, at 390 × 844,
  scale 2) and republish both. The map is shared by link, so the screens and
  the demo are too: made-up people only.
- **Over-the-air updates (EAS Update, the owner's yes, 17 November 2026).**
  `expo-updates`, `runtimeVersion` policy `appVersion`, channels `preview`
  (his test phone) and `production` (the store) in `eas.json`. Every push
  to main that touches `apps/mobile/**` or `packages/shared/**` is sent to
  `preview` by `.eas/workflows/test-phone-updates.yml`; store users get
  one **only** when `apps/mobile/release.json` changes
  (`store-updates.yml`) — change it only when he says "send it to the
  store users", after he has run that code's migrations. **A native change
  needs a new build**: `npm run native:check` (part of `npm run check`)
  hashes app.json, app.config.js and the dependencies into
  `apps/mobile/native-stamp.json` and fails if they change while
  `version` does not — raise `version`, run it with `-- --write`, and tell
  him a build is needed. **An update can arrive before his migration**:
  `src/control.tsx` reads `db_version()` with the office switches and,
  only on a clear answer that the database is older than
  `NEWEST_MIGRATION`, draws `Trouble` kind `database` ("Waiting for a
  database update"), asking again every 30 s; no answer never stops
  anybody. Settings' `ThisCopy` names the running update and its channel.
  Undo is the dashboard's Republish (docs/OWNER.md, "Undo an update"), or
  a revert sent as a new update.
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
  as Safety; Notifications is a soft-green or soft-yellow status card and
  an inbox of rows, each the job's drawing with a badge; the technician's application and its "received"
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
  ☰ `MenuButton` (`src/components/Menu.tsx`) opens a side menu,
  redesigned at the owner's request (24 November 2026) after many rounds:
  **the app's yellow top** (the same lit yellow as home, `Glow` from
  `YellowTop.tsx`) with the Pechkas mark, the × and the person — initial
  in yellow on an ink disc, name, number, a white chip saying Customer or
  Technician (not a button: Settings is a row); then **one plain list
  straight on white — no cards, no lines, no groups, no headings** (he:
  "professional apps don't categorise them, just keep a proper sequence")
  in one order: Home or Jobs, My jobs or My account and Guarantee claims,
  Notifications, Settings, Help, Support (saying "In the app"), Safety,
  Legal, Tell a friend (the phone's share sheet, words that claim only what
  is true). Rows are 44 tall, the tightest a finger can safely tap: a
  **two-tone icon** (`DuoIcon.tsx`) on a 36 soft-yellow tile, the words, a
  light chevron; the current screen on soft yellow, its tile full yellow.
  My jobs carries the number of her jobs still happening, read from
  `my_jobs()` as the menu opens — no badge at nought. At the foot one crisp
  yellow button, **"⇆ Technician mode" / "⇆ Customer mode"** (`ModeSwitch
  menu`: one line, no second line, no arrow — the owner's "crisp, sharp"),
  and the version under it. **The icons were redrawn for this**
  (`packages/shared/src/duo-icons.ts`, so Settings, Help and the office
  panel changed too): inside 3–21, one clear shape and at most two
  details, yellow on one part — the busier set looked "collapsed" at 22
  points. Guarantee claims is `medal`; `flag` stays Report. **Switching
  mode is one movement** (`SwitchCover.tsx`, `SwitchCoverHost` in
  `_layout.tsx`, the owner's choice from a video): the new side's colour
  (green technician, yellow customer) grows from the tapped button, the
  screw turns with the side's name rising under it while `switch_mode()`
  runs, then the cover lifts off the new side's first screen. `go(before,
  from)` in `src/mode.ts` waits for the full colour (`covered()`) before
  `refresh()` and the navigation, because each side's screens send the
  other side home the moment the role changes; a refusal shrinks the
  colour back (`drop()`); a customer with no application is not covered
  (that tap opens the form). Transform only; "remove animations" skips it.
  **The whole menu is one scrolling page**: on a short phone the yellow
  top, the rows and the button scroll together, because a fixed foot once hid
  the last four rows behind the buttons at 320 × 640. **It is drawn by
  `MenuHost` at the root (`_layout.tsx`), never in a Modal**: a Modal is
  its own window, and on the owner's Android 9 phone it stopped short of
  the status bar and the button bar, so the dimming did not reach the
  edges. The phone's Back button closes it. Every item goes to a real screen:
  `/notifications` is what Pechkas told you (below), and
  Support opens Write to the office. Customer screens are a light grey
  `colour.canvas` with white rounded cards, bold black headings, yellow as
  the one highlight. **Home shows only what matters, each thing once** (the owner's
  choice, 24 November 2026, replacing the map home): the yellow top as the
  sign-in pictures — the ☰ menu, the greeting, "What needs fixing?" on one
  big line with **no picture beside it** (A122, the owner's choice: the way
  professional apps do it; the work tiles' pictures carry the look) and
  the search box,
  which opens **Search** (`app/find.tsx`); any job still happening, on top
  until it is over, its yellow bar saying what she has to do; then **every
  kind of work** with the things it covers under its name ("Plumber — Taps,
  toilet, geyser, motor"), the first three in the trades' own order big (AC
  tall and yellow), the rest two by two — a tap opens that kind of work's
  page (`app/work/[trade].tsx`). **These screens share the new look** (the
  owner's choice, 24 November 2026): the yellow top (`YellowTop.tsx`, the
  sign-in pictures' glow), big drawings, black buttons, prices in pills
  (`PricePill`), and lists that rise in once (`Rise.tsx`). A kind of work's
  page: its big drawing and "What is the problem?"; a trade with groups
  shows them as **picture tiles** (Taps and sinks, Toilet, Geyser…, each
  with its own drawing — `art` in `WORK_GROUPS`, drawn in `TradeArt.tsx`),
  and a tap opens **that group's own page** (`app/group.tsx`, A124: the
  owner's choice of design B, 28 November 2026 — the sheet it replaced
  showed each picture at thumbnail size): the yellow top with the back
  button, the group's name, "Tap the one that looks like yours" and its
  picture, then **one wide card per job** (`WideJobCard` in
  `components/JobCards.tsx`: the picture large on the left, the name, one
  short line from `JOB_LINES` in `packages/shared/src/work.ts`, the usual
  price). A trade without groups lists its jobs as the same wide cards, so
  every kind of work reads the same. The short lines say only what the job
  covers — never a price, a time or a promise (`jobs.test.mjs` checks every
  job has one and none does); **Something else** is the black tile with a yellow
  microphone. **Search** (`app/find.tsx`): "What do you see?", and before
  typing ten words to tap (`WORK_SUGGESTIONS`; `jobs.test.mjs` checks each
  finds a job); results are cards with the job's drawing, its trade and
  the price pill. A job there or on a kind of work's page opens **Post a
  job** with that job chosen (`trade` and `type`): the job is the yellow
  picture at the top (`Screen`'s `top`) with **Change**; then four
  **numbered steps** — 1 What is wrong? (the voice note is the one big
  black button, `VoiceTile wide`; Video and Photo under it), 2 Which day?,
  3 Where?, 4 Your price — with Good to know unnumbered before the price,
  and a black **Post job · Rs …**. Opened with nothing chosen, Post a job
  keeps its drop-down. Home's other kinds of work are white cards with the
  drawing on a yellow disc (the picture above the words under 360 wide). A
  new customer's home ends with **How Pechkas works** on a green card until
  her first job is done, then one line saying My jobs, Help and Safety are
  in the menu. **Nothing else, on purpose — no
  duplicates** (the owner's rule): the map and "Set the job's address", the
  green call to action, voice and video, recent jobs and Why Pechkas were
  all second ways to somewhere else and are gone. How the work is shown is
  `packages/shared/src/work.ts`: `WORK_THINGS` (the line under each name),
  `WORK_GROUPS` (a job in no group goes under "More jobs", never hidden),
  `WORK_ALSO` (UPS and inverter has no list of its own, so its page offers
  the electrician's "UPS or inverter connection" with its trade's name) and
  `findJobs()` (a word must start a word of a job's name; only when no name
  matches does it look at the trade and what it covers; English only, no
  Roman Urdu words until the owner says so). `jobs.test.mjs` fails if a
  group names a job that does not exist, misses one, or a trade has no
  line. The drawings on these screens are `TradeArt.tsx` (the sign-in
  screens' style), **or a picture where one exists (A121)**: `WorkArt.tsx`
  draws the picture named in `JOB_PICTURES` / `ART_PICTURES` (shared
  `work.ts`, files in `assets/work/`, made with Figma's image tool and cut
  out) and otherwise the drawing. Every trade had pictures by A123 (each page, its
  group tiles, a list whose jobs all have their own — then "Tap the one
  that looks like yours" — a page without groups, whose job cards then
  carry the picture too, search results and the top of Post a job);
  home (the tiles and the job card on top) and the search's list of
  kinds of work use them too; home's yellow top has no picture at all
  (A122). **The eight jobs added by A125 have their 3D pictures too**
  (made the same day), and Water tank has its own picture and page top;
  its drawing (`tank` in `TradeArt.tsx` and `Art.tsx`) stays as the
  fallback. TV wall mounting is its own group, "TV" (art `tv`), so it
  never shares the fans picture. **Water tank** (A125) is overhead tanks
  only; underground tanks stay out (bad air inside one), and every A125
  price is NULL ("After a look") until the owner gives one. **A126** added
  fourteen more jobs the same way, with their 3D pictures, and a new kind
  of work, **Sofa and carpet cleaning** (`cleaning`: sofa, carpet or rug,
  mattress; its drawing is `cleaning` in `TradeArt.tsx` and `Art.tsx`);
  UPS and inverter now has a job of its own (battery replacement), and
  Plumber's "Drains and leaks" group is "Pipes, drains and leaks". Whole-
  house, office and kitchen deep cleaning stay out: a team's work. **The pictures are 3D,
  every trade (A123, built trade by trade, the last on 27 November 2026)** — soft 3D objects on the same yellow
  circle, WebP, made one at a time and moved onto the circle by
  `scripts/oncircle.py` — and their pages open with a wide 3D picture filling
  the yellow top (`topOf()`, `YellowTop picture`). **How a trade is made, mocked, built and
  published, and where it stands, is `docs/PICTURES.md`.** Every other place a job shows — My jobs,
  the job's screen, a finished or cancelled job, Past, notifications, the
  delete-account blocker, the technician's offer sheet, his job card and
  his finished-today rows — uses
  `TradeTile job={title}` or `WorkArt` + `pictureOf(trade, title)` (a job's
  `title` is its job's name); `design:check` fails on a screen drawing
  `<TradeArt>` itself. `jobs.test.mjs` fails if a pictured job is
  not a real job. The tiles rise in once as home opens; nothing moves
  after. The drawings are `src/components/Art.tsx` — objects, never people,
  over a yellow sweep; every trade in `public.trades` has one.
- **The technician side is inDrive's driver side** (`src/pro/Work.tsx`):
  the ☰ menu, the **Online / Offline switch** in the middle of the top bar
  and what he owes on the right (tap: his account); under it a greeting by
  the phone's clock and his first name over the screen's heading (**My
  jobs** while he has one, otherwise **Jobs near you**, or **Ready for
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
  suggest) — since A117 exactly the approved mock: the job's drawing,
  name and "Sara · 9 min away · 2.1 km", her words and media, Customer's
  offer / You keep, "Or ask for more:" and Accept; once sent, a green
  "✓ Offer sent to Sara" with Change and Withdraw under it. No − / +
  stepper, no note, no price-range card (the mock has none); parts only
  on a first job (A104). The switch's colours
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
  Home has no map any more (the owner's no-duplicates rule): the address is
  set on Post a job, which goes to the Address card instead of the pin
  picker when there is no key, since the picker needs a real map to move; Post a job and the
  technician's job show the box once there is a spot, and his tap still
  opens directions in Google Maps. Never render `MapView` on Android
  without the key. The iPhone uses Apple's maps and needs no key.
  `Map.web.tsx` is the browser's stand-in, the same drawing — never shipped. Location is
  asked for only when a button is pressed (`askPosition()`);
  `knownPosition()` never asks. The pin a customer places is
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
  welcome screen (`app/start.tsx`) was redesigned at the owner's request
  (24 November 2026, "2B"): three pages to swipe, each full screen in one
  brand colour — yellow, green, ink — with a soft light behind its drawing
  (`glow` and `GLOW_STOPS` in `packages/shared/src/tokens.ts`, drawn with
  react-native-svg, no new native library); a two-line headline,
  the second line in the page's accent colour (green on yellow, yellow on
  green and ink — the owner's design "A": "Your price, / your choice.",
  "Verified / technicians.", "Pay when / it's done."), one short line
  and one picture that acts out the headline (A120, the owner's choice
  after many rounds of drawn symbols: a customer holding her phone with her
  price on it; a technician in a Pechkas cap with his card, toolbox and a
  verified tick; a customer paying beside the fixed AC) — drawn people in
  the app's colours on the yellow screw-head circle, made with Figma's
  image tool and cut out so they stand on the page's own colour
  (`assets/welcome/*.png`), never a photo or a real person; the name over the top; **every page's words take the tallest
  page's height** (measured), so the drawings sit level and the same size
  on all three — when "Your price." was one line, its drawing sat higher; at the foot
  small dots, **Continue with phone** in the page's main colour (always the
  big button), a thin **"or continue with"** line so nobody reads the
  buttons as steps (the owner's question), then **Google** and **Email** as
  two white cards side by side, each mark on the same grey circle — Google's
  G and `MailMark`, a plain dark-grey envelope outline, not Pechkas' colours
  (the owner's choice) — (Google only when it is on; Email alone full
  width otherwise; their screen-reader names stay "Continue with …"), and
  the terms line. Less on each page on purpose: people swipe past welcome pages. The
  words and buttons take the current page's colours when it settles —
  colours snap. The headline shrinks with the width so "technicians." never
  breaks at 320. Every page says only what is true: no numbers, no
  ratings, and the pages never turn by themselves. **"Verified" is the
  owner's word (A118) and is true only once the identity service is on and
  checks every technician before his first job (A119)**: switching it on
  is a step before the app goes to the public, and no update goes to store
  users before then. **The sign-in screens — number, email, code,
  customer or technician, and name — share `AuthScreen`**
  (`src/components/AuthScreen.tsx`, the owner's choice of 24 November 2026,
  design "C"): a white page, which meets the phone's light keyboard with no
  line; at the top a yellow picture card (`glow.yellow`) whose drawing says
  what is happening before a word is read (`SignInArt.tsx`: a phone getting
  a text, a letter with the code, a code beside a padlock, a house and a
  toolbox, a "Hello" name tag — objects, never people), with the back
  button inside it and no logo; then one question, one box, one quiet line
  (`AuthNote`), and at the foot above the keyboard **one black button**
  (`AuthButton` `main`, pale and inert until it can act) and the other way
  as an underlined link 46 points tall (`link`). Boxes are soft grey at
  rest and white with an ink line while typing (`authBox`, `AuthField`).
  The picture card is 196 tall, 160 under 760 points of height and 128
  under 700, so the box still shows above the keyboard. **The motion is
  the owner's request**: each drawing moves once as its screen opens, in
  under a second, then stays still — the phone stands up and its message
  grows from its tail, the padlock drops beside the code, the house and the
  toolbox rise one after the other, the tag swings in on its hook and its
  signature is written. A part turns or grows about its own point on the
  220 × 150 grid (`about()`), transform only, native driver, and with
  "remove animations" on every part is simply in place (`useStill()`).
  Ticks pop in (`Pop`). A wrong code shakes the boxes (counted by `fails`,
  so the same sentence twice still shakes); the right one turns them green
  and opens the padlock. **Continue** stays pale until
  `pakistaniMobile()` accepts the number; the box's green tick pops in then.
  `PhoneBox` (with `big`) has the flag and **+92** fixed in front — a
  label, not a menu — and shows what is typed grouped 3-3-4 through
  `typedMobile()` (digits only, a leading 0 or pasted +92 dropped), on the
  plain digits keypad, never the dialler's. The code screen says where the
  code went with a **Change** button (back to the number), says "Never
  share this code with anyone", and offers **Send a new code** as the link,
  grey with a 0:42 clock until it may be pressed. **There is no "signed
  in" screen** (the owner's choice): a right code turns the six boxes green
  with "Verified. Signing you in…" for `SHOW_VERIFIED_MS` (700), then the
  app moves on by itself; a wrong one turns them brick with one sentence.
  "Are you a customer or a technician?" has no back button: two cards side
  by side, a tap picks one (tick, and its drawing above hops) and the
  button says the choice ("Continue as a customer"), with "Signed in as …"
  and **Not you? Sign out** under it. The name screen repeats the choice
  with **Change**; an email account types its number there in the same
  `PhoneBox`. No passkey: it needs
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
- **Post a job's look** (`app/post.tsx`, see "Post a job is three steps"
  under Jobs): the yellow top carries back, the step bar ("1 of 3"), the
  job's drawing, name and **Change** — never its price, which is on the
  price step only (the owner: no duplicates). **One tap of − or + is Rs 50**
  (`PRICE_STEP_PAISA` in `packages/shared`). The job is chosen in a `Sheet` (kind of work, then
  which job). On a narrow phone the stepper and the thumbnails shrink and
  sector names never break at their hyphen. A refusal for a box the page
  does not draw is shown in full. A new box needs its field in `STEP_OF`
  and `ANSWERS`.
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
  offer **Emergency numbers** (the Safety page works with no internet) and
  never a call to the office, which is reached only in the app.
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
  on its own; home's yellow top may run under the clock, since its own
  colour is the strip. Check any new
  screen with Android's bars in place, at 320 wide too.
