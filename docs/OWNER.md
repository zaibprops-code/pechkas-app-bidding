# Pechkas app — the owner's guide

Plain steps for everything you do yourself: trying the app on your phone,
running database changes, and where every account and setting lives.

---

## Where things stand

**The first screens look like inDrive's (new — no database step).** The
welcome screen is now white, with **pechkas** at the top and three pages
to swipe through, each with a drawing and one line: *Name your price for
home repairs*, *Technicians Pechkas has checked*, *Pay in cash when the
work is done*. Under them are the dots, a black **Continue with phone**, a
grey **Continue with email**, and the line about the Terms of Use and
Privacy Policy. **Continue with phone** opens *Join with your mobile
number*: one big box with the Pakistan flag and **+92** already in it, and
**Next** at the bottom.

**Continue with Google (new — needs your Google set-up, below).** On
Android, the welcome screen shows a black **Continue with Google** above the
other two, as on inDrive. It appears **by itself** the moment Google is
switched on in Supabase; until then the screen looks exactly as before, so
the new build can go out first. Google's own account chooser opens over the
app, then the person comes back signed in, is asked *How will you use
Pechkas?*, finds their first name already filled in, and types their mobile
number, as with an email. Not on iPhone: Apple then requires "Sign in with
Apple" as well, which is not built. Passkey: not recommended yet.

The privacy policy (website and app) and the Google Play answers in
`docs/store/data-safety.md` already say what Google sends. Steps:
**"Continue with Google (once)"** below.

To see it: a new **preview** build from `main`, then sign out
(**☰ → Settings → Sign out**).

**The privacy policy and the rules open inside the app (new — no
database step).** **Privacy policy**, **Terms of use**, the **Technician
agreement** and **Delete your account** used to open the website in the
phone's browser. Now each opens on its own screen in the app, the same way
everywhere: the welcome screen, Settings, Help and the technician
application. A link inside one (say, from the terms to the privacy
policy) opens the other in the app too.

The words still live on the website, and must: Google Play and the App
Store ask for the privacy policy and the delete-account page at a web
address. So there is still one place to change them: the website's
`src/pages/app/` pages. After any change there, ask Claude to copy them
into the app; the app and the stores' links then say the same thing.

On the way, three of those pages still told people to tap **Me**, which
the app no longer has since the menu layout. They now say **open the menu,
tap Settings**, on the website and in the app.

To see it: a new **preview** build from `main`, then on the welcome screen
tap **Terms** or **Privacy Policy**.

**Customer or technician — chosen, and switchable (new — needs one
database step).** Like inDrive, one account can be both:

- **The first question.** After signing in for the first time, the app
  asks **How will you use Pechkas?** with two big cards: **I need
  something fixed** and **I fix things**. Then comes only the first name
  (and the mobile number for an email account), with the choice shown at
  the top and a **Change** link.
- **The switch.** At the bottom of the **☰ menu**, where inDrive keeps
  "Driver mode", there is a green button: **Technician mode** for a
  customer, **Customer mode** for a technician. It is on the **Settings**
  screen too.
- A customer who has never applied is taken to the application. One who
  has applied goes straight to the technician screens; your approval
  still decides whether he gets jobs.
- A technician who switches to **Customer mode** is asked first, because
  he goes **offline**, any offer still waiting for an answer is **taken
  back**, and a job a customer asked for him by name goes to everyone.
  He stays approved: switching changes the screen, not your record of him.
- **Nobody switches in the middle of a job.** A customer whose job is
  still waiting for offers or has a technician coming, and a technician
  who has been chosen for a job, are told which job and asked to finish
  or cancel it first.
- A technician can now book a repair for himself. Before this, he was
  told to sign up again with another number. He can never offer on his
  own job.

These were the sensible defaults; say if you want any of them different.
To switch it on:

1. **Supabase → SQL Editor:** run `20261029000000_two_modes.sql`. It should
   say **Success**.
2. **Expo:** a new **preview** build from `main`, and install it.
3. Sign in with a new test number or email: the first screen asks **How
   will you use Pechkas?** On an approved technician's phone, open **☰** →
   **Customer mode** → **Switch**, and the customer home opens. **☰** →
   **Technician mode** switches back.

**The code is always 6 boxes (new — one Supabase setting, do it first).**
The *Enter the code* screen used to start with six boxes and add more as
numbers arrived, because your Supabase is sending **8-digit** email codes.
Now there are always exactly **6 boxes**, for email and text message alike,
and the sixth number signs you in by itself — no need to press Continue. If
somebody pastes a longer code, the screen says *"That is 8 numbers, but a
Pechkas code is always 6"* instead of cutting it short. So Supabase must
send 6:

1. **Supabase → Authentication → Sign In / Providers → Email.** Find
   **Email OTP Length**, set it to **6**, and **Save**.
2. Same page, **Phone** (only if you have switched it on): if there is an
   **SMS OTP Length**, make sure it says **6**, and **Save**.
3. Ask for a new code on your phone. The email should now show 6 numbers.
   The app you have installed already accepts 6, so do this step before
   the new build.
4. **Expo:** a new **preview** build from `main`, install it, and sign in
   once with email to see the six boxes fill and carry on by themselves.

**A job is followed live, like a ride on inDrive (new).** Posting a job
now opens that job's own screen: the Pechkas screw turning inside rings
while technicians are found, then **Choose your technician** with the
offers as cards, each with its time left and its own button. After you
choose, the same screen follows the visit to the end. The **home screen**
shows any job still happening in a card at the top — *Finding a
technician*, *Choose a technician · 2 offers*, *Bilal is on his way* —
and tapping it opens the job. **My jobs** is the full list; each card
opens its job. No migration — a new **preview** build from `main`, then
post a job and watch it.

