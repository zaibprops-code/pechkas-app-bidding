# Pechkas app — the owner's guide

Plain steps for everything you do yourself: trying the app on your phone,
running database changes, and where every account and setting lives.

---

## Where things stand

**Phase 1 — sign-in and technicians.** People sign in with their mobile
number and a code. A technician applies (no CNIC is ever asked for); you see
his application in the admin panel, record that you checked his identity,
watched a trial job and explained the rules, and approve him. His phone then
says he is approved. Posting jobs is still "Being built".

| Phase | What | State |
| --- | --- | --- |
| 0 | Foundations: the app opens, the database is locked down | Done |
| 1 | Sign-in, technician applications, you approve them | **Built — needs the setup below, then your test** |
| 2 | Customers post jobs with voice notes, video and a price | |
| 3 | Bidding: technicians accept or counter, customer chooses | |
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
| App identifier | `net.pechkas.app` — permanent |

**Still open:**
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

## Run a database change (a "migration")

Each change is a file in `supabase/migrations/`, run **once**, **in order**,
oldest first. Running one twice does no harm.

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
| The approved design | https://claude.ai/artifact/42Sb6DBfcN9pP1kLnvBqBr |
| The full plan | `APP_BUILD_PROMPT.md` in `zaibprops-code/Pechkas` |
| Android keystore backup | Your private storage. **Never** GitHub, never a chat. |

## Things that must never happen

- A password, key or keystore pasted into a chat or committed to GitHub.
- Anything typed into the Supabase dashboard that is not also a migration
  file here — the next person setting this up would not have it.
- A CNIC number stored anywhere. Only the date you checked it.
