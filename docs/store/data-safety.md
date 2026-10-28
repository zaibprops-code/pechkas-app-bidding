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
| **Location → Precise location** | Required | App functionality | The map pin on the house, which every job a customer posts needs; where the phone was when the emergency button was pressed. Only while the app is open, never in the background. Saved addresses stay on the phone and are not collected. |
| **Personal info → Name** | Required | App functionality, Account management, Fraud prevention, security and compliance | First name; a technician's full name. |
| **Personal info → Email address** | Optional | App functionality, Account management | Only for somebody who signs in with an email code, or continues with Google, instead of a mobile number. |
| **Personal info → User IDs** | Optional | Account management | Only for somebody who continues with Google: the number Google gives their Google account, so the same Google account always opens the same Pechkas account. |
| **Personal info → Phone number** | Required | App functionality, Account management, Fraud prevention, security and compliance | Sign-in, and passed to the other side once a technician is chosen. |
| **Personal info → Address** | Required | App functionality | Where the job is: sector, street, house, landmark, gate note. If a customer says Pechkas does not serve her sector yet: that sector and the kind of work. |
| **Personal info → Other info** | Required (technicians) | App functionality, Account management | A technician's trades, years in the trade, sectors, and that his identity was checked. Never a CNIC number. For somebody who continues with Google, also the link to their Google profile picture, which Google sends and the app never shows. |
| **Financial info → Other financial info** | Required (technicians) | App functionality, Account management, Fraud prevention, security and compliance | What a technician owes Pechkas in fees and what he has paid, with the payment reference. |
| **Messages → Other in-app messages** | Optional | App functionality | The chat between a customer and her chosen technician. |
| **Photos and videos → Photos** | Optional (customers), required (technicians, to start and finish a job) | App functionality | What is wrong; before and after photos; receipts for parts. |
| **Photos and videos → Videos** | Optional | App functionality | A short video of what is wrong. |
| **Audio → Voice or sound recordings** | Optional | App functionality | The voice note describing the problem. |
| **App activity → Other user-generated content** | Optional | App functionality, Fraud prevention, security and compliance | Star ratings and their words; problem reports and guarantee claims; which technician a customer asked for again; a technician a customer blocked, and her reason if she gave one. |
| **Device or other IDs** | Optional | App functionality | The notification code for the phone, only if the person allows notifications. |

**Fraud prevention** is the office's flags (phase 7): patterns across jobs,
such as many jobs cancelled after a technician was chosen. A person reads
them; nothing is decided automatically, and nobody's account changes
without the office doing it by hand.

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