**"No thanks" on one offer (new — needs one database step).** Under each
offer's **Choose** button there is now **No thanks**. It asks first, then:

- the offer leaves the customer's list straight away;
- the technician gets one notification — *"Your offer was not taken"*, with
  the trade, the sector and the job number, nothing else;
- he cannot offer on that job again, and it leaves his list. Her other jobs
  still reach him: this is not a block;
- the office sees it in the job's history: *Turned down an offer · Bilal ·
  Rs 5,500*.

Those were the sensible defaults; say if you want any of them different. To
switch it on:

1. **Supabase → SQL Editor:** run `20261028000000_declining_an_offer.sql`.
   It should say **Success**.
2. **Expo:** a new **preview** build from `main`, and install it.
3. Post a job, let two technicians offer, tap **No thanks** on one, then
   **Yes, turn it down**. On that technician's phone the job disappears and
   the notification arrives. **Me → This copy of the app** should say
   **Database: up to date**.

Still waiting on you: **raising your price while you wait.** That is money:
it needs a rule for how much, how often, and whether offers already sent
stay valid. Say yes, with the rule, and it gets built.

**Maps (new — needs your Google Maps key).** The home screen opens on a map
of Islamabad with the cards in a sheet over it, as in inDrive; the round
arrow button shows where you are. **Post a job → Pin my house on the map**
lets the customer move the map until the pin is on the house, and the
technician she chooses sees that pin on a small map (tap it for
directions). **iPhone needs nothing** — it uses Apple's maps. **Android
needs a Google Maps key**: until you add one, Android builds simply show no
maps and work as before. Steps: **"Maps: the Google Maps key (once)"**
below.

**The inDrive look (new).** As you asked, the app is now laid out the way
inDrive is: no bar of tabs along the bottom, a **☰ button** at the top left
that opens a side menu (your name and number, then Home, My jobs, Safety,
Help, Settings and Work with Pechkas), light grey screens with white
rounded cards, bold black headings and drawn pictures on the trade tiles.
Home asks **"What needs fixing & for how much?"** with your last two jobs
under it. Two new screens: **Safety** (the emergency numbers and what
Pechkas checks) and **Help** (WhatsApp or call the office). The technician
side is now light too, the same as the customer's, with its own ☰ menu. No migration — a new
**preview** build from `main`, then open the ☰ menu and try each item.

**Sign in first, like every big app (new).** The first screen after
installing — and after signing out — is a green welcome screen: what
Pechkas is, then **Continue with mobile number** or **Continue with email**.
Nothing else opens until somebody has signed in; a new number or email
simply becomes a new account, then the app asks for a first name and
whether you need something fixed or fix things yourself. Signed in, the
app opens straight on your own home screen every time. No migration — a
new **preview** build from `main`:

1. Install it. If you were signed in, you go straight to your home screen.
2. **Me → Sign out.** The welcome screen appears.
3. Close the app completely and open it again: still the welcome screen,
   and nothing behind it.
4. **Continue with mobile number** → your number → the code. You land on
   your own home screen.

**Formal English everywhere (new).** The Roman Urdu is gone: every screen,
button and notification is in formal English, for customers and technicians
alike, and the technician side has no language switch any more. "Assalam o
Alaikum" is now "Welcome", and the gate note talks about the guard. The store
screenshots were taken again. To get it:

1. **Supabase → SQL Editor:** run `20261027000000_english_only.sql`. It
   should say **Success**. From then on every notification is in English —
   even on a technician's phone that still has the old app.
2. **Expo:** a new **preview** build from `main`, and install it.
3. Go online as a technician: no **English** button at the top, and every
   line is English. **Me → This copy of the app** should say **Database:
   up to date**.

**Signing in with an email code (new).** On the sign-in screen, **Use my
email instead** sends a code by email — no Twilio needed. Somebody who signs
in by email types their mobile number next, because the technician they
choose still has to ring them. That number is marked **(not checked)** on
their **Me** screen and everywhere in the admin panel, since nobody has
proved it by SMS. Your own office alerts still go only to a number that
signed in by SMS. Set it up once: **"Setting up email sign-in (once)"**
below.

**Phase 8 — settings, blocking, terms.**

- **Admin → Settings.** Change the offer time, the "no offer" waiting time,
  the "asked for by name" time, the lowest offer, the highest counter, the
  visit fee, the wrong-code limit, the ratings rules and every flag limit —
  each only within a safe range, and every change is kept with your name
  under **Recent changes**. **Commission, the repeat fee, the credit limit,
  the guarantee reserve and the 30-day guarantee are shown but locked**,
  as you chose: they change only through Claude, in a migration.
- **Sectors.** Open or close a sector for new jobs from the same screen. A
  sector can only open once an approved technician works there; closing one
  leaves jobs already posted there as they are. The website and the store
  pages name the live sectors too, so tell Claude when you change one.
- **Blocking.** On a finished job (or one cancelled after she chose
  someone) a customer can tap **Never send me Bilal again**, with a reason
  if she likes. He never sees her jobs again and **is not told**. She can
  **Undo**. Two customers blocking the same man is a flag, and **Admin →
  Flags → Who blocked him** shows who and why.
