/**
 * How the customer finds the work (the owner's choice, 24 November 2026):
 * home shows every kind of work with the things it covers under its name,
 * a kind of work's page shows its jobs in small groups, and search finds a
 * job in any of them. The jobs themselves — their names, their usual prices
 * — are the database's (`public.job_types`, read through `app_lists()`);
 * this file only says how to SHOW them.
 *
 * Every job named here must be a real job of that trade, or a group would
 * quietly lose it: `supabase/tests/jobs.test.mjs` checks every name against
 * the migrations and fails on one that is not there. A job not in any group
 * is never hidden — the page puts it under "More jobs" — so a new job added
 * by migration appears the day it is added.
 *
 * Standalone on purpose (no imports), so the database tests can read it.
 */

/** The line under each kind of work's name on home: what it covers, in the things people see. */
export const WORK_THINGS: Record<string, string> = {
  ac: 'Service, gas, fitting, leaks',
  electrician: 'Fans, lights, switches, wiring',
  plumber: 'Taps, toilet, geyser, motor',
  ups: 'UPS or inverter trouble',
  solar: 'Panel cleaning, inverter faults',
  appliances: 'Fridge, washing machine, microwave',
  cctv: 'Cameras, recorder, phone view',
  wifi: 'Router, weak signal, cables',
  carpentry: 'Doors, locks, cupboards',
  painting: 'Rooms, touch-ups, damp patches',
  computers: 'Slow, virus, Windows, repairs',
  tank: 'Roof tank cleaning',
  cleaning: 'Sofa, carpet, mattress',
};

/** `art` names the group's drawing (TradeArt in the app); a group without one shows its trade's. */
export type WorkGroup = { title: string; art?: string; jobs: string[] };

/**
 * The groups on a long list. A trade with five jobs or fewer needs none: its
 * page is one short list. The order is the order on the page.
 */
export const WORK_GROUPS: Record<string, WorkGroup[]> = {
  ac: [
    { title: 'Service and repair', art: 'ac-service', jobs: ['General service (indoor and outdoor unit)', 'Gas top-up', 'Water leaking from indoor unit', 'PCB or electrical fault diagnosis', 'AC chemical wash', 'Window AC service'] },
    { title: 'Fitting and moving', art: 'ac-fitting', jobs: ['Split AC installation', 'Split AC uninstallation', 'Dismantle and refit (shifting house)', 'Outdoor unit stand or bracket', 'Stabiliser fitting'] },
  ],
  electrician: [
    { title: 'Fans and lights', art: 'fan', jobs: ['Ceiling fan installation', 'Ceiling fan repair', 'Exhaust fan fitting', 'Light or chandelier fitting'] },
    { title: 'TV', art: 'tv', jobs: ['TV wall mounting'] },
    { title: 'Switches and sockets', art: 'socket', jobs: ['Switch or socket replacement', 'New socket or light point', 'Doorbell or intercom fitting'] },
    { title: 'Power and wiring', art: 'breaker', jobs: ['DB or breaker fault', 'New DB or breaker board', 'Earthing', 'Wiring fault tracing', 'Rewiring a room or a house', 'UPS or inverter connection', 'Generator or solar changeover switch', 'Water motor automatic switch'] },
  ],
  plumber: [
    { title: 'Taps, sinks and showers', art: 'taps', jobs: ['Leaking tap repair or replacement', 'Wash basin or kitchen sink fitting', 'Shower, mixer or bathroom fittings', 'Silicone sealing (bath, basin or sink)', 'Bathroom accessory fitting', 'Water filter fitting', 'Water purifier (RO) filter change'] },
    { title: 'Toilet', art: 'toilet', jobs: ['Flush tank repair', 'Flush tank float valve replacement', 'Commode or toilet fitting'] },
    { title: 'Geyser', art: 'geyser', jobs: ['Geyser installation', 'Instant electric geyser fitting', 'Geyser service and descaling', 'Geyser repair'] },
    { title: 'Water motor', art: 'motor', jobs: ['Water motor or pump fitting', 'Water motor repair'] },
    { title: 'Pipes, drains and leaks', art: 'drain', jobs: ['Burst or leaking pipe repair', 'Hidden pipe leak', 'New water pipe line', 'Blocked drain clearing', 'Main sewerage line blockage'] },
  ],
  carpentry: [
    { title: 'Doors and windows', art: 'door', jobs: ['Door lock or handle fitting', 'Door hinge repair or replacement', 'Door adjustment (sticking or not closing)', 'Hanging a new door', 'Window repair (handle, hinge or sliding)', 'Mosquito mesh (jaali) for a window or door'] },
    { title: 'Cupboards and furniture', art: 'cupboard', jobs: ['Cupboard or wardrobe repair', 'Kitchen cabinet fitting', 'Drawer or channel repair', 'Flat-pack furniture assembly', 'Furniture repair'] },
    { title: 'On the wall', art: 'shelf', jobs: ['Shelf or wall bracket fitting', 'Curtain rod or blind fitting', 'Mirror, picture or frame hanging'] },
  ],
};

