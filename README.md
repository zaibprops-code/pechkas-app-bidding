# Pechkas app

An open-bidding app for home repairs in Islamabad. A customer shows what is
broken and names a price; technicians Pechkas has met in person accept or
counter; the customer chooses. Android and iOS, plus a web admin panel.

- **Owner's guide** — trying it on a phone, running database changes:
  [`docs/OWNER.md`](docs/OWNER.md)
- **Rules for anyone changing the code:** [`CLAUDE.md`](CLAUDE.md)

```
apps/mobile/      the phone app (Expo, React Native)
apps/admin/       the owner's web panel (Vite, React)
packages/shared/  money and wording both apps must agree on
supabase/         migrations, and tests that try to break in
scripts/          draws the icons from the Pechkas mark
```

```bash
npm install
npm run check
```
