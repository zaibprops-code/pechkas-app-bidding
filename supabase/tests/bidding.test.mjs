/**
 * Phase 3: technicians see jobs and offer; the customer chooses one.
 *
 * What must hold: a technician sees only jobs in his trades and sectors,
 * and never the street, the house or the number until he is chosen. Only
 * the customer can choose, only a live offer, and only once. The address
 * stops being his when the job is cancelled.
 */
import { as, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'b1111111-1111-4111-8111-111111111111'; // customer, F-11
const SARA = 'b2222222-2222-4222-8222-222222222222'; // another customer
const BILAL = 'b3333333-3333-4333-8333-333333333333'; // AC, F-11 and E-11, approved
const ASAD = 'b4444444-4444-4444-8444-444444444444'; // AC, F-11, approved
const KAMRAN = 'b5555555-5555-4555-8555-555555555555'; // plumber, F-11, approved: wrong trade
const DANISH = 'b6666666-6666-4666-8666-666666666666'; // AC, G-13 only: wrong sector
const WAQAS = 'b7777777-7777-4777-8777-777777777777'; // AC, F-11, still waiting for approval
const OWNER = 'b8888888-8888-4888-8888-888888888888';

const people = [
  [AYESHA, '923001111111', null, 'customer', 'Ayesha'],
  [SARA, '923002222222', null, 'customer', 'Sara'],
  [BILAL, '923003333333', null, 'pro', 'Bilal'],
  [ASAD, '923004444444', null, 'pro', 'Asad'],
  [KAMRAN, '923005555555', null, 'pro', 'Kamran'],
  [DANISH, '923006666666', null, 'pro', 'Danish'],
  [WAQAS, '923007777777', null, 'pro', 'Waqas'],
  [OWNER, null, 'owner@example.com', null, null],
];
for (const [id, phone, email, role, name] of people) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full, trades, sectors, status] of [
  [BILAL, 'Bilal Ahmed', '{ac}', '{F-11,E-11}', 'approved'],
  [ASAD, 'Asad Mehmood', '{ac,electrician}', '{F-11}', 'approved'],
  [KAMRAN, 'Kamran Shah', '{plumber}', '{F-11}', 'approved'],
  [DANISH, 'Danish Ali', '{ac}', '{G-13}', 'approved'],
  [WAQAS, 'Waqas Khan', '{ac}', '{F-11}', 'applied'],
]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, $2, $3, 6, $4, $5)`, [id, full, trades, sectors, status]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const upload = (who, name) =>
  as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);

const POST = `SELECT public.post_job(p_trade => $1, p_job_type => NULL, p_description => $2, p_offer_paisa => $3,
  p_when_kind => $4, p_when_part => $5, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_landmark => 'Behind the markaz mosque', p_lat => 33.68, p_lng => 72.99, p_gate_note => 'Chowkidar will open',
  p_media => $6::jsonb)`;

await upload(AYESHA, `${AYESHA}/voice-1.m4a`);
const job1 = (await call('authenticated', AYESHA, POST, ['ac', 'AC not cooling at all', 250000, 'now', null,
  JSON.stringify([{ kind: 'voice', path: `${AYESHA}/voice-1.m4a`, seconds: 20 }])])).value;
const job2 = (await call('authenticated', AYESHA, POST, ['ac', 'Service before summer please', 250000, 'tomorrow', 'morning', '[]'])).value;
ok('two AC jobs posted in F-11, one wanted now and one tomorrow', job1?.ok && job2?.ok, JSON.stringify([job1, job2]));

const FEED = `SELECT public.pro_feed()`;
const OFFER = `SELECT public.make_offer($1, $2, $3, $4)`;

// =============================================================================
heading('Going online');

ok('a technician still waiting for approval cannot go online', (await call('authenticated', WAQAS, `SELECT public.pro_set_online(true)`)).value?.ok === false);
ok('a customer cannot go online', (await call('authenticated', SARA, `SELECT public.pro_set_online(true)`)).value?.ok === false);
{
  const r = await call('authenticated', BILAL, FEED);
  ok('an approved technician sees nothing while offline', r.value?.approved === true && r.value?.online === false && r.value?.jobs.length === 0);
}
for (const who of [BILAL, ASAD, KAMRAN, DANISH]) await call('authenticated', who, `SELECT public.pro_set_online(true)`);

// =============================================================================
heading('Who sees which job');

{
  const r = await call('authenticated', BILAL, FEED);
  const jobs = r.value?.jobs ?? [];
  ok('Bilal (AC, F-11) sees both jobs', jobs.length === 2);
  const one = jobs[0] ?? {};
  ok('he sees the sector and the customer\'s first name', one.sector === 'F-11' && one.customer_first_name === 'Ayesha');
  for (const key of ['street', 'house', 'landmark', 'lat', 'lng', 'gate_note', 'phone', 'customer_phone', 'customer_id']) {
    ok(`but never the ${key}`, !(key in one));
  }
  ok('and he is told the commission, so he sees what he keeps', r.value?.commission_bps === 1000);
}
ok('Kamran (a plumber) sees no AC job', ((await call('authenticated', KAMRAN, FEED)).value?.jobs ?? []).length === 0);
ok('Danish (G-13 only) sees no F-11 job', ((await call('authenticated', DANISH, FEED)).value?.jobs ?? []).length === 0);
ok('Waqas, not yet approved, sees nothing', ((await call('authenticated', WAQAS, FEED)).value?.jobs ?? []).length === 0);
for (const table of ['offers', 'jobs', 'job_media']) {
  nothing(`a technician cannot read ${table} directly`, await as('authenticated', BILAL, `SELECT * FROM public.${table}`));
}
nothing('a stranger cannot read offers', await as('anon', null, `SELECT * FROM public.offers`));
denied('a stranger cannot ask for the feed', await as('anon', null, FEED));

heading('The voice note');
{
  const r = await as('authenticated', BILAL, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`);
  ok('Bilal can open the voice note on a job he may offer on', r.rows.length === 1);
}
nothing('Kamran, the wrong trade, cannot', await as('authenticated', KAMRAN, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`));
nothing('Danish, the wrong sector, cannot', await as('authenticated', DANISH, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`));
nothing('Waqas, not approved, cannot', await as('authenticated', WAQAS, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`));
nothing('Sara, another customer, cannot', await as('authenticated', SARA, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`));