- **Terms.** Drafts of the customer terms (**pechkas.net/app/terms**) and
  the technician agreement (**pechkas.net/app/technician-agreement**),
  linked from the sign-in screen, the application form and **Me**. They
  describe exactly what the app does, and every legal question is marked
  **[DECIDE WITH A LAWYER]** rather than guessed.

**Phase 7 — after launch.** Four things, all built and tested:

- **"Ask Bilal again."** On a finished job the customer has an **Ask Bilal
  again** button. Her next job in that trade goes to **him alone for 10
  minutes**, with a yellow-edged card at the top of his screen, then to
  every checked technician. He can tap **I am unavailable this time** and it
  goes to everyone at once (she is told); she can tap **Ask everyone now**.
  If he is offline, over the credit limit, or does not work in her sector,
  it is never held — it goes to everyone straight away and her screen says
  why.
- **The repeat fee: 7% of the labour** when the customer has had a job
  **done** by the same technician before — whether she asked for him or
  just chose him again. A job that stopped at the door or was cancelled
  does not count. He sees the 7% on the job before he offers, and it is
  written on the job when it is done.
- **Admin → Demand.** For the last 7, 30 or 90 days: jobs per sector and
  trade, how many **never had an offer**, how many you placed by hand, and
  how many technicians cover each; the trades in your live sectors with
  **nobody at all**; and the sectors you do not serve yet that customers
  asked for — on the post screen they now tap **My sector is not listed**
  and choose theirs. Nothing is promised to them.
- **Admin → Flags.** Patterns worth a look, over the last 60 days: a
  technician whose jobs keep ending in a refused new price, who asks for a
  new price on most jobs, whose parts are most of the price, whose jobs get
  cancelled after he is chosen (sometimes then done for cash outside the
  app), with many wrong start codes, complaints, low stars, or many jobs for
  one customer; a customer who cancels a lot, or whom technicians report.
  **Flags only: nothing happens to anybody by itself.** You ring, write
  what you found, and press **Checked — it is fine** or suspend him
  yourself under Technicians. The limits are guesses until real jobs show
  what is normal; they are settings (below).

The app privacy policy on the website says the three new things it now
keeps: who a customer asked for, a sector she told you about, and notes
you write on a flag.

**Phase 6b — the App Store (iPhone).** The same app, built for iPhone on
Expo's servers — no Mac needed. Ready for you, with the steps under
**"Putting the app on the App Store"** below:

- the iPhone settings Apple checks: every permission says exactly why it
  is needed, permissions the app never uses are removed, the encryption
  question is answered in the app, and Apple's privacy manifest is
  included;
- iPhone screenshots at the size Apple requires, the App Store text, the
  App Privacy answers, the age-rating answers and the review notes, in
  `docs/store/app-store.md`;
- the privacy policy now says Apple carries notifications on iPhones.

You chose: an **individual** Apple account (the App Store shows your name as
the seller), a **friend with an iPhone** tests it on TestFlight first, and
**Pakistan only**.

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

- **Parts and commission.** At **Mark job as done** the technician says what he
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
- **His account.** The technician taps **You owe Pechkas** for **My account**: what he owes, this month's jobs, parts and fees, his stars, what
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

1. He taps **I am on my way** and then **I have arrived**. Her phone buzzes at each.
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
| 6b | App Store (iPhone): settings, screenshots, App Privacy, age rating, TestFlight → review | **Ready — your steps below** |
| 7 | After launch: ask a technician again, 7% repeat fee, demand report, fraud flags | Done — **"Trying phase 7"** below |
| 8 | Settings screen, customers blocking a technician, terms and technician agreement | Done — **"Trying phase 8"** below |

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
| **Repeat fee** | **7% of the labour** when the customer has had a job done by the same technician before |
| **A job asked for by name** | His alone for **10 minutes**, then everyone's |
| **Flags look back** | **60 days** |
| Flag: refused new prices | **30%** of his finished jobs, once he has **3** |
| Flag: asked a new price | **50%** of his finished jobs, once he has **3** |
| Flag: parts-heavy jobs | **2** jobs where parts were **60%** or more of the price |
| Flag: wrong start codes | **5** on his jobs |
| Flag: cancelled after he was chosen | **3** jobs |
| Flag: problems or claims about somebody | **2** |
| Flag: ratings of 1 or 2 stars | **3** |
| Flag: jobs for one customer | **4** |
| Flag: a customer's cancellations | **5** |
| App identifier | `net.pechkas.app` — permanent |

**Still open:**
- **Email codes through Resend.** Until it is connected, Supabase's own
  test sender delivers only a few emails an hour, and only to your own
  Supabase team's addresses — real customers would never get their code.
  Steps: **"Sending email codes through Resend (once)"** below.
- **The guarantee: 15 days or 30?** The website (its /guarantee and /terms
  pages) promises **15 days**. The app, both store listings and the new app
  terms promise **30 days**. Customers will see both. Tell Claude which is
  right and everything will be made to say the same.
- **The big legal question in the new terms:** is a customer's agreement
  for the repair **with Pechkas** (the website's terms say the technician
  works for Pechkas and Pechkas is responsible) or **with the technician**,
  Pechkas introducing and checking him? A lawyer should answer it; the
  terms, the technician agreement and tax all follow from it. The other
  bracketed points — damage, limits of responsibility, notice before
  suspension, redoing failed work — go to the same lawyer.
- **The flag limits are guesses.** Watch **Admin → Flags** for the first
  month or two. When honest people keep showing up, or something you know
  was wrong never did, tell Claude which limit and it becomes a new
  migration.
- **The repeat fee counts any earlier finished job** between the same
  customer and technician, however long ago. Say if it should only count,
  say, the last 12 months.
