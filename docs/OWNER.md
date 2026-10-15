# Pechkas app — the owner's guide

Plain steps for everything you do yourself: trying the app on your phone,
running database changes, and where every account and setting lives.

---

## Where things stand

**Phase 0 — foundations.** The app opens on the Pechkas home screen. Every
button leads to a "Being built" page for now. Nothing is connected to the
database yet.

| Phase | What | State |
| --- | --- | --- |
| 0 | Foundations: the app opens, the database is locked down | **Done — waiting for your test** |
| 1 | Sign-in, technician applications, you approve them | Next |
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

**Still open:** launch sectors (where your first technicians live), English
and Roman Urdu wording (you check every Roman Urdu line), WhatsApp or SMS for
sign-in codes.

---

## Try the app on your phone

1. Go to **expo.dev** → your project **pechkas-app-bidding** → **Builds** →
   **Build from GitHub** (or the "Build" button).
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
| `20261015000000_foundations.sql` | Locks the database so the public key reaches nothing; stores your settings | **Now** |

---

## Where everything lives

| What | Where |
| --- | --- |
| The code | GitHub: `zaibprops-code/pechkas-app-bidding` |
| Builds and the signing key | expo.dev → pechkas-app-bidding → Builds / Credentials |
| The database | supabase.com → pechkas-app-bidding |
| The approved design | https://claude.ai/artifact/42Sb6DBfcN9pP1kLnvBqBr |
| The full plan | `APP_BUILD_PROMPT.md` in `zaibprops-code/Pechkas` |
| Android keystore backup | Your private storage. **Never** GitHub, never a chat. |

## Things that must never happen

- A password, key or keystore pasted into a chat or committed to GitHub.
- Anything typed into the Supabase dashboard that is not also a migration
  file here — the next person setting this up would not have it.
- A CNIC number stored anywhere. Only the date you checked it.
