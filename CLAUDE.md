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
- Customers and technicians sign in with a **mobile number and a code**.
  `pakistaniMobile()` in `packages/shared` is the one rule for what a number
  is. The office signs in with **email and password**, one login each, made
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
- Database refusals are English. On the technician side `proError()` turns
  the `field` into his language — put the words in `words.ts`, not the SQL.
- The `EXPO_PUBLIC_*` and `VITE_*` values are baked in **at build time**.
  Without them the app says it is not connected and the admin panel says so
  too; Vite even drops the code that would use them. Set them in Expo and
  Vercel, then rebuild.

### Jobs (phase 2)
- **Price guidance is the website's prices, never ours.** `job_types` is
  seeded from `src/data/services.js` in the website repository; a job the
  website does not price says "Price after a look" rather than a number.
  The lowest offer is the `min_offer_paisa` setting (Rs 1,000, the website's
  inspection fee). If the website's prices change, a migration updates
  `job_types`.
- **Only `live` sectors take jobs.** Nobody is promised a visit where Pechkas
  has nobody.
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
- **Every word is in `push_words`** (key, `ur`, `en`), filled by `say()`
  with `{slots}`; a slot can be per language as `name_ur` / `name_en`. `ur`
  is NULL only for customer and office messages, and a test fails if a
  technician's message lacks it. Change wording with a migration that
  updates the table. **`docs/ROMAN_URDU.md` is generated** by `npm run
  words` from `words.ts` and the migrated table; `npm run check` fails if it
  is stale, so the owner never reviews an old list.
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
- The Me screen shows and turns on notifications for anyone, so the owner's
  own phone can receive the office alerts without having a job open.
  `useNotify(null)` waits: a technician's language must be read from the
  phone before his token is saved, or it is saved in the wrong one.

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
- `push_words.who` says who reads each message; the database refuses a
  technician's message without Roman Urdu (`push_words_urdu`).
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

### Secrets
- Nothing secret is ever committed (`.gitignore` blocks keystores). Only
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` may be in the
  app; they are set in Expo's environment variables, not in a file here.
- The Android upload keystore lives in Expo's credentials and in the owner's
  private storage. Never in the repository.

## The look (`apps/mobile/src/theme.ts`)

- The website's colours: green `#0b5148` trust, yellow `#ffc53d` action and
  money, ink, paper, brick for warnings only. Every text pair ≥ 4.5:1.
- **No decoration.** The owner rejected truck-art and ajrak as unprofessional.
  The app is Pakistani in how it works: voice notes in Urdu, landmarks beside
  the pin, load-shedding asked about, parts with a shop receipt, the
  chowkidar at the gate, family told who is coming, Roman Urdu on the
  technician side (the owner checks every line).
- Customer side light, technician side dark.
- **Only `transform` moves.** `Press` sinks on tap and buzzes; it never eases
  a colour. A control whose text colour changes between states eases no
  colour at all — halfway through, text and background are the same grey.
- One line-icon set (`Icon.tsx`), no emoji. No stock photos of strangers.
- The mark's paths in `Mark.tsx` and `scripts/make-icons.mjs` are the
  website's and must stay identical. Never edit `apps/mobile/assets/` by
  hand; run `node scripts/make-icons.mjs`.
- No button may do nothing, and nothing says "coming soon": the stores reject
  both. The `/soon` screen was deleted before the first store build; a
  feature that is not built has no button.
- Every tap target is at least 44 × 44.
