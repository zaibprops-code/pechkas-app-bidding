# Pechkas app — the owner's guide

Plain steps for everything you do yourself: trying the app on your phone,
running database changes, and where every account and setting lives.

---

## Where things stand

**Phase 6 — Google Play.** Everything the store asks for is ready, and the
steps are under **"Putting the app on Google Play"** below:

- the store text, the icon, the banner and six screenshots
  (`docs/store/`);
- the answers to every App content form — Data safety, Content rating,
  App access and the rest (`docs/store/data-safety.md`,
  `docs/store/review-notes.md`);
- the app's privacy policy at **pechkas.net/app/privacy** and how to delete
  an account at **pechkas.net/app/delete-account** — new pages on the
  website, nothing else there changed. Both are drafts with a visible
  review box until a lawyer has read them;
- the app itself is tidied for review: no "being built" screen anywhere,
  links to the privacy policy on the sign-in and Me screens, only the
  permissions it really uses, and store builds that number themselves.

Google requires a personal account's first app to run a **closed test with
at least 12 testers for 14 days** before it can go public. The iPhone
version comes after Android is live.

**Phase 5 — money and trust.**

- **Parts and commission.** At **Kaam mukammal** the technician says what he
  spent on parts and photographs the shop receipt. Pechkas' fee is 10% of the
  rest — his labour — rounded down. The customer sees the split and the
  receipt.
- **The books.** Every rupee a technician owes and pays is written in a
  ledger that nobody can edit, not even you; a mistake is undone with
  **Undo**, which writes the opposite and keeps both. 20% of each commission
  is set aside as the **guarantee reserve**. A visit fee carries no
  commission: it is only petrol.
- **The credit limit.** Over **Rs 3,000** owed, a technician cannot send new
  offers. His phone tells him once, and his screen says how much and where
  to pay.
- **Paying.** He sends the money by JazzCash, Easypaisa, bank or cash, and
  you record it in **Admin → Money → Record a payment** with the
  transaction ID. His phone is told. You type, once, where technicians
  should send money; until you do, the app tells them to ask the office.
- **His account.** The technician taps **Pechkas ka baqaya** for **Mera
  hisaab**: what he owes, this month's jobs, parts and fees, his stars, what
  customers said, and every line.
- **Ratings.** Both rate each other, 1 to 5 stars. Neither sees the other's
  until both have rated or two days pass. Customers see a technician's
  stars only after **3 ratings** — "New" before that — and how many jobs he
  has really done. A technician's rating of a customer is seen only by you.
- **Problems.** Either side can **report a problem** during a job or for a
  day after; the customer can **claim the 30-day guarantee**. Both go to
  **Admin → Problems**, and to your phone.
- **The emergency button**, on every job that is on, for both sides. Pressing
  it tells your phone at once, then sends where the phone is if it can. The
  screen shows **Police 15, Rescue 1122, Fire brigade 16, Edhi 115** and
  your office number. "Pressed by mistake" tells you that too. Nothing is
  closed in Problems without a note of what was done.

**Phase 4 — doing the job.** Once a customer has chosen a technician, the
job goes step by step, and every step is written down for you:

1. He taps **Rasta pakar liya** (on my way) and then **Pohanch gaya**
   (arrived). Her phone buzzes at each.
2. Her app shows a **4-digit start code**. He types it in at the gate with a
   **photo of how it was** before he can start. It proves the man at the
   door is the one the app sent. Five wrong codes lock it, your phone is
   told, and you unlock it from the admin panel after ringing them both.
3. If the job is bigger than it looked, he **cannot just ask for more at the
   door**: he sends the new price, a reason and a photo, and she taps
   **Approve** or **Decline** in her app. Declined, the job stops and she
   pays only the **visit fee** — Rs 300 for now (see below).
4. He finishes with a **photo of the finished work**. Her app says exactly
   what to pay him in cash. For 24 hours she has a **Something is wrong**
   button, which comes straight to you.
5. The two can **chat** in the app, text only. You can read every chat in the
   admin panel, and both of them are told so.

The admin panel has new tabs — **Under way** and **Finished** — and each job
has **History, chat and photos**: who did what, when. **Needs you** now
also shows locked codes, problems reported, and jobs that look stuck (on
the way for over 3 hours, or working for over 10).