/**
 * The words Search offers before anything is typed: things people say, to
 * tap rather than spell. Every one must find at least one job through
 * findJobs() — `jobs.test.mjs` checks them against the real list.
 */
export const WORK_SUGGESTIONS = ['Geyser', 'Ceiling fan', 'AC service', 'Leaking tap', 'Fridge', 'Door lock', 'Wi-Fi signal', 'CCTV camera', 'Water motor', 'Paint a room'];

/**
 * A job of another trade that belongs on this trade's page too, because it
 * is the same thing in the customer's eyes. Shown with its own trade's name
 * and posted as that trade: UPS and inverter has no list of its own yet,
 * and connecting one is the electrician's job.
 */
export const WORK_ALSO: Record<string, { trade: string; job: string }[]> = {
  ups: [{ trade: 'electrician', job: 'UPS or inverter connection' }],
};

/**
 * One short line under each job's name on its card (the owner's choice of
 * design B, 28 November 2026): what the job covers, as she would see it at
 * home, so two pictures that look alike can still be told apart. Plain
 * words only — never a price, a time or a promise. `jobs.test.mjs` fails if
 * a real job has no line or a line names no real job.
 */
export const JOB_LINES: Record<string, Record<string, string>> = {
  plumber: {
    'Leaking tap repair or replacement': 'A dripping, loose or broken tap, fixed or changed',
    'Wash basin or kitchen sink fitting': 'A basin or kitchen sink put in, with its pipes',
    'Shower, mixer or bathroom fittings': 'Showers, mixers and other bathroom fittings, put in or fixed',
    'Water filter fitting': 'A water filter fitted under the sink or on the wall',
    'Flush tank repair': 'A flush that keeps running, leaks or will not flush',
    'Flush tank float valve replacement': 'The valve that stops the tank filling, changed',
    'Commode or toilet fitting': 'A commode or toilet put in, or refitted',
    'Geyser installation': 'A new geyser put in and joined to the water pipes',
    'Geyser service and descaling': 'Scale cleaned out of the geyser, and the geyser checked',
    'Geyser repair': 'A geyser that will not heat, leaks or keeps stopping',
    'Water motor or pump fitting': 'A water motor or pump put in for the tank',
    'Water motor repair': 'A motor that hums, will not start or does not lift water',
    'Blocked drain clearing': 'A sink, shower or floor drain that will not empty',
    'Main sewerage line blockage': 'The main line out of the house blocked or backing up',
    'Hidden pipe leak': 'A leak inside a wall or under a floor, found and fixed',
    'Water purifier (RO) filter change': 'New filters or membrane for your water purifier',
    'Silicone sealing (bath, basin or sink)': 'Old or black sealing removed and done again',
    'Bathroom accessory fitting': 'A towel rail, soap dish, holder or shelf put up',
    'Burst or leaking pipe repair': 'A pipe you can see that has burst or drips, fixed',
    'New water pipe line': 'A short new water pipe run inside the house',
    'Instant electric geyser fitting': 'A small electric water heater put in at a tap',
  },
  ac: {
    'General service (indoor and outdoor unit)': 'Indoor and outdoor units cleaned and checked',
    'Gas top-up': 'Gas filled when the AC runs but cools poorly',
    'Water leaking from indoor unit': 'Water dripping from the indoor unit, stopped',
    'PCB or electrical fault diagnosis': 'An AC that will not start or shows a fault, checked',
    'Split AC installation': 'A split AC put up, piped and connected',
    'Split AC uninstallation': 'A split AC taken down safely',
    'Dismantle and refit (shifting house)': 'Taken down at the old house and put up at the new one',
    'Outdoor unit stand or bracket': 'A stand or wall bracket for the outdoor unit',
    'Stabiliser fitting': 'A voltage stabiliser fitted for the AC',
    'AC chemical wash': 'A deep clean of the coils with a cleaning solution',
    'Window AC service': 'A window AC cleaned and checked',
  },
  electrician: {
    'Ceiling fan installation': 'A ceiling fan hung and connected',
    'Exhaust fan fitting': 'An exhaust fan fitted in a kitchen or bathroom',
    'Light or chandelier fitting': 'Lights or a chandelier put up and connected',
    'Switch or socket replacement': 'A broken, loose or burnt switch or socket changed',
    'New socket or light point': 'A new socket or light point where you need one',
    'Doorbell or intercom fitting': 'A doorbell or intercom put in',
    'DB or breaker fault': 'A breaker that keeps tripping, or a fault in the board',
    'Wiring fault tracing': 'Power gone in part of the house, and the fault found',
    'Rewiring a room or a house': 'Old or unsafe wiring replaced',
    'UPS or inverter connection': 'A UPS or inverter wired into the house',
    'Generator or solar changeover switch': 'A switch between the mains and a generator or solar',
    'Water motor automatic switch': 'A switch that starts and stops the water motor by itself',
    'TV wall mounting': 'A TV put up on the wall on a bracket',
    'Ceiling fan repair': 'A fan that runs slow, hums or will not start',
    'Earthing': 'A proper earth for the house or a socket',
    'New DB or breaker board': 'A new board of breakers fitted and wired',
  },
  solar: {
    'Panel cleaning (up to 5kW)': 'Dust and dirt washed off a system of up to 5kW',
    'Panel cleaning (5kW to 10kW)': 'Dust and dirt washed off a system of 5 to 10kW',
    'System check and written report': 'Panels, inverter and wiring checked, with a written report',
    'Full maintenance service': 'The whole system cleaned and checked',
    'Inverter or wiring fault': 'An inverter showing a fault, or no power coming through',
  },
  appliances: {
    'Washing machine service and clean': 'Drum, filter and pipes cleaned, and the machine checked',
    'Appliance installation or fitting': 'A washing machine, oven or other appliance put in and connected',
    'Washing machine repair': 'A machine that will not start, spin or drain',
    'Fridge or freezer repair': 'A fridge or freezer that will not cool or keeps stopping',
    'Microwave or electric oven repair': 'A microwave or oven that will not heat or start',
    'Water dispenser repair': 'A dispenser that will not cool, will not heat or leaks',
    'Clothes dryer repair': 'A dryer that will not turn, heat or dry',
  },
  cctv: {
    'Fitting a camera': 'One camera put up and connected',
    'Fitting a set of four, with the recorder': 'Four cameras and the recorder put in',
    'Moving or re-aiming a camera': 'A camera moved, or turned to see the right place',
    'Setting it up on your phone': 'Your cameras set up to watch on your phone',
    'Camera or recorder not working': 'No picture, a dead camera or a recorder fault',
  },
  wifi: {
    'Setting up a new router': 'A new router connected and its Wi-Fi set up',
    'Getting the signal to a room it does not reach': 'Wi-Fi brought to a room where it is weak or missing',
    'Running a network cable point': 'A network cable run to where you need it',
    'Office or shop network': 'Wi-Fi and cables for an office or shop',
    'Internet keeps dropping': 'Wi-Fi or internet that keeps cutting out, checked',
  },
  painting: {
    'Single room repaint': 'One room painted again',
    'Touch-up and patch work': 'Cracks and holes filled, and marks painted over',
    'Damp or seepage patch treatment': 'A damp or seepage patch scraped back and sealed',
    'Full flat or house repaint': 'A whole flat or house painted again',
  },
  computers: {
    'A slow machine, cleaned up': 'A slow computer cleared of clutter and checked',
    'Windows reinstall': 'Windows put on again, fresh',
    'Virus or pop-up trouble': 'Viruses and pop-ups removed',
    'Will not start, or a hardware fault': 'A computer that will not start, or has a faulty part',
    'Screen, keyboard or battery replacement': 'A laptop screen, keyboard or battery changed',
  },
  carpentry: {
    'Door lock or handle fitting': 'A lock or handle fitted or changed',
    'Door hinge repair or replacement': 'A loose or broken hinge fixed or changed',
    'Door adjustment (sticking or not closing)': 'A door that sticks, drags or will not close, adjusted',
    'Hanging a new door': 'A new door hung in its frame',
    'Window repair (handle, hinge or sliding)': 'A window handle, hinge or sliding track fixed',
    'Cupboard or wardrobe repair': 'Doors, shelves or hinges of a cupboard or wardrobe fixed',
    'Drawer or channel repair': 'A drawer that sticks or falls out, and its runners fixed',
    'Flat-pack furniture assembly': 'Furniture that came in a box, put together',
    'Furniture repair': 'A broken chair, table or bed fixed',
    'Shelf or wall bracket fitting': 'Shelves or brackets put up on a wall',
    'Curtain rod or blind fitting': 'Curtain rods or blinds put up',
    'Mirror, picture or frame hanging': 'Hung straight and firm on the wall',
    'Mosquito mesh (jaali) for a window or door': 'A new mesh fitted, or a torn one replaced',
    'Kitchen cabinet fitting': 'One cabinet or a wall unit put up',
  },
  tank: {
    'Overhead water tank cleaning': 'A plastic or cement tank on the roof, emptied, scrubbed and rinsed',
  },
  ups: {
    'UPS battery replacement': 'Old UPS batteries taken out and new ones connected',
  },
  cleaning: {
    'Sofa cleaning': 'Seats and cushions washed with a machine',
    'Carpet or rug cleaning': 'A carpet or rug washed and dried on the spot',
    'Mattress cleaning': 'A mattress cleaned of dust and stains',
  },
};

