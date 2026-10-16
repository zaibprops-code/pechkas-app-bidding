# App Store (iPhone): everything App Store Connect asks for

**appstoreconnect.apple.com → Apps → Pechkas.** Each heading below is a page
or box there. Every sentence is true of the app today and claims no numbers —
no ratings, jobs or customers until they are real. Anything in
`[SQUARE BRACKETS]` is yours to fill in.

The answers match https://pechkas.net/app/privacy and the Google Play answers
in [`data-safety.md`](data-safety.md). If the app starts collecting something
new, all of them change together.

`[REVIEW WITH A LAWYER BEFORE PUBLISHING]` — the App Privacy answers are a
legal declaration, like Google's Data safety form.

---

## App Information

| Box | What to put |
| --- | --- |
| Name (30 at most) | `Pechkas: Home Repairs` |
| Subtitle (30 at most) | `Checked technicians, Islamabad` |
| Primary category | **Lifestyle** |
| Secondary category | **Utilities** |
| Content rights | **No**, the app does not contain, show or access third-party content |
| Age rating | see [Age rating](#age-rating) |

## Pricing and Availability

- **Price:** Free (USD 0).
- **Availability:** **Pakistan only.** Untick every other country. Pechkas
  works only in Islamabad, and selling only in Pakistan also means the EU's
  trader rules do not apply.

## App Privacy

**Privacy Policy URL:** `https://pechkas.net/app/privacy`

**Do you or your third-party partners collect data from this app?** Yes.

For **every** data type below, Apple asks three things. The answers are the
same each time:

- **Purposes:** **App Functionality** only. (Apple counts preventing fraud as
  App Functionality, so the office's flags need no other purpose.)
- **Linked to the user's identity?** **Yes** — everything belongs to an
  account.
- **Used for tracking?** **No.** Nothing is used for advertising or shared with
  data brokers, and the app shows no adverts.

| Apple's category → type | Why the app has it |
| --- | --- |
| Contact Info → **Name** | First name; a technician's full name |
| Contact Info → **Email Address** | Only for somebody who signs in with an email code instead of a mobile number |
| Contact Info → **Phone Number** | Sign-in, and given to the other side once a technician is chosen |
| Contact Info → **Physical Address** | Where the job is: sector, street, house, landmark, gate note; a sector a customer says Pechkas does not serve yet |
| Location → **Precise Location** | The map pin a customer may add; where the phone was when the emergency button was pressed. Only while the app is open |
| Financial Info → **Other Financial Info** | What a technician owes Pechkas in fees and what he paid |
| User Content → **Photos or Videos** | What is wrong; before and after photos; receipts for parts |
| User Content → **Audio Data** | The voice note describing the problem |
| User Content → **Emails or Text Messages** | The chat between a customer and her chosen technician |
| User Content → **Other User Content** | Star ratings and their words; problem reports and guarantee claims; which technician a customer asked for again; a technician a customer blocked, and her reason if given |
| Identifiers → **User ID** | The account's own ID inside Pechkas |
| Identifiers → **Device ID** | The notification address of the phone, only if notifications are allowed |
| Other Data → **Other Data Types** | A technician's trades, years in the trade, sectors, and the record that Pechkas checked his identity (never a CNIC number) |

**Not collected:** health, payment cards or bank details,
contacts, browsing or search history, purchases, coarse location, product
interaction or other usage data (there is no analytics), crash data,
performance data, advertising data, sensitive info.

> If crash reporting or analytics are ever added, change these answers first.

## Age rating

**App Information → Age Rating → Edit.** Answer for what is in the app:

| Question | Answer |
| --- | --- |
| Violence, sexual content, nudity, profanity, horror, drugs, alcohol, tobacco, gambling, contests, mature themes | **None** to every one |
| Medical or treatment information | **None** |
| Unrestricted web access | **No** — links open the phone's own browser, WhatsApp or the phone dialler |
| User-generated content | **Yes** — the chat, photos, and the words with a rating |
| Messaging and chat | **Yes** — between a customer and the technician she chose, only while a job is on |
| Advertising | **No** |
| Parental controls / age assurance | **No** |

The app is for adults: the policy says 18 and over. Whatever rating Apple
works out from these answers, accept it — never answer differently to get a
younger rating.

## Version 1.0 page

### Screenshots

**iPhone 6.9" Display:** upload, in this order,
`docs/store/screenshots-iphone/1-home.png` … `6-technician.png`
(1320 × 2868). Apple uses them for the smaller iPhones too. They are the
real app with test accounts (Ayesha, Bilal and Asad are test accounts).

The app is iPhone only (`supportsTablet: false`), so no iPad screenshots are
needed.

### Promotional text (170 at most)

```
Something broken at home in Islamabad? Say what is wrong, name your price, and choose a technician Pechkas has checked. The price changes only if you say yes.
```

### Description (4,000 at most)

The same as the Google Play full description in
[`listing.md`](listing.md). Copy it from there unchanged.

### Keywords (100 at most, commas, no spaces after them)

```
electrician,plumber,AC repair,technician,Islamabad,home repair,handyman,CCTV,UPS,mistri,plumbing
```

### URLs

| Box | What to put |
| --- | --- |
| Support URL | `https://pechkas.net/contact` |
| Marketing URL | `https://pechkas.net` |

### Copyright

```
2026 [YOUR FULL NAME AS ON THE APPLE ACCOUNT]
```

An individual account sells under your own name, so the copyright is in
your name too.

### App Review Information

**Sign-in required:** ticked. Apple's form has room for one account, so
put the **customer** reviewer number in the boxes and the technician one in
the notes:

| Box | What to put |
| --- | --- |
| User name | the customer reviewer number, written `0300 …` |
| Password | its six-digit code |
| Contact first and last name | your name |
| Contact phone | `+92 335 8855076` |
| Contact email | the store email you created for Google Play |

Use the **same two reviewer numbers** you made for Google
([`review-notes.md`](review-notes.md)); they are already set up in Supabase,
one as an approved technician. The numbers and codes go only into Supabase
and these boxes.

**Notes:**

```
Pechkas connects people in Islamabad who need a home repair with technicians Pechkas has checked. Sign-in is a mobile number and a one-time code. The number in the sign-in boxes is a test number that accepts the code given, with no SMS.

A second test account, an approved technician: [TECHNICIAN REVIEWER NUMBER], code [ITS CODE].

Customer: sign in with the first number, tap a trade (e.g. AC), choose a job, write a few words, choose sector F-11, add any street and house, choose "Now", and post. Jobs can only be posted in sectors F-11, E-11 and G-13.

Technician: on a second device, sign in with the second number. The technician's screen is in Roman Urdu; tap "English" at the top right for English. Tap "Offline" to go online; the customer's job appears. Press "Qubool" to accept the price. Back on the customer's device, choose the technician in "My jobs".

The app sells no digital goods and takes no payments: it arranges repairs done in person at the customer's home, paid for in cash to the technician (guideline 3.1.3(e)).

Account deletion: "Me" → "Delete my account", and https://pechkas.net/app/delete-account.

The emergency button shows Pakistani emergency numbers and alerts the Pechkas office. It is only available while a job is on.
```

> Typing the technician's number and code into Apple's notes box is the
> same as typing them into the sign-in boxes: Apple keeps them private.
> They still never go into this repository or a chat.
