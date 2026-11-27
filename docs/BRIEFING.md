# Pechkas: a complete briefing for an adviser

_Written 16 November 2026, updated 27 November 2026, from the two repositories as they stand today
(app `zaibprops-code/pechkas-app-bidding`, website `zaibprops-code/Pechkas`).
Every rule below is something the code actually does, not a plan, unless it
says "open" or "not built"._

**How to use this file.** Paste it into a new conversation with Claude and
say something like: *"This is my business. Help me decide D16"* (or any other
number), or *"What should I decide before launch, and in what order?"* The
numbers (D1…, A1…) are the same as in `docs/DECISIONS.md`, so whatever you
decide there can be built straight away in the repositories.

---

## 1. What Pechkas is

- **A home-repair business in Islamabad.** The trades are AC, electrician,
  plumber, CCTV, Wi-Fi and internet, UPS and inverter, solar, home
  appliances, carpentry, painting and computers. Brand lines: "Har pech ka
  hal" and "Khara kaam, khara daam".
- **The owner is one person, Muhammad Zohaib Khan.** He is not a developer.
  He tests on an Android 9 phone and has no Mac. Claude writes all the code.
- **The app is the product. The website is marketing.** The owner's rule
  (16 November 2026): building the app is the only purpose. The website was
  built first, but now it only tells people about Pechkas and sends them to
  the app. **Nothing in the app follows the website.** Where they disagree,
  the app is right and the website is changed later.
- **The two pieces:**
  1. **The website, pechkas.net (marketing).** A fixed price list for each service,
     area pages, safety guides for emergencies, seasonal campaigns,
     referral cards and a careers page (`/join`). People book on WhatsApp
     or through `/book`, and a small office "job book" (`/admin`) tracks
     those jobs. It runs on Vercel with Supabase behind it.
  2. **The app, "Pechkas", for Android and later iPhone (the product).** It works by open
     bidding, like inDrive for home repairs:
     - a customer posts a job and names her price;
     - checked technicians accept that price or ask for more;
     - she picks one.

     It is built with Expo (React Native) on a Supabase database. The
     office runs it from a web admin panel.
