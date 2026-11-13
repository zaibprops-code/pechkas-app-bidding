# Google Play: the App content forms

**Play Console → Policy and programs → App content.** Each section below is
one form there, with the answer to every question and why. They are written
to match exactly what the app does, which is also what
https://pechkas.net/app/privacy says. If the app starts collecting something
new, these answers, that page and the app change together.

`[REVIEW WITH A LAWYER BEFORE PUBLISHING]` — the Data safety answers are a
legal declaration. They are drafted carefully, but have them read before
the app goes to production.

---

## Privacy policy

`https://pechkas.net/app/privacy`

## Ads

**Does your app contain ads?** No.

## App access

**All or some functionality is restricted** → add the instructions in
[`review-notes.md`](review-notes.md).

## Content rating

See [Content rating](#content-rating) below.

## Target audience and content

- **Target age groups:** 18 and over only.
- **Could the store listing unintentionally appeal to children?** No.

## News app

No.

## Government app

No.

## Financial features

**My app doesn't provide any financial features.** The app takes no
payments, lends nothing and holds nobody's money. (Technicians see what they
owe Pechkas in fees; they pay it outside the app.)

## Health

No health features.

---

## Data safety

### Overview

| Question | Answer |
| --- | --- |
| Does your app collect or share any of the required user data types? | **Yes** |
| Is all of the user data collected by your app encrypted in transit? | **Yes** — everything goes over HTTPS |
| Which account creation methods does your app support? | **Username and other authentication** → phone number or email with a one-time code; and **OAuth** → Google ("Continue with Google", Android) |
| Do you provide a way for users to request that their data is deleted? | **Yes** |
| Delete account URL | `https://pechkas.net/app/delete-account` |

### Shared?

For every type below, **Shared: No.** Google does not count as "sharing":
data handled for us by service providers (Supabase, Twilio, Resend, Expo,
Google Firebase, and Google for "Continue with Google"), and data a user deliberately sends to another user — a customer's
address going to the technician she chose is exactly that. Nothing is sold
and nobody receives anything for their own use.

### Collected — type by type

For each: **Collected: Yes · Shared: No · Processed ephemerally: No.**

