/**
 * Phase 2: posting a job, and the files that show what is wrong.
 *
 * The address and the recordings are the most private things in the app.
 * These tests try to read them as a stranger, as another customer, as a
 * technician, and as staff who have been switched off.
 */
import { as, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'a1111111-1111-4111-8111-111111111111'; // customer
const SARA = 'a2222222-2222-4222-8222-222222222222'; // another customer
const BILAL = 'a3333333-3333-4333-8333-333333333333'; // technician
const OWNER = 'a4444444-4444-4444-8444-444444444444';
const GONE = 'a5555555-5555-4555-8555-555555555555';

for (const [id, phone, email] of [
  [AYESHA, '923001111111', null],
  [SARA, '923002222222', null],
  [BILAL, '923003333333', null],
  [OWNER, null, 'owner@example.com'],
  [GONE, null, 'gone@example.com'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
}
await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'customer', 'Ayesha'), ($2, 'customer', 'Sara'), ($3, 'pro', 'Bilal')`, [AYESHA, SARA, BILAL]);
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`INSERT INTO public.staff (id, name, active) VALUES ($1, 'Gone', false)`, [GONE]);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}

/** An upload, the way Supabase's storage API writes it: as the uploader. */
const upload = (who, name) =>
  as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name, owner_id) VALUES ('job-media', $1, $2)`, [name, who]);

const POST = `SELECT public.post_job(
  p_trade => $1, p_job_type => $2, p_description => $3, p_offer_paisa => $4,
  p_when_kind => $5, p_when_part => $6, p_sector => $7, p_street => $8, p_house => $9,
  p_landmark => $10, p_lat => $11, p_lng => $12, p_power => $13, p_parts => $14,
  p_gate_note => $15, p_media => $16::jsonb)`;

const { rows: [service] } = await setup(`SELECT id FROM public.job_types WHERE trade = 'ac' AND name LIKE 'General service%'`);
const { rows: [plumbing] } = await setup(`SELECT id FROM public.job_types WHERE trade = 'plumber' LIMIT 1`);

/** A good job, with one field changed. */
function job(change = {}) {
  const base = {
    trade: 'ac', type: service.id, description: 'Blows air but it is not cold.', offer: 250000,
    when: 'today', part: 'evening', sector: 'F-11', street: 'Street 34', house: 'House 12',
    landmark: 'Behind the markaz mosque', lat: 33.68, lng: 72.99, power: 'on', parts: 'pro_buys',
    gate: 'Chowkidar will open', media: [],
  };
  const j = { ...base, ...change };
  return [j.trade, j.type, j.description, j.offer, j.when, j.part, j.sector, j.street, j.house,
    j.landmark, j.lat, j.lng, j.power, j.parts, j.gate, JSON.stringify(j.media)];
}

// =============================================================================
heading('Files in the private bucket');

ok('Ayesha can upload into her own folder', !(await upload(AYESHA, `${AYESHA}/voice-1.m4a`)).error);
await upload(AYESHA, `${AYESHA}/video-1.mp4`);
await upload(AYESHA, `${AYESHA}/photo-1.jpg`);
denied('but not into Sara\'s', await upload(AYESHA, `${SARA}/sneaky.m4a`));
denied('nor into a folder of no one', await upload(AYESHA, `loose/file.m4a`));
denied('a stranger cannot upload at all', await as('anon', null, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', 'x/y.m4a')`));
await upload(SARA, `${SARA}/voice-1.m4a`);
nothing('Sara cannot see Ayesha\'s recordings', await as('authenticated', SARA, `SELECT name FROM storage.objects WHERE name LIKE $1`, [`${AYESHA}/%`]));
nothing('a technician cannot see them either', await as('authenticated', BILAL, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`));
nothing('nor can a stranger', await as('anon', null, `SELECT name FROM storage.objects`));
{
  const r = await as('authenticated', AYESHA, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`);
  ok('Ayesha sees exactly her own three', r.rows.length === 3 && r.rows.every((x) => x.name.startsWith(AYESHA)));
}
{
  const r = await as('authenticated', OWNER, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`);
  ok('the office sees all of them', r.rows.length === 4);
}
nothing('staff who were switched off see none', await as('authenticated', GONE, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`));
{
  const r = await as('authenticated', SARA, `DELETE FROM storage.objects WHERE name = $1 RETURNING name`, [`${AYESHA}/photo-1.jpg`]);
  ok('Sara cannot delete Ayesha\'s photo', r.rows.length === 0 && !r.error);
}

// =============================================================================
heading('Posting a job: everything that must be refused');

const media = [
  { kind: 'voice', path: `${AYESHA}/voice-1.m4a`, seconds: 24 },
  { kind: 'video', path: `${AYESHA}/video-1.mp4`, seconds: 18 },
  { kind: 'photo', path: `${AYESHA}/photo-1.jpg` },
];

for (const [what, change, field] of [
  ['an offer below Rs 1,000, the inspection fee', { offer: 99900 }, 'offer'],
  ['an offer with paisa in it', { offer: 250050 }, 'offer'],
  ['a job type from a different trade', { type: plumbing.id }, 'job_type'],
  ['a sector Pechkas does not work in yet', { sector: 'G-7' }, 'sector'],
  ['a sector that does not exist', { sector: 'Atlantis' }, 'sector'],
  ['no house number', { house: ' ' }, 'house'],
  ['"today" with no part of the day', { part: null }, 'when'],
  ['"now" with a part of the day', { when: 'now', part: 'evening' }, 'when'],
  ['half a location', { lng: null }, 'location'],
  ['a location in another country', { lat: 51.5, lng: -0.1 }, 'location'],
  ['nothing to show what is wrong', { description: 'AC', media: [] }, 'media'],
  ['a file in somebody else\'s folder', { media: [{ kind: 'voice', path: `${SARA}/voice-1.m4a` }] }, 'media'],
  ['a file that was never uploaded', { media: [{ kind: 'photo', path: `${AYESHA}/never.jpg` }] }, 'media'],
  ['a path trying to climb out of the folder', { media: [{ kind: 'photo', path: `${AYESHA}/../x.jpg` }] }, 'media'],
  ['two voice notes', { media: [media[0], { ...media[0] }] }, 'media'],
  ['a CNIC number in the description', { description: `My CNIC is ${['61101', '1234567', '1'].join('-')}` }, 'description'],
]) {
  const r = await call('authenticated', AYESHA, POST, job(change));
  ok(`${what}`, r.value?.ok === false && r.value?.field === field, JSON.stringify(r.value ?? r.error));
}
{
  const r = await call('authenticated', BILAL, POST, job());
  ok('a technician account cannot post a job', r.value?.ok === false);
}
denied('a stranger cannot post at all', await as('anon', null, POST, job()));
{
  const { rows } = await setup(`SELECT count(*)::int AS n FROM public.jobs`);
  ok('none of those left a job behind', rows[0].n === 0);
}

// =============================================================================
heading('Posting a job properly');

let jobId;
{
  const r = await call('authenticated', AYESHA, POST, job({ media }));
  jobId = r.value?.id;
  ok('Ayesha posts an AC service with a voice note, a video and a photo', r.value?.ok === true && /^PK-\d+$/.test(r.value?.ref ?? ''), JSON.stringify(r.value ?? r.error));
}
{
  const r = await call('authenticated', AYESHA, POST, job({ type: null, description: 'Something is wrong with the AC remote', media: [] }));
  ok('"something else", described in words, is fine too', r.value?.ok === true);
}
{
  const r = await call('authenticated', AYESHA, POST, job({ media: [media[0]] }));
  ok('the same file cannot be attached to a second job', r.value?.ok === false && r.value?.field === 'media');
}
{
  const r = await call('authenticated', AYESHA, `SELECT public.my_jobs()`);
  const mine = r.value ?? [];
  const first = mine.find((x) => x.id === jobId);
  ok('she sees her jobs, newest first, with the address and the files', mine.length === 2 && first?.house === 'House 12' && first?.media?.length === 3);
}
{
  const r = await call('authenticated', SARA, `SELECT public.my_jobs()`);
  ok('Sara sees none of them', Array.isArray(r.value) && r.value.length === 0);
}
for (const table of ['jobs', 'job_media', 'job_types']) {
  nothing(`a stranger cannot read ${table}`, await as('anon', null, `SELECT * FROM public.${table}`));
  nothing(`another customer cannot read ${table}`, await as('authenticated', SARA, `SELECT * FROM public.${table}`));
  nothing(`a technician cannot read ${table}`, await as('authenticated', BILAL, `SELECT * FROM public.${table}`));
}
denied('she cannot lower her own price behind the app\'s back', await as('authenticated', AYESHA, `UPDATE public.jobs SET offered_paisa = 100 WHERE id = $1`, [jobId]));
nothing('a technician gets no jobs from the office list', await as('authenticated', BILAL, `SELECT * FROM public.admin_jobs()`));
nothing('nor do switched-off staff', await as('authenticated', GONE, `SELECT * FROM public.admin_jobs()`));
{
  const r = await as('authenticated', OWNER, `SELECT * FROM public.admin_jobs('open')`);
  const row = r.rows.find((x) => x.id === jobId);
  ok('the office sees it, with her number, full address and website price', row?.customer_phone === '923001111111' && row?.house === 'House 12' && Number(row?.list_paisa) === 250000);
}
{
  const r = await call('anon', null, `SELECT public.app_lists()`);
  const v = r.value ?? {};
  ok('the app can show the website prices and the live sectors before sign-in',
    v.job_types?.some((t) => t.trade === 'ac' && t.list_paisa === 250000) && v.live_sectors?.includes('F-11') && !v.live_sectors?.includes('G-7') && v.min_offer_paisa === 100000);
}

// =============================================================================
heading('Cancelling');

ok('Sara cannot cancel Ayesha\'s job', (await call('authenticated', SARA, `SELECT public.cancel_job($1, null)`, [jobId])).value?.ok === false);
ok('a technician cannot cancel it', (await call('authenticated', BILAL, `SELECT public.cancel_job($1, null)`, [jobId])).value?.ok === false);
ok('Ayesha can', (await call('authenticated', AYESHA, `SELECT public.cancel_job($1, 'Fixed it myself')`, [jobId])).value?.ok === true);
ok('but not twice', (await call('authenticated', AYESHA, `SELECT public.cancel_job($1, null)`, [jobId])).value?.ok === false);
{
  const { rows: [other] } = await setup(`SELECT id FROM public.jobs WHERE status = 'open' LIMIT 1`);
  ok('the office needs a reason to cancel a job', (await call('authenticated', OWNER, `SELECT public.admin_cancel_job($1, '')`, [other.id])).value?.field === 'reason');
  ok('and can with one', (await call('authenticated', OWNER, `SELECT public.admin_cancel_job($1, 'Customer rang: duplicate')`, [other.id])).value?.ok === true);
  ok('switched-off staff cannot', (await call('authenticated', GONE, `SELECT public.admin_cancel_job($1, 'x')`, [other.id])).value?.ok === false);
}

// =============================================================================
heading('Floods are bounded');

{
  // Five open jobs is the limit; the sixth is refused.
  for (let i = 0; i < 5; i += 1) await call('authenticated', SARA, POST, job({ description: `Tap leaking number ${i}`, trade: 'plumber', type: null }));
  const r = await call('authenticated', SARA, POST, job({ description: 'One more leaking tap', trade: 'plumber', type: null }));
  ok('a sixth open job is refused until one is closed', r.value?.ok === false && /5 jobs open/.test(r.value?.why ?? ''), JSON.stringify(r.value));
}

// =============================================================================
heading('Deleting an account takes the jobs with it');

ok('Ayesha deletes her account', (await call('authenticated', AYESHA, `SELECT public.delete_my_account()`)).value?.ok === true);
{
  const { rows } = await setup(`SELECT (SELECT count(*) FROM public.jobs WHERE customer_id = $1)::int AS j, (SELECT count(*) FROM public.job_media m JOIN public.jobs x ON x.id = m.job_id WHERE x.customer_id = $1)::int AS m`, [AYESHA]);
  ok('none of her jobs or file records remain', rows[0].j === 0 && rows[0].m === 0);
}

{
  // The app refuses a file over LIMITS.bytes (apps/mobile/src/post/media.ts) before sending it; the
  // bucket must take exactly that much, or a video the app allowed is turned away at the door.
  const { rows } = await setup(`SELECT file_size_limit FROM storage.buckets WHERE id = 'job-media'`);
  ok('the job-media bucket takes files up to 50 MB, the same as the app', Number(rows[0]?.file_size_limit) === 50 * 1024 * 1024, rows[0]);
}

report();