// =============================================================================
heading('Offers that must be refused');

const j1 = job1.id;
const j2 = job2.id;
for (const [what, args, field] of [
  ['below the lowest price for any job', [j1, 90000, 30, null], 'price'],
  ['more than twice what the customer offered', [j1, 500100, 30, null], 'price'],
  ['with paisa in it', [j1, 250050, 30, null], 'price'],
  ['no arrival time on a job wanted now', [j1, 250000, null, null], 'eta'],
  ['an arrival time on a job booked for tomorrow', [j2, 250000, 30, null], 'eta'],
  ['his phone number in the note', [j1, 250000, 30, 'Call me on 0300-1234567'], 'note'],
  ['a CNIC number in the note', [j1, 250000, 30, `CNIC ${['61101', '1234567', '1'].join('-')}`], 'note'],
]) {
  const r = await call('authenticated', BILAL, OFFER, args);
  ok(what, r.value?.ok === false && r.value?.field === field, JSON.stringify(r.value ?? r.error));
}
ok('Kamran cannot offer on an AC job', (await call('authenticated', KAMRAN, OFFER, [j1, 250000, 30, null])).value?.ok === false);
ok('Waqas, not approved, cannot offer', (await call('authenticated', WAQAS, OFFER, [j1, 250000, 30, null])).value?.ok === false);
ok('Ayesha cannot offer on her own job', (await call('authenticated', AYESHA, OFFER, [j1, 250000, 30, null])).value?.ok === false);
denied('a stranger cannot offer', await as('anon', null, OFFER, [j1, 250000, 30, null]));

// =============================================================================
heading('Offers, and the customer choosing');