| Data type | Required or optional | Purposes | What it is in the app |
| --- | --- | --- | --- |
| **Location → Precise location** | Required | App functionality, Fraud prevention, security and compliance | The map pin on the house, which every job a customer posts needs; where the phone was when the emergency button was pressed; for technicians, where the phone was when they tapped I have arrived or reported nobody home, to check they reached the address (exact positions erased after 90 days). Only while the app is open, never in the background. Saved addresses stay on the phone and are not collected. |
| **Personal info → Name** | Required | App functionality, Account management, Fraud prevention, security and compliance | First name; a technician's full name. |
| **Personal info → Email address** | Optional | App functionality, Account management | Only for somebody who signs in with an email code, or continues with Google, instead of a mobile number. |
| **Personal info → User IDs** | Optional | Account management | Only for somebody who continues with Google: the number Google gives their Google account, so the same Google account always opens the same Pechkas account. |
| **Personal info → Phone number** | Required | App functionality, Account management, Fraud prevention, security and compliance | Sign-in, and passed to the other side once a technician is chosen. |
| **Personal info → Address** | Required | App functionality | Where the job is: sector, street, house, landmark, gate note. If a customer says Pechkas does not serve her sector yet: that sector and the kind of work. |
| **Personal info → Other info** | Required (technicians) | App functionality, Account management | A technician's trades, years in the trade, sectors; his quiz results; for each trade whether he is on first jobs, approved or paused and why; and, once an identity-checking service is in use, its result and reference (or, for technicians approved before 13 November 2026, the date Pechkas staff saw his identity). Never a CNIC number. For somebody who continues with Google, also the link to their Google profile picture, which Google sends and the app never shows. |
| **Financial info → Other financial info** | Required (technicians) | App functionality, Account management, Fraud prevention, security and compliance | What a technician owes Pechkas in fees and what he has paid, with the payment reference, and the payment screenshot he sends with **I have paid** (seen by the office only). If he says a customer did not pay him in full: what he says he received, the commission held and charged on it, and what the office decided. |
| **Messages → Other in-app messages** | Optional | App functionality | The chat between a customer and her chosen technician. |
| **Photos and videos → Photos** | Optional (customers), required (technicians, to start and finish a job, and his own face photo) | App functionality, Fraud prevention, security and compliance | A technician's photo of his face, shown to customers who receive his offer and checked by the customer at her door; what is wrong; before and after photos; receipts for parts; a technician's screenshot of a payment to Pechkas; a customer's photo with "not finished yet"; photos of a fault under guarantee and of its repair; photos with an appeal; the photo with a new price, kept as the reason for any visit fee; a technician's photo of the gate or door when he could not get in; a customer's screenshot of a payment to the technician, if she says she paid him (seen by the office only). |
| **Photos and videos → Videos** | Optional | App functionality | A short video of what is wrong, or of a fault under guarantee; a technician's short "Show it working" video at the finish. |
| **Audio → Voice or sound recordings** | Optional | App functionality | The voice note describing the problem. |
| **App activity → Other user-generated content** | Optional | App functionality, Fraud prevention, security and compliance | Star ratings and their words; problem reports; "not finished yet" reasons and notes and the technician's one-line reply; guarantee claims with their words, the technician's answer and any appeal; a customer's disagreement with a visit fee and her words, and whether the technician says he was paid it; the reason a customer chose for cancelling and any words she added; a technician's reply to a late arrival or no-show recorded about him; the time a technician says he will arrive when running late, and the reason he chose (and any words) when he could not come; who had a job before it went to another technician; the office's reason for pausing a technician's offers; the office's reason for giving a technician more time to pay; a technician's appeal against a visit fee refund charge; a technician's report that he could not get in, its photo and note, and a customer's reply that she was home; a technician's report that a customer did not pay him in full, her answer and the words she wrote, and the office's decision and note; which technician a customer asked for again; a technician a customer blocked, and her reason if she gave one; a customer's answers to three questions on a technician's first jobs and whether she confirmed his photo at her door; safety reports, the technician's side and the office's decision; a technician's appeal against a pause and the office's answer; a checker's findings on another technician's first risky job; a technician's request to change his photo, with his reason; the kind of job and sector a customer asked to be told about. |
| **Device or other IDs** | Optional | App functionality | The notification code for the phone, only if the person allows notifications. |

**Fraud prevention** is the office's flags (phase 7): patterns across jobs,
such as many jobs cancelled after a technician was chosen. A person reads
them; nothing is decided automatically, and nobody's account changes
without the office doing it by hand.

**Prices of finished jobs** are also kept as a separate record: the kind of
job, the sector, the day and the prices — no name, number, address, account
or technician. It is not linked to anybody, so it is not a data type to tick
here; the privacy policy describes it, and that it stays after an account is
deleted. Customers and technicians see ranges from it only once a kind of
job has 10 finished jobs. One of the office's flags reads it too: a
technician whose price for the work is often well above the range.

### Not collected

Approximate location (the app only ever takes the precise pin of the house,
and the phone's position only when the person taps to use it), user IDs from other services, race, religion,
political or sexual information, payment card or bank details, credit score,
health, contacts, calendar, files and documents, web history, installed
apps, search history, app interactions and in-app search (there is no
analytics), crash logs and diagnostics (there is no crash reporting).

> If crash reporting or analytics are ever added, these answers change
> first.

---

## Content rating

**Play Console → App content → Content rating → Start questionnaire.**

| Question | Answer |
| --- | --- |
| Email for the rating certificate | `[THE NEW STORE EMAIL]` |
| Category | **All other app types** (not a game) |
| Violence, fear, sexuality, language, controlled substances, crude humour | **No** to every one |
| Gambling or simulated gambling | **No** |
| Does the app allow users to interact or exchange content with each other? | **Yes** — the chat between a customer and her chosen technician, and photos of the job |
| Does the app share the user's current physical location with other users? | **Yes** — a customer's map pin on the house, which the chosen technician sees |
| Does the app allow purchases of digital goods? | **No** |
| Is the app a web browser or search engine? | **No** |

Expected result: suitable for everyone, with the notes **Users Interact** and
**Shares Location**. That is accurate; do not answer differently to get a
"cleaner" rating.
