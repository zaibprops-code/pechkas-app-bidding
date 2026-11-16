# Pechkas: a complete briefing for an adviser

_Written 16 November 2026 from the two repositories as they stand today
(app `zaibprops-code/pechkas-app-bidding`, website `zaibprops-code/Pechkas`).
Every rule below is something the code actually does, not a plan, unless it
says "open" or "not built"._

**How to use this file.** Paste it into a new conversation with Claude and
say something like: *"This is my business. Help me decide D38"* (or any other
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
- **There are two products:**
  1. **The website, pechkas.net.** A fixed price list for each service,
     area pages, safety guides for emergencies, seasonal campaigns,
     referral cards and a careers page (`/join`). People book on WhatsApp
     or through `/book`, and a small office "job book" (`/admin`) tracks
     those jobs. It runs on Vercel with Supabase behind it.
  2. **The app, "Pechkas", for Android and later iPhone.** It works by open
     bidding, like inDrive for home repairs:
     - a customer posts a job and names her price;
     - checked technicians accept that price or ask for more;
     - she picks one.

     It is built with Expo (React Native) on a Supabase database. The
     office runs it from a web admin panel.
- **Where it stands:**
  - The app is built through "phase 8" and D37.
  - It is **not open to the public yet**: only test numbers can sign in
    until an SMS company is connected (D20).
  - The Play Store closed test (12 testers for 14 days) is the next store
    step.
  - The app is on **edition 8**: the database changes for D37 and a new
    build go out together.
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
2. **Posting a job.** Everything is on one page:
   - **The job:** the trade, then the job type. Each type shows the
     website's usual price as "Usual price".
   - **What is wrong:** a voice note (up to 1 minute), a video (up to 20
     seconds), photos (up to 4) and words.
   - **The address:** a map pin is required. The app reads the sector from
     the pin, and the customer types the house or flat and the street.
   - **The day:** today, tomorrow, or a day in the coming week. She does
     not choose a time.
   - **Her price:** in steps of Rs 50, with a minimum of Rs 1,000.
   - **Only "live" sectors take jobs:** F-11, E-11 and G-13.
   - **Price range:** once there are 10 finished jobs of that kind in 90
     days, she sees the middle half of what such jobs really cost.
3. **Offers.**
   - **Who sees the job:** approved technicians in that trade and sector
     who are online. Before he is chosen, a technician sees her first name
     and the sector only, never the address or phone number.
   - **What an offer can be:** he accepts her price, or asks for more, up
     to 2× her price.
   - **What an offer must say:** the two-hour window he will arrive in.
   - **How long it lasts:** 10 minutes, after which he can renew it.
   - **What she sees:** his first name, his years of experience, his
     checks, his rating ("New" until he has 3 ratings), and reviews
     without the reviewers' names.
4. **When nobody offers.**
   - **She is told:** after 20 minutes for a job today, or 3 hours for a
     later day.
   - **She can:**
     - raise her price by Rs 200, 500 or 1,000, up to 3 times;
     - move the job to another day;
     - keep waiting.
   - **A job nobody took closes at 8pm on its day.**
5. **She chooses one offer.**
   - The job is locked to that technician.
   - His window becomes the job's time.
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
| **Repeat customer** | 7% when the same customer and technician have finished a job together before (D18 asks how far back that should count). |
| **No commission on** | Visit fees, parts, guarantee repairs Pechkas pays for, cancellations, no-shows and unsuccessful visits. The rule (A67) is that Pechkas earns only on completed repair labour the customer has paid for. |
| **Credit limit** | Rs 3,000. Once he owes more than that, his new offers stop until he pays. |
| **Due dates (D36)** | Each fee is due 14 days after it is posted, with 3 days of grace. From day 18 his new offers stop while it is unpaid. There is no late fee and no interest. Payments pay the oldest fees first. |
| **Paying Pechkas** | He taps "I have paid" with a screenshot. **The office must press Confirm**, which is the one routine step still needing a person (A5). The account he pays into is still blank (D15). |
| **Guarantee reserve** | 20% of every commission. When it runs out, Pechkas pays from its own money. |
| **Visit fee** | A flat Rs 300, set in Settings. Owed only after a real visit at which she declined a new price. The technician keeps all of it. |
| **Ledger** | Double-entry and written once. A mistake is corrected with a reversal, never an edit. No balance is stored: it is always worked out from the ledger lines. |
| **Customer discounts** | None. A64 says there is no compensation, wallet, credit or discount at launch. |

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
   - basic job types only, one job at a time, at or under a price limit;
   - after each job the customer answers four questions: was he on time,
     did he explain the work, did he leave it clean, does it work.
4. **A trial job counts as good when all of these hold:**
   - all four answers were yes;
   - his before and after photos are in;
   - no guarantee claim stands against it;
   - the commission on it is paid;
   - the customer is real and separate from him: a different checked
     number, a home far enough from the other trial customers, and not
     counted before.
5. **Three good jobs plus verified identity approve the trade.**
   - **Verified identity** means a CNIC check against NADRA's records,
     done by an outside service.
   - **There is no such service yet** (D37.2), so **today nobody can leave
     first-job limits.**
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
  - she picks the day and he picks the two-hour window;
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
  - a potential no-show is announced 30 minutes after his window ends.
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
- **A25–A30, trust:** no CNIC is stored; flags are only flags; blocking;
  hidden ratings; first name only before he is chosen; applying is free.
  - **Note: A25 is out of date.** It still says a technician is approved
    after "identity in person or by video call, a trial job, and the
    rules". D37 (A85–A98) replaced that, so A25 should be reworded.
- **A31–A35, accounts and contact:** number, email or Google sign-in; one
  account with two modes; English only; no email address; open 7am to
  10pm.

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

- **D15:** which account technicians pay their commission into. **It is
  blank today.**
- **D16:** keep the lowest offer at Rs 1,000 and the highest at 2× her
  price?
- **D17:** are F-11, E-11 and G-13 the right sectors to start in? They
  should be where the first technicians live and work.
- **D18:** does the 7% repeat rate look back forever, or only 12 months?
- **D19:** should a technician be switched offline automatically after
  some hours?
- **D20:** **which SMS company sends the codes.** Nobody real can sign in
  until this is done.
- **D21:** email codes need Resend connected.
- **D22:** Sign in with Apple before the iPhone version, or phone and email
  only on iPhone?
- **D37.1, the numbers for first jobs. Every one starts as "not set", and
  whatever needs it waits until it is set.** Claude's proposals:
  - a price limit of Rs 4,000 on first jobs;
  - first-job customers' homes at least 500 m apart;
  - a quiz pass mark of 80%, with a retake after 3 days;
  - risky work after 10 clean jobs over at least 30 days, with no claim
    against him in 60 days;
  - a checker's fee of Rs 1,000;
  - technicians approved before D37 kept approved at 3 clean jobs, and
    risky work at 10.
- **D37.2, the identity service.** A company authorised to check CNICs
  against NADRA, with a liveness photo and face match, a written price, and
  terms saying Pechkas receives only "matched or not". **It is the most
  urgent thing outside the app, because nobody leaves first-job limits
  without it.**
- **D37.3, the Urdu quiz text:** a native speaker must check it before the
  rules quiz is switched on.
- **D37.4, the safety quizzes:** a qualified electrician, gas fitter or AC
  technician checks each one before it goes on. Until then nobody can
  unlock risky work.
- **D37.5:** safety quizzes for the other trades, if wanted.
- **D37.7:** UPS and inverter needs its own job types and price list.
- **D37.8, the website's trust claims.** The booking pages say a
  technician has "had his CNIC checked" in person, wears a uniform, and
  that "we call you before he reaches your gate". **Under the standing
  rule (no visits, no calls), are these still true?** If not, they must
  change, because the site must never promise what Pechkas does not do.
- **Next routine step to remove:** A5, the office confirming every "I have
  paid".

### The website (owner checks facts)

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
- **D34.7:** "come back later" rescheduling, not built.
- **D34.8:** a street test of the GPS radius in real Islamabad houses,
  flats and shops.
- **D39:** a second city: visit fees, prices, the lowest offer and sectors
  for each city, and who checks technicians there.

### D38, launch offers (being discussed, no answer yet)

- **The question:** should there be anything to win the first technicians
  and customers?
- **Today:** there are none. The 10% and 7% rates are written into the
  technician agreement, so any offer changes that page too.
- **Claude's recommendation:**
  - **A launch commission rate** (for example 5%) on a technician's jobs
    **after** his first 3 in a trade, with a fixed end date. He pays
    whichever is lower, the launch rate or the usual one.
  - **A technician-refers-technician credit**, earned only when the
    newcomer's 3rd first job counts as good. It is capped, only reduces
    what he owes, and is never paid out in cash.
  - **No customer discount.** A discount would break A64. A
    customer-referral reward has nothing to pay out in, because there is
    no wallet.
- **Waiting for the owner:**
  1. Any offer at all, or none?
  2. For a launch rate: what rate, and what end date?
  3. For the referral credit: what amount, and what cap?
  4. Confirm that there is no customer discount.

## 8. Launch blockers, in a sensible order

1. **The legal base:**
   - D1 first, then D2;
   - then a lawyer reads the terms, the technician agreement and the
     privacy page.

   **Every legal choice is visibly marked `[DECIDE WITH A LAWYER]`.**
2. **The identity service (D37.2).** Without it every technician stays on
   first-job limits for good.
3. **Real sign-in:** an SMS company (D20), and Resend if email codes stay
   (D21).
4. **Run the D37 migrations** and install edition 8 on the same day.
5. **Set the D37.1 numbers and the D15 pay account.**
6. **Find the first real technicians** in the launch sectors (D17).
7. **Get the Urdu and safety quizzes checked** (D37.3, D37.4).
8. **Fix the website's trust claims** (D37.8), the gas number (D26), and
   the real team (D28).
9. **The Play Store closed test, then public release.** The iPhone comes
   later and needs D22.

## 9. Tensions worth thinking about

These are honest observations, not decisions.

- **The cold start.**
  - The rules make a new technician slow to reach full access: 3 trial
    jobs per trade, an identity service, and checked jobs for risky work.
  - Customers need technicians to be available.
  - With few technicians, many jobs will get no offers, and risky job types
    will be closed in most sectors.
  - **D38 and D17 (starting small, where the first technicians live) are
    the main levers.**
- **The office is still needed for some steps:**
  - confirming payments (A5);
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
- **The website and the app must say the same thing.** The guarantee
  lengths, the cancellation rules and the legal pages are copied between
  them, and **any change has to happen in both in the same week.**

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
- **Commits go straight to `main`**, with no branches or pull requests.
- **Never ask him to paste a secret into a chat.** Say where to put it
  instead.