**Phase 3 — bidding.** A customer posts a job and names a price (phase 2).
Approved technicians who switch themselves **Online** see new jobs in their
own trades and sectors — the sector, the customer's first name, the voice
note and photos, never the street, house or phone number. Each one either
**accepts** the customer's price or **sends his own**, with how soon he can
come and one optional line. The customer sees every offer with the
technician's first name and years in the trade and **chooses one**. Only then
does that technician get the address and the number, and the customer gets
his. You see it all in the admin panel, and a job nobody has offered on for
15 minutes appears under **Needs you**, where you can ring round and place it
by hand.

**Phase 3b — notifications.** The phone now buzzes, even with the app
closed: a technician who is **Online** when a job he could take is posted;
a customer when an offer arrives; a technician when he is chosen, when
somebody else is chosen instead of him, or when a job he offered on or was
going to is cancelled; a customer when you place or cancel their job from
the admin panel; and **you**, on your own phone, when a job has had no offer
for 15 minutes — once per job. The database sends them, through Expo's
free push service and Google's Firebase. A notification says the trade, the
sector, a first name, a price and the job number — **never** an address, a
landmark, a gate note or a phone number, because it shows on a lock screen.
The app asks for permission when a technician goes online and when a
customer has a job waiting, not when it first opens.

It needs a free Firebase account, set up once — **"Setting up
notifications (once)"** below. Until then everything still works; nobody
is buzzed, and the screens still update by themselves while open.

| Phase | What | State |
| --- | --- | --- |
| 0 | Foundations: the app opens, the database is locked down | Done |
| 1 | Sign-in, technician applications, you approve them | Done |
| 2 | Customers post jobs with voice notes, video, photos and a price | Done |
| 3 | Bidding: technicians accept or counter, customer chooses | Done |
| 3b | Notifications: a new job buzzes the technician, a new offer buzzes the customer, a waiting job buzzes you | Done |
| 4 | Doing the job: on the way, start code, photos, new price at the door, visit fee, chat, done | Done |
| 5 | Money and trust: parts, commission, ledger, credit limit, payments, ratings, problems, guarantee, emergency | Done |
| 6 | Google Play: listing, policy pages, forms, closed test → public | **Ready — your steps below** |
| 6b | App Store (iPhone) | After Android is public; needs an Apple Developer account |

## The settings you chose

Stored in the database table `settings`. Changing one is a new migration,
not a new app.

| Setting | Value |
| --- | --- |
| Commission | 10% of the agreed price, labour only |
| Credit limit | Rs 3,000 owed, then no new offers until settled |
| Offer stays open | 10 minutes |
| Untaken job comes to you after | 15 minutes |
| Guarantee | 30 days |
| **Lowest offer a customer can make** | **Rs 1,000** — your published inspection fee. **Confirm or change.** |
| **Highest counter-offer** | **2× the customer's price** (Rs 2,000 job → at most Rs 4,000). **Confirm or change.** |
| Open jobs one customer may have | 5 |
| Jobs one customer may post in a day | 10 |
| **Sectors taking jobs** | **F-11, E-11, G-13** — the same as the website. **Confirm or change.** |
| **Commission** | **10% of the labour** — the price minus parts with a receipt — rounded down. None on a visit fee. |
| **Guarantee reserve** | **20% of each commission**, set aside for redoing failed work |
| **Stars shown after** | **3 ratings**; "New" before that. Ratings may be given for 14 days. |
| **Emergency numbers** | Police 15, Rescue 1122, Fire brigade 16, Edhi 115 — confirmed by you |
| **Visit fee** | **Rs 300 to Rs 1,000**, the petrol for his trip — your decision. Until Google Maps is connected the trip cannot be measured, so it is **Rs 300**, your rule for "no distance". |
| Wrong start codes before it locks | 5 |
| App identifier | `net.pechkas.app` — permanent |

**Still open:**
- **A lawyer reads the two app pages** — pechkas.net/app/privacy and
  /app/delete-account — and the Data safety answers, before the app goes
  public. Fill in the bracketed gaps: the registered business name and
  address, the Supabase region (**Supabase → Project Settings → General →
  Region**), how many days a deletion request takes, how long the
  technicians' money records are kept, and how long photos taken at a
  customer's home are kept after she deletes her account. Then tell Claude
  and the review boxes come off.
- **Twilio** for real sign-in codes, before the public can sign in (steps
  below).
- **Where technicians pay.** Type it in **Admin → Money → Where
  technicians pay** (for example your JazzCash number and account name).
  Until then they are told to ask the office.
- **No commission on a visit fee.** That was taken as the default — it is
  petrol, not work. Say if you want commission on it.