- **A lawyer reads the privacy page again** for the three new lines in
  phase 7 (who a customer asked for, a sector she asked about, notes on a
  flag). The Google Play Data safety answers changed too:
  `docs/store/data-safety.md`.
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
- **The visit fee by distance.** The maps are built, but the fee is money,
  so it waits for your decisions: **how many km per litre** to assume,
  where the **petrol price** comes from (you set it, and update it when the
  government changes it), and **straight-line or road distance** — road
  distance means turning on Google's paid Distance Matrix service as well.
  Until then the fee stays Rs 300, your rule for "no distance".
- **Cancelling once he has arrived.** For now a customer can cancel free
  until he reaches the house; after that the app tells her to call you.
  Say if cancelling after he has set off should cost her the visit fee.
- **The lowest offer (Rs 1,000), the highest counter (2×) and the live
  sectors** above.
- **Online stays on until he switches it off.** A technician who forgets
  will still see jobs and can still offer — nobody is sent anywhere without
  the customer choosing him, so the harm is small. Say if you want it to
  switch off by itself after some hours.
- **Price guidance.** Within 20% of the website price the app says "Fair";
  below that "Low"; above "Generous". Say if you want different words or
  limits.
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

1. Install the new build. **Continue with mobile number** → your test number → the code.
2. Choose **I fix things**, fill in the form, send it.
3. Open the admin panel, sign in with your email, find yourself under
   **Waiting**, record the three checks, press **Approve**.
4. On the phone, pull the technician screen down to refresh: it should open the technician work screen, with the **Offline / Online** switch at the top.
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
3. **On the phone:** sign in, tap **AC** on the home screen, choose a job,
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
   technician's work screen. Tap **Offline** — it turns yellow and says **Online**.
4. **The customer phone:** sign in with the other number, tap **AC**, choose
   **Gas top-up**, sector **F-11**, any street and house, **As soon as
   possible**, and press **Post job**.
5. **The technician phone:** within 15 seconds the job appears, showing the
   sector and the customer's first name but **no address**. Press **+** twice
   to ask Rs 200 more, choose **30 min**, and send it.
6. **The customer phone:** within 10 seconds **My jobs** shows the offer with
   "His price" under it. Press **Choose …** and then **Yes**.
7. **The technician phone:** the job moves to **My jobs** with the full address, the customer's number, **Call customer** and **Open the map**.
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
   job. Within a few seconds the technician's phone should buzz: **New job: AC · F-11** (or the trade and sector you used). Tap it: the app
   opens on his work screen, with the job on it.
4. **Lock the customer's phone.** On the technician phone, send an offer.
   The customer's phone buzzes: **New offer on PK-…**. Tap it.
5. Choose the technician. His phone buzzes: **You have been chosen**.
6. Cancel the job from the customer phone. His phone buzzes: **Job cancelled … Please do not travel**.
7. **Two technicians:** if you have a third phone, let both technicians
   offer, choose one, and check the other's phone says **Another technician was chosen**.
8. **Your alert:** post a job and let nobody offer. About 15 minutes later
   your phone says **No offers yet on PK-…**, once.
9. **Admin panel → Jobs → Open → Place it by hand:** a technician who has
   not allowed notifications says **no notifications, ring him** beside his
   name.

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

1. **Customer:** post a job. **Technician:** go Online and press **Accept**.
   **Customer:** choose him.
2. **Technician:** **My jobs** shows the job with a yellow **I am on my way** button. Tap it. The customer's phone buzzes "… is on his way" and
   her **My jobs** shows a big **start code**.
3. **Technician:** tap **I have arrived**. Her phone buzzes "… has arrived".
4. **Technician:** type a **wrong** code, take a photo with **+**, press
   **Start the job**. It says the code is wrong and how many tries are
   left. Now type the right code from her screen and press it again.
5. **Technician:** **Request a new price** → type a higher price, a reason
   and take a photo → **Send to the customer**. Her phone buzzes. On her
   screen: the new price, the reason and the photo, with **Approve Rs …**
   and **Decline**. Press **Approve**.
6. **Both:** press **Message** and send each other a line.
7. **Technician:** take an **after** photo and press **Mark job as done**. Her
   screen says **Done. Pay … in cash**, with the before and after photos.
   His shows it under **Last 24 hours** with what to collect — and the
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
2. Run a job as in phase 4 up to **Start the job**.
3. **Customer:** press **Emergency**. Your phone buzzes **EMERGENCY on
   PK-…** at once. The screen shows the four numbers. Press **Pressed by
   mistake** — your phone is told that too.
4. **Technician:** take the after photo, type **1500** in **Spent on parts**, photograph a receipt, and see the fee change to 10% of the
   rest. Press **Mark job as done**.
5. **Customer:** the card says what was parts and what was his work, with
   the receipt photo. Give him stars and a line.
6. **Technician:** under **Last 24 hours**, rate the customer. Then tap
   **You owe Pechkas** at the top: **My account** shows what he owes,
   the month, and — now both have rated — her stars and words.
7. **Admin → Problems:** the emergency is there, with both numbers and the
   address. Write what you did and **Close it**.
8. **Admin → Money:** **Record a payment** for him — amount, **JazzCash**,
   a transaction ID — and save. His phone says **Payment received: …**.
   **Account, line by line** shows the fee and the payment. Try **Undo** on
   the payment with a reason: it is struck through, not deleted, and he owes
   it again.
9. **The credit limit:** jobs worth about Rs 31,000 of labour take a
   technician past Rs 3,000. His phone says so, his work screen turns red,
   and **Accept** is refused until you record a payment.