/** A job's short line, if it has one. */
export const jobLine = (trade: string, job: string): string | undefined => JOB_LINES[trade]?.[job];

/**
 * Pictures (the owner's decision A121): the jobs that have a picture of their
 * own, by name, and the drawings (`art` keys, above) that have a picture in
 * place of the line drawing. The pictures themselves are in
 * apps/mobile/assets/work and are named there (`WorkArt.tsx`). A job with no
 * picture of its own shows its group's, and a group with none its drawing.
 * `jobs.test.mjs` fails if a name here is not a real job, so renaming a job
 * cannot quietly lose its picture. Every job has one now, and home and
 * search use them too (the line drawings in TradeArt stay only as the
 * fallback for a trade or job added before its picture is made).
 */
export const JOB_PICTURES: Record<string, Record<string, string>> = {
  plumber: {
    'Leaking tap repair or replacement': 'plumber-leak',
    'Wash basin or kitchen sink fitting': 'plumber-sink',
    'Shower, mixer or bathroom fittings': 'plumber-shower',
    'Water filter fitting': 'plumber-filter',
    'Flush tank repair': 'plumber-flushtank',
    'Flush tank float valve replacement': 'plumber-float',
    'Commode or toilet fitting': 'plumber-commode',
    'Geyser installation': 'plumber-geyserfit',
    'Geyser service and descaling': 'plumber-descale',
    'Geyser repair': 'plumber-geyserrepair',
    'Water motor or pump fitting': 'plumber-motorfit',
    'Water motor repair': 'plumber-motorrepair',
    'Blocked drain clearing': 'plumber-blocked',
    'Main sewerage line blockage': 'plumber-sewer',
    'Hidden pipe leak': 'plumber-hiddenleak',
    'Water purifier (RO) filter change': 'plumber-ro',
    'Silicone sealing (bath, basin or sink)': 'plumber-silicone',
    'Bathroom accessory fitting': 'plumber-accessory',
    'Burst or leaking pipe repair': 'plumber-pipe',
    'New water pipe line': 'plumber-newpipe',
    'Instant electric geyser fitting': 'plumber-instant',
  },
  ac: {
    'General service (indoor and outdoor unit)': 'ac-general',
    'Gas top-up': 'ac-gas',
    'Water leaking from indoor unit': 'ac-leak',
    'PCB or electrical fault diagnosis': 'ac-pcb',
    'Split AC installation': 'ac-install',
    'Split AC uninstallation': 'ac-uninstall',
    'Dismantle and refit (shifting house)': 'ac-shifting',
    'Outdoor unit stand or bracket': 'ac-stand',
    'Stabiliser fitting': 'ac-stabiliser',
    'AC chemical wash': 'ac-wash',
    'Window AC service': 'ac-window',
  },
  electrician: {
    'Ceiling fan installation': 'el-ceilingfan',
    'Exhaust fan fitting': 'el-exhaust',
    'Light or chandelier fitting': 'el-chandelier',
    'Switch or socket replacement': 'el-switch',
    'New socket or light point': 'el-newsocket',
    'Doorbell or intercom fitting': 'el-doorbell',
    'DB or breaker fault': 'el-breaker',
    'Wiring fault tracing': 'el-tracing',
    'Rewiring a room or a house': 'el-rewiring',
    'UPS or inverter connection': 'el-ups',
    'Generator or solar changeover switch': 'el-changeover',
    'Water motor automatic switch': 'el-motorswitch',
    'TV wall mounting': 'el-tv',
    'Ceiling fan repair': 'el-fanrepair',
    'Earthing': 'el-earthing',
    'New DB or breaker board': 'el-db',
  },
  solar: {
    'Panel cleaning (up to 5kW)': 'solar-clean5',
    'Panel cleaning (5kW to 10kW)': 'solar-clean10',
    'System check and written report': 'solar-check',
    'Full maintenance service': 'solar-service',
    'Inverter or wiring fault': 'solar-fault',
  },
  appliances: {
    'Washing machine service and clean': 'app-wmservice',
    'Appliance installation or fitting': 'app-install',
    'Washing machine repair': 'app-wmrepair',
    'Fridge or freezer repair': 'app-fridge',
    'Microwave or electric oven repair': 'app-microwave',
    'Water dispenser repair': 'app-dispenser',
    'Clothes dryer repair': 'app-dryer',
  },
  cctv: {
    'Fitting a camera': 'cctv-camfit',
    'Fitting a set of four, with the recorder': 'cctv-camset',
    'Moving or re-aiming a camera': 'cctv-camaim',
    'Setting it up on your phone': 'cctv-camphone',
    'Camera or recorder not working': 'cctv-camfault',
  },
  wifi: {
    'Setting up a new router': 'wifi-router',
    'Getting the signal to a room it does not reach': 'wifi-extend',
    'Running a network cable point': 'wifi-cable',
    'Office or shop network': 'wifi-office',
    'Internet keeps dropping': 'wifi-dropping',
  },
  painting: {
    'Single room repaint': 'paint-room',
    'Touch-up and patch work': 'paint-touchup',
    'Damp or seepage patch treatment': 'paint-damp',
    'Full flat or house repaint': 'paint-house',
  },
  computers: {
    'A slow machine, cleaned up': 'pc-slow',
    'Windows reinstall': 'pc-windows',
    'Virus or pop-up trouble': 'pc-virus',
    'Will not start, or a hardware fault': 'pc-nostart',
    'Screen, keyboard or battery replacement': 'pc-parts',
  },
  carpentry: {
    'Door lock or handle fitting': 'carp-lock',
    'Door hinge repair or replacement': 'carp-hinge',
    'Door adjustment (sticking or not closing)': 'carp-adjust',
    'Hanging a new door': 'carp-newdoor',
    'Window repair (handle, hinge or sliding)': 'carp-window',
    'Cupboard or wardrobe repair': 'carp-wardrobe',
    'Drawer or channel repair': 'carp-drawer',
    'Flat-pack furniture assembly': 'carp-flatpack',
    'Furniture repair': 'carp-furniture',
    'Shelf or wall bracket fitting': 'carp-shelffit',
    'Curtain rod or blind fitting': 'carp-curtain',
    'Mirror, picture or frame hanging': 'carp-mirror',
    'Mosquito mesh (jaali) for a window or door': 'carp-mesh',
    'Kitchen cabinet fitting': 'carp-cabinet',
  },
  tank: {
    'Overhead water tank cleaning': 'tank-clean',
  },
  ups: {
    'UPS battery replacement': 'ups-battery',
  },
  cleaning: {
    'Sofa cleaning': 'clean-sofa',
    'Carpet or rug cleaning': 'clean-carpet',
    'Mattress cleaning': 'clean-mattress',
  },
};
export const ART_PICTURES: Record<string, string> = {
  plumber: 'plumber-leak',
  taps: 'plumber-taps',
  toilet: 'plumber-toilet',
  geyser: 'plumber-geyser',
  motor: 'plumber-motor',
  drain: 'plumber-drain',
  ac: 'ac-ac',
  'ac-service': 'ac-service',
  'ac-fitting': 'ac-fitting',
  electrician: 'el-electrician',
  fan: 'el-fans',
  socket: 'el-switches',
  breaker: 'el-power',
  ups: 'ups-ups',
  solar: 'solar-solar',
  appliances: 'app-appliances',
  cctv: 'cctv-cctv',
  wifi: 'wifi-wifi',
  painting: 'paint-painting',
  computers: 'pc-computers',
  carpentry: 'carp-carpentry',
  door: 'carp-door',
  cupboard: 'carp-cupboard',
  shelf: 'carp-shelf',
  tv: 'el-tv',
  tank: 'tank-tank',
  cleaning: 'clean-cleaning',
};