ok('Bilal takes her price, here in 20 minutes', (await call('authenticated', BILAL, OFFER, [j1, 250000, 20, 'Sounds like low gas'])).value?.ok === true);
ok('Asad counters at Rs 2,800', (await call('authenticated', ASAD, OFFER, [j1, 280000, 35, null])).value?.ok === true);
ok('Asad changes his mind to Rs 2,700: the same offer, replaced', (await call('authenticated', ASAD, OFFER, [j1, 270000, 35, null])).value?.ok === true);
{
  const { rows } = await setup(`SELECT count(*)::int AS n FROM public.offers WHERE job_id = $1`, [j1]);
  ok('so there are two offers, not three', rows[0].n === 2);
}
let offers;
{
  const r = await call('authenticated', AYESHA, `SELECT public.job_offers($1)`, [j1]);
  offers = r.value ?? [];
  const asad = offers.find((o) => o.pro_first_name === 'Asad');
  ok('Ayesha sees both offers, first names only', offers.length === 2 && offers.every((o) => !/ /.test(o.pro_first_name)));
  ok('Asad\'s shows as a counter-offer at Rs 2,700', asad?.is_counter === true && Number(asad?.price_paisa) === 270000);
  ok('and nobody\'s number is in them', offers.every((o) => !('phone' in o)));
}
ok('Sara sees no offers on Ayesha\'s job', ((await call('authenticated', SARA, `SELECT public.job_offers($1)`, [j1])).value ?? []).length === 0);
ok('a technician cannot see the other offers', ((await call('authenticated', BILAL, `SELECT public.job_offers($1)`, [j1])).value ?? []).length === 0);
{
  const mine = (await call('authenticated', AYESHA, `SELECT public.my_jobs()`)).value ?? [];
  ok('her job list counts two live offers', Number(mine.find((x) => x.id === j1)?.live_offers) === 2);
}

const bilalOffer = offers.find((o) => o.pro_first_name === 'Bilal').id;
const asadOffer = offers.find((o) => o.pro_first_name === 'Asad').id;

ok('Sara cannot choose for Ayesha', (await call('authenticated', SARA, `SELECT public.choose_offer($1)`, [bilalOffer])).value?.ok === false);
ok('Bilal cannot choose himself', (await call('authenticated', BILAL, `SELECT public.choose_offer($1)`, [bilalOffer])).value?.ok === false);
{
  await setup(`UPDATE public.offers SET expires_at = now() - interval '1 minute' WHERE id = $1`, [asadOffer]);
  const r = await call('authenticated', AYESHA, `SELECT public.choose_offer($1)`, [asadOffer]);
  ok('an offer that has run out cannot be chosen', r.value?.ok === false && /run out/.test(r.value?.why ?? ''));
  await setup(`UPDATE public.offers SET expires_at = now() + interval '10 minutes' WHERE id = $1`, [asadOffer]);
}
ok('Ayesha chooses Bilal', (await call('authenticated', AYESHA, `SELECT public.choose_offer($1)`, [bilalOffer])).value?.ok === true);
{
  const r = await call('authenticated', AYESHA, `SELECT public.choose_offer($1)`, [asadOffer]);
  ok('choosing again, Asad this time, is refused: the job is taken', r.value?.ok === false);
  const { rows } = await setup(`SELECT status, pro_id, agreed_paisa FROM public.jobs WHERE id = $1`, [j1]);
  ok('the job is Bilal\'s, at Rs 2,500', rows[0].status === 'assigned' && rows[0].pro_id === BILAL && Number(rows[0].agreed_paisa) === 250000);
  const { rows: o } = await setup(`SELECT status FROM public.offers WHERE id = $1`, [asadOffer]);
  ok('and Asad\'s offer is turned down', o[0].status === 'rejected');
}
ok('Asad can no longer offer on it', (await call('authenticated', ASAD, OFFER, [j1, 260000, 30, null])).value?.ok === false);
{
  // The second lock, on its own: even if an offer were somehow still pending
  // on a job that is already taken (two taps racing, a bug elsewhere), the
  // job's own status refuses it.
  await setup(`UPDATE public.offers SET status = 'pending', expires_at = now() + interval '10 minutes' WHERE id = $1`, [asadOffer]);
  const r = await call('authenticated', AYESHA, `SELECT public.choose_offer($1)`, [asadOffer]);
  const { rows } = await setup(`SELECT pro_id FROM public.jobs WHERE id = $1`, [j1]);
  ok('a still-pending offer on a taken job cannot take it from Bilal', r.value?.ok === false && rows[0].pro_id === BILAL);
  await setup(`UPDATE public.offers SET status = 'rejected' WHERE id = $1`, [asadOffer]);
}

// =============================================================================
heading('Only now: the address and the numbers');