- **Where it stands:**
  - The app is built through "phase 8", D37, the new A5 (payments
    count at once), D38 (launch offers) and A104 (the first-job price
    limit on the work, not parts).
  - It is **not open to the public yet**: only test numbers can sign in
    until Twilio (SMS codes, A107) and Resend (email codes, A108) are
    connected in Supabase and a real code has been seen to arrive.
  - The Play Store closed test (12 testers for 14 days) is the next store
    step.
  - The app is on **edition 8**: six database changes (D37's two, A5's,
    D38's, A104's and A105's) and one new build go out together.
  - **From that build on, the app updates itself**: most changes reach
    phones without a new build. The owner's test phone gets every change;
    store users only when he says so. If an update needs a database change
    he has not run yet, the app shows "Waiting for a database update"
    instead of breaking.
- **Contact:**
  - No email address, on purpose. Everything goes through WhatsApp.
  - Working hours are 7am to 10pm, every day.
  - English only, on the screens and on the website. Customers may still
    send a voice note in Urdu.

## 2. The owner's standing rule (13 November 2026)

Every decision is held to this rule:

- **The app runs by its own rules**, so everyone is treated fairly and kept
  safe without a person deciding each case.
- **The owner cannot be present anywhere.** He cannot travel to watch a
  technician work, and he has no homes of friends or family to use as
  tests.
- **The office stays out of routine steps.** A person is needed only for
  exceptions: a safety report, a dispute or an appeal.
- **Before any design needs a person, look for something else that can do
  the step instead:** a rule, a check in the app, the customer's
  confirmation, or another technician's check. If a human step truly
  cannot be avoided, say so and explain why.
- **Never promise anything the app cannot actually do**, on the website or
  in the app.
- **No calls.** The owner cannot take phone or video calls. An exception
  reaches him as a written item in the office panel, which he answers in
  his own time.

- **The app comes first** (16 November 2026). Every decision is made for
  the app on its own merits, never copied from the website. The website is
  marketing and follows the app.

The following follow from the same principles:

- **Never invent figures.** No prices, ratings, reviews, job counts or
  statistics that are not real.
- **Unknown values stay as visible placeholders**, such as `[PRICE]`.
- **No CNIC number or image** ever enters the code or the database.
- **No decoration.** The owner rejected truck-art and ajrak as looking
  unprofessional.
- **The app is Pakistani in how it works:**
  - voice notes in Urdu;
  - landmarks next to the map pin;
  - the guard at the gate;
  - parts paid against a shop receipt;
  - the family told who is coming.

## 3. How a job works in the app, start to finish

1. **Signing in.**
   - **Ways to sign in:** a mobile number with a 6-digit code, an email
     code, or Google on Android.
   - **Nothing opens before sign-in.**
   - **One account has two modes**, customer and technician, and you switch
     between them in the menu. You cannot switch in the middle of a job.
2. **Posting a job.** Three steps, one thing on each screen (A109):
   - **The job** is chosen before, on home or search; the top of every step
     shows it with **Change**.
   - **1 · Show us the problem:** a big record button for a voice note (up to
     1 minute), a video (up to 20 seconds), photos (up to 4), or a few
     words. One of them is required (A113).
   - **2 · Where:** the map fills the screen. The street and sector are read
     from the pin; she types only the house number. **Anywhere in
     Islamabad**, Bahria Town and DHA included; elsewhere she is told
     "Islamabad only, for now" (A111).
   - **3 · Her price:** it starts at the usual price, in steps of Rs 50, and
     cannot go below the job's lowest: **60% of the usual price**, which the
     office can change (A112). No day to pick: **every job is as soon as
     possible** (A110).
   - **Price range:** once there are 10 finished jobs of that kind in 90
     days, she sees the middle half of what such jobs really cost.
3. **Offers.**
   - **Who sees the job:** approved technicians in that trade and sector
     who are online and near the job: within 5 km of where they are (sent
     from the phone while the app is open; location is needed to be
     online), growing evenly to all of Islamabad in 8 minutes (A114). With
     no recent position, his home area; with neither, his sectors.
   - **While she waits:** her map with the search growing, how many
     technicians have looked (first letters only), and an **automatic
     choice**, off by default: the first technician who accepts her price
     is chosen for her (A115). Before he is chosen, a technician sees her first name
     and the sector only, never the address or phone number.
   - **What an offer can be:** he accepts her price, or asks for more, up
     to 2× her price.
   - **What an offer must say:** no time at all. Google Maps works out how
     far he is (A115, A116).
   - **How long it lasts:** 10 minutes, after which he can renew it.
   - **What she sees:** his first name, his years of experience, his
     checks, his rating ("New" until he has 3 ratings), and reviews
     without the reviewers' names.
4. **When nobody offers.**
   - **She is told:** after 20 minutes for a job today, or 3 hours for a
     later day.
   - **She can:**
     - raise her price by Rs 200, 500 or 1,000, up to 3 times;
     - keep waiting.
   - **A job nobody took closes at 10pm on its day.** Jobs run 7am to
     10pm; a job posted after 9pm is for the next morning (A116).
5. **She chooses one offer.**
   - The job is locked to that technician.
   - **He is due** at her choice plus his Google minutes (or 60 minutes
     when Google has none), and **late 15 minutes after that** (A116).
   - He now sees her address and number.
   - She gets a **start code**.
6. **The visit.**
   - **He taps On my way, then Arrived.** Arrived is checked by GPS against
     her pin: within 100 m, with an accuracy of 50 m or better.
   - **At the door** she confirms his photo ("Is this Imran?"), then gives
     him the start code.
   - **He takes photos** before and after the work.
   - **If the price has to change**, it is a request with a reason and a
     photo, and she approves or declines it. If she declines, she pays
     only the **visit fee, a flat Rs 300**, all of which goes to him.
   - **Chat** is text only. There is also a button to tell her family, an
     emergency button, and a button to report a problem.
7. **Finishing.**
   - **"Work finished" does not close the job.** It closes when she taps
     **Yes, it works**, or after 24 hours with reminders.
   - **"Not finished yet"** sends the job back to him with a reason. The
     second time, the office decides.
8. **Paying.**
   - **She pays him directly**, in cash, by JazzCash or by Easypaisa.
     **The app never holds money.**
   - **He then owes Pechkas commission** on the labour only.
9. **Afterwards.**
   - **Ratings:** each side rates the other. Ratings stay hidden until both
     have rated, or 48 hours have passed.
   - **Blocking:** she can block him. He is never told.
   - **Book again:** reposts the same job.
   - **Ask again:** holds her next job for him alone for 10 minutes.
   - **The guarantee button** ("It has failed again") covers 30 days for
     repairs and installations, and 7 days for services.

**When something goes wrong** (each case has a rule; details in section 6):

- **Cancelling** is always free for the customer until she gives the start
  code.
- **The technician cannot come:** the same job goes back to the other
  technicians.
- **The technician is running late:** he tells her a new time, at most
  twice per job.
- **Nobody is home:** he can report it.
- **The customer does not pay him:** he can report it.
- **The work fails within the guarantee:** another technician fixes it at
  Pechkas' cost.

## 4. Money

| Rule | Detail |
|---|---|
| **Commission** | 10% of the **labour** only, which is the agreed price minus parts that have a shop receipt. Rounded down, so odd paisa stay with the technician. |
| **Repeat customer** | 7% when the same customer and technician finished a job together in the **12 months** before she chose him for this one (A105, 22 November 2026). Measured from the moment she chooses him, when the rate is fixed. Locked, and stated in the agreement. |
| **No commission on** | Visit fees, parts, guarantee repairs Pechkas pays for, cancellations, no-shows and unsuccessful visits. The rule (A67) is that Pechkas earns only on completed repair labour the customer has paid for. |
| **Credit limit** | Rs 3,000. Once he owes more than that, his new offers stop until he pays. |
| **Due dates (D36)** | Each fee is due 14 days after it is posted, with 3 days of grace. From day 18 his new offers stop while it is unpaid. There is no late fee and no interest. Payments pay the oldest fees first. |
| **Paying Pechkas (A5, 17 November 2026)** | He taps "I have paid" with the transaction number and a screenshot, and **it counts at once**: what he owes drops straight away. Each transaction number can be used only once, and nothing calls a payment "verified". The office only acts when money did not arrive: for 30 days it can mark a payment **Not received** or **Received less**, which puts back exactly the missing amount and flags him. **A second time within 90 days pauses his new offers** until the office lifts the pause; he appeals in writing, and an appeal unanswered for 3 days shows as a reminder. The Money page lists "Payments to check", and the office is told at most once a day. He pays into a separate bank account with Raast, used only for Pechkas (A103, 18 November 2026), which moves to a business account in Pechkas' name once the business is registered (D2). |
| **Launch rate (D38, 17 November 2026)** | 5% of the labour instead of 10% (or 7%), on his jobs in a trade **after his first 3 good jobs** there. It lasts until 90 days after that trade is approved, and never more than 12 months after his 3rd good job; it ends at midnight in Islamabad. The rate is fixed when the customer chooses him and is shown, with its end date, before he offers. **Only for technicians who apply by a cut-off date, which is not set yet, so the offer is off** (D38.1). |
| **Referral credit (D38)** | Rs 1,000 for each technician he brings in with his code, at most 5. Earned when the newcomer's 3rd first job counts as good **and** the 30-day "Not received" window has passed on the payments for all 3; shown as "Pending" until then, and kept afterwards. It only lowers what he owes Pechkas: never cash, never a payout, and it never counts as his own payment for his first jobs. "Tell a technician" sends an Urdu and English WhatsApp message that says plainly he gets a small credit; the button appears only once the office has saved the app's store link. A flag shows unusual referral patterns. |
| **Guarantee reserve** | 20% of every commission. When it runs out, Pechkas pays from its own money. On a 5% launch job that is 1% of the labour. |
| **Visit fee** | A flat Rs 300, set in Settings. Owed only after a real visit at which she declined a new price. The technician keeps all of it. |
| **Ledger** | Double-entry and written once. A mistake is corrected with a reversal, never an edit. No balance is stored: it is always worked out from the ledger lines. |
| **Customer discounts** | None. A64 says there is no compensation, wallet, credit or discount at launch, and D38 kept it that way. |

## 5. Trust and safety: how a technician becomes approved (D37, 13 November 2026)

**Approval is by rule, trade by trade. Nobody meets the technician, and the
office no longer presses Approve.**

1. **He applies.** Applying is free, and Pechkas never charges to join.
   - **Not asked:** no CNIC, no gender, no date of birth.
2. **The person is approved** once three things are true:
   - his number has been checked by SMS;
   - his face photo is in;
   - he has passed the rules quiz (once the quiz is switched on).

   **His photo locks with his first job**, and changing it needs the
   owner's approval.
3. **His first 3 jobs in each trade are a trial:**
   - customers see "New on Pechkas" on his offers;
   - basic job types only, one job at a time, and his **work** may come to
     at most **Rs 5,000** (A104): parts with a shop receipt are not
     counted, and his offer can say how much of his price is parts;
   - if he asks a new price during the job and its work is over the
     limit, both sides are told; she may agree, and then the job goes
     ahead but does not count as one of his 3;
   - after each job the customer answers four questions: was he on time,
     did he explain the work, did he leave it clean, does it work.
4. **A trial job counts as good when all of these hold:**
   - all four answers were yes;
   - his before and after photos are in;
   - no guarantee claim stands against it;
   - the commission on it is paid (a payment he sends in the app counts
     for this 3 days after he sends it; if the office later finds it did
     not arrive in full, the job waits again until he pays the rest);
   - the customer is real and separate from him: a different checked
     number, a home far enough from the other trial customers, and not
     counted before.
5. **Three good jobs plus verified identity approve the trade.**
   - **Verified identity** means a CNIC check against NADRA's records,
     done by an outside service.
   - **The owner decided (A119, 26 November 2026) that it comes before
     the first job**: once the service is switched on, nobody takes any
     job until verified. Pechkas' side is built (the database rule, the
     server function, his screen, the legal pages); **the company is not
     chosen yet** (D37.2), so the service is off and today nobody can
     leave first-job limits.