/** The picture for a job (its own, else its group's), or for a drawing's key; undefined when there is none yet. */
export function workPicture(trade: string, job?: string): string | undefined {
  return (job ? JOB_PICTURES[trade]?.[job] : undefined) ?? ART_PICTURES[job ? workArt(trade, job) : trade];
}

/** A job's drawing: its group's when the group has one, else its trade's. */
export function workArt(trade: string, job: string): string {
  return WORK_GROUPS[trade]?.find((g) => g.jobs.includes(job))?.art ?? trade;
}

/** Words of a search, lower case, without the little ones that match everything. */
function words(q: string): string[] {
  return q
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length >= 2 && !['or', 'and', 'the', 'a', 'an', 'my', 'is', 'of', 'to', 'in', 'not'].includes(w));
}

/**
 * The jobs a search finds. Every word typed must start a word of the job's
 * name — so "gey" finds the geyser jobs and "fan" the fans, while "an" finds
 * nothing. Only when no job's own name matches does it look wider, at the
 * trade's name and the things the trade covers: "plumber" lists the
 * plumber's jobs, and "fridge" would find the appliance jobs if none were
 * called that. Never both: a geyser search must not also list every tap.
 */
export function findJobs<J extends { trade: string; name: string }>(query: string, jobs: J[], tradeName: (slug: string) => string): J[] {
  const typed = words(query);
  if (!typed.length) return [];
  const starts = (text: string, w: string) => text.toLowerCase().split(/[^a-z0-9-]+/).some((t) => t.startsWith(w));
  const byName = jobs.filter((j) => typed.every((w) => starts(j.name, w)));
  if (byName.length) return byName;
  return jobs.filter((j) => typed.every((w) => starts(j.name, w) || starts(tradeName(j.trade), w) || starts(WORK_THINGS[j.trade] ?? '', w)));
}
