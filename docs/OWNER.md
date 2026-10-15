# Pechkas app — the owner's guide

Plain steps for everything you do yourself: trying the app on your phone,
running database changes, and where every account and setting lives.

---

## Where things stand

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

Nothing arrives as a notification yet: the screens ask again every 10–15
seconds while they are open. Notifications need a Firebase account and come
next (phase 3b).

| Phase | What | State |
| --- | --- | --- |
| 0 | Foundations: the app opens, the database is locked down | Done |
| 1 | Sign-in, technician applications, you approve them | Done |
| 2 | Customers post jobs with voice notes, video, photos and a price | Done |
| 3 | Bidding: technicians accept or counter, customer chooses | **Built — run the migration, rebuild, test** |
| 3b | Notifications: a new job buzzes the technician, a new offer buzzes the customer | Next — needs a Firebase account |
| 4 | Doing the job: on the way, gate code, price changes | |
| 5 | Money and trust: commission, ratings, Help, guarantee | |
| 6 | Play Store and App Store | |

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
| App identifier | `net.pechkas.app` — permanent |

**Still open:**
- **The lowest offer (Rs 1,000), the highest counter (2×) and the live
  sectors** above.
- **Online stays on until he switches it off.** A technician who forgets
  will still see jobs and can still offer — nobody is sent anywhere without
  the customer choosing him, so the harm is small. Say if you want it to
  switch off by itself after some hours.
- **A technician who was not chosen** simply sees the job disappear from his
  list. Say if you want him told "the customer chose someone else".
- **Price guidance.** Within 20% of the website price the app says "Fair";
  below that "Low"; above "Generous". Say if you want different words or
  limits.
- **The Roman Urdu on the technician screens.** Read every line on your phone
  and send corrections. The words are all in `apps/mobile/src/words.ts`.
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

1. Install the new build. **Me** → **Sign in** → your test number → the code.
2. Choose **I fix things**, fill in the form, send it.
3. Open the admin panel, sign in with your email, find yourself under
   **Waiting**, record the three checks, press **Approve**.
4. On the phone, pull the technician screen down to refresh: it should say
   **Mubarak ho, aap approve ho gaye**.
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
3. **On the phone:** tap **AC** on the home screen → sign in → choose a job,
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
   dark work screen. Tap **Offline** — it turns yellow and says **Online**.
4. **The customer phone:** sign in with the other number, tap **AC**, choose
   **Gas top-up**, sector **F-11**, any street and house, **As soon as
   possible**, and press **Post job**.
5. **The technician phone:** within 15 seconds the job appears, showing the
   sector and the customer's first name but **no address**. Press **+** twice
   to ask Rs 200 more, choose **30 min**, and send it.
6. **The customer phone:** within 10 seconds **My jobs** shows the offer with
   "His price" under it. Press **Choose …** and then **Yes**.
7. **The technician phone:** the job moves to **Mere kaam** with the full
   address, the customer's number, **Call karein** and **Naqsha kholein**
   (the map).
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
| `20261018000000_bidding.sql` | Going online, offers, the customer choosing, the address reaching only the chosen technician | Fourth — **run it for phase 3** |

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
| Customers' voice notes, videos and photos | Supabase → Storage → `job-media` (private; opened from the admin panel) |
| The approved design | https://claude.ai/artifact/42Sb6DBfcN9pP1kLnvBqBr |
| The full plan | `APP_BUILD_PROMPT.md` in `zaibprops-code/Pechkas` |
| Android keystore backup | Your private storage. **Never** GitHub, never a chat. |

## Things that must never happen

- A password, key or keystore pasted into a chat or committed to GitHub.
- Anything typed into the Supabase dashboard that is not also a migration
  file here — the next person setting this up would not have it.
- A CNIC number stored anywhere. Only the date you checked it.
