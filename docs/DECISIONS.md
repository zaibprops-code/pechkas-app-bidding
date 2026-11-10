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

_Last updated: 10 November 2026 (D12 built). The same list as a map you can tap through:
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

#### D10. Cancelling after the technician has set off
- **The question:** Should a customer who cancels after he is on his way, or
  after he arrives, pay the visit fee?
- **Today:** She can cancel free until he arrives. After that the app tells
  her to call the office. The website's cancellation policy is still
  `[CANCELLATION POLICY]` on /guarantee and /terms, and must end up saying
  the same as the app.
- **Options:**
  - (a) Free until he arrives, as now.
  - (b) The visit fee once he has set off.
  - (c) The visit fee only once he has arrived.
- **Who decides:** You.
- **Follow-up questions:** D10.1 before he sets off (free today); D10.2 after
  "On my way" (free today, counts towards the cancellation flag); D10.3
  after he arrives (only the office or a declined new price today); D10.4
  the website's blank cancellation policy. Kept separate from the visit fee,
  as you asked on 9 November.

#### D11. A chosen technician who never comes
- **The question:** What happens to a technician who is chosen and does not
  turn up?
- **Today:** She can cancel free and post again. Jobs cancelled after he
  was chosen count towards a flag (3 in 60 days), and the office decides
  what to do. Nothing happens to him automatically.
- **Options:**
  - (a) Keep it as a flag only.
  - (b) Also stop his offers for a while.
  - (c) Also charge him something.
- **Who decides:** You. Option (c) is you + lawyer.

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

#### D13. Commission on a visit fee
- **The question:** Should Pechkas take 10% of a visit fee?
- **Today:** No commission on a visit fee. It is petrol, not work.
- **Who decides:** You (confirm, or change).

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
  | Cancelled after he was chosen | 3 |
  | Wrong start codes on his jobs | 5 |
  | 1–2 star ratings | 3 |
  | Problems reported about somebody | 2 |
  | Jobs for one customer | 4 |
  | A customer's cancellations | 5 |
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

#### D34. Nobody home when the technician arrives
- **The question:** He arrives in his window and nobody opens the door, or
  the customer does not answer. Does she owe the visit fee? How long must
  he wait, and how many times must he call first?
- **Today:** No rule and no button. He can ring her or the office. The
  office can call the job off by hand, and nothing is charged.
- **Options:**
  - (a) The office decides each case.
  - (b) After he has waited and called, he taps "Nobody home" with a photo
    of the gate, and she owes the visit fee.
  - (c) No charge, only a flag.
- **Linked to:** D10 (cancelling) and D12 (the visit fee).
- **Who decides:** You.
- **Follow-up questions:** D34.1 how long he waits (suggestion: 15 minutes
  from the start of his window); D34.2 how many calls, recorded by the app;
  D34.3 proof (a photo of the gate in the app); D34.4 fee or no fee (kept
  separate from the visit fee, as you asked; suggestion: the office decides
  each case for launch); D34.5 she says she was home (to the office).

#### D35. A customer who does not pay the technician
- **The question:** The job is done, but she refuses to pay him or pays
  less. His 10% commission is still added to what he owes. What happens to
  the commission, and to her?
- **Today:** No rule. He can report a problem, and the office can undo the
  commission by hand in Money.
- **Options:**
  - (a) The office decides each case.
  - (b) He gets a "Not paid" button, which holds the commission until the
    office has looked.
  - Separately: is she stopped from posting new jobs until it is settled?
- **Linked to:** D1 (who her agreement is with decides who can chase the
  money).
- **Who decides:** You. Chasing the money is you + lawyer.

#### D36. A due date for paying Pechkas
- **The question:** Must a technician pay what he owes by a set day (weekly
  or monthly), or only when he goes over Rs 3,000?
- **Today:** Only the Rs 3,000 limit. A man owing Rs 2,900 can owe it for
  ever.
- **Options:**
  - (a) The limit only, as now.
  - (b) A weekly pay day with a reminder.
  - (c) A monthly pay day.
- **Linked to:** A3 (the credit limit), D15 (where he pays).
- **Who decides:** You.

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
| A16 | She can **cancel free until he arrives**; after that she calls the office (D10). |

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