10. **Guarantee:** a day after a job is done, the customer's card shows
    **It has failed again (guarantee)**. A claim lands in Problems.

---

## Trying phase 7

**Supabase → SQL Editor:** run `20261023000000_after_launch.sql`. It should
say **Success**. Then a new **preview** build on both phones, and the admin
panel redeploys by itself on Vercel.

1. Finish a job between your customer phone and your technician phone, as
   in phase 5. Make sure the technician is **Online**.
2. **Customer → My jobs:** the finished job has **Ask Bilal again** (his
   name). Tap it. The post screen says **Asking Bilal first**. Fill it in
   and **Post job**. The green box says it was sent to him first.
3. **Technician:** his phone buzzes **A customer has asked for you again**.
   The job is at the top with a yellow edge, and under the price it says
   the Pechkas fee is **only 7%** — **You keep** is 93% of the price.
4. **A second technician phone, if you have one:** the job is **not** there.
5. **Technician:** tap **I am unavailable this time**. The customer's phone
   buzzes **Bilal cannot take PK-…**, and the second technician now sees the
   job, at 10%.
6. Post another, ask for him again, and this time **wait 10 minutes**: it
   opens to everyone by itself. Or tap **Ask everyone now** on her card.
7. **Customer → Post another job:** choose a trade, then under **Where**
   tap **My sector is not listed** and choose, say, **G-9**. It thanks her
   and posts nothing.
8. **Admin → Demand:** G-9 is under **Asked for, not served yet**. Any job
   that waited with no offer shows in **No offer**. **Nobody to send** lists
   the trades in F-11, E-11 and G-13 with no approved technician.
9. **Admin → Flags:** probably empty, which is right. Cancel three jobs
   after choosing the same technician and he appears, with the reason in
   plain words. Write a line and press **Checked — it is fine**: he moves
   to the bottom, and nothing else about him changes.

---

## Something is missing on my phone?

Open **Me** and scroll to **This copy of the app**. It says two things:

1. **Version 1.0.0 · code b305ba8 · built 16 Oct 2026** — the code inside
   the app on your phone. Compare the code with the newest commit on GitHub
   (**zaibprops-code/pechkas-app-bidding → Commits**, the first line). If it
   is older, build again from `main` and install the new APK over the old
   one. On the Expo build page, the **Commit** line shows which code it
   built.
2. **Database: up to date**, or a red box saying the database is missing
   changes and which file to run from. Run those files in **Supabase → SQL
   Editor**, oldest first (the table under **"Run a database change"**).

**Two checks you can paste into Supabase → SQL Editor** (both only read,
nothing changes):

- `supabase/checks/1_which_migrations_ran.sql` — every database change, with
  **ran on …** or **NOT RUN — run this file**.
- `supabase/checks/2_is_everything_set_up.sql` — your owner login, the photo
  store, notifications, the timed jobs, open sectors, technicians and alert
  numbers. Each line says **OK** or what is missing and where to fix it.

Two more things that look like "missing" but are not:

- **Demand, Flags, Settings, Money, Problems** are in the **admin panel**
  (your Vercel address, in a browser), not in the phone app.
- Some buttons appear only at the right moment: **Ask … again** and
  **Never send me … again** only on a finished job; **Report a problem**
  and **Emergency** only while a job is on; the technician screens only
  for an approved technician who is **Online**.

---

## Continue with Google (once)

Do it in this order; the Supabase page gives you an address the Google page
needs. Nothing here is ever pasted into a chat.

### A. Supabase: open the Google switch

1. **Supabase → Authentication → Sign In / Providers → Google.**
2. Find **Callback URL (for OAuth)** — it looks like
   `https://abcd.supabase.co/auth/v1/callback`. Copy it. Leave this page open.

### B. Google Cloud: make the sign-in key

1. Go to **console.cloud.google.com** and sign in with the Pechkas Google
   account (the store email). At the top, open the project list →
   **New project** → name it `Pechkas` → **Create**, and make sure it is
   selected.
2. **☰ → APIs & Services → OAuth consent screen** (Google may call it
   **Google Auth Platform**) → **Get started**. App name `Pechkas`; support
   email: the store email; audience **External**; contact email: the store
   email. Agree and **Create**.
3. **Branding**: home page `https://pechkas.net`, privacy policy
   `https://pechkas.net/app/privacy`, terms `https://pechkas.net/app/terms`.
   Under **Authorized domains** add `pechkas.net` and `supabase.co`.
   **Leave the logo empty** — adding one sends the app to Google for a
   review that takes weeks. **Save**.
4. **Audience → Publish app → Confirm.** Without this, only "test users"
   can sign in. The app asks only for name and email, which Google does not
   review.
5. **Clients → Create client** → type **Web application**, name
   `Pechkas via Supabase`. Under **Authorized redirect URIs → Add URI**,
   paste the address from A2. **Create**.
6. A box shows a **Client ID** and a **Client secret**. Keep it open.

### C. Supabase: switch it on

1. Back on the Supabase Google page from A: turn on **Enable Sign in with
   Google**. Paste the **Client ID** (into **Client IDs**) and the **Client
   secret** — there, never in a chat. **Save**.
2. **Authentication → URL Configuration → Redirect URLs** must still list
   `pechkas://auth-callback` (it does, from the email set-up).

### D. Try it

1. Install a **preview** build from `main` made after this change.
2. Sign out (**☰ → Settings → Sign out**). The welcome screen now shows
   **Continue with Google** at the top. Tap it, choose an account, and you
   come back to *How will you use Pechkas?* with your first name filled in.
