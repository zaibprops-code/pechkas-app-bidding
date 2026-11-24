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

export type WorkGroup = { title: string; jobs: string[] };

/**
 * The groups on a long list. A trade with five jobs or fewer needs none: its
 * page is one short list. The order is the order on the page.
 */
export const WORK_GROUPS: Record<string, WorkGroup[]> = {
  ac: [
    { title: 'Service and repair', jobs: ['General service (indoor and outdoor unit)', 'Gas top-up', 'Water leaking from indoor unit', 'PCB or electrical fault diagnosis'] },
    { title: 'Fitting and moving', jobs: ['Split AC installation', 'Split AC uninstallation', 'Dismantle and refit (shifting house)', 'Outdoor unit stand or bracket', 'Stabiliser fitting'] },
  ],
  electrician: [
    { title: 'Fans and lights', jobs: ['Ceiling fan installation', 'Exhaust fan fitting', 'Light or chandelier fitting'] },
    { title: 'Switches and sockets', jobs: ['Switch or socket replacement', 'New socket or light point', 'Doorbell or intercom fitting'] },
    { title: 'Power and wiring', jobs: ['DB or breaker fault', 'Wiring fault tracing', 'Rewiring a room or a house', 'UPS or inverter connection', 'Generator or solar changeover switch', 'Water motor automatic switch'] },
  ],
  plumber: [
    { title: 'Taps, sinks and showers', jobs: ['Leaking tap repair or replacement', 'Wash basin or kitchen sink fitting', 'Shower, mixer or bathroom fittings', 'Water filter fitting'] },
    { title: 'Toilet', jobs: ['Flush tank repair', 'Flush tank float valve replacement', 'Commode or toilet fitting'] },
    { title: 'Geyser', jobs: ['Geyser installation', 'Geyser service and descaling', 'Geyser repair'] },
    { title: 'Water motor', jobs: ['Water motor or pump fitting', 'Water motor repair'] },
    { title: 'Drains and leaks', jobs: ['Blocked drain clearing', 'Main sewerage line blockage', 'Hidden pipe leak'] },
  ],
  carpentry: [
    { title: 'Doors and windows', jobs: ['Door lock or handle fitting', 'Door hinge repair or replacement', 'Door adjustment (sticking or not closing)', 'Hanging a new door', 'Window repair (handle, hinge or sliding)'] },
    { title: 'Cupboards and furniture', jobs: ['Cupboard or wardrobe repair', 'Drawer or channel repair', 'Flat-pack furniture assembly', 'Furniture repair'] },
    { title: 'On the wall', jobs: ['Shelf or wall bracket fitting', 'Curtain rod or blind fitting'] },
  ],
};

/**
 * A job of another trade that belongs on this trade's page too, because it
 * is the same thing in the customer's eyes. Shown with its own trade's name
 * and posted as that trade: UPS and inverter has no list of its own yet,
 * and connecting one is the electrician's job.
 */
export const WORK_ALSO: Record<string, { trade: string; job: string }[]> = {
  ups: [{ trade: 'electrician', job: 'UPS or inverter connection' }],
};

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