6. **Pauses happen by rule:**
   - one safety report pauses the trade at once;
   - so does a second "It works: no".

   He can appeal in writing, and the office answers in writing.
7. **Risky work** (gas, wiring, AC gas, solar faults, fridges, UPS) unlocks
   only after two things:
   - a clean record;
   - one job checked by another approved technician, whom the app picks
     and Pechkas pays a fee.

   **Where nobody can do the check yet**, customers see "This kind of job
   is not available on Pechkas yet".
8. **Gas cookers and ovens are not taken at all.**

**Other trust rules:**

- **Flags are only flags.** Late arrivals, no-shows, low ratings, blocks,
  prices far above the usual range and so on put a person in front of the
  office. Nothing suspends, blocks or charges anybody automatically.
- **Customer details:** only the chosen technician sees her address and
  phone number, and only while the job is on.
- **Notifications** never contain an address, a phone number or a surname.
- **Location** is checked only at moments that matter (arriving, nobody
  home), never tracked in the background. Coordinates are erased after 90
  days.

## 6. Everything already decided (short form)

The full wording is in `docs/DECISIONS.md`, Part 2.

- **A1–A8, money:** see section 4.
- **A9–A15, jobs and prices:**
  - she names the price, and he can ask for up to 2×;
  - every job is as soon as possible, and he is due by Google's minutes
    when she chooses him (A110, A116);
  - live sectors only, and the map pin is required;
  - the rules for when nobody offers;
  - price records are kept;
  - a new price at the door is a request;
  - the visit fee.
