# Pechkas — business decisions

Every business decision about how Pechkas works, in one place: **what is
already decided** and **what is still open**. The app, the website and the
legal pages follow this list.

**How we use it**

1. Pick one open decision by its number (for example "let's do D10").
2. Claude explains it, with the options and a suggestion. You decide.
3. Claude builds it, then moves it to the decided list with the date.

A decided item can be reopened the same way: say its number (for example
"reopen A12").

Who decides:

- **You** — a business choice. Claude can suggest, but it is yours.
- **You + lawyer** — it is in the terms or the technician agreement, or it
  is about money owed or the law. A lawyer must read it before launch.
- **You check** — a fact only you can confirm (a phone number, a price).

_Last updated: 22 November 2026 (D20 decided as A107: Twilio SMS now, WhatsApp after Meta approves; D21 decided as A108: keep email sign-in, sent through Resend. Earlier the same day: D18 decided and built as A105: the repeat rate looks back 12 months; D19 decided as A106: Online stays the technician's own switch). Before that, 18 November 2026 (D37.1 decided and built: the numbers as A102, the price limit on the work as A104; D15 decided as A103). Before that, 17 November 2026 (D38 decided and built as A99–A101; A5 decided and built; A25 reworded to match D37). The same list as a map you can tap through:
https://claude.ai/artifact/YBZXKEJ1QUo39BNK4k8Ha4 (private to your account)._

---

## The standing rule (the owner, 13 November 2026)

Every decision below, open or decided, is held to this. An older decision
that still needs the owner or the office for a routine step is to be
reviewed against it.

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

**The app comes first (the owner, 16 November 2026).** Building the app is
the only purpose. The website was built first, but it is now for marketing
only. Nothing in the app follows the website: every decision here is made
for the app on its own merits, and where the two disagree, the app is right
and the website is changed later to match. Website-only items (D23–D29,
D37.8) are marketing and do not block the app.

---

## Part 1 — Still open

### Before launch: the legal base (you + lawyer)

These sit under **[DECIDE WITH A LAWYER]** in the app's terms
(pechkas.net/app/terms) and the technician agreement
(pechkas.net/app/technician-agreement). D1 comes first: several of the
others depend on its answer.

#### D1. Who is the customer's agreement with?
- **The question:** When a customer books a repair, is her agreement with
  **Pechkas**, with the technician working for Pechkas? Or is it with **the
  technician**, with Pechkas introducing him, checking him and standing
  behind the guarantee?
- **Why it matters:** It decides who is responsible for bad work and
  damage, and whether technicians are employees or independent. That also
  decides tax, and much of both legal pages.
- **Today:** The website's terms (WhatsApp bookings) say the technician
  works for Pechkas. The app's terms leave it open. The two must end up
  saying the same thing.
- **Who decides:** You + lawyer.

#### D2. The business itself
- **The question:** What is the registered name, address and legal form
  (sole owner or company)? Which tax registration does the lawyer or
  accountant say you need?
- **Today:** `[REGISTERED BUSINESS NAME AND ADDRESS]` appears on the
  terms, the technician agreement and the website's terms.
- **Who decides:** You + lawyer or accountant.

#### D3. Damage at a customer's home
- **The question:** If a technician breaks something, who pays (him,
  Pechkas, or insurance), and up to how much?
- **Today:** The terms say `[DECIDE WITH A LAWYER: who pays for damage, and
  up to how much.]` There is no insurance.
- **Who decides:** You + lawyer.

#### D4. The limit of Pechkas' responsibility, and which law applies
- **The question:** What is the most Pechkas is ever responsible for? Which
  law applies (Pakistan), and where are disputes heard (Islamabad)?
- **Who decides:** You + lawyer.

#### D5. Guarantee charges to a technician
- **The question:**
  - May Pechkas add the cost of a replacement repair to what he owes?
  - Must he redo failed work without pay?
  - Is 7 days a fair time to appeal?
  - Is the office's decision on an appeal final, or does he have a
    further review?
- **Today:** Built the way you decided (A20–A23 below): never more than his
  labour, final only after 7 days or after the office upholds his appeal.
  The lawyer confirms it is allowed.
- **Who decides:** Lawyer (your rule is already set).

#### D6. Suspending a technician
- **The question:** How much notice does he get before he is suspended or
  removed? How does he ask for the decision to be looked at again?
- **Today:** The office can switch anybody off at once, and the agreement
  says "tells you why".
- **Who decides:** You + lawyer.

#### D7. Changing the terms
- **The question:** How much notice do customers and technicians get
  before new terms apply to them?
- **Who decides:** You + lawyer.

#### D8. The guarantee's edges
- **The question:**
  - Is work covered when the customer supplied the part herself?
  - Is there a top limit on what Pechkas owes under the guarantee?
- **Today:** A part the technician fitted is covered by the shop's
  warranty. Pechkas covers the labour to fit it again.
- **Who decides:** You + lawyer.

#### D9. The privacy page's blanks
- **The question:** Fill in five things, and have a lawyer read the
  privacy page, the delete-account page and the Play Store's Data safety
  answers:
  - which Supabase region the data lives in;
  - how many days a deletion request takes;
  - how long money records are kept (`[HOW LONG THE LAW REQUIRES]`);
  - how long photos from inside a customer's home are kept after she
    deletes her account;
  - the publish date.
- **Where to find the region:** Supabase → Project Settings → General →
  Region.
- **Who decides:** You check, then lawyer.

### Before launch: money and everyday rules (you)

#### D10. Cancelling — decided and built (A41–A46)
- **Your decision** (10 November 2026), with your answers to the audit's
  questions, is now in Part 2 as A41–A46.
- **Still open:**
  - **D10.5 Research, not a rule yet:** how Islamabad technicians handle a
    last-minute cancellation today. Ask three or four. Nothing changes until
    you decide.
  - **D10.6 Could late cancellations ever lead to a charge or a
    restriction?** Today they never do. You + lawyer; the app's terms carry
    a `[DECIDE WITH A LAWYER]` for it.

#### D11. A chosen technician who never comes — decided and built (A44, A45, A59–A65)
- **Your decision** (11 November 2026) is now in Part 2 as A59–A65.
  D11.1 is answered by A63 (a pause of new offers, never a charge) and
  D11.2 by A64 (no compensation at launch; service recovery instead).
- **Still open:**
  - **D11.3** Whether a pause needs notice first, and whether late
    withdrawals or no-shows may ever lead to more than a review and a pause.
    You + lawyer; the technician agreement carries a `[DECIDE WITH A
    LAWYER]` for it.
  - **D11.4** Whether "no compensation, service recovery instead" is enough
    under consumer law. You + lawyer; the app's terms carry a `[DECIDE WITH
    A LAWYER]` for it.

#### D12. The visit fee — decided and built (A36–A40)
- **Your decision** (9 November 2026), and your follow-up answers (10
  November: "go with your suggestions"), are now in Part 2 as A36–A40.
- **Still open:**
  - **D12.10 Is Rs 300 the right amount in 2026?** Ask three or four
    Islamabad technicians what they charge today for coming to check a fault,
    then set the fee near it in Settings. Watch how often customers say no
    at the door, and how many fees go unpaid or are questioned (the admin
    panel's Visit fees page shows both). The website's own note says
    Islamabad quotes Rs 500–1,000 for a diagnostic visit; that is the
    inspection fee, a different thing, but a useful anchor.
  - **D39** covers a different fee in each city.

#### D13. Commission on a visit fee — decided and built (A66, A67)
- **Your decision** (11 November 2026) is now in Part 2 as A66 and A67.
- **Still open:**
  - **D13.1** Look at it again **if the visit fee ever goes above Rs 300**,
    for example with a distance-based fee. Decide then from what technicians
    earn and what visits cost, not just because the fee went up.
  - **D13.2** A review **after 2–3 months of real jobs**: how often jobs
    stop with a visit fee, per technician, and what the Visit fees page's
    "At 10% (not charged)" column adds up to.

#### D14. Paying technicians what Pechkas owes them
- **The question:** After a guarantee repair, Pechkas can owe a technician
  money. How often is he paid (weekly, monthly, on request)? How
  (JazzCash, Easypaisa, bank)? Is there a smallest amount worth sending?
- **Today:** The office records each payment by hand in Money → "Pechkas
  owes these technicians". The agreement says
  `[DECIDE WITH A LAWYER: how and when the office pays you…]`.
- **Who decides:** You + lawyer.

#### D15. Where technicians pay Pechkas — decided 18 November 2026 (A103)
- Decided: a separate bank account with a Raast ID, used only for Pechkas,
  moving to a business account in Pechkas' name once D2 is done. See A103.
- **Where to put it:** Admin → Money → Where technicians pay.

#### D16. The lowest offer and the highest counter-offer
- **The question:**
  - Keep the lowest price a customer can offer at **Rs 1,000** (your
    published inspection fee)?
  - Keep the most a technician can ask at **2× the customer's price**?
- **Who decides:** You (confirm, or change). The office can change both
  later in Settings.

#### D17. Launch sectors
- **The question:** Are **F-11, E-11 and G-13** the right sectors to start
  in? They should be where your first approved technicians actually live
  and work.
- **Today:** Those three take jobs, the same as the website.
- **Who decides:** You.

#### D18. How long the repeat fee looks back — decided and built 22 November 2026 (A105)
- Decided: 12 months, measured from when she chooses him. See A105.

#### D19. Technicians who forget to go offline — decided 22 November 2026 (A106)
- Decided: nothing switches automatically. See A106.

### Before launch: signing in (you, then setup steps)

#### D20. Who sends the sign-in codes by SMS — decided 22 November 2026 (A107)
- Decided: Twilio SMS now; WhatsApp through Twilio once Meta approves the
  business. See A107. Set-up: OWNER.md, "Real sign-in codes: Twilio SMS".

#### D21. Email codes — decided 22 November 2026 (A108)
- Decided: keep email sign-in, sent through Resend from pechkas.net. See
  A108. Set-up: OWNER.md, "Sending email codes through Resend".

#### D22. iPhone sign-in
- **The question:** Before the iPhone version, build "Sign in with Apple"?
  Apple requires it next to Google's button. The other choice is to keep
  iPhone users on phone and email only.
- **Today:** The Google button shows on Android only.
- **Who decides:** You.

### The website: marketing, not the app (you, or you check)

These are about the website only. Since 16 November 2026 the website is
marketing, so none of them blocks the app.

#### D23. Painting prices
- **The question:** Price the two painting jobs per room, or mark them
  "Inspection first"? Islamabad usually quotes painting per square foot.
- **Today:** `[PRICE]` on both, and painting is hidden.
- **Who decides:** You.

#### D24. Plan and check-up prices
- **The question:** Prices for:
  - the Landlord plan (per property, per month);
  - the Office and guesthouse plan;
  - the Move-out check, the Move-in check, and both together.
- **Today:** `[PRICE]` on all five.
- **Who decides:** You.

#### D25. Customers paying from abroad
- **The question:** How do overseas Pakistanis pay for work at their
  family's home?
- **Today:** `[OVERSEAS PAYMENT METHODS]` on /from-abroad.
- **Who decides:** You.

#### D26. The gas emergency number
- **The question:** The gas company's emergency line, for the gas-smell
  safety guide.
- **Today:** `[GAS EMERGENCY NUMBER]`. **A wrong number here is dangerous.**
  Ring it yourself before it goes in.
- **Who decides:** You check.

#### D27. The About page
- **The question:** Your story: where you grew up, what you did before,
  the repair that made you start Pechkas, why the name. Plus a photograph.
- **Today:** Gaps, on purpose. Claude will never write these for you.
- **Who decides:** You write them.

#### D28. Real technicians on /team
- **The question:** Replace the two example technicians with real ones.
  For each one: the date his CNIC was checked, and his permission to use
  his photograph.
- **Who decides:** You.

#### D29. The Google review link
- **The question:** Your Google Business Profile's review link, so receipts
  can ask for a review.
- **Today:** Empty, so the review button is left out.
- **Who decides:** You check.

### After launch: tune with real data (you, in a month or two)

These all have a working value today. They are guesses until real jobs
show whether they are right.

#### D30. Flag limits
- **The question:** Are the fraud-flag limits catching the right people?
  See Admin → Flags. Each limit can be changed there in Settings.
- **Today:**

  | Flag | Limit |
  | --- | --- |
  | His late arrivals (more than 15 minutes after he was due) | 3 |
  | His confirmed no-shows | 1 |
  | His own "nobody home" reports | 3 |
  | Wrong start codes on his jobs | 5 |
  | 1–2 star ratings | 3 |
  | Problems reported about somebody | 2 |
  | Jobs for one customer | 4 |
  | A customer's late cancellations | 3 |
  | Office-confirmed "nobody home" for a customer | 3 |
  | Refused new prices | 30% of his jobs, once he has 3 |
  | Asked a new price | 50% of his jobs, once he has 3 |
  | Parts-heavy jobs (parts ≥ 60% of the price) | 2 |
  | Blocked by customers | 2 |
  | Price for the work 50% above the usual range | 3 |
  | Jobs mostly closed by the clock, not the customer | 3, and half his jobs |
  | Guarantee claims | 2 in 60 days; 3 in 90 days = review his approval |
  | Customer found wrong about "not finished" | 2 |

- **Who decides:** You.

#### D31. Price guidance
- **The question:**
  - Keep showing technicians the usual price range when they make an
    offer?
  - Keep needing 10 finished jobs of a kind, over 90 days, before a range
    is shown?
- **Today:** Ranges are shown to technicians. If their quotes start
  bunching at the middle, switch it off in Settings.
- **Who decides:** You.

#### D32. Small limits
- **The question:** Confirm or change each of these:
  - an offer stays open for 10 minutes;
  - a job a customer asks a particular technician for is his alone for
    10 minutes;
  - a customer may have 5 jobs open and post 10 a day;
  - a customer may raise her price 3 times (+Rs 200 / 500 / 1,000);
  - she is told "no offers yet" after 20 minutes for today, 3 hours for a
    later day;
  - ratings may be given for 14 days;
  - stars are shown after 3 ratings;
  - a start code locks after 5 wrong tries.
- **Who decides:** You.

#### D33. The guarantee reserve
- **The question:** Is 20% of each commission enough to pay for guarantee
  repairs, now that the office can raise a replacement's limit up to 3×?
- **Today:** 20%. When the reserve is empty, Pechkas pays from its own
  money. The office page shows the balance.
- **Who decides:** You, once there are a few months of claims.

#### D40. When a late technician becomes a possible no-show
- **The question:** Two new numbers came with A116 (built 25 November
  2026). Confirm or change them:
  - a chosen technician who has **not arrived 60 minutes after the time he
    was due** is a possible no-show: she, he and the office are told, and
    she may cancel free or find another;
  - when Google Maps gave **no minutes** for him (no key yet, or no
    answer), he is **due 60 minutes** after she chose him.
- **Today:** 60 and 60, chosen by Claude, not by you. Both are in Admin →
  Settings (30 to 180 minutes). The 15 minutes for "late" is yours (A116)
  and locked, because the terms say it.
- **Who decides:** You.

### Growing: a second city (you, after launch)

#### D39. Opening a second city
- **The question:** What has to change before Pechkas takes jobs outside
  Islamabad? Prices, incomes and technicians' going rates differ by city
  (the owner's question, 10 November 2026).
- **Today:** Islamabad only: one visit fee, one lowest offer, one list of
  usual prices, all Islamabad's, and Islamabad sectors.
- **Follow-up questions:** D39.1 a visit fee per city; D39.2 usual prices
  per city, and price ranges counted per city; D39.3 the lowest offer per
  city; D39.4 each city's own areas, opened only with a checked technician
  there; D39.5 the same commission everywhere, or lower to start; D39.6 who
  checks technicians in that city.
- **Who decides:** You, before a second city.

### Found on a second pass: no rule yet (you)

These came up when the app was checked for situations nobody has decided.
Each one happens in real life; today the office handles it by hand.

#### D34. Nobody home — decided and built (A47–A52)
- **Your decision** (11 November 2026) is now in Part 2 as A47–A52.
- **Still open:**
  - **D34.6 Should Pechkas ever pay a technician for a visit where nobody
    was home?** Not at launch. The admin panel's Cancellations page now
    keeps every such visit, with the job's visit fee as a reference, so you
    can decide from real numbers. You + lawyer.
  - **D34.8 The street test**: the 100 m radius and 50 m accuracy are
    starting guesses. Walk the checklist in `docs/OWNER.md` (houses, shops,
    upper-floor flats, poor reception) on real Android phones, then set the
    two numbers in Settings → Location checks from what you saw.
  - **D34.7 "Come back later"**: moving a visit to another window instead
    of cancelling and posting again. Postponed by you; not built.

#### D35. A customer who does not pay the technician — decided and built (A76–A84)
- **Your decision** (12 November 2026) is now in Part 2 as A76–A84.
- **Still open, for you and a lawyer** (each is a `[DECIDE WITH A LAWYER]`
  on the terms, the technician agreement or the privacy page):
  - **D35.1** Whether Pechkas may restrict a customer's access because of
    a debt to a technician, what notice it must give, and how she can
    challenge it.
  - **D35.2** Recording that she owes: how accurate it must be, how long
    it is kept, and how she has it corrected.
  - **D35.3** Who may chase the money, and whether her details may be
    passed to anybody to do so (linked to D1).
  - **D35.4** Holding the commission and charging it only on money
    received, against the rest of the technician agreement.
  - **D35.5** The guarantee on a job that was not paid in full.

#### D36. A due date for paying Pechkas — decided and built (A68–A75)
- **Your decision** (11 November 2026) is now in Part 2 as A68–A75.
- **Still open:**
  - **D36.4** Whether stopping new offers for an overdue fee needs notice
    beyond the reminders. You + lawyer; the technician agreement carries a
    `[DECIDE WITH A LAWYER]` for it.

#### D37. A new technician's first jobs — decided and built (A85–A98)
- **Your decision** (13 November 2026, after the watched-trial plan was
  withdrawn) is now in Part 2 as A85–A98.
- **Still open:**
  - **D37.1 The numbers — decided 18 November 2026 (A102, A104).** The
    price limit is Rs 5,000 on the work, not parts (A104, built).
  - **D37.2 The identity service.** *The kind of check and when it comes
    were decided 26 November 2026 (A119), and everything on Pechkas' side is
    built.* Still open: **which company** — one authorised to check CNICs
    against NADRA's records, with a liveness photo and face match; a written
    price; written terms that it keeps the card image and Pechkas receives
    only matched or not and its reference; probably a registered business
    (NTN or SECP) first. Its key goes into Supabase's secrets, never the chat
    or this repository. The steps are "The identity check" in
    `docs/OWNER.md`. **You, by email, + lawyer.**
  - **D37.3 The Urdu.** Every quiz question is a draft; a native speaker
    checks it before the rules quiz is switched on. **You check.**
  - **D37.4 The safety quizzes.** Drafted for AC, Electrician, Plumber, Solar
    and Home appliances, and switched off. A qualified electrician, gas
    fitter or AC technician checks each before it goes on. Until then risky
    work cannot be unlocked by anyone, because the checked safety quiz is
    part of the bar. **You arrange, by email.**
  - **D37.5 Safety quizzes for CCTV, Wi-Fi, computers, carpentry and
    painting.** None drafted: those trades have no risky job types. Say if
    you want them. **You.**
  - **D37.6 The lawyer's questions** (each a `[DECIDE WITH A LAWYER]` on the
    agreement, the terms or the privacy page): keeping and showing a photo
    used to identify a person; checking identity against NADRA's records
    through another company; decisions made by rule about who may take jobs,
    and their review; what a checker is responsible for. **You + lawyer.**
  - **D37.7 UPS and inverter** needs its own job types and price list later
    (fix a). Until then all UPS work is "Something else", risky, and open
    only to a technician whose risky Electrician work is open. **You.**
  - **D37.8 The website's own booking pages** still say every Pechkas
    technician "has had his CNIC checked" in person, wears a uniform, and
    that "we call you before he reaches your gate" (the home page's trust
    points, the FAQ, /team). Those describe WhatsApp bookings, not the app,
    and were left alone; under the standing rule (no visits, no calls), say
    whether they are still true. **You.**
- **Next routine step to remove (the owner, 13 November 2026):** A5, the
  office confirming every "I have paid". **Done 17 November 2026** (the
  new A5): a payment counts at once and is final for first jobs after 3
  days, so a good first job no longer waits for the office.

#### D38. Launch offers — decided and built (A99–A101)
- **Your decision** (17 November 2026) is in Part 2 as A99–A101: a launch
  rate that belongs to each technician, a credit for bringing in another
  technician, and no customer discount. Built on 17 November 2026, in
  edition 8. The Urdu of the "Tell a technician" message is a draft: a
  native speaker checks it, and decides how Pechkas is spelled, before
  the app is public.
- **Still open:**
  - **D38.1 The cut-off date.** Only technicians who apply before it get
    the launch rate. You give it once the public launch date is known;
    until then it is "not set" and the offer is off. **You.**
  - **D38.3 The Urdu of the "Tell a technician" message.** A native
    speaker checks it and decides how Pechkas is spelled in Urdu; that
    spelling is then used everywhere. **You check.**
  - **D38.2 The agreement's wording** for A99 and A100, marked
    `[DECIDE WITH A LAWYER]`, for the same review as D1. **You + lawyer.**

---

## Part 2 — Already decided

What the app and the website do today. Reopen any item by its number.

### Money

| # | Decision |
| --- | --- |
| A1 | **Commission is 10% of the labour only**: the agreed price minus parts with a shop receipt, rounded down so odd paisa stay with the technician. |
| A2 | **7% instead of 10%** when the same customer and technician have done a job together before, finished in the 12 months before she chose him (A105). |
| A3 | **Credit limit Rs 3,000.** Once a technician owes more, his new offers stop until he pays. He is told once. |
| A4 | **Pechkas holds nobody's money** in version 1. The customer pays the technician directly (cash, JazzCash, Easypaisa). There is no wallet and no escrow. A wallet would need a lawyer first. |
| A5 | **Decided and built 17 November 2026** (replaces "nothing counts until the office presses Confirm"). **A technician's "I have paid" counts at once**: what he owes drops as soon as he sends the amount, how he paid (JazzCash, Easypaisa or bank), the transaction number and a screenshot. **Each transaction number can be used only once.** Nothing in the app or its wording calls a payment "verified". **For counting first (trial) jobs, a payment is final after 3 calendar days** (no holiday list). **No office notice per payment**: the Money page keeps "Payments to check" (amount, transaction number, days left of the 30, oldest first), and the office is told at most once a day ("5 payments to check"). **For 30 days after the claim, the office may press "Not received" or "Received less: Rs ___"**: a ledger reversal puts back only the missing amount, nothing is edited, and he gets a flag. A trial job that counted on that money goes back to waiting, and its trade back to trial if that job approved it; jobs in progress go on; once he pays the missing amount and that payment is final, the job counts again. **A second "Not received" or "Received less" within 90 days pauses his new offers by rule, until the office lifts it**; jobs he has go on, he appeals in writing, and an appeal unanswered for 3 days is shown as a reminder under Exceptions. Payments sent before this stay under the old rule (the office confirms them). Built so that a payment company's own confirmation can plug in later. Cash given in person is still recorded by the office. Part of edition 8: one migration and one build together. |
| A6 | **20% of every commission goes to the guarantee reserve.** When it is empty, Pechkas still pays. |
| A7 | Prices are whole rupees. The − and + buttons move a price by **Rs 50**. |
| A8 | No price agreed means **"no price yet"**, never Rs 0. Pechkas never invents a price, rating, review or number. |

### Jobs and prices

| # | Decision |
| --- | --- |
| A9 | **The customer names her price.** Technicians accept it or ask for more, up to 2× (D16). The lowest offer is Rs 1,000 (D16). |
| A10 | **The customer picks the day; the technician says the two hours** he will arrive in. Everything runs on Pakistan's clock. |
| A11 | **Only live sectors take jobs** (F-11, E-11, G-13 — D17). The **map pin is required**. |
| A12 | **No offers yet:** after 20 minutes (today) or 3 hours (a later day), she may raise her price by +Rs 200 / 500 / 1,000 (3 times at most), choose another day, or keep waiting. A job nobody took closes at 8pm on its day. The office is not told about ordinary jobs. |
| A13 | **Pechkas keeps what every finished job went for**, with no names or addresses, and shows the usual range once there are 10 jobs of that kind in 90 days. |
| A14 | **A new price at the door is a request.** It needs a reason and a photo. If she declines, she pays only the visit fee. |
| A15 | **The visit fee is Rs 300 to Rs 1,000**, the petrol for the trip. A flat Rs 300 until distance can be measured (D12). No commission on it (D13). |
| A16 | Replaced by A41 on 10 November 2026: she can now cancel free at the door too, until she gives him the start code. |

### Checking the work, and the guarantee

| # | Decision |
| --- | --- |
| A17 | **"Work finished" does not close a job.** It counts as done only when she taps **Yes, it works**, or after 24 hours with reminders. Only then do the commission and the guarantee start. |
| A18 | **"Not finished yet"** needs one of four reasons and may carry a photo. He can answer and fix it. **The second time, the office decides**: finished, visit fee only, or he goes back. |
| A19 | **The guarantee is 30 days on repairs and installations, 7 days on services** (cleaning, servicing, top-ups). The same on the website and in the app. |
| A20 | **A claim needs words and a photo or video** (no voice notes). He has **24 hours** to answer and must come back **within 48 hours**. |
| A21 | **If he ignores the claim, misses the visit, or refuses and the office rules against him**: his new offers stop, and another technician does the repair, paid by Pechkas. **He is charged no more than his own labour, and never for parts.** |
| A22 | **The replacement technician is paid first off what he owes Pechkas.** Anything left over, Pechkas owes him. |
| A23 | **A charge is final only after 7 days without an appeal**, or after the office keeps it on appeal. Cancelled on appeal means it is never added. Once added it is ordinary debt, and the Rs 3,000 limit applies. |
| A24 | **Raise the limit**: if nobody offers on a replacement, only the office can raise what Pechkas pays, up to 3× the first figure. The extra is Pechkas' cost. **The customer never pays for a guarantee repair.** |

### The visit fee (decided 9–10 November 2026)

| # | Decision |
| --- | --- |
| A36 | **A flat visit fee of Rs 300**, set by the office in Settings, fixed on a job when the customer chooses the technician. **He keeps all of it**; Pechkas takes no commission. No distance, GPS or petrol price. One fee for every trade and for Islamabad (D12.11, D12.12). |
| A37 | **Owed only after a real visit:** he gave the start code, looked, asked a new price with a reason and a photo, and she declined it. Never when the repair goes ahead, he did not arrive, it is a guarantee visit (Pechkas pays), or the office finds the failure was his. Some work done before the bigger fault is still Rs 300; real work is a smaller new price she approves (D12.1, D12.9). |
| A38 | **Shown before she chooses** (Post a job and above the offers) **and before he offers**, never only in the terms. The website says the same rule (D12.8). |
| A39 | **He says paid or not paid; she can disagree once within 24 hours, or say she paid.** While a fee is unpaid she cannot post a new job. The office decides every disagreement, with a reason, and may have Pechkas pay him an unpaid fee; she then settles with Pechkas before posting again. A fee waived after she paid goes back to her: from him, or from Pechkas and added to what he owes (D12.3, D12.4, D12.5). |
| A40 | **The office's "not finished" decision has two outcomes:** not his fault, visit fee owed; his fault, no fee. **A new price on a guarantee repair is answered by the office**, never the customer (D12.2, D12.7). |

### Cancellations, late arrivals and no-shows (decided 10 November 2026)

| # | Decision |
| --- | --- |
| A41 | **Cancelling is always free for the customer**, until she gives him the start code, **at the door too** ("I no longer need this service"). After the code, she calls the office, and the office can stop the job **without a visit fee**. **A cancellation never creates a visit fee**: D10 stays separate from D12. |
| A42 | **One category for each cancellation, worked out by the database on its own clock**, in this order, so none counts against both people: office; before anybody was chosen; potential no-show; technician late; **late** (at the door, within 2 hours of his window, or after an "On my way" tapped no more than 3 hours before it); normal. Cancellations from before these rules are kept as they were, marked "before the rules", and counted nowhere. |
| A43 | **She picks a reason** — I fixed the problem myself, Someone else fixed the problem, My plans changed, The technician is late, I found a better price, I no longer need the service, Other — and may add words. The office says whom it is cancelling for. |
| A44 | **A late arrival** is "Arrived" more than 30 minutes after his window starts, or her cancelling because he had not come by then. **A potential no-show** is no "Arrived" 30 minutes after his window ends: she, he and the office are told, and she may cancel free or keep waiting. It counts only once the office has confirmed it. |
| A45 | **Reviews, never penalties.** A customer with 3 late cancellations in 60 days, or a technician with 3 late arrivals or 1 confirmed no-show in 60 days, is put in front of the office. The old "5 cancellations" and "cancelled after he was chosen" flags are retired. Nothing suspends, blocks or charges anybody. He sees his record in My account and can dispute any of it; the office confirms or dismisses each with a note he reads. |
| A46 | **Only a potential no-show, or his dispute, reaches the office's phone at once**; other cancellations wait on the admin panel's Cancellations page. The website and the app's terms say the same rule, and the lawyer markers stay. |

### Nobody home (decided 11 November 2026)

| # | Decision |
| --- | --- |
| A47 | **A "nobody home" report protects the technician without blaming the customer.** It is an allegation, not a finding: submitted (awaiting review), disputed, then confirmed or rejected by the office. |
| A48 | **When he may ask:** after tapping Arrived, once his window has started, and 15 minutes after the later of the two. The customer is notified and has **10 minutes**; **"I'm coming" gives her 10 more**, once. Only then can he report it. *Revised 11 November 2026 (A53–A58): the proof is now his GPS location first, with a photo required only when the location check fails, plus the database's timestamps and the notifications sent. The earlier "No GPS" rule is replaced.* |
| A49 | **No money moves:** nothing is charged to the customer and nothing is paid to the technician. The job is cancelled, never stopped, so it can never create a visit fee (D12) or a debt. Every such visit is kept separately as an **uncompensated visit**, with the job's visit fee as a reference only, to decide later whether Pechkas should pay for them. |
| A50 | **What counts:** only **3 office-confirmed** "nobody home" reports in 60 days ask the office to review a customer; never one where the technician arrived more than 30 minutes after his window began. **3 "nobody home" reports by one technician** in 60 days ask the office to look into him, never a suspension. A **disputed** report counts against nobody until the office decides. |
| A51 | **"Guard refused entry"** is its own reason and label. He can ask as soon as his window has started (she can ring her guard). It counts against neither of them. |
| A52 | **The customer may say "I was home"** within 24 hours; it goes to the office. D34 sits beside D10 (its own cancellation label, never a late cancellation) and D12 (never a visit fee) without changing their rules. **Rescheduling is not part of it** (D34.7). |

### Arrival checked by location (decided 11 November 2026, revising D34)

| # | Decision |
| --- | --- |
| A53 | **GPS-first arrival verification**, built as **one shared location service** for all of Pechkas (D10, D11, D12, D34, later matching and maps), never one per feature. When he taps **I have arrived**, and again when he reports nobody home, his phone's position, accuracy and time are checked by the database against the customer's pin. **Verified** = within **100 m** with accuracy **50 m** or better, a fresh reading, not faked; all three are office settings, to be tuned after a street test in Islamabad. |
| A54 | **Event-based only:** no continuous or background tracking. **Exact coordinates are kept 90 days at most**, then erased automatically; the distance, accuracy, time and result stay. Deleted earlier with the job or account. Only the office sees coordinates. No paid map service. |
| A55 | **The customer is told "Technician arrival verified near your registered service address"** only when the check verified it, and never sees his coordinates. |
| A56 | **A tap is not an arrival.** `arrived_at` (the tap), `arrival_verified_at` (GPS) and the review status are kept apart. Only a verified arrival, the office's approval or the customer's start code satisfies it; an unverified tap does not stop D10's no-show watch and never becomes a confirmed no-show by itself. **3 unverified arrivals in 60 days** (not approved) ask the office to review him. A poor signal, a refused permission or a wrong pin is never misconduct by itself. |
| A57 | **Photographs:** optional when the location check verifies; **required** (taken with Pechkas' camera, never the gallery) when it fails; if the camera does not work, he says why and the report goes to the office as unverified. |
| A58 | **The office may approve an arrival or confirm a report even when GPS failed**, always with a reason, its name and the time, kept in a review record nobody can change. Only office-confirmed incidents count towards the customer's review. |

### Paying Pechkas by a date (decided 11 November 2026)
| | |
|---|---|
| A68 | **Each final debt is due 14 days after it is posted, with 3 days of grace; from 00:00 on day 18 his new offers stop while any of it is unpaid.** Days are Islamabad's. Jobs he has go on. No late fee, no interest, no suspension. No minimum amount. The Rs 3,000 limit stays a separate check: either can stop new offers. |
| A69 | **What falls due:** a job's commission (from when it is posted), a guarantee charge (posted only once final, after its appeal), and a visit-fee refund charged to him — which now has the same **7-day appeal** first: the office's "Pechkas paid her back; he must repay" only records it; it is posted, and its 14 days start, when he has not appealed by the date or the office keeps it on appeal; cancelled, Pechkas bears it. Nothing disputed or not final can fall due. Debts owed when D36 began start their 14 days that day; refunds charged under the old rule get the new appeal from that day first. |
| A70 | **Payments pay the oldest fees first**, recorded line by line ("this payment paid that fee"), lines only ever added. Money Pechkas owes him (guarantee-repair pay, a visit fee it covered) pays his fees **only while it has not been paid out to him**; money already sent to him never also clears a fee. A reversal in any order takes back exactly what it paid or was paid by, never brings a reversed fee back, never loses money or credits it twice. |
| A71 | **A waiting "I have paid" protects only the amount claimed**, oldest fees first, **until the office decides**, however long it takes. After 3 business days the payment needs attention and the office is told each business day. Rejected, the protection ends at once; confirmed, his offers come back at once if nothing else stops them. |
| A72 | **Business days are Monday to Friday minus the office's list of official public holidays**, typed from the government's notice, never guessed. A wrong list can never stop a technician's offers: it only decides when the office is reminded. |
| A73 | **Extra time only for fees whose offers have already stopped** (day 18 on), never while due or in grace: 3 to 14 days (7 offered), once per overdue spell, with a reason, who and when kept for good. The new end is the day it is given plus the days chosen; offers stop at the next midnight if still unpaid, **with no second grace**. |
| A74 | **Reminders, one combined message a day at most**: 3 days before a due date, on it, on the last grace day, and when offers stop. Amounts and job numbers only. |
| A75 | Commission rates and calculations are unchanged (10%, 7%). Edition 6 of the app shows the refund appeal; ask for the update only once it is in the stores. |

### Commission (decided 11 November 2026)
| | |
|---|---|
| A66 | **Pechkas takes 0% of a visit fee; the technician keeps all of it** — as already built under A36, so nothing about money changed. The admin **Visit fees** page now shows the totals: recorded, paid by customers, paid by Pechkas, not paid yet, waived (and any money to give back), kept by technicians, Pechkas' commission (Rs 0), and **what 10% of the fees customers really paid would have been**, by month. That last figure is for comparison only: it is never owed, never a ledger line and never touches anybody's balance. Each fee is counted once, where it stands today. |
| A67 | **The rule for every commission decision: Pechkas earns commission only on completed repair labour for which the customer has paid.** Visit fees, genuine parts (with a shop receipt), guarantee repairs funded by Pechkas, cancelled bookings, no-shows and unsuccessful visits never generate commission. "Completed and paid" means the job counts as done (her **Yes, it works**, the 24-hour clock, or the office): the app never sees the cash, which goes straight from her to him. |

### A technician who cannot come (decided 11 November 2026)
| | |
|---|---|
| A59 | **"I can't come"** is on his job until his arrival counts (verified, approved by the office, or the start code), with a reason he must choose and words he may add. **More than 2 hours before his window: a normal withdrawal; within 2 hours, or after it began: a late withdrawal**, on the database's clock. It is refused once the job is no longer his, so a customer's cancellation can never be turned into his withdrawal. |
| A60 | **The same job goes back, never a copy.** Her words, photos, voice note, address, pin and price stay; what belonged to his assignment (agreed price, the window from his offer, the visit fee fixed when she chose him, the start code, the arrival) is written to the job's history first, then cleared. If less than an hour is left before 8pm on its day (when a job nobody took closes), it moves to the next day and she is told. The technician who left is shut out of that job for good; technicians whose offers were turned down may offer again. Chat shows only the current technician's messages. |
| A61 | **"Find another technician"** is open to her whenever he has not arrived and she could still cancel. It is never her cancellation and costs nothing. More than 30 minutes late, or a possible no-show, is recorded as his lateness exactly as D10 would; switching within 2 hours of his time with no fault of his counts like a late cancellation for her, unless he had said he was running late. |
| A62 | **"I'm running late"**: he gives the time he will be there, at least 5 minutes away and at most 2 hours after his window ends, **twice per job at most**. She is told at once and may wait or find another technician, free either way. His window and every estimate stay on record, and arriving more than 30 minutes into his window is still a late arrival. |
| A63 | **The office may pause a technician's new offers for 1, 3 or 7 days**, with a reason he reads in the app. His waiting offers are withdrawn; jobs he has go on; it ends by itself or is lifted early with a reason; every line is kept and cannot be changed. **3 late withdrawals in 60 days** ask the office to review him. The ladder — **1 confirmed no-show: contact him; 2 in 60 days: consider a 1–3 day pause; 3: review his approval** — is shown as a suggestion and never applied by itself. No suspension or charge is automatic. |
| A64 | **No compensation, wallet, credit or discount at launch.** Service recovery instead: an apology, the job back in front of other technicians at once, and nothing to post again. |
| A65 | D11 shares D10's records without changing their rules: a late arrival, no-show or "nobody home" report is now **one per technician per job**, so a job that came back gives its next technician a record of his own. No money moves anywhere in D11. |

### A customer who does not pay the technician (decided 12 November 2026)
| | |
|---|---|
| A76 | **He reports within 7 days of the job counting as done**: Not paid, or Paid less with what he received. One report per job, only on jobs the customer pays for (never a visit fee or a repair Pechkas pays for). He may change the amount until she answers; after that only the office can, with a recorded reason. **No report in 7 days: the commission stays as posted.** |
| A77 | **His commission is held the moment he reports**: the posting is reversed in full, Pechkas' share and the guarantee reserve alike. A held commission counts towards **nothing**: not the Rs 3,000 limit, not the D36 due dates, no reminders, no stopped offers. |
| A78 | **She is asked neutrally** ("A question about payment for PK-1041"; the details only in the app) and answers once, within 3 days: **That's right** (she owes the rest) or **I have paid** (her words and an optional screenshot, to the office). **No answer in 3 days goes to the office, still held, and she is not blocked: silence is never agreement.** |
| A79 | **Commission only on the labour he actually received**: labour received = what she paid minus the job's recorded parts (never below nothing), commission at the job's own rate, rounded down; the reserve at the rate when he reported. Each release posts only the difference from what is already posted, so part-payments in any order end exactly where one posting would have (Rs 5,000 job, Rs 1,000 parts, Rs 3,000 paid: Rs 200, of it Rs 40 reserve and Rs 160 Pechkas). **Each release is a new commission fee with its own 14 days** (A68). |
| A80 | **She cannot post new jobs only once she agreed, or the office decided, that she owes**; never while she disputes it or has not answered. It lifts when he taps **I have now been paid in full**, the office records a payment, closes the case, or clears her with a reason. **Guarantee claims and replacement bookings are never blocked.** Her answer is recorded as what she said about the amount, not as legal consent to the block (D35.1). |
| A81 | **The office**, a reason every time, kept with who and when and never edited: she paid in full; she has paid Rs X in all; she owes the rest; close unpaid (commission only on what he received); correct his amount (up or down: what was released on the old figure is reversed and released again); let her post again. **"His report was false"** is a separate tick, only from an office finding, and a flag only. |
| A82 | **The guarantee is unchanged**: never cancelled, delayed or reduced by a payment case. While one is open, her claim goes to the office instead of to him, and a claim already with him moves too, with his answer clock stopped. The office sends another technician (Pechkas pays from the reserve, **no charge to him**), lets him handle it under the usual rules with a fresh 24 hours, or finds it not covered. **No automatic charge**: he is charged only if he refuses a claim handed back to him and the office finds it covered (A21), or the office establishes from its own evidence that his work was defective, and then through the usual 7-day appeal. A payment dispute alone is never evidence of poor work. |
| A83 | **Flags only**: 3 not-paid reports by one technician within the flag period (60 days now), 2 confirmed unpaid jobs for one customer, 1 report the office found false. No Pechkas compensation for an unpaid job at launch. |
| A84 | Commission rates are unchanged (10%, 7%). Edition 7 of the app shows the payment question; ask for the update only once it is in the stores. |

### A new technician's first jobs (decided 13 November 2026)
| | |
|---|---|
| A85 | **Approval is by the app's rule, trade by trade, enforced in the database at every door**: the feed, an offer, her choosing him, the office assigning by hand, and "ask for him again". Every change to a trade is kept. |
| A86 | **The person is approved by rule** once his number is checked by SMS, his face photo is in and he has passed the rules quiz. Nobody meets him. The office approves only somebody it turned down before who applied again. |
| A87 | **His photo** is shown to customers before they choose him; at her door she taps "Yes, this is the man in the photo" before the start code. A "no" gives the job back to others, pauses all his work and reaches the office as a written item. The photo locks with his first job; a change needs a reason and the owner's approval. |
| A88 | **Identity is a service plugged in later**: only its result and reference are kept, never a CNIC number or image. Until it is live he stays on first-job limits however many good jobs he does, and nothing says "identity checked". Technicians approved before D37 show "Identity seen by Pechkas staff on [date]" until the owner's deadline after the service goes live, then drop to first-job limits by rule. |
| A89 | **His first 3 jobs in a trade are his trial**: "New on Pechkas" on his offer, basic job types only, one job at a time, at or under the price limit. "Something else" opens only on approval. |
| A90 | **After each first job she answers four questions** (on time, explained the work, left it clean, it works). A job counts when all four are yes, the before and after photos are in, no guarantee claim stands, the commission on it is paid, and she is a real, separate customer (a number checked by SMS that is not his, a home at least the set distance from the others, not a customer already counted, an account older than his application or with other jobs). **Commission is taken on these jobs as on any other.** |
| A91 | **Three good jobs and verified identity approve the trade.** A covered guarantee claim on one of them within its guarantee puts the trade back on trial. |
| A92 | **Pauses by rule**: a safety report pauses the trade at once; two "It works: no", or two first jobs with a "no" on another question, pause it. Jobs he has go on. He appeals in writing and the office answers in writing; a safety report is decided by the office after his side. **A customer whose safety report or "It works: no" the office finds false gets a flag.** |
| A93 | **Risky job types**: AC gas top-up, installation, uninstallation, stabiliser fitting, dismantle and refit, PCB or electrical fault; Electrician DB or breaker fault, motor switch, new socket or light point, UPS or inverter connection, changeover switch, wiring fault tracing, rewiring; Plumber's three geyser types and both water motor types; Solar system check, full maintenance and inverter or wiring fault (both panel cleanings are basic); fridge or freezer repair; and "Something else" in those trades and in UPS. **UPS and inverter opens only to a technician with risky Electrician work open.** |
| A94 | **Risky work unlocks after a clean record and one checked job**: another approved technician the app picks comes too and checks against a list; Pechkas pays him a fee as a credit; if a man he passed has a covered claim or an upheld safety report on risky work within the set time, he gets a flag and is not picked again. **Where nobody can check, risky types are closed to customers** ("This kind of job is not available on Pechkas yet", with "Tell me when it is", counted per job type and sector for the office). The owner may arrange an outside assessor by email, once per trade. |
| A95 | **Technicians approved before D37** work as before until the owner sets the two record numbers, then are sorted by their own clean jobs: approved, risky work open, or starting as new. |
| A96 | **Quizzes are in Urdu**, with the English under each question and "Hear it" where the phone has an Urdu voice, drawn at random from a larger pool. **The safety quizzes stay off, and nothing public mentions a safety test, until a qualified person has checked them.** |
| A97 | **Gas cookers and gas ovens are not taken**: the oven job is "Microwave or electric oven repair", technicians decline them, and the office can close such a job with that reason. A technician working on a roof follows the roof line in his agreement. |
| A98 | Every number starts "not set". Commission rates are unchanged (10%, 7%). Edition 8 of the app has the screens; ask for the update only once it is in the stores. |

### Launch offers (decided and built 17 November 2026)
| | |
|---|---|
| A99 | **A launch rate that belongs to each technician, not the calendar.** 5% instead of 10% (and instead of 7% for a repeat customer) on his jobs in a trade **from his 3rd good job there; his 90 days start when that trade is approved**, and the 5% ends **no later than 12 months after his 3rd good job**, whatever happens (so a late identity service cannot stretch it). The rate is fixed when the customer chooses him. Only for technicians who apply before a cut-off date (D38.1); until that date is set the offer is off. **His first 3 jobs in each trade keep the full commission**: paying it shows whether he pays Pechkas. His screens show his rate and its end date before he makes an offer. At 5%, the guarantee reserve grows by only 1% of labour, so during the offer guarantee repairs will mostly be paid from Pechkas' own money; that is expected. |
| A100 | **A credit for bringing in another technician**: Rs 1,000 per newcomer, for at most 5 newcomers per technician. It is earned only once the newcomer's 3rd first job counts as good **and the 30-day "Not received" window has passed on the payments for all 3 of his qualifying jobs**; until then the referrer sees it as "Pending". After that it is kept even if a job later stops counting for another reason. The credit only lowers what he owes Pechkas, never paid in cash, and never counts as payment for the referrer's own first jobs. The "Tell a technician" message goes out on WhatsApp in English and Urdu; its wording is shown to the owner before it is built. |
| A101 | **No customer discount.** A64 stays. |

### First-job numbers and paying Pechkas (decided 18 November 2026)
| | |
|---|---|
| A102 | **The first-job numbers (D37.1)**, typed by the owner in Admin → Settings → First jobs: **500 m** between the homes of customers whose jobs count for one technician; quiz pass mark **80%**, retake after **3 days**; risky work after **5 clean jobs** in that trade over **at least 30 days**, with **no guarantee claim found against him in 60 days**, and another try **30 days** after a checked job that did not pass; checker's fee **Rs 1,000**, paid by Pechkas as a credit (watch whether checkers say yes at that fee); a checker has **60 minutes** to say yes before the app asks the next, and answers for the man he passed for **30 days**; technicians approved before D37 (only test accounts) stay approved at **3** clean jobs and keep risky work at **10** clean risky jobs; staff-seen identity stops counting **30 days** after the identity service goes live. The price limit is A104. |
| A104 | **The price limit on a new technician's first jobs is Rs 5,000 on his WORK, not on parts** (built 18 November 2026). On a first job his offer may say how much of his price is parts with a shop receipt; the limit is checked on the price less those parts, when he offers and again when she chooses. **A new price during a first job whose work is over the limit is not refused**: before he sends it he is told *"This price is above the limit for new technicians. If she agrees, the job goes ahead but won't count toward your 3 first jobs."*; her card says *"This is more than Pechkas allows new technicians. You can agree, or decline and pay only the visit fee."*; if she agrees the job goes on at the new price and does not count as a first job, and if she declines the usual visit-fee rule applies. **At the finish**, work is the final price less the parts on the receipt; over the limit, the job is finished and paid as normal and does not count. Each first job keeps the limit in force when it was given to him. This closes a gap: before, a new price during a first job was never checked against the limit. The terms and technician agreement say so, marked [DECIDE WITH A LAWYER]. |
| A103 | **Technicians pay Pechkas into a separate bank account with a Raast ID, used only for Pechkas (D15).** Raast is free from any bank, JazzCash or Easypaisa, and the statement is a clean record for checking "I have paid" (A5). It is in the owner's own name for now; a personal account that receives many small payments from strangers can draw the bank's questions, so **it moves to a business account in Pechkas' name once the business is registered (D2)**, and only the details in Admin → Money → Where technicians pay change. |

### The repeat rate and going online (decided 22 November 2026)
| | |
|---|---|
| A105 | **The 7% repeat rate looks back 12 months (D18).** It applies when the same customer and technician finished a job together in the 12 months before she chose him for this one, measured from the moment she chooses him, because that is when the rate is fixed: the 7% he sees before she chooses can never become 10% half-way through. On a job nobody has been chosen for yet, it is measured from now. Stopped and cancelled jobs never count. The 12 months is locked like the 10% and 7%, and the technician agreement states it. Built. |
| A106 | **"Online" stays the technician's own switch (D19).** Nothing switches it off automatically, as in inDrive. A technician who forgets to go offline may get job alerts at night; that is his to fix. If it annoys technicians after launch, it can be looked at again. |

### A faster Post a job, and how jobs reach technicians (decided 25 November 2026)
| | |
|---|---|
| A109 | **Post a job is three steps**: show us the problem, where, your price — one thing on each screen and one black button at the foot, replacing the one long page ("people don't like filling large forms"). The yellow top shows the job and Change, never its price; the price is on the price step only. Built. |
| A110 | **Every job is as soon as possible.** No day to pick, and no "Choose another day" when nobody offers: Pechkas is a fast service. Late at night, after the last two-hour window has started at 8pm, the job is for tomorrow morning. Built. |
| A111 | **Anywhere in Islamabad, nowhere else yet.** Bahria Town and DHA count as Islamabad wherever the pin is. A pin elsewhere is told "Pechkas works in Islamabad only, for now", with "Tell me when you come to Rawalpindi". Rawalpindi comes after Islamabad goes well. Built. |
| A112 | **The lowest price is 60% of the usual price**, rounded up to Rs 50, and never below the Rs 1,000 lowest offer. The office can change the 60% in Settings, between 30% and 100%. When nobody offers, she is asked to raise her price, as before. Built. |
| A113 | **Showing the problem stays required for every job**: a voice note, a photo, a video or a few words. Technicians price from what they see. Built. |
| A114 | **A technician needs location on to be online** (while the app is open; never in the background). He sees jobs near where he is, widening to all of Islamabad when nobody near offers; with no recent position, his home area. The search starts at 5 km and grows evenly to all of Islamabad in 8 minutes (the office can change both). Built (Part 2a). |
| A115 | **Offers show how far he is, worked out by Google Maps, not typed by him**, with his rating or New, years in the trade and jobs on Pechkas, on a map. After she chooses, his route and the minutes left, while his app is open. **Automatic choice** — "the first technician who accepts your price" — is offered, **off by default** — built (Part 2a), with her waiting screen (who has looked, the countdown). The Google minutes on offers and his route while on his way: built (Part 2b), working once the Google key is in Supabase. |
| A116 | **He counts as late 15 minutes after Google's time** at the moment she chose him. **Jobs run 7am to 10pm.** Built (Part 2c, 25 November 2026): a technician names no time in his offer; when she chooses him, the job shows the time he is due by — her choice plus his Google minutes, or 60 minutes when Google has none (D40) — and he is late 15 minutes after it. A job is for today until 9pm, then for the next morning from 7am; a job nobody took closes at 10pm. Jobs from older copies with a two-hour window keep the old rules. |
| A117 | **The screens exactly as the approved mocks** (the owner, 25 November 2026). Built: waiting is a full map with the technicians near her as dots and a sheet with the countdown, raising her price and the automatic choice; "Still looking?", "No offer yet", the cancel sheet with one-tap reasons; an offer drops in from the top; Choose a technician is short cards; on his way and at the door are a map with a sheet. **The owner chose to show online technicians near a waiting customer on her map** (rounded to about 100 m, no name, photo or number) and **Google's minutes on every job in a technician's list** (each a paid request after the free 10,000 a month; asked again only when he moves 300 m or every 10 minutes, five at most at a time). The privacy page, technician agreement and store answers say so. |
| A118 | **The welcome screen's words and ways in** (the owner, 25–26 November 2026). Every page has a two-line headline with the second line in colour and one short line under it: *Your price, your choice.* / *Verified technicians.* / *Pay when it's done.* The drawings sit at the same height on all three. **Continue with phone** is the one big button; under a thin "or continue with" line, **Google** and **Email** are two white cards (the email mark a plain dark-grey envelope, not Pechkas' colours). **"Verified" is the owner's word, and it is only true once the identity service (A119) is switched on**: switching it on is a step before the app goes to the public, and no update goes to store users before then. Built. |
| A119 | **The identity check is the strongest kind, and comes before a technician's first job** (the owner, 26 November 2026, deciding the kind of check in D37.2). An outside identity company checks his CNIC against NADRA's records and matches a live photo of his face to his card, on its own page opened from the app; it keeps the card picture, and Pechkas keeps only verified or failed, the date and the company's reference (A25, A88 unchanged). **Once the owner switches the service on, nobody takes any job until verified** (identity seen by staff before D37 still counts until its deadline). He may open the check three times a day, because each can cost Pechkas money. Built: the database rule, the server function that talks to the company, his screen and the legal pages. **Still open (D37.2): which company** — one with NADRA access, a written price and written data terms; then its one small connection is written. |
| A120 | **Drawn people in pictures, starting with the welcome pages** (the owner, 26 November 2026, after many rounds of drawn symbols that he found confusing). Each welcome picture acts out its headline: a customer holding her phone with her price on it; a technician in a Pechkas cap and shirt with his card, his toolbox and a verified tick; a customer paying beside the fixed AC. One style, taken from a reference app's principles but in Pechkas' own colours: black outline, white, Pechkas yellow, green for ticks, the yellow screw-head circle behind each person, cut out so it stands on the page's own colour. Never a photograph, never a real person. Made with Figma's image tool in the owner's Figma ("Pechkas welcome illustrations"). Built. |
| A121 | **Pictures of the work, plumbing first** (the owner, 26 November 2026: "most people here would understand it by pictures"). Each kind of work, group and job is shown as a picture of the thing or the problem as she sees it at home, in the welcome pictures' system (objects only, Pechkas colours on the yellow screw-head circle, cut out), with the name always written beside it. Made with Figma's image tool. Plumbing is built (nine pictures, 26 November) AC (twelve: its page, both groups and all nine jobs) electrician (sixteen: its page, three groups and all twelve jobs), UPS and inverter (its page; its one job is the electrician's) and solar (its page and all five jobs, on the page itself, as every trade without groups shows them), appliances and CCTV (each its page and all five jobs), and Wi-Fi, painting and computers (each its page and all its jobs; the Windows logo the image tool drew was removed: no other company's logo), and carpentry (its page, three groups and all eleven jobs), and plumbing's toilet, geyser, motor and drain jobs (every one of the 76 jobs then had its own), the same day; then home itself (its tiles and the job card on top); its very top has no picture (A122). Built for every trade. |
| A122 | **Home's yellow top has no picture** (the owner, 26 November 2026, after trying the Pechkas technician — a repeat of the welcome page — a house in the new style, three problems together, a cutaway house and the logo). The greeting, "What needs fixing?" on one big line and the search box, as professional apps do; the pictures in the work tiles carry the look. Built. |
| A123 | **3D pictures of the work, AC first** (the owner, 27 November 2026, after mocks of the sign-in screens, plumber and AC in a flat vector style and in 3D: "I like this one", with the yellow circle kept behind each picture as before). Soft 3D objects with real light and shadow on the bright yellow circle, objects only; a trade's page may open with a wide 3D picture filling its yellow top. Each picture is made on its own in Figma's image tool, moved onto the circle by `scripts/oncircle.py`, and kept as WebP. Built for AC (12 pictures and the top) and CCTV (27 November, 6 pictures and the top: "take time to make the pictures very realistic") and Wi-Fi and internet (27 November, 6 pictures and the top) and UPS and inverter (27 November, its picture, its one job and the top; that job is Electrician's too, so it is 3D there until Electrician is done, the owner's choice) and Solar (27 November, 6 pictures and the top) and Plumber (27 November, all 20 pictures and the top) and Painting (27 November, its 5 pictures and the top; a stain or an old faded wall is drawn on pale blue so it cuts out cleanly, and a boxy room or house gets a larger circle so it still shows) and Home appliances (27 November, its 7 pictures and the top; the gauge set's hoses are asked for in blue and red only, or a yellow hose comes with it); the other trades follow one by one, and the sign-in pictures in 3D wait for his word. |

### Trust and safety

| # | Decision |
| --- | --- |
| A25 | **No CNIC number or image is ever stored**, only that it was checked, when, by whom and how. *Reworded 17 November 2026:* a technician is approved by the app's rules, trade by trade (A85–A98), never by a check in person or a video call. Identity is checked only by an outside identity service once one is connected (A88); technicians approved before D37 keep the date Pechkas staff saw their identity, until the owner's deadline. |
| A26 | **Flags are only flags.** Nothing suspends, blocks or charges anybody automatically. A person looks first. |
| A27 | **A customer can block a technician** after a job. **He is never told.** |
| A28 | **Ratings stay hidden** until both sides have rated, or 48 hours pass. A technician shows "New" until he has 3 ratings. |
| A29 | **Before he is chosen**, a technician sees the customer's first name and sector only. The address and phone number come once he is chosen, and only while the job is on. |
| A30 | **Applying to be a technician is free**, and nobody may charge to join. |

### Accounts, language and contact

| # | Decision |
| --- | --- |
| A31 | **Sign in with a mobile number or an email code** (6 digits). Google sign-in on Android. Nothing opens before signing in. |
| A107 | **Sign-in codes go by SMS through Twilio** (D20, 22 November 2026), connected in Supabase's own phone settings: the app is unchanged. Only Pakistan is allowed in Twilio, SMS pumping protection is on, codes last 5 minutes, and Supabase limits how many are sent an hour. **WhatsApp comes later**, through the same Twilio account, once the business is registered (D2) and Meta approves Pechkas' WhatsApp sender and code template: then WhatsApp becomes the first choice, with "Send by SMS instead". Numbers already checked by SMS stay checked. Not ready until a real code has arrived on Jazz, Zong, Telenor and Ufone. |
| A108 | **Email sign-in stays, sent through Resend** (D21, 22 November 2026) from `no-reply@pechkas.net`, connected as Supabase's own email sender: the app is unchanged. It is the way in for family abroad (only Pakistani mobile numbers sign in by phone), for somebody whose SMS does not arrive, and on iPhone until there is more than phone and email there. Resend's free plan: 100 emails a day, 3,000 a month. The email is `supabase/email/sign-in-code.html`, in Pechkas' colours. Not ready until a real code has arrived at an address outside the Supabase team. |
| A32 | **One account, two modes** (customer and technician), like inDrive. |
| A33 | **The app is in English only.** The website is English too, keeping the Roman-Urdu brand lines. Customers may still send a voice note in Urdu. |
| A34 | **Pechkas has no email address.** Everything is on WhatsApp. |
| A35 | **Working hours are 7am to 10pm, every day.** |

---

## Not decisions — setup jobs

Steps for each are in `docs/OWNER.md`:

- Connect the SMS company (D20) and Resend (D21).
- Upload `google-services.json` to Expo, so phones get notifications.
- Open the separate bank account with a Raast ID and type it in Admin →
  Money → Where technicians pay (D15, A103).
- Type the first-job numbers in Admin → Settings → First jobs (A102).
- Set your own phone as the office's alert phone (Admin → Jobs → Alerts on
  your phone).
- Put the app in the Play Store's closed test, then ask for "please update"
  only once edition 4 is in the store.
