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
};

/** `art` names the group's drawing (TradeArt in the app); a group without one shows its trade's. */
export type WorkGroup = { title: string; art?: string; jobs: string[] };

/**
 * The groups on a long list. A trade with five jobs or fewer needs none: its
 * page is one short list. The order is the order on the page.
 */
export const WORK_GROUPS: Record<string, WorkGroup[]> = {
  ac: [
    { title: 'Service and repair', art: 'ac-service', jobs: ['General service (indoor and outdoor unit)', 'Gas top-up', 'Water leaking from indoor unit', 'PCB or electrical fault diagnosis'] },
    { title: 'Fitting and moving', art: 'ac-fitting', jobs: ['Split AC installation', 'Split AC uninstallation', 'Dismantle and refit (shifting house)', 'Outdoor unit stand or bracket', 'Stabiliser fitting'] },
  ],
  electrician: [
    { title: 'Fans and lights', art: 'fan', jobs: ['Ceiling fan installation', 'Exhaust fan fitting', 'Light or chandelier fitting'] },
    { title: 'Switches and sockets', art: 'socket', jobs: ['Switch or socket replacement', 'New socket or light point', 'Doorbell or intercom fitting'] },
    { title: 'Power and wiring', art: 'breaker', jobs: ['DB or breaker fault', 'Wiring fault tracing', 'Rewiring a room or a house', 'UPS or inverter connection', 'Generator or solar changeover switch', 'Water motor automatic switch'] },
  ],
  plumber: [
    { title: 'Taps, sinks and showers', art: 'taps', jobs: ['Leaking tap repair or replacement', 'Wash basin or kitchen sink fitting', 'Shower, mixer or bathroom fittings', 'Water filter fitting'] },
    { title: 'Toilet', art: 'toilet', jobs: ['Flush tank repair', 'Flush tank float valve replacement', 'Commode or toilet fitting'] },
    { title: 'Geyser', art: 'geyser', jobs: ['Geyser installation', 'Geyser service and descaling', 'Geyser repair'] },
    { title: 'Water motor', art: 'motor', jobs: ['Water motor or pump fitting', 'Water motor repair'] },
    { title: 'Drains and leaks', art: 'drain', jobs: ['Blocked drain clearing', 'Main sewerage line blockage', 'Hidden pipe leak'] },
  ],
  carpentry: [
    { title: 'Doors and windows', art: 'door', jobs: ['Door lock or handle fitting', 'Door hinge repair or replacement', 'Door adjustment (sticking or not closing)', 'Hanging a new door', 'Window repair (handle, hinge or sliding)'] },
    { title: 'Cupboards and furniture', art: 'cupboard', jobs: ['Cupboard or wardrobe repair', 'Drawer or channel repair', 'Flat-pack furniture assembly', 'Furniture repair'] },
    { title: 'On the wall', art: 'shelf', jobs: ['Shelf or wall bracket fitting', 'Curtain rod or blind fitting'] },
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
 * Pictures (the owner's decision A121): the jobs that have a picture of their
 * own, by name, and the drawings (`art` keys, above) that have a picture in
 * place of the line drawing. The pictures themselves are in
 * apps/mobile/assets/work and are named there (`WorkArt.tsx`). A job with no
 * picture of its own shows its group's, and a group with none its drawing.
 * `jobs.test.mjs` fails if a name here is not a real job, so renaming a job
 * cannot quietly lose its picture. Every job has one now; until home
 * moves to pictures too, home and the list of kinds of
 * work keep the drawings so the two styles never sit side by side there.
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