{
  const mine = (await call('authenticated', BILAL, `SELECT public.pro_my_jobs()`)).value ?? [];
  const j = mine[0] ?? {};
  ok('Bilal gets the house, street, landmark, location and gate note', j.house === 'House 12' && j.street === 'Street 34' && j.landmark && j.lat && j.gate_note);
  ok('and Ayesha\'s first name and number', j.customer_first_name === 'Ayesha' && j.customer_phone === '923001111111');
  ok('and what he keeps: Rs 2,500 less 10%', Number(j.keeps_paisa) === 225000);
}
ok('Asad gets nothing', ((await call('authenticated', ASAD, `SELECT public.pro_my_jobs()`)).value ?? []).length === 0);
{
  const feed = (await call('authenticated', ASAD, FEED)).value?.jobs ?? [];
  ok('the job leaves everybody else\'s feed', !feed.some((x) => x.id === j1));
}
{
  const mine = (await call('authenticated', AYESHA, `SELECT public.my_jobs()`)).value ?? [];
  const j = mine.find((x) => x.id === j1);
  ok('Ayesha gets Bilal\'s first name and number', j?.pro?.first_name === 'Bilal' && j?.pro?.phone === '923003333333');
}
{
  const r = await as('authenticated', ASAD, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`);
  ok('Asad can no longer open the voice note', r.rows.length === 0 && !r.error);
  const b = await as('authenticated', BILAL, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`);
  ok('Bilal still can: it is his job', b.rows.length === 1);
}

heading('When the job is called off');
ok('Ayesha cancels it', (await call('authenticated', AYESHA, `SELECT public.cancel_job($1, 'Fixed itself')`, [j1])).value?.ok === true);
ok('Bilal no longer has her address', ((await call('authenticated', BILAL, `SELECT public.pro_my_jobs()`)).value ?? []).length === 0);
{
  const r = await as('authenticated', BILAL, `SELECT name FROM storage.objects WHERE bucket_id = 'job-media'`);
  ok('nor the voice note', r.rows.length === 0 && !r.error);
  const mine = (await call('authenticated', AYESHA, `SELECT public.my_jobs()`)).value ?? [];
  ok('and his number leaves her screen too', mine.find((x) => x.id === j1)?.pro === null);
}

// =============================================================================
heading('The office');

{
  await setup(`UPDATE public.jobs SET created_at = now() - interval '20 minutes' WHERE id = $1`, [j2]);
  const r = await as('authenticated', OWNER, `SELECT * FROM public.admin_jobs('open')`);
  ok('a job open 20 minutes with no offers is marked "needs you"', r.rows.find((x) => x.id === j2)?.needs_you === true);
}
nothing('a technician gets nothing from the office lists', await as('authenticated', BILAL, `SELECT * FROM public.admin_pros()`));
ok('a technician cannot place a job', (await call('authenticated', BILAL, `SELECT public.admin_assign($1, $2, 250000)`, [j2, BILAL])).value?.ok === false);
ok('the office cannot place it with somebody unapproved', (await call('authenticated', OWNER, `SELECT public.admin_assign($1, $2, 250000)`, [j2, WAQAS])).value?.field === 'pro');
ok('the office places it with Asad, by phone, at Rs 2,600', (await call('authenticated', OWNER, `SELECT public.admin_assign($1, $2, 260000)`, [j2, ASAD])).value?.ok === true);
ok('and Asad now has the address', ((await call('authenticated', ASAD, `SELECT public.pro_my_jobs()`)).value ?? []).some((x) => x.id === j2 && x.house === 'House 12'));
ok('nobody can place it twice', (await call('authenticated', OWNER, `SELECT public.admin_assign($1, $2, 250000)`, [j2, BILAL])).value?.ok === false);

{
  const r = await call('authenticated', OWNER, `SELECT public.admin_cancel_job($1, 'Technician could not come')`, [j2]);
  ok('the office can call off a job that already has a technician', r.value?.ok === true);
  ok('and he loses the address at once', !((await call('authenticated', ASAD, `SELECT public.pro_my_jobs()`)).value ?? []).some((x) => x.id === j2));
  await setup(`UPDATE public.jobs SET status = 'assigned', cancelled_by = NULL, cancel_reason = NULL WHERE id = $1`, [j2]);
}

heading('A technician who is suspended');
await setup(`UPDATE public.pros SET status = 'suspended' WHERE id = $1`, [ASAD]);
ok('loses the address of the job he had', ((await call('authenticated', ASAD, `SELECT public.pro_my_jobs()`)).value ?? []).length === 0);
ok('and his feed', ((await call('authenticated', ASAD, FEED)).value?.jobs ?? []).length === 0);

report();