- **The visit fee needs Google Maps** to measure each trip. When you are
  ready, Claude will tell you how to make a Google Maps key (it needs a
  billing card on Google Cloud, with a free monthly allowance), and then
  one more thing to decide: **how many km per litre** to assume, and where
  the **petrol price** comes from — you set it, and update it when the
  government changes it.
- **Cancelling once he has arrived.** For now a customer can cancel free
  until he reaches the house; after that the app tells her to call you.
  Say if cancelling after he has set off should cost her the visit fee.
- **The lowest offer (Rs 1,000), the highest counter (2×) and the live
  sectors** above.
- **Online stays on until he switches it off.** A technician who forgets
  will still see jobs and can still offer — nobody is sent anywhere without
  the customer choosing him, so the harm is small. Say if you want it to
  switch off by itself after some hours.
- **Every Roman Urdu line is in one list: `docs/ROMAN_URDU.md`** —
  notifications first, then the screens, each beside its English. Open it
  on GitHub on your phone, read it as a technician would, and send Claude
  the name in the first column and what it should say.
- **Price guidance.** Within 20% of the website price the app says "Fair";
  below that "Low"; above "Generous". Say if you want different words or
  limits.
- **The Roman Urdu on the technician screens.** Read every line on your phone
  and send corrections. The words are all in `apps/mobile/src/words.ts`.
- **Who sends the real sign-in codes** (an SMS company, or WhatsApp). Until
  then, only the test numbers you add in Supabase can sign in.
- Launch sectors (where your first technicians live).
- **Approval needs all three checks** — identity, a trial job, the rules. If
  you want to approve without a trial job, say so; it is one line to change.

---

## Setting up phase 1 (once)

Do these in order. None of them needs Claude, and nothing secret goes into a
chat.

### A. Supabase: the database changes

Run both migrations from the table further down, in order, if you have not
already: `…_foundations.sql`, then `…_accounts_and_technicians.sql`.

### B. Supabase: your own admin login

1. supabase.com → **pechkas-app-bidding** → **Authentication** → **Users** →
   **Add user** → **Create new user**.
2. Your email, a strong password you keep private, and tick **Auto Confirm
   User**. Create.
3. **SQL Editor** → **New query**, paste this with your real email, and Run:

   ```sql
   select public.make_owner('you@example.com', 'Zohaib');
   ```

   It should answer **Done. Zohaib can now sign in to the admin panel.**
   Nobody can run this from the app or the admin panel — only here.

### C. Supabase: phone sign-in, with test numbers

1. **Authentication** → **Sign In / Providers** (or **Providers**) →
   **Phone** → turn it on.
2. Find **Test phone numbers and OTPs** and add your own number and a code,
   like this — the number without the `+` or the first `0`:

   ```
   923001234567=123456
   ```

   Add one for a second phone too if you want to play customer and
   technician at once. These numbers sign in with that code and no SMS is
   sent, so it costs nothing.
3. Save. **If Supabase will not let you turn Phone on without choosing an SMS
   company first, stop there and tell Claude what the screen says.**

### D. Copy two values into Expo (for the phone app)

1. Supabase → **Project Settings** → **API** (or **Data API** and **API
   Keys**). You need two things:
   - **Project URL** — like `https://abcdefgh.supabase.co`
   - the **publishable** key (older projects call it **anon public**).
     **Never** the `secret` or `service_role` key.
2. expo.dev → **Pechkas App** → **Environment variables** → **Add variable**,
   twice, each for the **Preview** and **Production** environments:

   | Name | Value |
   | --- | --- |
   | `EXPO_PUBLIC_SUPABASE_URL` | the Project URL |
   | `EXPO_PUBLIC_SUPABASE_ANON_KEY` | the publishable / anon public key |

   Visibility: **Plain text** is fine — both are printed inside every copy of
   the app on purpose. The database is what decides who sees what.
3. Start a new **preview** build (steps below). The old build does not know
   these values; they are baked in when it is built.

### E. Put the admin panel online (Vercel)

1. vercel.com → **Add New…** → **Project** → import
   **zaibprops-code/pechkas-app-bidding**.
2. **Root Directory**: `apps/admin`. Framework: **Vite** (it should guess).
3. **Environment Variables** — the same two values, with different names:

   | Name | Value |
   | --- | --- |
   | `VITE_SUPABASE_URL` | the Project URL |
   | `VITE_SUPABASE_ANON_KEY` | the publishable / anon public key |

