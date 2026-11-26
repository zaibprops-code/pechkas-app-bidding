# Design ideas from a reference app (proposal, not decided)

_Started 26 November 2026, from screenshots the owner shared of another
Pakistani service app. Nothing here is decided or built. When the owner
approves an idea it moves into `docs/DESIGN.md` (and the design skill), and
the screens change with it. We take the **principles**, never that app's
colours, drawings, shapes or words: Pechkas keeps its own look._

## What makes that app look professional

Everything comes from **one system**, used on every screen:

1. **One illustration style.** Black line drawings, white fill, one brand
   colour. No 3D, no gloss, no mixed styles anywhere in the app.
2. **One signature shape.** The same bold brand-colour shape sits behind
   every drawing, on the welcome pages, the service cards and even the
   side menu. You recognise the app from the shape alone.
3. **People from here.** A woman in a dupatta, a man in kameez, a worker in
   uniform, drawn simply. People see themselves in it.
4. **The picture acts out the headline.** "Safe and Verified" shows a
   customer holding a phone with a tick; "You're in Control" shows the
   customers. Words and picture never say different things.
5. **Pictures show the work being done**, not a symbol of it.
6. **Two-tone headlines.** One key word in the brand colour ("Complete
   **onboarding**", "Safe and **Verified**", "You're in **Control**").
7. **A faint pattern of the trade's tools** behind the screens (brushes,
   buckets, sprays), barely visible, so even empty space feels on-brand.
8. **The same card everywhere.** One corner radius, one fill, an icon on a
   rounded square tile, a title, one line of explanation, a chevron.
9. **Choosing looks the same everywhere.** A selected card gets a
   brand-colour outline and a ticked box (or a filled radio circle on the
   right); an unselected one is plain.
10. **Small capital step labels** above a title ("STEP 1 OF 2"), letter-spaced,
    in the brand colour.
11. **Real payment logos** (Cash, Easypaisa, JazzCash) where payment is
    named, so it is recognised at a glance.
12. **A menu with personality:** the logo, "Hey, name", plain icon rows with
    chevrons, the signature shape as decoration, a friendly invite button
    with its reward, and the mode switch as the one big button.

## What Pechkas already does the same way

- Two-tone headlines on the welcome pages (A118).
- The same card and row on every screen (`Panel`, `RowCard`, `DuoRow`), each
  with a two-tone icon on a soft yellow tile.
- Legal is a list of cards with a one-line description, then a reader.
- One plain menu list with chevrons, and the mode switch as the one big
  button at its foot.
- One accent colour (yellow), with green for trust and ticks.

## Proposed rules for Pechkas (for the owner to approve one by one)

**P1. One illustration system for the whole app.** Black outline, white
fill, **Pechkas yellow** as the one colour, green only for ticks and
"verified". The welcome pages, Home's kinds of work, the empty states and
the sign-in pictures all drawn this way. _(The app's drawings on Home and
the sign-in screens already use this outline style; the welcome pages would
join them.)_

**P2. A Pechkas signature shape behind every drawing:** the yellow screw
head from the logo (a yellow disc with its slot), used the way that app
uses its blue shape. Our own sign, never theirs.

**P3. People in drawings — needs the owner's decision.** Today's rule is
"objects, never people, never a face". This style needs simple drawn
people: a customer (a woman in a dupatta or a man in kameez) and a
technician in a Pechkas shirt with his toolbox. Never a photo, never a real
person, simple faces only.

**P4. Every picture acts out its own headline.** If the words and the
picture could say different things, change one of them.

**P5. A faint pattern of repair tools** (screwdrivers, spanners, screws,
pliers) at very low strength on the coloured tops (yellow customer, green
technician), never behind text that must be read, never moving.

**P6. Choosing looks the same everywhere:** a selected card gets an ink (or
green) outline and a ticked box; this already exists in places and would be
made the rule.

**P7. Step labels** in small letter-spaced capitals above a title wherever
there are steps (Post a job's "1 of 3", the technician's application).

**P8. Payment logos** for Easypaisa and JazzCash where the app names them
(the "Pay when it's done" welcome page, the receipt, Pay Pechkas) — only
once Pechkas has checked each company's rules for using its logo.

## What we do NOT take

- **The dark theme.** Pechkas is light on both sides, like inDrive (the
  owner's decision); a dark theme would be a new decision.
- **Asking for CNIC number, date of birth or gender** on the technician's
  form. Pechkas never collects these (A25, D37): identity is checked by the
  identity company.
- **A language switch** (English only, the owner's decision) or **a theme
  switch**.
- **"Default payment"** in Settings: Pechkas takes no payments in the app
  (version 1 holds nobody's money), so there is nothing to choose.
- **Star ratings shown before they are real.** A new technician shows
  "New", never 5.0.
- Their colours, their angular blue shape, their drawings, their words.

## Next

1. The owner shares the rest of the reference screenshots; anything new is
   added above.
2. Mocks of the three welcome pages in the Pechkas version of this system
   (P1, P2, P4, and P3 if the owner says yes to people).
3. The owner approves rules one by one; each approved one moves into
   `docs/DESIGN.md` and the screens follow.