- **A17–A24, checking the work and the guarantee:**
  - a job closes only when she confirms it, or after 24 hours;
  - the guarantee is 30 days for repairs and 7 for services;
  - a claim needs words and a photo or video, and he answers within 24
    hours and comes back within 48;
  - if he ignores the claim, another technician does the repair and Pechkas
    pays;
  - he is charged at most his own labour, never for parts, and only after
    a 7-day chance to appeal;
  - only the office can raise what Pechkas pays for the replacement, up to
    3×.
- **A36–A40, the visit fee:**
  - Rs 300, with no commission;
  - owed only after a real visit;
  - shown before she chooses a technician;
  - the rules for when it is disputed.
- **A41–A46, cancellations:**
  - always free for the customer until the start code;
  - the database puts each cancellation in one category;
  - reviews, never penalties;
  - a potential no-show is announced 60 minutes after he was due (D40).
- **A47–A52, nobody home:**
  - his report protects him without blaming her;
  - she gets 10 minutes, plus 10 more if she says she is coming;
  - no money moves;
  - "the guard refused entry" is a separate reason.
- **A53–A58, arrival checked by location:**
  - GPS first;
  - a photo is needed only when the GPS check fails;
  - the office can approve an arrival with a written reason.
- **A59–A65, a technician who cannot come:**
  - the same job goes back to others, never a copy;
  - "I'm running late" at most twice per job;
  - she can "find another technician" at no cost;
  - the office can pause his new offers for 1, 3 or 7 days;
  - no compensation at launch.