4. **Deploy**. You get an address like `pechkas-app-bidding.vercel.app`.
5. Optional, later: **Settings → Domains** → add `admin.pechkas.net` and
   follow what Vercel says to add to the DNS.

### F. Try it

1. Install the new build. **Me** → **Sign in** → your test number → the code.
2. Choose **I fix things**, fill in the form, send it.
3. Open the admin panel, sign in with your email, find yourself under
   **Waiting**, record the three checks, press **Approve**.
4. On the phone, pull the technician screen down to refresh: it should say
   **Mubarak ho, aap approve ho gaye**.
5. **Me → Delete my account** should remove you completely. If it says
   "Something went wrong", tell Claude — Supabase sometimes needs one extra
   permission for this.

---

## Try the app on your phone

1. Go to **expo.dev** → team **fixmindss-team** → project **Pechkas App**
   (slug `pechkas-app`) → **Builds** → **Build from GitHub**.
2. Fill it in exactly like this:

   | Field | Set it to |
   | --- | --- |
   | Base directory | `apps/mobile` |
   | Platform | Android |
   | Git ref | `main` |
   | EAS Build profile | `preview` |
   | Environment | Preview |
   | EAS Submit | off |

3. Press **Confirm**. A build takes roughly 10–20 minutes. You will see it on
   the Builds page.