3. If the button is not there: Google is not switched on in C1, or the
   phone had no signal when the screen opened — close the app and open it.
4. If Google says **Error 400: redirect_uri_mismatch**: the address in B5 is
   not exactly the one from A2. If it says **Access blocked** or mentions
   test users: do B4.

Good to know: somebody who joined with their **mobile number** and later
taps Continue with Google gets a **new, separate** account — the two have
nothing in common for Supabase to match. Tell people to keep using the way
they joined.

## Setting up email sign-in (once)

1. **Supabase → SQL Editor:** run `20261025000000_email_sign_in.sql`. It
   should say **Success**.
2. **Authentication → Sign In / Providers → Email:** make sure it is **on**.
   Set **Email OTP Length** to **6** and **Save** — the app shows exactly
   six boxes, so a longer code cannot be typed in.
3. **Authentication → Emails → Templates** (or **Email Templates**).
   **Supabase only lets you change a template once your own email sender is
   connected** — it says "Set up custom SMTP to edit templates". So do
   **"Sending email codes through Resend (once)"** below first, then come
   back here. This is the step that makes the email show a **code**. Supabase's own message
   holds only a link, and that link opens a web page that does not exist —
   which is what you saw. Open **Magic Link**, set the **Subject** to
   `Your Pechkas code`, delete everything in the message box, paste this,
   and **Save**:

   ```
   <h2>Your Pechkas code</h2>
   <p>Type this code in the Pechkas app:</p>
   <p style="font-size:28px;font-weight:bold;letter-spacing:6px">{{ .Token }}</p>
   <p>Or, on the phone where you asked for it, tap: <a href="{{ .ConfirmationURL }}">Sign in to Pechkas</a></p>
   <p>It works for one hour. If you did not ask for it, you can ignore this email.</p>
   <p>Nobody reads replies to this address. To reach Pechkas, message us on WhatsApp: 0335 8855076.</p>
   ```

   Then open **Confirm signup** (a brand-new email address gets that one
   instead) and do exactly the same. `{{ .Token }}` is where Supabase puts
   the code, `{{ .ConfirmationURL }}` the link. Type them exactly, with the
   two curly brackets each side.
4. **Authentication → URL Configuration.** This is what makes the link
   open the app:
   - **Site URL:** `https://pechkas.net` — **Save**. (It was
     `http://localhost:3000`, a page on a programmer's own computer: that is
     the page that "did not work".)
   - **Redirect URLs → Add URL:** `pechkas://auth-callback` — **Save**.
5. **Expo:** a new **preview** build from `main`. The code in step 3 works
   with the app you already have; the link needs this new build.
6. On your phone: sign out (**Me → Sign out**), then **Continue with email**, type **your own
   email address** (until Resend is connected, Supabase's test sender only delivers to it), and
   **Send me a code**. Type the code from the email, then your first name,
   **I need something fixed**, and your mobile number.
7. Sign out and try the link instead: ask for a new code, open the email
   **on the same phone**, and tap **Sign in to Pechkas**. Android may ask
   which app to open it with — choose **Pechkas**. The app opens and signs
   you in. Only the **newest** email's link works, and only on the phone
   that asked for it; anywhere else it says so, and the code still works.
8. **Me** shows your number with **(not checked)** and your email. In the
   admin panel, your number shows **(not checked)** on anything you post.

If it fails, the red box says why and gives Supabase's own words: send a
screenshot to Claude.

---

## Sending email codes through Resend (once)

The app does not change for this: it asks Supabase for a code, and Supabase
hands the email to Resend instead of its own test sender. No new build, no
migration. Do it in this order — Resend will not send from pechkas.net until
it has seen the DNS records.

### A. Resend: prove pechkas.net is yours

1. **resend.com → Domains → Add Domain.** Type `pechkas.net`. Region: leave
   the one it offers. **Add**.
2. Resend shows **three or four DNS records** (an `MX` and a `TXT` on
   `send`, a `TXT` on `resend._domainkey`, sometimes a `TXT` on `_dmarc`).
   Keep that page open.
3. Add each one where you added the Google Search Console record — the
   website's README, section 21 (**Vercel → your website project →
   Settings → Domains → pechkas.net → DNS records**, or wherever you bought
   the domain if its DNS is there). Copy **Name**, **Type**, **Value** and,
   for the MX, **Priority** exactly as Resend shows them. They sit on
   `send.` and `resend._domainkey.`, so they do not touch the website, the
   `www` record or the Search Console record.
4. Back in Resend, **Verify DNS Records**. It can take a few minutes to a
   few hours; press it again until all of them say **Verified**.

### B. Resend: a key for Supabase

1. **Resend → API Keys → Create API Key.** Name `Supabase sign-in codes`,
   permission **Sending access**, domain **pechkas.net**. **Add**.
2. Resend shows the key **once**. Do not close the page and do not paste it
   anywhere except step C4.

### C. Supabase: send through Resend

1. **Supabase → Authentication → Emails → SMTP Settings** (on some screens:
   **Project Settings → Authentication → SMTP Settings**). Switch on
   **Enable Custom SMTP**.
2. **Sender email:** `codes@pechkas.net`. **Sender name:** `Pechkas`.
   (This is only a sender — there is no inbox behind it, which is why the
   email says to use WhatsApp. The website still shows no email address.)