- **A66–A67, commission:** none on visit fees, and the general rule for
  commission.
- **A68–A75, paying Pechkas by a date:** 14 days plus 3 days of grace.
- **A76–A84, a customer who does not pay the technician:**
  - he reports it within 7 days;
  - his commission is held;
  - she answers once within 3 days, and silence never blocks her;
  - commission only on what he actually received.
- **A85–A98, a new technician's first jobs:** see section 5.
- **A99–A101, launch offers (D38, 17 November 2026):**
  - 5% launch rate after his first 3 good jobs in a trade, until 90 days
    after the trade is approved (at most 12 months after the 3rd good job),
    only for technicians who apply by the cut-off date;
  - Rs 1,000 credit per technician he brings in, at most 5, never cash;
  - no customer discount;
  - see section 4.
- **A102–A104, first-job numbers and paying Pechkas (18 November 2026):**
  - A102: homes at least 500 m apart; quiz pass 80%, retake after 3 days;
    risky work after 5 clean jobs over at least 30 days with no claim in
    60 days, another try 30 days after a failed check; checker's fee
    Rs 1,000, 60 minutes to say yes, answerable for 30 days; older
    technicians kept at 3 and 10 clean jobs; staff-seen identity counts
    until 30 days after the identity service starts;
  - A103: technicians pay into a separate bank account with Raast;
  - A104: the Rs 5,000 first-job limit is on his work, not parts (built).
- **A105–A106, the repeat rate and going online (22 November 2026):**
  - A105: the 7% repeat rate looks back 12 months, from when she chooses
    him (built);
  - A106: "Online" stays the technician's own switch; nothing turns it off
    automatically.
- **A107–A108, sign-in codes (22 November 2026):**
  - A107: codes by SMS through Twilio now (Pakistan only, fraud blocker
    on, 5-minute codes); by WhatsApp through the same Twilio account once
    the business is registered and Meta approves, with SMS as the other
    choice. About $0.33–0.47 a text by SMS against about $0.015 by
    WhatsApp, from public price lists;
  - A108: email sign-in stays, sent through Resend from
    no-reply@pechkas.net (free up to 100 a day): the way in for family
    abroad and when an SMS does not arrive.
- **A25–A30, trust:** no CNIC is stored; flags are only flags; blocking;
  hidden ratings; first name only before he is chosen; applying is free.
  - A25 now says approval is by rule (A85–A98), never a check in person
    or a video call.
