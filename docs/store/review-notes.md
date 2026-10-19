# Google Play: how the reviewers get in

Google's reviewers must be able to sign in. Sign-in is a phone number and a
code, and they have no Pakistani SIM, so they use **test numbers** — numbers
Supabase accepts with a fixed code and never sends an SMS to.

**The numbers and codes never go in this repository or a chat.** You make
them in Supabase and type them only into Play Console.

## 1. Make two reviewer numbers in Supabase

**Supabase → Authentication → Sign In / Providers → Phone → Test phone
numbers and OTPs.** Add two lines, each a number that is not anybody's real
phone and a six-digit code only you know:

```
92300[SEVEN DIGITS]=[SIX-DIGIT CODE]     ← the reviewer's customer
92300[SEVEN DIGITS]=[SIX-DIGIT CODE]     ← the reviewer's technician
```

Save. These keep working after Twilio is connected.

## 2. Make the reviewer's technician approved

1. On your phone, sign out of the app and sign in with the **technician**
   reviewer number. Choose **I fix things** and fill in the form (name
   "Play Reviewer", trade **AC**, sector **F-11**).
2. **Admin panel → Technicians → Waiting:** record the three checks with the
   note "Google Play review account — not a real technician", and approve.
   That note is the truth, and it stays on the record.
3. Sign out of the app again.

Do the same sign-in once with the **customer** number and choose **I need
something fixed**, so the reviewer starts on a finished account.

## 3. Paste this into Play Console

**Play Console → App content → App access → All or some functionality is
restricted → Add instructions.** Name: `Reviewer accounts`.
Username: the number, written as `0300 …`. Password: the code.

Add the two numbers as two sets of credentials, and put this in **Any
other information required to access your app**:

```
Pechkas connects people in Islamabad who need a home repair with technicians Pechkas has checked. The app opens on a sign-in screen: tap "Continue with mobile number". Sign-in is a mobile number and a one-time code; the two numbers above are test numbers that accept the code given, with no SMS.

To try the customer side: sign in with the first number. Tap a trade (e.g. AC), choose a job, write a few words, choose sector F-11, add any street and house, choose "Now", and post. Jobs can only be posted in sectors F-11, E-11 and G-13.

To try the technician side: on a second device, sign in with the second number. You land on the technician's screen. Tap "Offline" to go online; the customer's job appears. Press "Accept" to accept the price. On the customer's device, choose the technician in "My jobs".

The app takes no payments: customers pay technicians in cash. Account deletion is in "Me" → "Delete my account", and at https://pechkas.net/app/delete-account.
```