3. **Host:** `smtp.resend.com`. **Port:** `465`.
4. **Username:** `resend`. **Password:** the key from B2. **Save**.
5. **Authentication → Rate Limits → Rate limit for sending emails**:
   Supabase sets this low once your own sender is connected. Set it to
   **60** an hour for now. Resend's free plan sends 100 a day and 3,000 a
   month; if sign-ups ever come near that, it is time for Resend's paid plan.
6. Check the two templates from **"Setting up email sign-in"**, step 3, are
   saved with `{{ .Token }}` in them.

### D. Try it

1. On your phone: **Me → Sign out**, then **Continue with email**, and
   type an email address that is **not** on your Supabase
   team — a family member's, or a second Gmail. **Send me a code**.
2. The email comes from **Pechkas &lt;codes@pechkas.net&gt;** within a
   minute. Check the spam folder the first time; if it is there, mark it
   **Not spam**.
3. **Resend → Emails** lists every email sent, and says **Delivered** or why
   not. If the app shows a red box instead, it gives Supabase's own words:
   send a screenshot to Claude. The usual ones: *"Error sending magic link
   email"* — the SMTP password or domain is wrong (C4, A4); *"email rate
   limit exceeded"* — C5.

---

## Maps: the Google Maps key (once)

Only Android needs this; iPhones use Apple's maps. Without it, Android
builds show no maps and everything else works.

### A. Make the key in Google Cloud

1. Go to **console.cloud.google.com** and sign in with your Google account.
2. At the top, **Select a project → New project**, name it `Pechkas`,
   **Create**, then make sure `Pechkas` is selected.
3. **Billing** (left menu): link a billing account and card. Google insists
   on one, but maps shown inside a phone app are free; nothing is charged
   for them.
4. **APIs & Services → Library**: search **Maps SDK for Android**, open it,
   press **Enable**.
5. **APIs & Services → Credentials → Create credentials → API key.** Google
   shows the key — keep that page open, and never paste the key into a chat.
6. On the key, press **Edit API key**:
   - **Application restrictions → Android apps → Add an item**:
     package name `net.pechkas.app`, and the **SHA-1** fingerprint from
     **expo.dev → Pechkas App → Credentials → Android → net.pechkas.app**
     (the "SHA-1 Fingerprint" line). Add a second item with the same package
     name and the SHA-1 from **Play Console → Test and release → Setup → App
     signing → App signing key certificate**, once the app is on Play.
   - **API restrictions → Restrict key → Maps SDK for Android.**
   - **Save.** The key now works only inside Pechkas.

### B. Give the key to Expo

1. **expo.dev → Pechkas App → Environment variables → Add variable.**
2. Name: `GOOGLE_MAPS_API_KEY`. Value: the key. Visibility: **Sensitive**.
   Environments: tick **preview** and **production**. **Save.**

### C. Try it

1. A new **preview** build from `main`, and install it.
2. The home screen opens on a map. Tap the round arrow top right: the phone
   asks once for your location, then the map moves to you.
3. **Post a job → Pin my house on the map**: move the map until the pin is
   on your house, **Confirm this spot**; a small map with your pin appears.
4. With a technician chosen, his job card shows the same pin; tapping it
   opens Google Maps with directions.

If the home screen still has no map, the build was made before the key was
added: build again.

---

## Trying phase 8

**Supabase → SQL Editor:** run `20261024000000_settings_and_blocks.sql`. It
should say **Success**. Then a new **preview** build on your phone; the
admin panel and the website update by themselves.

1. **Admin → Settings:** change **An offer stays open for** to **90** and
   press **Save**. It is refused: 5 to 60 minutes. Make it **15** and save.
   It appears under **Recent changes** with your name.
2. Look at **Money and promises**: commission, credit limit and the
   guarantee are there, marked **Locked**.
3. Under **Sectors taking jobs**, open **Open another sector** and tap one
   where nobody works. It is refused, and says why.
4. **Customer phone → My jobs**, on a finished job: tap **Never send me …
   again**, write a reason, and **Yes, block**. The card says he was not
   told. On the technician's phone, post a new job from the customer: it
   does not appear for him. Tap **Undo** and it does.
5. **Sign-in screen** and **Me**: **Terms of use** opens
   pechkas.net/app/terms. On a technician's **Me** and on the application
   form, the technician agreement opens.
6. Put **offer time back to 10 minutes** when you are done, or leave it if
   15 suits you better.

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
   Service SID **there**, never in a chat. Check **SMS OTP Length** says
   **6**. **Save**.
5. Try it from a number that is **not** a test number. Keep the reviewer
   test numbers: Google's reviewers still need them.

### G. Going public

When Google grants production access (and a lawyer has read the pages):
**Test and release → Production → Create new release**, upload the
newest `.aab`, and roll out. Every later update is the same: a production
build in Expo, then a new release with its `.aab`.

---

## Putting the app on the App Store

No migration. Apple needs one thing Expo's website cannot do for you: a
first build started from **your computer**, where you sign in to Apple
yourself so Expo can make the iPhone certificates. Windows is fine. Your
Apple password and codes go into that window only — never into a chat.

### A. The Apple Developer account

1. Make sure your Apple ID has **two-factor authentication** on
   (appleid.apple.com → Sign-In and Security).
2. Go to **developer.apple.com/programs/enroll**, sign in, and enrol as an
   **Individual**. Pay the yearly fee (about US$99).
3. Apple checks who you are. If it asks you to use the **Apple Developer**
   app on an iPhone, borrow your tester's for that step. Wait for the email
   saying the membership is active. It can take a day or two.

### B. Your computer, once