- **A31–A35, accounts and contact:** number, email or Google sign-in; one
  account with two modes; English only; no email address; open 7am to
  10pm.
- **A109–A116, a faster Post a job (25 November 2026):** three steps; every
  job as soon as possible; anywhere in Islamabad (Bahria Town and DHA
  count); lowest price 60% of the usual, office-changeable; showing the
  problem stays required — all built. Also built: location on to go online
  and jobs near him (A114), the waiting screen and the automatic choice
  (A115), offers with Google's minutes and distance and his route while on
  his way (A115; needs the Google key in Supabase); late 15 minutes after
  the time Google's minutes say he is due, jobs 7am to 10pm (A116). All
  built.
- **A117, the screens exactly as the approved mocks (25 November 2026):**
  waiting on a full map with the technicians near her as unnamed dots
  (rounded to about 100 m; the owner's choice), raising her price there,
  "Still looking?" and "No offer yet", offers dropping in, short choose
  cards, him coming on the map; his list shows Google's minutes for each
  job (paid requests, kept down by a setting). Built.
- **A118, the welcome screen (26 November 2026):** two-line headlines,
  *Your price, your choice.* / *Verified technicians.* / *Pay when it's
  done.*; phone first, then "or continue with" Google and Email. Built.
  "Verified" is true only once the identity check (A119) is switched on,
  which is a step before the public launch.
- **A119, the identity check (26 November 2026):** CNIC against NADRA's
  records plus a live face match, by an outside company, before a
  technician's first job; Pechkas keeps only the result and the company's
  reference. Built on Pechkas' side; the company is still to be chosen.
- **A120, drawn people in pictures (26 November 2026):** the welcome pages
  show drawn people acting out each headline, in Pechkas colours on the
  yellow screw-head circle; never a photo or a real person. Built.
- **A121, pictures of the work (26 November 2026):** jobs shown as a
  picture of the problem, with the name beside it. Every trade, all 76
  jobs and home built.
- **A122, home's top (26 November 2026):** no picture beside "What needs
  fixing?", which is one big line, as professional apps do. Built.
- **A123, 3D pictures (27 November 2026):** the pictures of the work become
  soft 3D objects on the same yellow circle, trade by trade. AC,
  CCTV, Wi-Fi and UPS built; the other trades and the sign-in pictures follow one at a time.

## 7. Still open: what the owner has to decide

### The legal base (owner and a lawyer, before launch)

**These eleven items appear in the terms and the agreement as
`[DECIDE WITH A LAWYER]`.**

- **D1, who the customer's agreement is with.** Is it Pechkas, with the
  technician working for Pechkas? Or the technician, with Pechkas
  introducing him? **D1 comes first, because many other items depend on
  it.** Today the website's terms say the technician works for Pechkas,
  and the app's terms leave it open.
- **D2, the business itself:** the registered name and address, the legal
  form, and the tax registration. An NTN or SECP registration is probably
  also needed for the identity service.
- **D3, damage:** who pays when a technician breaks something, and up to
  how much. There is no insurance today.
- **D4, the limit of liability:** the most Pechkas is ever responsible
  for, which law applies, and where disputes are heard.
- **D5, guarantee charges:** the lawyer confirms the rule already built is
  allowed.
- **D6, suspending a technician:** how much notice he gets, and how he asks
  for a review.
- **D7, changing the terms:** how much notice customers and technicians
  get.
- **D8, the guarantee's edges:** whether a part the customer supplied
  herself is covered, and whether there is a top limit.
- **D9, the privacy page's blanks:** the Supabase region, the deletion
  time, how long money records are kept, how long photos are kept, and the
  publish date.
- **The other items under the same heading:**
  - D10.6: can late cancellations ever lead to a charge?
  - D11.3 and D11.4: notice before a pause, and whether service recovery
    is enough under consumer law.
  - D34.6: should Pechkas ever pay for a visit where nobody was home?
  - D35.1–D35.5: blocking a customer over a debt to a technician, keeping
    a record of debts, chasing the money, and the guarantee on an unpaid
    job.
  - D36.4: notice before offers stop for an overdue fee.
  - D37.6: keeping his photo, checking his identity through NADRA, and
    decisions made by rule.
- **D14, paying technicians what Pechkas owes them:** how often, how, and
  the smallest amount worth sending.

### Business choices (owner, before launch)

- **D16:** keep the lowest offer at Rs 1,000 and the highest at 2× her
  price?
- **D17:** are F-11, E-11 and G-13 the right sectors to start in? They
  should be where the first technicians live and work.
- **D22:** Sign in with Apple before the iPhone version, or phone and email
  only on iPhone?
- **D37.2, which identity company.** The kind of check is decided (A119)
  and built. Still to choose: a company authorised to check CNICs against
  NADRA, with a liveness photo and face match, a written price, and terms
  saying Pechkas receives only "matched or not". **It is the most urgent
  thing outside the app: nobody leaves first-job limits without it, and
  the welcome screen's "Verified technicians" needs it switched on before
  the public launch.** Steps: "The identity check" in `docs/OWNER.md`.
- **D37.3, the Urdu quiz text:** a native speaker must check it before the
  rules quiz is switched on.
- **D37.4, the safety quizzes:** a qualified electrician, gas fitter or AC
  technician checks each one before it goes on. Until then nobody can
  unlock risky work.
- **D37.5:** safety quizzes for the other trades, if wanted.
- **D37.7:** UPS and inverter needs its own job types and price list.
- **A5 is done (17 November 2026):** the office no longer confirms every
  "I have paid"; it only corrects the ones that did not arrive.

### The website (marketing only: none of these blocks the app)

- **D37.8, the website's trust claims.** The booking pages say a
  technician has "had his CNIC checked" in person, wears a uniform, and
  that "we call you before he reaches your gate". Under the standing rule
  (no visits, no calls) these are not how the app works, so the marketing
  copy will need changing before it points people to the app.

- **D23:** painting prices.
- **D24:** prices for the landlord and office plans and the move-in and
  move-out checks.
- **D25:** how customers abroad pay.
- **D26:** the gas emergency number. **A wrong number is dangerous: ring
  it yourself first.**
- **D27:** the About page story and photo, which only the owner can write.
- **D28:** real technicians on `/team`.
- **D29:** the Google review link.

### Tune after launch, with real data

- **D10.5:** how Islamabad technicians handle last-minute cancellations
  today.
- **D12.10:** is Rs 300 the right visit fee? Ask local technicians what
  they charge for coming to check a fault.
- **D13.1 and D13.2:** review commission on visit fees after 2–3 months.
- **D30:** the flag limits (a table of about 17 limits).
- **D31:** price guidance for technicians.
- **D32:** small limits:
  - an offer lasts 10 minutes, and an "ask again" hold also lasts 10
    minutes;
  - a customer may have 5 jobs open and post 10 a day;
  - she may raise her price 3 times;
  - ratings may be given for 14 days.
- **D33:** is a 20% reserve enough?
- **D40:** a possible no-show 60 minutes after he was due, and 60 minutes
  allowed when Google has no minutes: confirm or change (both in Settings).
- **D34.7:** "come back later" rescheduling, not built.
- **D34.8:** a street test of the GPS radius in real Islamabad houses,
  flats and shops.
- **D39:** a second city: visit fees, prices, the lowest offer and sectors
  for each city, and who checks technicians there.

### D38, launch offers (decided and built 17 November 2026; three follow-ups)

- **Decided:** a 5% launch rate and a referral credit for technicians
  (A99–A101, see section 4), and no customer discount.
- **Built:** in edition 8. Approved technicians with no first-job record
  are listed by the database step and left unchanged.
- **Still open:**
  1. **D38.1, the cut-off date.** Technicians who apply by this day get the
     launch rate. Until it is set, the offer is off for everybody. Give it
     once the launch date is known.
  2. **D38.2, the agreement wording.** The technician agreement's new
     "Launch offers" section is marked `[DECIDE WITH A LAWYER]`, for the
     same review as D1.
  3. **D38.3, the Urdu.** The "Tell a technician" message's Urdu is a
     draft. A native speaker checks it, and decides whether "Pechkas" is
     one word or two in Urdu, used everywhere.

## 8. Launch blockers, in a sensible order

1. **The legal base:**
   - D1 first, then D2;
   - then a lawyer reads the terms, the technician agreement and the
     privacy page.

   **Every legal choice is visibly marked `[DECIDE WITH A LAWYER]`.**
2. **The identity service (D37.2, A119).** Choose the company, then follow
   "The identity check" in `docs/OWNER.md`: the server function, its
   secrets, the database change, a test on your own phone, and **switch it
   on before the public launch** — the welcome screen says "Verified
   technicians", and without it every technician stays on first-job
   limits for good.
3. **Real sign-in:** connect Twilio (A107) and Resend (A108) in Supabase,
   following `docs/OWNER.md`, and see a real code arrive on all four
   networks and at an outside email address.
4. **Run the six database changes** (D37's two, then A5's, D38's, A104's
   and A105's) and install the one edition-8 build on the same day.
5. **Type the decided numbers and the pay account:** the first-job
   numbers in Admin → Settings → First jobs (A102, A104), and the new
   bank account in Admin → Money → Where technicians pay (A103). Give the D38.1
   cut-off date once the launch date is known, and save the app's store
   link in the office panel once the app is in the Play Store, so "Tell a
   technician" appears.
6. **Find the first real technicians** in the launch sectors (D17).
7. **Get the Urdu checked:** the quizzes and the safety quizzes (D37.3,
   D37.4) and the "Tell a technician" message (D38.3).
8. **The Play Store closed test, then public release.** The iPhone comes
   later and needs D22.

The website's own items (D23–D29, D37.8) are marketing work for later and
are not on this list.

## 9. Tensions worth thinking about

These are honest observations, not decisions.

- **The cold start.**
  - The rules make a new technician slow to reach full access: 3 trial
    jobs per trade, an identity service, and checked jobs for risky work.
  - Customers need technicians to be available.
  - With few technicians, many jobs will get no offers, and risky job types
    will be closed in most sectors.
  - **D38 and D17 (starting small, where the first technicians live) are
    the main levers.** D38 is now built, but it does nothing until the
    cut-off date is set (D38.1).
- **The office is still needed for some steps:**
  - correcting a payment that did not arrive, and answering a payment
    pause appeal (A5: exceptions only, no longer every payment);
  - disputes and appeals;
  - "not finished" the second time;
  - guarantee refusals.

  **The owner has to answer these in writing in his own time.** At volume,
  that is real work.
- **Money flows outside the app**, so Pechkas is owed commission rather
  than collecting it. The credit limit and due dates are the only way to
  enforce it. **A wallet would change this, but needs a lawyer first.**
- **Many numbers are guesses until real jobs exist:** the flags, the visit
  fee, the GPS radius and the reserve. They are kept as settings so they
  can be tuned without new code.
- **The website still holds some of the app's files.** The four legal
  pages, the logo's shapes and the first price list live in the website's
  repository and are copied into the app. That is only where the files
  are: the app decides what they say. **Whether to move them into the
  app's repository is an open choice for the owner.**

## 10. How to work with Claude on this

- **Explain in plain words, with numbered steps**, and say which screen
  and which button.
- **The owner decides business questions.** Claude suggests, then builds
  what was decided. Each decision moves from D… to A… in `docs/DECISIONS.md`
  with its date. **Never record a decision he has not made.**
- **Anything touching safety, money or the law: stop and ask.** Legal
  wording is a visible `[DECIDE WITH A LAWYER]`, never a guess.
- **The owner runs database changes himself**, in the Supabase SQL editor,
  following `docs/OWNER.md`.
- **Build the app; never follow the website.** No website work unless the
  owner asks for it by name.
- **Commits go straight to `main`**, with no branches or pull requests.
- **Never ask him to paste a secret into a chat.** Say where to put it
  instead.
