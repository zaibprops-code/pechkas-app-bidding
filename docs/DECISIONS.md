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

_Last updated: 11 November 2026 (D12, D10 and D34 built). The same list as a map you can tap through:
https://claude.ai/artifact/YBZXKEJ1QUo39BNK4k8Ha4 (private to your account)._

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

#### D15. Where technicians pay Pechkas
- **The question:** Which account technicians send their commission to:
  your JazzCash number, an Easypaisa account or a bank account, with the
  account name.
- **Today:** Empty, so the app tells them to ask the office.
- **Where to put it:** Admin → Money → Where technicians pay.
- **Who decides:** You.

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

#### D18. How long the repeat fee looks back
- **The question:** The fee is 7% instead of 10% when the same customer
  and technician have done a job together before. Should that count any
  earlier job, however long ago, or only the last 12 months?
- **Today:** Any earlier finished job, forever.
- **Who decides:** You.

#### D19. Technicians who forget to go offline
- **The question:** Should "Online" switch itself off after some hours?
- **Today:** It stays on until he switches it off. The harm is small,
  because nobody is sent anywhere unless a customer chooses him.
- **Who decides:** You.

### Before launch: signing in (you, then setup steps)

#### D20. Who sends the sign-in codes by SMS
- **The question:** Which SMS company sends the codes (Twilio, or a
  Pakistani SMS company), or should codes go by WhatsApp? Each has a cost
  per message.
- **Today:** Only the test numbers you add in Supabase can sign in.
- **Who decides:** You. Then follow the setup steps in OWNER.md.

#### D21. Email codes
- **The question:** Keep sign-in by email? If yes, it needs Resend
  connected. Without it, real customers never receive their code.
- **Who decides:** You. Then follow the setup steps in OWNER.md.

#### D22. iPhone sign-in
- **The question:** Before the iPhone version, build "Sign in with Apple"?
  Apple requires it next to Google's button. The other choice is to keep
  iPhone users on phone and email only.
- **Today:** The Google button shows on Android only.
- **Who decides:** You.

### Before launch: the website (you, or you check)

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
  | His late arrivals (more than 30 minutes) | 3 |
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

#### D37. The trial job for a new technician
- **The question:** Approval needs a trial job.
  - Where does it happen: a real customer's job with you there, or a test
    job you set up?
  - Is he paid for it, and who pays for any parts?
- **Today:** The admin panel records "Trial job watched". How the trial
  job is run is not written down anywhere.
- **Who decides:** You.

#### D38. Launch offers
- **The question:** Do you want anything to win the first technicians and
  customers? For example no commission for a technician's first month or
  first few jobs, or a reward for referring a friend.
- **Today:** None. The app shows no discounts, and the 10% and 7% are
  written into the technician agreement, so an offer would change that
  page too.
- **Who decides:** You. A lawyer reads the agreement's wording.

---

## Part 2 — Already decided

What the app and the website do today. Reopen any item by its number.

### Money

| # | Decision |
| --- | --- |
| A1 | **Commission is 10% of the labour only**: the agreed price minus parts with a shop receipt, rounded down so odd paisa stay with the technician. |
| A2 | **7% instead of 10%** when the same customer and technician have done a job together before (how far back: D18). |
| A3 | **Credit limit Rs 3,000.** Once a technician owes more, his new offers stop until he pays. He is told once. |
| A4 | **Pechkas holds nobody's money** in version 1. The customer pays the technician directly (cash, JazzCash, Easypaisa). There is no wallet and no escrow. A wallet would need a lawyer first. |
| A5 | **Technicians pay Pechkas through "Pay Pechkas"** with a screenshot. Nothing counts until the office presses Confirm. Cash given in person is recorded by hand. |
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

### Trust and safety

| # | Decision |
| --- | --- |
| A25 | **No CNIC number or image is ever stored**, only that it was checked, when and by whom. A technician is approved after three checks: identity in person or by video call, a trial job, and the rules. |
| A26 | **Flags are only flags.** Nothing suspends, blocks or charges anybody automatically. A person looks first. |
| A27 | **A customer can block a technician** after a job. **He is never told.** |
| A28 | **Ratings stay hidden** until both sides have rated, or 48 hours pass. A technician shows "New" until he has 3 ratings. |
| A29 | **Before he is chosen**, a technician sees the customer's first name and sector only. The address and phone number come once he is chosen, and only while the job is on. |
| A30 | **Applying to be a technician is free**, and nobody may charge to join. |

### Accounts, language and contact

| # | Decision |
| --- | --- |
| A31 | **Sign in with a mobile number or an email code** (6 digits). Google sign-in on Android. Nothing opens before signing in. |
| A32 | **One account, two modes** (customer and technician), like inDrive. |
| A33 | **The app is in English only.** The website is English too, keeping the Roman-Urdu brand lines. Customers may still send a voice note in Urdu. |
| A34 | **Pechkas has no email address.** Everything is on WhatsApp. |
| A35 | **Working hours are 7am to 10pm, every day.** |

---

## Not decisions — setup jobs

Steps for each are in `docs/OWNER.md`:

- Connect the SMS company (D20) and Resend (D21).
- Upload `google-services.json` to Expo, so phones get notifications.
- Type the account technicians pay into (D15).
- Set your own phone as the office's alert phone (Admin → Jobs → Alerts on
  your phone).
- Put the app in the Play Store's closed test, then ask for "please update"
  only once edition 4 is in the store.