1. Install **Node.js** — the **LTS** version from **nodejs.org** — and
   **Git** from **git-scm.com**, with the default choices.
2. Open **Command Prompt** and type, one line at a time:

   ```
   git clone https://github.com/zaibprops-code/pechkas-app-bidding.git
   cd pechkas-app-bidding
   npm install
   cd apps\mobile
   npx eas-cli@latest login
   ```

   Git opens a browser to sign in to GitHub; Expo asks for your Expo
   (fixminds) login.

### C. The first iPhone build

In the same window:

```
npx eas-cli@latest build --platform ios --profile production
```

It asks questions. Answer:

| It asks | Answer |
| --- | --- |
| Do you want to log in to your Apple account? | **Yes**, then your Apple ID, password and the six-digit code on your Apple device |
| Generate a new Apple Distribution Certificate? | **Yes** |
| Generate a new Apple Provisioning Profile? | **Yes** |
| Would you like to set up Push Notifications? / Generate a new Apple Push Notifications service key? | **Yes** |

Expo keeps all of it. The build then runs on Expo's servers (20–40
minutes); the window can be closed, and **expo.dev → Builds** shows it.

### D. The app in App Store Connect

1. **appstoreconnect.apple.com → Apps → +  → New App.**
2. Platform **iOS**, name `Pechkas: Home Repairs`, primary language
   **English (U.S.)**, bundle ID **net.pechkas.app** (it is in the list
   after step C), SKU `pechkas-ios`, **Full Access**. **Create.**

### E. Send the build to TestFlight

Back in Command Prompt, in `pechkas-app-bidding\apps\mobile`:

```
npx eas-cli@latest submit --platform ios --latest
```

Sign in to Apple when asked, and say **Yes** when it offers to make an
**App Store Connect API Key** — Expo then sends future builds without your
password. Apple takes 10–30 minutes to process the build; it then appears
under **TestFlight**.

### F. Your friend tests it

1. **App Store Connect → TestFlight → External Testing → +**, a group called
   `Friends`, add the build, and add your friend's email.
2. Fill in **Test Information** (what to test: "Post a job, choose a
   technician, chat, look at the emergency screen without calling") and
   **Submit for Review**. Apple's beta review is usually a day.
3. Your friend installs **TestFlight** from the App Store and opens your
   invitation email. Until Twilio sends real codes, add a test number for
   them in Supabase, like your own.
4. Ask them to try: signing in; posting a job with a **voice note**, a
   **photo from the gallery** and one **from the camera**; adding the
   **map pin**; allowing **notifications**; **choosing** a technician (you,
   on your Android); the **chat**; the **emergency** screen (press **Pressed
   by mistake**, do not call); **rating**; and **Delete my account** last.
   Anything odd: a screenshot to you, and you send it to Claude.

### G. Submit for review

1. **App Store Connect → Pechkas → the 1.0 version page.** Fill everything
   from `docs/store/app-store.md`: screenshots from
   `docs/store/screenshots-iphone/`, text, URLs, copyright, App Review
   Information (the same reviewer numbers as Google's). Also **App
   Privacy**, **Age Rating** and **Pricing and Availability** — Pakistan
   only.
2. Under **Build**, choose the build your friend tested.
3. **Add for Review → Submit.** Apple usually answers in one to three days.
   If it rejects the app, copy Apple's whole message to Claude.

### H. Every update after this

**expo.dev → Builds → Build from GitHub**, as for Android, but
**Platform: iOS**, profile `production`, Environment **Production**, and
**EAS Submit on**. It reaches TestFlight on its own; then in App Store
Connect make a new version, choose the build and submit. If anything asks
for Apple credentials it does not have, do step C again from your computer.

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
| `20261023000000_after_launch.sql` | Asking a technician again, the 7% repeat fee, the demand report, fraud flags | Ninth — **run it for phase 7** |
| `20261024000000_settings_and_blocks.sql` | The settings screen with its safe ranges and record of changes, opening and closing sectors, customers blocking a technician | Tenth — **run it for phase 8** |
| `20261025000000_email_sign_in.sql` | Signing in with an email code: the mobile number an email account types, marked not checked | Eleventh — **run it for email sign-in** |
| `20261026000000_what_has_run.sql` | Lets the app's Me screen say whether the database is up to date | Twelfth |
| `20261027000000_english_only.sql` | Every notification in formal English, for technicians too, even on a phone with an older app | Thirteenth |

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
| Every word on the technician's screens | `apps/mobile/src/words.ts` |
| Words in the notifications | the `push_words` table, set in `supabase/migrations/20261020000000_who_else_hears.sql` and `…21000000_doing_the_job.sql` |
| Who owes what, and payments | Admin panel → **Money** (the ledger is the tables `ledger_txns` and `ledger_entries`; they refuse any edit) |
| Problems, claims, emergencies | Admin panel → **Problems** |
| The emergency numbers | `apps/mobile/src/emergency.ts` — change only on your say-so |
| The office phone number the app shows | `apps/mobile/src/office.ts` — the same as the website's; change both together |
| Notifications: Firebase | console.firebase.google.com → Pechkas (`net.pechkas.app`) |
| Notifications: what was sent | Supabase → Table Editor → `push_log` |
| Customers' voice notes, videos and photos | Supabase → Storage → `job-media` (private; opened from the admin panel) |
| App Store text, iPhone screenshots, App Privacy and age-rating answers | `docs/store/app-store.md`, `docs/store/screenshots-iphone/` |
| Apple account, TestFlight, App Store page | developer.apple.com and appstoreconnect.apple.com (your Apple ID) |
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