4. When it says **Finished**, open that build **on your Android phone** and
   tap **Install** (or scan its QR code with the phone's camera).
5. Android may say it is from an unknown source. Allow it for this one app:
   it is yours, signed with your own key.

`preview` makes an APK for testing. `production` is only for the Play Store,
in phase 6.

If a build fails, copy the red error lines from the build's page and send
them to Claude.

---

## Trying phase 2

1. **Supabase → SQL Editor:** run `20261017000000_posting_a_job.sql`. It
   should say **Success**. Check **Storage** in the left menu: there is now a
   bucket called **job-media**, marked private.
2. **Expo:** start a new **preview** build from GitHub (same settings as
   always) and install it. The app now asks for the **microphone**, **camera**
   and **location** the first time each is used — allow them.
3. **On the phone:** tap **AC** on the home screen → sign in → choose a job,
   record a short voice note, add a photo, fill in F-11, a street and house,
   choose **Tomorrow · Morning**, and press **Post job**.
4. **My jobs** should show it as **Waiting for a technician**.
5. **Admin panel → Jobs:** it is there with the customer's number, the
   address, a Google Maps link if they added their location, the voice note to
   play and the photo to open.
6. Cancel it from the phone and check it moves to **Cancelled** in the panel.
7. Try something wrong on purpose: G-7 is not offered (Pechkas is not there
   yet), and an offer below Rs 1,000 cannot be made.

---

## Trying phase 3

You need **two phones** (or one phone and a friend's): one is the customer,
one is an approved technician. Each needs its own test number in Supabase
(**Authentication → Phone → Test phone numbers**, see step C above).

1. **Supabase → SQL Editor:** run `20261018000000_bidding.sql`. It should say
   **Success**.
2. **Expo:** start a new **preview** build from GitHub (same settings as
   always) and install it on **both** phones.
3. **The technician phone:** sign in with a number you have **approved** in
   the admin panel. His application must include **AC** and **F-11** (or
   use the trade and sector he did choose in steps 4 and 5). You land on the
   dark work screen. Tap **Offline** — it turns yellow and says **Online**.
4. **The customer phone:** sign in with the other number, tap **AC**, choose
   **Gas top-up**, sector **F-11**, any street and house, **As soon as
   possible**, and press **Post job**.
5. **The technician phone:** within 15 seconds the job appears, showing the
   sector and the customer's first name but **no address**. Press **+** twice
   to ask Rs 200 more, choose **30 min**, and send it.
6. **The customer phone:** within 10 seconds **My jobs** shows the offer with
   "His price" under it. Press **Choose …** and then **Yes**.
7. **The technician phone:** the job moves to **Mere kaam** with the full
   address, the customer's number, **Call karein** and **Naqsha kholein**
   (the map).
8. **The customer phone:** shows the technician's name, **Call**, and **Send
   his name to family on WhatsApp**.
9. **Admin panel → Jobs → Technician chosen:** the job is there with both
   numbers. Try **Cancel this job** with a reason: the job leaves the
   technician's phone and the customer's shows it cancelled, with your reason.
10. Post one more job and switch the technician **Offline**: after 15 minutes
    with no offer it shows under **Needs you** in the admin panel, where you
    can choose a technician and press **Place it by hand**.

Try something wrong on purpose: an offer more than double the customer's
price is refused, and a technician who is not approved never sees a job.

---

## Setting up notifications (once)

Android notifications go through Google's **Firebase**. It is free. You make
one Firebase project and give Expo two files from it. **Neither file ever
goes into a chat or onto GitHub** — only into Expo, as below.

### A. Make the Firebase project

1. Go to **console.firebase.google.com** and sign in with the Google account
   you want to own it.
2. **Create a project** (it may say **Get started with a Firebase
   project**). Name: `Pechkas`. When it asks about **Google Analytics**,
   turn it **off**. Press **Create project**, then **Continue**.
3. On the project's front page press the **Android** icon (or **Add app** →
   **Android**).
4. **Android package name:** `net.pechkas.app` — exactly that. App
   nickname: `Pechkas`. Leave **SHA-1** empty. Press **Register app**.
5. Press **Download google-services.json** and keep the file. Then press
   **Next**, **Next**, **Continue to console** — Expo does the rest of those
   steps for you.

### B. Give Expo the `google-services.json` file

1. **expo.dev** → **Pechkas App** → **Environment variables** → **Add
   variable** (or **Create**).
2. **Name:** `GOOGLE_SERVICES_JSON` — exactly that.
3. **Type:** **File**, and choose the `google-services.json` you downloaded.
4. **Environments:** tick **Preview** and **Production**.
5. **Visibility:** **Secret**. Save.

### C. Give Expo Firebase's sending key

This one **is** a secret: it lets whoever has it send notifications as you.

1. Firebase console → the **gear** next to **Project Overview** → **Project
   settings** → the **Service accounts** tab.
2. Press **Generate new private key** → **Generate key**. A `.json` file
   downloads.
3. **expo.dev** → **Pechkas App** → **Credentials** → **Android** →
   `net.pechkas.app`.
4. Find **FCM V1 service account key** (under **Service credentials**) →
   **Add a service account key** → upload that `.json` file → **Save**.
5. Keep the file in your private storage with the keystore backup, or delete
   it — Expo has it now, and you can always generate another.

While you are in **Project settings**, open the **Cloud Messaging** tab: it
should say **Firebase Cloud Messaging API (V1)** is **Enabled**. If it says
disabled, press the three dots beside it and enable it.

### D. Run the database changes

**Supabase → SQL Editor:** run `20261019000000_notifications.sql`, then
`20261020000000_who_else_hears.sql`. Each should say **Success**. If one
instead says something about an **extension** — **pg_net** for the first,
**pg_cron** for the second: Supabase → **Database** → **Extensions** →
search that name → switch it on → then run the file again.

`pg_cron` is the database's clock: once a minute it looks for jobs that have
waited 15 minutes with no offer. You can see it under **Integrations →
Cron** (or **Database → Cron Jobs**) as `pechkas-needs-you`.

### F. Alerts for you

1. In Supabase → **Authentication** → **Phone** → test numbers, make sure
   your own mobile number is there (step C of phase 1).
2. On your phone, sign in to the Pechkas app with that number → **Me** →
   **Turn on notifications** → **Allow**.
3. **Admin panel → Jobs:** at the top, **Alerts on your phone** → type the
   same number → **Send alerts here**. It should say **One phone will hear
   it**. If it says no phone has allowed notifications, step 2 is not done
   yet.

### E. Build and install

Start a new **preview** build from GitHub (same settings as always) and
install it on both phones. The build must be **after** step B, or it will
not know about Firebase.

---

## Trying phase 3b

Two phones again: one customer, one approved technician.

1. **Technician phone:** open the app and tap **Offline** to go **Online**.
   Android asks to allow notifications — **Allow**.
2. **Customer phone:** post a job in his trade and sector. On **My jobs** a
   green card says **Know when offers arrive** — press **Turn on
   notifications** → **Allow**.
3. **Lock the technician's phone.** On the customer phone, post a second
   job. Within a few seconds the technician's phone should buzz: **Naya
   kaam: AC · F-11** (or the trade and sector you used). Tap it: the app
   opens on his work screen, with the job on it.
4. **Lock the customer's phone.** On the technician phone, send an offer.
   The customer's phone buzzes: **New offer on PK-…**. Tap it.
5. Choose the technician. His phone buzzes: **Aap chun liye gaye**.
6. Cancel the job from the customer phone. His phone buzzes: **Kaam
   cancel … Mat jayein**.
7. **Two technicians:** if you have a third phone, let both technicians
   offer, choose one, and check the other's phone says **Customer ne kisi
   aur ko chuna**.
8. **Your alert:** post a job and let nobody offer. About 15 minutes later
   your phone says **No offers yet on PK-…**, once.
9. **Admin panel → Jobs → Open → Place it by hand:** a technician who has
   not allowed notifications says **no notifications, ring him** beside his
   name.
10. Read `docs/ROMAN_URDU.md` and tell Claude what to change.

**If nothing arrives:**
- Supabase → **Table Editor** → `push_log` shows every notification the
  database tried to send, newest last. `phones` = 0 means that person's
  phone never said yes, or the build was made before step B. The `problem`
  column says why.
- If `push_log` looks fine, Supabase → **SQL Editor** → run
  `select status_code, content from net._http_response order by created desc limit 5;`
  — that is Expo's answer. **InvalidCredentials** means step C is missing.
  Copy those words to Claude — never the key itself.

---

## Trying phase 4

**Supabase → SQL Editor:** run `20261021000000_doing_the_job.sql`. It should
say **Success**. Then start a new **preview** build and install it on both
phones. Use one customer phone and one approved technician phone.

1. **Customer:** post a job. **Technician:** go Online and press **Qubool**.
   **Customer:** choose him.
2. **Technician:** **Mere kaam** shows the job with a yellow **Rasta pakar
   liya** button. Tap it. The customer's phone buzzes "… is on his way" and
   her **My jobs** shows a big **start code**.
3. **Technician:** tap **Pohanch gaya**. Her phone buzzes "… has arrived".
4. **Technician:** type a **wrong** code, take a photo with **+**, press
   **Kaam shuru karein**. It says the code is wrong and how many tries are
   left. Now type the right code from her screen and press it again.
5. **Technician:** **Nayi price bhejein** → type a higher price, a reason
   and take a photo → **Customer ko bhejein**. Her phone buzzes. On her
   screen: the new price, the reason and the photo, with **Approve Rs …**
   and **Decline**. Press **Approve**.
6. **Both:** press **Message** and send each other a line.
7. **Technician:** take an **after** photo and press **Kaam mukammal**. Her
   screen says **Done. Pay … in cash**, with the before and after photos.
   His shows it under **Pichle 24 ghante** with what to collect — and the
   address is gone from his phone.
8. **Customer:** **Something is wrong** → write a line → **Send to
   Pechkas**. Your phone is told.
9. **Admin panel → Jobs → Needs you:** the job is there with **Problem
   reported**. Press **History, chat and photos**: every step, who did it
   and when, the photos and the chat.
10. **Try the other ending:** do it again, but at step 5 press **Decline**.
    The job stops, his phone says to collect only the visit fee, Rs 300.
11. **Try the lock:** on another job, type a wrong code five times. Your
    phone is told; in the admin panel press **Unlock the start code**.

---

## Trying phase 5

**Supabase → SQL Editor:** run `20261022000000_money_and_trust.sql`. It should
say **Success**. Then a new **preview** build on both phones.

1. **Admin panel → Money → Where technicians pay:** type your JazzCash (or
   bank) details as technicians should see them, and **Save**.
2. Run a job as in phase 4 up to **Kaam shuru karein**.
3. **Customer:** press **Emergency**. Your phone buzzes **EMERGENCY on
   PK-…** at once. The screen shows the four numbers. Press **Pressed by
   mistake** — your phone is told that too.
4. **Technician:** take the after photo, type **1500** in **Parts par
   kharcha**, photograph a receipt, and see the fee change to 10% of the
   rest. Press **Kaam mukammal**.
5. **Customer:** the card says what was parts and what was his work, with
   the receipt photo. Give him stars and a line.
6. **Technician:** under **Pichle 24 ghante**, rate the customer. Then tap
   **Pechkas ka baqaya** at the top: **Mera hisaab** shows what he owes,
   the month, and — now both have rated — her stars and words.
7. **Admin → Problems:** the emergency is there, with both numbers and the
   address. Write what you did and **Close it**.
8. **Admin → Money:** **Record a payment** for him — amount, **JazzCash**,
   a transaction ID — and save. His phone says **Pechkas ko … mil gaye**.
   **Account, line by line** shows the fee and the payment. Try **Undo** on
   the payment with a reason: it is struck through, not deleted, and he owes
   it again.
9. **The credit limit:** jobs worth about Rs 31,000 of labour take a
   technician past Rs 3,000. His phone says so, his work screen turns red,
   and **Qubool** is refused until you record a payment.
10. **Guarantee:** a day after a job is done, the customer's card shows
    **It has failed again (guarantee)**. A claim lands in Problems.

---

## Putting the app on Google Play

No migration this time. Do these in order; each says which screen and which
button. Nothing secret goes into a chat.

### A. A store email address

Create a new Gmail just for this (for example `pechkas.app@gmail.com`, if it
is free). Google shows it on the store page. Your own email stays private,
and nothing on the website changes.

### B. The Google Play developer account

1. Go to **play.google.com/console**, sign in with the new Gmail, and
   choose **Yourself** (a personal account).
2. Pay the one-time fee (US$25) and follow Google's identity check. Google
   asks for your ID document and may ask you to verify on an Android phone
   with the **Play Console** app. That is between you and Google: it never
   comes to Pechkas or to this project.
3. Wait for Google to confirm the account. It can take a few days.

### C. Create the app

1. **Play Console → Create app.** App name `Pechkas: Home Repairs`, default
   language **English (United States)**, **App**, **Free**. Tick the
   declarations, **Create app**.
2. **Policy and programs → App content:** fill every section from
   `docs/store/data-safety.md`. For **App access**, first make the two
   reviewer accounts in `docs/store/review-notes.md`.
3. **Grow users → Store presence → Main store listing:** copy the text from
   `docs/store/listing.md` and upload the icon, banner and six screenshots
   from `docs/store/graphics/` and `docs/store/screenshots/`. To download
   one from GitHub: open the file, then the **download** button.

### D. The store build

1. In **expo.dev → Pechkas App → Environment variables**, check the
   **Production** environment has all three: `EXPO_PUBLIC_SUPABASE_URL`,
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` and the `GOOGLE_SERVICES_JSON` file.
2. **Builds → Build from GitHub**, the same as always, except
   **EAS Build profile: `production`** and **Environment: Production**. It
   makes an `.aab` file (the store format) instead of an APK, and numbers
   itself.
3. When it says **Finished**, **download** the `.aab`.

### E. The closed test (12 testers, 14 days)

1. Collect the Gmail addresses of **at least 12 people** with Android
   phones who will keep the app installed for two weeks: technicians,
   family, friends. More than 12 is safer — Google counts only those who
   stay opted in.
2. **Play Console → Test and release → Testing → Closed testing →** the
   track called **Closed testing - Alpha** (or **Create track**).
3. **Countries / regions:** add **Pakistan**.
4. **Testers → Create email list**, name it `Pechkas testers`, paste the
   addresses, **Save**, and tick the list.
5. **Create new release:** if asked about app signing, choose **Use
   Google-generated key** (Google keeps the key that signs the app for
   phones; your Expo key only proves uploads come from you). Upload the
   `.aab` from D, release notes `First test of Pechkas.`, **Next → Save →
   Send for review / Start rollout**.
6. Once Google has reviewed it, copy the **opt-in link** from the Testers
   tab and send it to every tester on WhatsApp. Each one opens it, taps
   **Become a tester**, then installs Pechkas from the Play Store.
7. Ask them to actually use it: post a job, offer, chat. Google asks about
   that later.
8. After **14 days**, **Dashboard → Apply for production**. Answer
   Google's questions about the test honestly.

### F. Real sign-in codes (Twilio) — before the public can sign in

1. Make an account at **twilio.com**. In the Console, note where it shows
   **Account SID** and **Auth Token**.
2. **Messaging → Services → Create Messaging Service**, name it `Pechkas
   sign-in`, and follow the steps to add a sender. **If Twilio says
   Pakistan needs a registered sender name or a special number, stop and
   tell Claude what it says** — that rule changes, and it decides what to
   do next.
3. Note the **Messaging Service SID**.
4. **Supabase → Authentication → Sign In / Providers → Phone →** SMS
   provider **Twilio**. Paste the Account SID, Auth Token and Messaging
   Service SID **there**, never in a chat. **Save**.
5. Try it from a number that is **not** a test number. Keep the reviewer
   test numbers: Google's reviewers still need them.

### G. Going public

When Google grants production access (and a lawyer has read the pages):
**Test and release → Production → Create new release**, upload the
newest `.aab`, and roll out. Every later update is the same: a production
build in Expo, then a new release with its `.aab`.

---

## Run a database change (a "migration")

Each change is a file in `supabase/migrations/`, run **once**, **in order**,
oldest first. Running one twice does no harm — but if you ever re-run an
older file, run every later file again after it, in order, so the newest
version of everything is the one left in place.

1. Open **supabase.com** → project **pechkas-app-bidding** → **SQL Editor**
   → **New query**.
2. Open the migration file on GitHub
   (`zaibprops-code/pechkas-app-bidding` → `supabase/migrations/` → the file),
   press **Raw**, select everything and copy it.
3. Paste it into the SQL editor and press **Run**.
4. It should say **Success. No rows returned.** If it shows an error, stop
   and send the red text to Claude. Do not run the next file.

To see which have been run: **Table Editor** → `applied_migrations`.

| File | What it does | Run it |
| --- | --- | --- |
| `20261015000000_foundations.sql` | Locks the database so the public key reaches nothing; stores your settings | First |
| `20261016000000_accounts_and_technicians.sql` | Accounts, technician applications, checks, approvals, the office list | Second |
| `20261017000000_posting_a_job.sql` | Jobs, the website prices, the private bucket for voice notes, videos and photos | Third |
| `20261018000000_bidding.sql` | Going online, offers, the customer choosing, the address reaching only the chosen technician | Fourth |
| `20261019000000_notifications.sql` | Phones' notification addresses, and the database telling people when something happens | Fifth — **run it for phase 3b** |
| `20261020000000_who_else_hears.sql` | The notification words in one table; telling a technician who was not chosen; your alert for jobs with no offers | Sixth |
| `20261021000000_doing_the_job.sql` | On my way, arrived, the start code, photos, a new price at the door, the visit fee, chat, done, "something is wrong", each job's history | Seventh |
| `20261022000000_money_and_trust.sql` | Parts, commission, the ledger, the credit limit, payments, ratings, problems, guarantee claims, the emergency button | Eighth — **run it for phase 5** |

---

## Where everything lives

| What | Where |
| --- | --- |
| The code | GitHub: `zaibprops-code/pechkas-app-bidding` |
| Builds and the signing key | expo.dev → fixmindss-team → Pechkas App (`pechkas-app`, ID `225cda33-cb96-4105-8927-ca3f8b9d314a`) → Builds / Credentials |
| The database | supabase.com → pechkas-app-bidding |
| Your admin login | Supabase → Authentication → Users (your email); the office list is the `staff` table |
| The admin panel | Vercel → pechkas-app-bidding (Root Directory `apps/admin`) |
| Words on the technician screens | `apps/mobile/src/words.ts` |
| Every Roman Urdu line, beside its English | `docs/ROMAN_URDU.md` (written by `npm run words`) |
| Words in the notifications | the `push_words` table, set in `supabase/migrations/20261020000000_who_else_hears.sql` and `…21000000_doing_the_job.sql` |
| Who owes what, and payments | Admin panel → **Money** (the ledger is the tables `ledger_txns` and `ledger_entries`; they refuse any edit) |
| Problems, claims, emergencies | Admin panel → **Problems** |
| The emergency numbers | `apps/mobile/src/emergency.ts` — change only on your say-so |
| The office phone number the app shows | `apps/mobile/src/office.ts` — the same as the website's; change both together |
| Notifications: Firebase | console.firebase.google.com → Pechkas (`net.pechkas.app`) |
| Notifications: what was sent | Supabase → Table Editor → `push_log` |
| Customers' voice notes, videos and photos | Supabase → Storage → `job-media` (private; opened from the admin panel) |
| Store text, graphics, screenshots, form answers | `docs/store/` (graphics made by `node scripts/make-store.mjs`) |
| The app's privacy policy and delete-account page | pechkas.net/app/privacy and /app/delete-account — `src/pages/app/` in the website repository |
| The approved design | https://claude.ai/artifact/42Sb6DBfcN9pP1kLnvBqBr |
| The full plan | `APP_BUILD_PROMPT.md` in `zaibprops-code/Pechkas` |
| Android keystore backup | Your private storage. **Never** GitHub, never a chat. |

## Things that must never happen

- A password, key or keystore pasted into a chat or committed to GitHub.
- Anything typed into the Supabase dashboard that is not also a migration
  file here — the next person setting this up would not have it.
- A CNIC number stored anywhere. Only the date you checked it.
