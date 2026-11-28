# 3D pictures of the work, trade by trade (A123)

How the pictures of the work are made, shown to the owner, built into the app
and published. Any session can pick this up from here. The rules for how the
pictures look are in `docs/DESIGN.md` ("3D pictures, trade by trade"); the
decision is A123 in `docs/DECISIONS.md`.

## Where it stands (28 November 2026)

| Trade | State |
| --- | --- |
| Every trade: AC, CCTV, Wi-Fi, UPS, Solar, Plumber, Painting, Home appliances, Computers, Carpentry, Electrician | Built: 3D pictures and a 3D top of the page (Electrician last, 27 November 2026) |
| A127's two plumbing jobs, two AC problems and three Solar jobs | Built 28 November 2026: water tank installation (a new tank on its stand with new pipes and a valve), low water pressure (a shower giving a trickle, a gauge with a blank face; the tiles cut with `--circle 1.06`), AC not cooling (the indoor unit, gauges with blank faces and a probe thermometer) and noisy or shaking AC (the outdoor unit opened, its rubber mounting pads); solar inverter (on a wall square, `--circle 1.06`), solar battery and solar producing less power (dusty panels, a loose connector, a meter) |
| A126's fourteen new jobs and **Sofa and carpet cleaning** | Built 28 November 2026: pipe repair, new pipe line, electric geyser; AC chemical wash, window AC; ceiling fan repair, earthing, new breaker board; UPS battery; clothes dryer; kitchen cabinet; sofa, carpet and mattress cleaning, the trade's own picture and its page top. The mattress (white) was made on the pale blue backdrop; the new pipe line, breaker board and cabinet were cut with `--circle 1.06` |
| A125's eight new jobs and **Water tank** | Built 28 November 2026: water purifier filters, silicone sealing, bathroom accessories (Plumber); TV wall mounting and its "TV" group (Electrician); mirror or picture hanging, mosquito mesh (Carpentry); water dispenser (Home appliances); Water tank's own picture, its cleaning job and its page top. The four flat, boxy ones (mirror, TV, mesh, bathroom tiles) were cut with `--circle 1.06`, the mesh at 0.96; at 1.22 the circle ran off the source and showed flat sides |

No flat picture of the work is left. A new trade or job follows the same
steps below before it ships. The sign-in pictures in 3D wait for the
owner's word (A123).

## The order of work for each trade

1. **Make the pictures** (below), cut them onto the circle, check them.
2. **Mock**: put them in a copy of the app, take "now" and "new" screenshots
   at 390 and 320 wide, put them side by side, undo the copy, send the two
   pictures to the owner and ask "Shall I build <trade>?". Build only after
   he says yes (he may say "build" before seeing the mock: that is a yes).
3. **Build**: put them in properly, update the docs, `npm run check`, commit,
   push to `main`.
4. **Publish**: the demo, the gallery and the decision map; the briefing PDF.
5. **Tell him** in plain words what changed, with the three links.

## 1. Making the pictures

Figma's image tool (`generate_image`), model `gpt-image-2.5-flare`, in any
Figma design file. Figma's AI credits run out (they come back at 00:00 UTC);
if they do, stop and say so. **Never switch to another image model**: it
would not match the other pictures.

Which pictures a trade needs: in `packages/shared/src/work.ts`,
`JOB_PICTURES[<trade>]` (one per job), `ART_PICTURES[<trade>]` (the trade's
own picture) and, for a trade with groups, `ART_PICTURES[<group art>]` for
each group in `WORK_GROUPS` (Electrician: fans, switches, power; Carpentry:
door, cupboard, shelf). Plus one wide picture for the top of its page.

**Square pictures** (1024 x 1024), one object or a small group:

> A photorealistic 3D product render, square. Background: a smooth soft pale
> yellow (#FFF1C7) seamless studio backdrop, completely plain, no floor line,
> no text. Centred, filling about 70% of the square: **<what it shows>**.
> Style: photorealistic studio product photography rendered in 3D, like an
> Apple or Dyson product shot — accurate proportions, real materials, soft key
> light from the upper left, gentle soft contact shadow, crisp edges, sharp
> focus, high detail. No people, no hands, no text, no letters, no numbers, no
> logos, no brand names. Nothing yellow on the objects.

**The wide top** (2048 x 1260):

> A photorealistic 3D product render for the top of a home-repair app screen.
> Background: a smooth warm golden yellow (#FFC53D) seamless studio backdrop
> with a soft lighter glow, completely plain, no floor line, no text. The LEFT
> HALF of the picture is completely empty yellow, and there is a wide band of
> empty yellow along the right edge and the top edge too: every object sits
> fully inside the frame, well away from every edge. A compact tidy group
> placed between about 50% and 85% of the way across, upper middle:
> **<what it shows>**. Style: (as above). No people, no hands, no text, no
> letters, no numbers, no logos, no brand names. Nothing yellow on the objects.

What it shows: the thing or the problem as she sees it at home, with one or
two tools; dark teal green (#0B5148) for tool handles; Pakistani where a place
shows (round-pin sockets, a twin-tub washing machine, a flat-roofed Islamabad
house). Ask for blank gauge faces and no display digits. Look at every result:
remake it if it has text, numbers, a logo, something yellow on the object, or
the object touches the edge.

**Home appliances' last two pictures** (built; kept as examples, square;
without "no yellow hose" the gauge set came with one, three times out of three):

- `app-fridge`: a white two-door refrigerator with the freezer on top,
  slightly turned, its lower door open showing clean glass shelves and a
  little frost on the back wall inside; standing beside it on the floor a
  refrigeration technician's manifold gauge set with one blue and one red
  gauge (blank faces, no numbers) and coiled hoses in blue and red only, no
  yellow hose, and a small dark teal
  green (#0B5148) toolbox. (Also: no food.)
- `app-microwave`: a stainless steel and black microwave oven, slightly
  turned, with its outer metal cover lifted off and set beside it, showing
  the inside parts — the magnetron, the transformer and wiring — and its glass
  door slightly open with the turntable plate inside; in front a screwdriver
  with a dark teal green (#0B5148) handle. (Also: no food, no display digits.)

### Cutting them onto the circle

Download each full-size PNG (the result's `image.url`) into a new empty folder
outside the repository, named as the picture (`app-fridge.png`). Then:

```bash
python3 scripts/oncircle.py <out> <folder>/app-fridge.png <folder>/app-microwave.png
python3 scripts/oncircle.py <out> --circle 1.3 <folder>/paint-house.png   # a boxy object
python3 scripts/retop.py <folder>/app-top.png <out>/app-top.jpg 0.86 0.47 0.47
```

- **Check every cut picture on bright pink** (paste it over a plain #FF00FF
  image with Pillow and look). Nothing on the object may show pink. Glass (a
  washing machine lid) may: look at it on the app's grey (#F6F6F8) and keep
  it if it reads as glass.
- A yellowish or beige part (a damp stain, an old faded wall) comes out
  see-through on the pale yellow backdrop: make that picture again on "a
  smooth soft pale sky blue (#DCE8F5)" backdrop. A grey or white part passes
  for a shadow on blue, so those stay on yellow.
- A boxy object (a room corner, a house, a wall unit) hides the circle: cut
  it with `--circle 1.2` to `1.3` so the circle shows round it. But the
  circle is drawn inside the 1024 source: on a tall or large object a big
  circle runs off it and shows flat edges. Doors keep the default; a wall
  piece filling most of the square takes 1.0 to 1.2.
- The mock of a trade with groups: pass a group's title instead of a job
  (`trade-mock.mjs carpentry "Doors and windows"`), and the third screen
  shows that group's sheet with its job pictures.
- The top: `retop.py source out SCALE CX CY` shrinks the object and moves it.
  Check the page at 320 wide: nothing cut at the right edge, nothing under
  the title. If the source picture itself cuts an object at its edge, make
  the top again (retop cannot add what is not there).
- retop reads the backdrop from the source's left 40%. If the image tool
  returns a narrower top (1536 x 1024) with the object reaching into that
  part, first widen it on the left with a mirrored strip of its own
  backdrop (Computers: 512 px, then `0.68 0.454 0.484`).

## 2. The mock

```bash
# a demo of main, served, and the "now" screens
bash scripts/demo/build.sh /tmp/pechkas-demo
node scripts/demo/serve.mjs /tmp/pechkas-demo/site 8901 &
SHOTS_OUT=/tmp/<trade>-now node scripts/shots/trade-mock.mjs <trade> "<one of its job names>"
```

Put the new pictures in **temporarily**: copy each cut PNG over the file the
app uses now (`apps/mobile/assets/work/<name>.png`), copy the top to
`apps/mobile/assets/work/<prefix>-top.jpg` and add its line to `TOPS` in
`apps/mobile/src/components/WorkArt.tsx` (`appliances:
require('../../assets/work/app-top.jpg'),`). Stop the server, build the demo
again, serve it, and take the "new" screens with `SHOTS_OUT=/tmp/<trade>-new`.
Then:

```bash
python3 scripts/shots/compare.py /tmp/<trade>-now /tmp/<trade>-new /tmp/<trade>-mock "New (3D)"
git checkout apps/mobile/assets/work/ apps/mobile/src/components/WorkArt.tsx   # undo the copy
```

and remove any new file the copy added (`git status`). Look at both pictures
yourself before sending them: at 320 nothing may be cut or overlap.

## 3. Building a trade

1. Save each cut picture as WebP, quality 84, and remove the old PNG:
   ```bash
   python3 -c "from PIL import Image; Image.open('<out>/app-fridge.png').convert('RGBA').save('apps/mobile/assets/work/app-fridge.webp','WEBP',quality=84,method=6)"
   git rm apps/mobile/assets/work/app-fridge.png
   ```
2. `apps/mobile/src/components/WorkArt.tsx`: change each of the trade's
   `require('../../assets/work/<name>.png')` lines to `.webp`, and add the
   trade's line to `TOPS` (after the last one, `electrician:`); a new job's
   picture goes in `PICTURES` and `JOB_PICTURES` (shared `work.ts`).
3. The docs: every trade is now 3D, so a new trade or job is added where
   these name the work — `CLAUDE.md` ("The pictures are 3D, every
   trade"), `docs/DESIGN.md` **and** `.claude/skills/pechkas-design/SKILL.md`
   (identical; `design:check` fails otherwise), `docs/DECISIONS.md` row A123
   ("and <Trade or job> (<date>, <n> pictures)"), `docs/BRIEFING.md`'s A123
   line, and this file's table.
   - anything new you learned about making the pictures goes in DESIGN.md
     and SKILL.md (both).
4. `node scripts/briefing-pdf.mjs` (rebuilds `docs/Pechkas-briefing.pdf`).
   It needs `marked`: run `npm i --no-save marked@12` first if it says
   "Cannot find module 'marked'", and make sure `package.json` and the
   lock file are unchanged afterwards (`git status`).
5. `npm run check`. It takes about 25 minutes: run it in the background with
   a long time limit and wait for it. `location.test.mjs` can fail with
   "accuracy 51 metres … stale" when the machine is busy (for example while
   a demo builds): run nothing else at the same time, and if only that fails,
   run it again alone.
6. Commit to `main` ("3D pictures for <Trade> (A123)", saying what each
   picture shows) and `git push -u origin main`.

## 4. Publishing

The three pages belong to the owner's claude.ai account. A session signed in
to another account cannot change them: then say so and stop here.

- **The demo**, https://claude.ai/artifact/C5cHrZkaysrbB16jkGiqNG: build it
  from the pushed commit (`bash scripts/demo/build.sh /tmp/pechkas-demo`),
  then publish `site/index.html` with `root` the site folder and `files` only
  what changed: `start.txt`, the new
  `app/_expo/static/js/web/entry-<hash>.js` (named in `index.html`'s
  `__PENTRY`) and the trade's new files under `app/assets/assets/work/`
  (`.webp` with contentType `image/webp`). If the publish is refused because a
  published file was "not read", read it with the Artifact tool (`action:
  read`, its `path`) and publish again.
- **The gallery**, https://claude.ai/artifact/Cwq32rcn2JGAbbbYan9yMD:
  `SHOTS_OUT=<gallery>/shots node scripts/shots/gallery.mjs <trade>` writes
  `10-home-a/b.jpg` and `19-work-<trade>.jpg` (a trade with groups also has
  `19-work-<trade>-<group>.jpg`; take those by hand the same way). Read the
  published `index.html` first (`action: read`), then publish it with those
  shots in `files`.
- **The decision map**, https://claude.ai/artifact/YBZXKEJ1QUo39BNK4k8Ha4:
  read it, then in its HTML change the A123 row (it now says every trade is
  built) and the foot's "Updated <date>: 3D
  pictures of the work, …" line; check its `<script>` still parses
  (`new Function(code)` in node). Copy the built demo site to `<map>/demo`,
  run `python3 scripts/demo/map-patch.py <map>/demo/index.html`, and publish
  the map with `demo/index.html`, `demo/start.txt`, the same changed demo
  files under `demo/`, and the gallery's new `shots/…`. **An artifact holds
  at most 512 files**: list the map's files (`action: list`, `scope:
  files`) and remove, with `null` in `files`, every `demo/app/…` file the new
  demo no longer has (old `entry-*.js` and old pictures).
- Send the owner the briefing PDF.

## 5. Telling him

Plain words: what each picture shows, anything that took extra work, that
the demo, map, gallery and briefing are updated (with the three links), and
which trades are still drawings.
