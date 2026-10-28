# Pechkas design rules

These are the rules every screen of the Pechkas app, and the office panel, follows. They were
worked out screen by screen with the owner, from inDrive's layout and the
pechkas.net colours, and every screen in the app now follows them. Follow them
for any new screen or change, and change this file when a rule changes.

This file has a twin: `.claude/skills/pechkas-design/SKILL.md`, the same
rules as a Claude skill. `npm run check` fails if the two differ, so
change both together (copy this file's text under the skill's header).

## 1. The feeling

- **Laid out like inDrive** (the owner's reference): a light grey screen,
  white rounded cards on it, big bold titles, one yellow thing to tap.
  No tab bar: the ☰ menu on the left of the top.
- **Professional, not decorated.** The owner turned down truck-art and
  ajrak. The app is Pakistani in how it works (voice notes in Urdu, the
  guard at the gate, parts with a shop receipt), never in ornament.
- **Formal English** on every screen. Roman-Urdu phrases read as
  unofficial and were removed.
- **The same pieces everywhere.** A new screen is built from the
  components in section 6, never from new one-off styles. If the
  pieces cannot do it, add a piece and use it everywhere it fits.

## 2. Colours (`packages/shared/src/tokens.ts`)

Always use the names, never a hex code typed in a screen. The colours and the
card shadow live in `packages/shared/src/tokens.ts`; the app reads them
through `apps/mobile/src/theme.ts` and the admin panel as CSS variables
(section 12).

| Name | Use it for |
| --- | --- |
| `colour.canvas` | The screen behind everything (light grey). |
| `colour.white` | Every card. |
| `colour.green` | Trust and "this is you / this is us": the person card in the menu and Settings, the office card in Help, a technician's initial, a done step, "notifications are on", the green call to action. **At most one big green card per screen.** |
| `colour.yellow` | Action and money: the main button, a count, an arrow disc. **Never as text on a light background** (it cannot be read). |
| `colour.softYellow` | The tile behind a two-tone icon; a money card ("Your price", "Pay Bilal in cash", a new price to approve); the current row in the menu. |
| `colour.cream` | Behind a drawing: trade tiles, media tiles (Voice, Video, Photo), the two "How will you use Pechkas?" cards. |
| `colour.brick` | Warnings, danger and emergencies **only**: Emergency, Delete my account, a refusal, the emergency numbers. |
| `colour.softBrick` | The tile behind the one row that cannot be undone. |
| `colour.greenSoft` | Small "good" chips: Done, On, a tick. |
| `colour.ink` / `inkSoft` / `steel` | Text: titles / body / quieter lines. |
| `colour.rule` | The thin line between rows. |

Every text and background pair is at least 4.5:1.

## 3. Type (`font` in `theme.ts`)

Plus Jakarta Sans for everything people read. Never write a family name in
a screen; use the token.

| What | Font | Size |
| --- | --- | --- |
| Screen title (the `Hero`) | `font.display` | as `Hero` draws it |
| Section heading on a screen ("Offers", "Earlier", "Common questions") | `font.display` | 19 |
| Card title (a `Panel`) | `font.display` | 18 |
| Row label | `font.bodySemi` | 15.5 |
| Row value / hint under it | `font.body` | 13, `steel` |
| Body text | `font.body` | 14–15 |
| Big money figure | `font.display` | 20–40 |
| Codes, job numbers | `font.mono` | — |
| The word "Pechkas" beside the logo, only | `font.brand` | — |

## 4. Shape, space and touch

- Cards: radius **24**, padding **16**, the one shadow `shadow.card`.
  Things inside a card (a tile, a grey box): radius 16–22.
- Buttons and chips are pills. Primary button: yellow, full width, an
  arrow after the words when it moves you on.
- Screen side margin 12–20; space between cards 14.
- **Every tap target is at least 44 × 44** (`TAP`). List rows are at least
  60–68 high.
- Cards never have borders, only the shadow. Rows inside a card are split
  by a `colour.rule` line, never by gaps.

## 5. Icons and pictures

- **Two-tone icons (`DuoIcon.tsx`)** for anything that names a section, a
  row or a tile: ink outline, yellow fill on the part that matters, on a
  `softYellow` tile 40–56 square. Their shapes are data in
  `packages/shared/src/duo-icons.ts`, drawn by the app's `DuoIcon` and the
  admin panel's `Duo`; add a new one there, in the same 24-unit grid and
  style, and both get it.
- **Line icons (`Icon.tsx`)** only inside buttons, chevrons, ticks and small
  status discs.
- **Drawings (`Art.tsx`)** for trades: objects, never people, over a yellow
  sweep, on a `cream` tile. `artFor(trade)` picks one.
- No emoji. No stock photographs of strangers.
- The logo is `Mark` (`src/components/Mark.tsx`); its shapes come from the
  website and nobody draws it by hand.

## 6. The building blocks

| Piece | File | Use it for |
| --- | --- | --- |
| `Screen` + `hero` | `components/ui.tsx` | Every ordinary screen: a round back or ☰ button, a big title, an optional line under it. It also handles Android's bars and the slide-in. |
| `MenuButton` | `components/Menu.tsx` | The ☰ at the top of a screen you arrive at from the menu. |
| `Panel` | `components/Panel.tsx` | A white card headed by a two-tone icon, a title and a hint. `tone="money"` makes it soft yellow. Without a title it is a plain white card. |
| `RowCard` + `DuoRow` | `components/Rows.tsx` | Settings-style lists: icon tile, label, value under it, chevron. `danger` for the one row that cannot be undone. |
| `Action` | `components/Panel.tsx` | A row of square buttons (Call / Chat / Family / Report). |
| `Button` | `components/ui.tsx` | `yellow` (main), `green`, `outline`, `soft`, `danger`, `ink`. |
| `Field`, `Chip` | `components/ui.tsx` | Text boxes and choices. |
| `TradeTile`, `Steps` | `customer/bits.tsx` | A trade's drawing on cream; the four steps of a visit. |
| `EmergencyTiles` | `components/EmergencyTiles.tsx` | The four emergency numbers, two by two. |
| `Notice` / `MessageCard` | `components/ui.tsx`, `Toast.tsx` | Every message (error, warning, success, info). |
| `Trouble` | `components/Trouble.tsx` | No internet, not answering, crash, missing page, update, paused. |
| `ScrewSpinner` | `components/ScrewSpinner.tsx` | Anything working. There is no other spinner. |
| `Sheet` | `components/Sheet.tsx` | A choice that slides up from the bottom. |

A green call-to-action card (home's "What needs fixing & for how much?",
My jobs' "Post a new job") is: green card, white title, one line, a yellow
disc with an arrow on the right.

## 7. How screens are laid out

- **Top: who or what this is.** A person card, a status card, or the
  search. Then the content, then the rare and the dangerous at the foot
  (cancel, block, delete, sign out), where nobody taps them by mistake.
- **No group headings in menus and settings lists.** The owner asked for a
  better design, not categories. Separate cards are enough.
  A **section heading** is used only where the content changes kind
  ("Happening now" / "Earlier", "Offers" / "Your job", "Common questions").
- **One yellow main action per screen**, plus at most one yellow pill per
  card when there is something to do there ("Choose a technician",
  "Answer the new price").
- **Say what is happening in words read from the data**: the job's own
  status, step and counts. Nothing estimated, no "usually replies in".
- **Long things open one at a time** (Help's questions), so a page never
  becomes a wall of words.
- **Documents are a list, then a reader** (the owner's reference app):
  `app/legal/index.tsx` lists every legal page as one white card — icon
  tile, the page's own title and one-line summary (never typed in the
  screen), a chevron — and each opens in `app/legal/[doc].tsx`, with its
  section headings in green and **Last updated** pinned at the foot. When
  more than one legal page is open, a round × beside the title closes them
  all at once.
- **An address is a pin first**, the way ride apps take one: a map box
  with one bubble ("Set the address on the map", or "Use my location"
  without the map key) and the Pechkas pin, and no boxes until the pin is
  down. Then what was read from the pin, said as such ("Sector F‑11 · read
  from the map", with Change), and only what a pin cannot know: the house
  or flat number. Saved places are one link that opens a sheet.
- **Empty is a card, not a blank**: an icon on a soft tile, one line, and
  the button that fills it.
- A screen whose first load fails shows `Trouble` under its own header;
  once something is on screen, a failed refresh is only the top banner.

## 8. Movement

- **Only `transform` moves.** Never ease a colour: halfway through, text
  and background can be the same grey.
- Things snap (switch colours, a chevron turning). Sheets and banners
  slide by transform. The screw turns its slot only, clockwise, resting on
  whole turns.
- With "remove animations" on, everything stands still.

## 9. Words on screens

- Formal English. Short sentences. Say which button.
- **The app never mentions the website** (the owner's decision). A guide
  price is "the usual Pechkas price" or "Usual price", never "website
  price"; nothing on a screen sends people to pechkas.net or says what it
  says. Only the legal pages may name the website, where the law needs it.
- **Never invent** a price, rating, count or statistic. A new technician is
  "New". Unknown values are a visible `[PLACEHOLDER]`.
- A number that can change or is still undecided (credit limit, visit fee,
  guarantee length) is never written into a screen's text: point to the
  screen that shows the real figure.
- Safety advice and emergency numbers are never reworded for the look.
- Nothing says "coming soon", and no button does nothing.

## 10. Small phones (check 320 and 412 wide)

Every screen is checked at **412** and **320** wide before it ships.

- **Nothing important beside a long name.** A price or label in a column on
  the right squeezed "Something else, or not sure" into "Somethin / g else".
  Put it under the name instead, or move it under the title below 360.
- Long button labels drop the price or a word below 360
  ("Choose Bilal" instead of "Choose Bilal · Rs 4,500").
- Two side-by-side buttons stack below 360.
- Never break inside a code: sectors and job numbers use a non-breaking
  hyphen (`F‑11`, `PK‑1001`, `'‑'`), phone numbers a non-breaking
  space. An email address stays on one line, shortened in the middle.
- Grids keep two columns and shrink their gaps rather than cutting a word.
- Nothing scrolls sideways.

## 11. Android's bars

The app is drawn edge to edge. Every scrolling screen draws `SystemBars`
and ends with `insets.bottom` of room (`useScrollEnd()`); `Screen` does
both. A fixed top bar (chat, the technician's bar) covers the clock itself.

## 12. The office panel (`apps/admin`)

The admin panel is a website for the office, and it follows the same rules
in a browser's terms, so the office and the phones look like one business.

- **The same colours, fonts and icons, from the same files.** `look.ts`
  turns `packages/shared/src/tokens.ts` into CSS variables (`--green`,
  `--soft-yellow`, `--shadow-card` …) and loads the app's own font files
  (Plus Jakarta Sans, Bricolage for the word "Pechkas", IBM Plex Mono for
  codes); `Duo.tsx` draws the shared two-tone icons. **`admin.css` never
  types a colour** — `npm run design:check` fails if a hex code appears in
  it.
- **The menu is the app's menu**: on the left, the Pechkas mark, the
  person on a green card, then one plain list of rows (two-tone icon on a
  soft tile, the words, a chevron, the current one on soft yellow) and
  Sign out at the foot. On a phone (under 900 px wide) it is a drawer
  behind a round ☰ button, and while closed it cannot be reached with Tab.
- **Each section opens with its icon and its title** (`Head` in
  `Duo.tsx`), the same icon as its row in the menu.
- **White cards, radius 24, the one shadow, no borders**; boxes inside a
  card are grey or soft and rounded. Buttons are pills; filters are chips,
  the chosen one green. Sign-in is one white card in the middle.
- **Nothing scrolls sideways on a phone.** Cards and form boxes are
  `minmax(0, 1fr)` grids and fields may shrink, because a long name in a
  drop-down once pushed a whole job card past the edge. Wide tables scroll
  inside their own box (`.scroll`).
- Checked at **1280** and **390** wide.

## 13. Before a screen is finished

1. Built from the pieces in section 6, colours and fonts by name.
2. Looked at in the browser at 412 and 320 wide: no cut word, no sideways
   scroll, nothing behind the bars, every tap target 44.
3. `npm run check`, and `npx expo export` for Android and iOS.
4. `CLAUDE.md` and `docs/OWNER.md` say what changed, in plain words.
