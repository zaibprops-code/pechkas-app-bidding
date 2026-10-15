/**
 * Phase 3b: the database tells people's phones.
 *
 * What must hold: the right people are told and nobody else — not the
 * plumber about an AC job, not the technician who is offline, not the one
 * still waiting for approval. Nothing that leaves the database names a
 * street, a house, a landmark, a gate note or a phone number. A phone's
 * address belongs to whoever signed in on it last, and nobody can read
 * anybody's. And a notification that cannot be sent never stops the job.
 *
 * Nothing is sent from here: the stand-in for Supabase's pg_net in
 * supabase/local/bootstrap.sql writes each request into `net.sent` instead.
 */
import { as, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'c1111111-1111-4111-8111-111111111111'; // customer
const SARA = 'c2222222-2222-4222-8222-222222222222'; // another customer
const BILAL = 'c3333333-3333-4333-8333-333333333333'; // AC, F-11, approved, reads Roman Urdu
const ASAD = 'c4444444-4444-4444-8444-444444444444'; // AC, F-11, approved, reads English
const KAMRAN = 'c5555555-5555-4555-8555-555555555555'; // plumber, F-11: wrong trade
const DANISH = 'c6666666-6666-4666-8666-666666666666'; // AC, G-13: wrong sector
const WAQAS = 'c7777777-7777-4777-8777-777777777777'; // AC, F-11, not approved yet
const NOMAN = 'c8888888-8888-4888-8888-888888888888'; // AC, F-11, approved, OFFLINE
const OWNER = 'c9999999-9999-4999-8999-999999999999';

for (const [id, phone, email, role, name] of [
  [AYESHA, '923001111111', null, 'customer', 'Ayesha'],
  [SARA, '923002222222', null, 'customer', 'Sara'],
  [BILAL, '923003333333', null, 'pro', 'Bilal'],
  [ASAD, '923004444444', null, 'pro', 'Asad'],
  [KAMRAN, '923005555555', null, 'pro', 'Kamran'],
  [DANISH, '923006666666', null, 'pro', 'Danish'],
  [WAQAS, '923007777777', null, 'pro', 'Waqas'],
  [NOMAN, '923008888888', null, 'pro', 'Noman'],
  [OWNER, null, 'owner@example.com', null, null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full, trades, sectors, status] of [
  [BILAL, 'Bilal Ahmed', '{ac}', '{F-11,E-11}', 'approved'],
  [ASAD, 'Asad Mehmood', '{ac}', '{F-11}', 'approved'],
  [KAMRAN, 'Kamran Shah', '{plumber}', '{F-11}', 'approved'],
  [DANISH, 'Danish Ali', '{ac}', '{G-13}', 'approved'],
  [WAQAS, 'Waqas Khan', '{ac}', '{F-11}', 'applied'],
  [NOMAN, 'Noman Butt', '{ac}', '{F-11}', 'approved'],
]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, $2, $3, 6, $4, $5)`, [id, full, trades, sectors, status]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
const SAVE = `SELECT public.save_push_token($1, $2, $3)`;

/** Every message that would have left since the last look, flattened. */
let seen = 0;
async function sentSince() {
  const { rows } = await setup(`SELECT id, url, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  return rows.flatMap((r) => r.body.map((m) => ({ ...m, url: r.url })));
}
const to = (messages, name) => messages.filter((m) => m.to === token(name));
const nobodyElse = (messages, names) => messages.every((m) => names.some((n) => m.to === token(n)));

const POST = `SELECT public.post_job(p_trade => $1, p_job_type => NULL, p_description => $2, p_offer_paisa => $3,
  p_when_kind => $4, p_when_part => $5, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_landmark => 'Behind the markaz mosque', p_lat => 33.68, p_lng => 72.99, p_gate_note => 'Chowkidar Rafiq will open',
  p_media => '[]'::jsonb)`;

// =============================================================================
heading('A phone\'s address');

ok('a stranger cannot save one', Boolean((await as('anon', null, SAVE, [token('anon'), 'android', 'en'])).error));
ok('rubbish is refused', (await call('authenticated', AYESHA, SAVE, ['https://evil.example/hook', 'android', 'en'])).value?.ok === false);
ok('an unknown phone type is refused', (await call('authenticated', AYESHA, SAVE, [token('ayesha'), 'nokia', 'en'])).value?.ok === false);
for (const [who, name, lang] of [
  [AYESHA, 'ayesha', 'en'], [SARA, 'sara', 'en'], [BILAL, 'bilal', 'ur'], [ASAD, 'asad', 'en'],
  [KAMRAN, 'kamran', 'ur'], [DANISH, 'danish', 'ur'], [WAQAS, 'waqas', 'ur'], [NOMAN, 'noman', 'ur'],
]) {
  const r = await call('authenticated', who, SAVE, [token(name), 'android', lang]);
  if (!r.value?.ok) ok(`${name} saves this phone`, false, JSON.stringify(r));
}
ok('everybody saved their phone', (await setup(`SELECT count(*)::int AS n FROM public.push_tokens`)).rows[0].n === 8);

nothing('nobody can read the phones table', await as('authenticated', AYESHA, `SELECT token FROM public.push_tokens`));
nothing('not even their own row', await as('authenticated', AYESHA, `SELECT token FROM public.push_tokens WHERE user_id = $1`, [AYESHA]));
nothing('a stranger cannot read it', await as('anon', null, `SELECT token FROM public.push_tokens`));
denied('nobody can write it directly', await as('authenticated', SARA, `INSERT INTO public.push_tokens (token, user_id, platform) VALUES ($1, $2, 'android')`, [token('sneak'), SARA]));
nothing('nobody can read what was sent', await as('authenticated', AYESHA, `SELECT * FROM public.push_log`));
ok('nobody can send one themselves', Boolean((await as('authenticated', SARA, `SELECT public.send_push($1, 'x', NULL, '/', 'Hello', 'Hello')`, [AYESHA])).error));
ok('nobody can ask whether somebody ELSE may see a job', Boolean((await as('authenticated', SARA, `SELECT public.pro_may_see_as(gen_random_uuid(), $1)`, [BILAL])).error));

{
  await call('authenticated', SARA, `SELECT public.forget_push_token($1)`, [token('ayesha')]);
  ok('Sara cannot make Ayesha\'s phone forget her', (await setup(`SELECT user_id FROM public.push_tokens WHERE token = $1`, [token('ayesha')])).rows[0]?.user_id === AYESHA);
}
{
  // Sara signs in on a borrowed phone, then signs out again.
  await call('authenticated', SARA, SAVE, [token('borrowed'), 'android', 'en']);
  await call('authenticated', SARA, `SELECT public.forget_push_token($1)`, [token('borrowed')]);
  ok('signing out makes the phone forget', (await setup(`SELECT count(*)::int AS n FROM public.push_tokens WHERE token = $1`, [token('borrowed')])).rows[0].n === 0);
  // The same phone, used by Sara and then by Ayesha without signing out between.
  await call('authenticated', SARA, SAVE, [token('shared'), 'android', 'en']);
  await call('authenticated', AYESHA, SAVE, [token('shared'), 'android', 'en']);
  ok('a phone signed in as somebody else moves to them', (await setup(`SELECT user_id FROM public.push_tokens WHERE token = $1`, [token('shared')])).rows[0]?.user_id === AYESHA);
  await call('authenticated', AYESHA, `SELECT public.forget_push_token($1)`, [token('shared')]);
}
{
  for (let i = 0; i < 7; i += 1) await call('authenticated', SARA, SAVE, [token(`old${i}`), 'android', 'en']);
  ok('somebody with a drawer of old phones keeps the five newest', (await setup(`SELECT count(*)::int AS n FROM public.push_tokens WHERE user_id = $1`, [SARA])).rows[0].n === 5);
  await setup(`DELETE FROM public.push_tokens WHERE user_id = $1`, [SARA]);
  await call('authenticated', SARA, SAVE, [token('sara'), 'android', 'en']);
}

for (const who of [BILAL, ASAD, KAMRAN, DANISH]) await call('authenticated', who, `SELECT public.pro_set_online(true)`);
// Waqas cannot go online, Noman simply has not.
await sentSince();

// =============================================================================
heading('A job is posted');

const job1 = (await call('authenticated', AYESHA, POST, ['ac', 'AC not cooling at all', 550000, 'now', null])).value;
ok('Ayesha posts an AC job in F-11', job1?.ok === true, JSON.stringify(job1));
let all = [];
{
  const m = await sentSince();
  all.push(...m);
  ok('Bilal is told', to(m, 'bilal').length === 1);
  ok('Asad is told', to(m, 'asad').length === 1);
  ok('only those two: not the plumber, not G-13, not the unapproved, not the offline one, not Ayesha', m.length === 2 && nobodyElse(m, ['bilal', 'asad']), JSON.stringify(m.map((x) => x.to)));
  ok('it goes to Expo\'s push service', m.every((x) => x.url === 'https://exp.host/--/api/v2/push/send'));
  const b = to(m, 'bilal')[0];
  const a = to(m, 'asad')[0];
  ok('Bilal reads it in Roman Urdu', b?.title === 'Naya kaam: AC · F-11' && /Rs 5,500 · Abhi/.test(b.body), JSON.stringify(b));
  ok('Asad reads it in English', a?.title === 'New job: AC · F-11' && /Ayesha · Rs 5,500 · As soon as possible/.test(a.body), JSON.stringify(a));
  ok('tapping it opens the technician\'s screen', b?.data?.url === '/pro' && b?.channelId === 'jobs');
}

{
  await setup(`INSERT INTO net.fail VALUES (true)`);
  const r = (await call('authenticated', AYESHA, POST, ['ac', 'Second AC also warm', 300000, 'tomorrow', 'evening'])).value;
  await setup(`DELETE FROM net.fail`);
  ok('a job still posts when the push service cannot be reached', r?.ok === true, JSON.stringify(r));
  const log = (await setup(`SELECT problem FROM public.push_log WHERE kind = 'new_job' ORDER BY id DESC LIMIT 1`)).rows[0];
  ok('and the failure is written down for the owner', /could not be reached/.test(log?.problem ?? ''), JSON.stringify(log));
  ok('the job really is there', (await setup(`SELECT count(*)::int AS n FROM public.jobs WHERE customer_id = $1`, [AYESHA])).rows[0].n === 2);
}
{
  const r = (await call('authenticated', AYESHA, POST, ['ac', 'Third one, booked', 300000, 'tomorrow', 'evening'])).value;
  const m = await sentSince();
  all.push(...m);
  ok('a job booked for later says when', /Kal shaam/.test(to(m, 'bilal')[0]?.body ?? '') && /Tomorrow evening/.test(to(m, 'asad')[0]?.body ?? ''), JSON.stringify(m.map((x) => x.body)));
  await call('authenticated', AYESHA, `SELECT public.cancel_job($1)`, [r.job_id ?? r.id]);
  ok('cancelling an open job herself tells nobody', (await sentSince()).length === 0);
}
{
  await setup(`DELETE FROM public.push_tokens WHERE user_id = $1`, [ASAD]);
  const sr = await call('authenticated', SARA, POST, ['ac', 'Upstairs AC blowing warm air', 400000, 'now', null]);
  ok('Sara posts an AC job too', sr.value?.ok === true, JSON.stringify(sr.value ?? sr.error));
  const m = await sentSince();
  all.push(...m);
  ok('a technician with no phone saved is simply not told', to(m, 'bilal').length === 1 && m.length === 1);
  const log = (await setup(`SELECT phones, problem FROM public.push_log WHERE user_id = $1 ORDER BY id DESC LIMIT 1`, [ASAD])).rows[0];
  ok('and the owner can see why', log?.phones === 0 && /no phone/.test(log?.problem ?? ''), JSON.stringify(log));
  await call('authenticated', ASAD, SAVE, [token('asad'), 'android', 'en']);
}

const jobId = (await setup(`SELECT id FROM public.jobs WHERE description = 'AC not cooling at all'`)).rows[0].id;
const ref = (await setup(`SELECT ref FROM public.jobs WHERE id = $1`, [jobId])).rows[0].ref;

// =============================================================================
heading('Offers');

ok('Bilal takes her price, 20 minutes away', (await call('authenticated', BILAL, `SELECT public.make_offer($1, 550000, 20, NULL)`, [jobId])).value?.ok === true);
{
  const m = await sentSince();
  all.push(...m);
  const a = to(m, 'ayesha')[0];
  ok('Ayesha is told, and nobody else', m.length === 1 && Boolean(a), JSON.stringify(m.map((x) => x.to)));
  ok('it says who, the price, and how soon', a?.title === `New offer on ${ref}: Rs 5,500` && /^Bilal took your price and can be there in 20 minutes/.test(a?.body ?? ''), JSON.stringify(a));
  ok('tapping it opens her jobs', a?.data?.url === '/jobs');
}
ok('Bilal changes his mind about the price', (await call('authenticated', BILAL, `SELECT public.make_offer($1, 560000, 20, NULL)`, [jobId])).value?.ok === true);
ok('nudging a live offer does not buzz her again', (await sentSince()).length === 0);
await call('authenticated', BILAL, `SELECT public.withdraw_offer($1)`, [jobId]);
ok('taking it back tells her nothing', (await sentSince()).length === 0);
await call('authenticated', BILAL, `SELECT public.make_offer($1, 550000, 20, NULL)`, [jobId]);
ok('offering again after taking it back does', to(await sentSince(), 'ayesha').length === 1);
ok('Asad asks Rs 6,000', (await call('authenticated', ASAD, `SELECT public.make_offer($1, 600000, 45, 'I will bring the gauge')`, [jobId])).value?.ok === true);
{
  const m = await sentSince();
  all.push(...m);
  ok('his counter says so', /^Asad asks Rs 6,000 and can be there in 45 minutes/.test(to(m, 'ayesha')[0]?.body ?? ''), JSON.stringify(m));
}
{
  await setup(`UPDATE public.offers SET expires_at = now() - interval '1 minute' WHERE pro_id = $1 AND job_id = $2`, [ASAD, jobId]);
  await call('authenticated', ASAD, `SELECT public.make_offer($1, 600000, 45, NULL)`, [jobId]);
  ok('renewing an offer that ran out tells her again', to(await sentSince(), 'ayesha').length === 1);
}

// =============================================================================
heading('Choosing');

{
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [jobId, BILAL])).rows[0].id;
  ok('Ayesha chooses Bilal', (await call('authenticated', AYESHA, `SELECT public.choose_offer($1)`, [offer])).value?.ok === true);
  const m = await sentSince();
  all.push(...m);
  const b = to(m, 'bilal')[0];
  ok('Bilal is told, in Roman Urdu', b?.title === `Aap chun liye gaye: ${ref}` && /Ayesha ne Rs 5,500 par aap ko chuna/.test(b?.body ?? ''), JSON.stringify(b));
  const a = to(m, 'asad')[0];
  ok('Asad, whose offer was live, is told she chose someone else', a?.title === `The customer chose someone else: ${ref}` && /^Not this time/.test(a?.body ?? ''), JSON.stringify(a));
  ok('nobody else (Ayesha chose, so she knows)', m.length === 2, JSON.stringify(m.map((x) => x.to)));
}

// =============================================================================
heading('Called off');

ok('Ayesha cancels the job Bilal is on', (await call('authenticated', AYESHA, `SELECT public.cancel_job($1, 'Fixed itself')`, [jobId])).value?.ok === true);
{
  const m = await sentSince();
  all.push(...m);
  const b = to(m, 'bilal')[0];
  ok('Bilal is told not to go', b?.title === `Kaam cancel: ${ref}` && /^Mat jayein/.test(b?.body ?? ''), JSON.stringify(b));
  ok('only Bilal', m.length === 1);
}

// =============================================================================
heading('The office');

{
  const sara = (await setup(`SELECT id, ref FROM public.jobs WHERE customer_id = $1`, [SARA])).rows[0];
  ok('the office places Sara\'s job with Asad', (await call('authenticated', OWNER, `SELECT public.admin_assign($1, $2, 450000)`, [sara.id, ASAD])).value?.ok === true);
  let m = await sentSince();
  all.push(...m);
  ok('Asad is told the office gave it to him', to(m, 'asad')[0]?.title === `Pechkas gave you a job: ${sara.ref}`, JSON.stringify(m));
  ok('Sara is told who is coming, since she did not choose', to(m, 'sara')[0]?.title === `Asad is your technician for ${sara.ref}`, JSON.stringify(m));
  ok('those two only', m.length === 2);

  ok('the office cancels it', (await call('authenticated', OWNER, `SELECT public.admin_cancel_job($1, 'Asad is ill. House 12 gate code 4471')`, [sara.id])).value?.ok === true);
  m = await sentSince();
  all.push(...m);
  ok('Asad is told not to go', /^Job cancelled/.test(to(m, 'asad')[0]?.title ?? ''));
  ok('Sara is told, without the office\'s words on her lock screen', to(m, 'sara')[0]?.title === `Pechkas cancelled ${sara.ref}` && !/4471|House 12|is ill/.test(to(m, 'sara')[0]?.body ?? ''), JSON.stringify(m));

  const pros = (await call('authenticated', OWNER, `SELECT * FROM public.admin_pros()`)).rows;
  ok('the office can see who can be reached', pros.length === 5 && pros.every((p) => p.notifications === true), JSON.stringify(pros.map((p) => [p.full_name, p.notifications])));
  nothing('a technician cannot list them', await as('authenticated', BILAL, `SELECT * FROM public.admin_pros()`));
}

// =============================================================================
heading('Offers on a job that is called off');

{
  const j = (await call('authenticated', AYESHA, POST, ['ac', 'Hall AC dripping water', 300000, 'now', null])).value;
  await sentSince();
  await call('authenticated', BILAL, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j.id]);
  await call('authenticated', ASAD, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j.id]);
  await call('authenticated', ASAD, `SELECT public.withdraw_offer($1)`, [j.id]);
  await sentSince();
  ok('Ayesha cancels it while Bilal\'s offer is live', (await call('authenticated', AYESHA, `SELECT public.cancel_job($1)`, [j.id])).value?.ok === true);
  const m = await sentSince();
  all.push(...m);
  ok('Bilal is told his offer is closed', to(m, 'bilal')[0]?.title === `Kaam cancel: ${j.ref}` && /offer band/.test(to(m, 'bilal')[0]?.body ?? ''), JSON.stringify(m));
  ok('Asad, who had taken his back, is not', to(m, 'asad').length === 0 && m.length === 1);
}
{
  const j = (await call('authenticated', AYESHA, POST, ['ac', 'Bedroom AC making a noise', 300000, 'now', null])).value;
  await call('authenticated', BILAL, `SELECT public.make_offer($1, 300000, 30, NULL)`, [j.id]);
  await call('authenticated', ASAD, `SELECT public.make_offer($1, 320000, 30, NULL)`, [j.id]);
  await setup(`UPDATE public.offers SET expires_at = now() - interval '1 minute' WHERE pro_id = $1 AND job_id = $2`, [ASAD, j.id]);
  await sentSince();
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [j.id, BILAL])).rows[0].id;
  await call('authenticated', AYESHA, `SELECT public.choose_offer($1)`, [offer]);
  const m = await sentSince();
  all.push(...m);
  ok('a technician whose offer had already run out is not told he lost', to(m, 'asad').length === 0 && to(m, 'bilal').length === 1, JSON.stringify(m.map((x) => x.to)));
  await call('authenticated', AYESHA, `SELECT public.cancel_job($1)`, [j.id]);
  await sentSince();
}

// =============================================================================
heading('The office is told when nobody offers');

const ZOHAIB_PHONE = 'cabcabca-0000-4000-8000-000000000001'; // the owner, signed in to the app with his mobile
await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, '923009999999')`, [ZOHAIB_PHONE]);
await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'customer', 'Zohaib')`, [ZOHAIB_PHONE]);
await call('authenticated', ZOHAIB_PHONE, SAVE, [token('zohaib'), 'android', 'en']);

ok('the clock is set to look every minute', (await setup(`SELECT schedule, command FROM cron.job WHERE jobname = 'pechkas-needs-you'`)).rows[0]?.schedule === '* * * * *');
ok('nobody can set off the alerts themselves', Boolean((await as('authenticated', OWNER, `SELECT public.alert_needs_you()`)).error));
ok('a technician cannot set an alert number', (await call('authenticated', BILAL, `SELECT public.admin_set_alert_phone('03001234567')`)).value?.ok === false);
ok('a number that is not a mobile is refused', (await call('authenticated', OWNER, `SELECT public.admin_set_alert_phone('12345')`)).value?.field === 'phone');
ok('the owner sets his own', (await call('authenticated', OWNER, `SELECT public.admin_set_alert_phone('+923009999999')`)).value?.ok === true);
{
  const r = (await call('authenticated', OWNER, `SELECT public.admin_alerts()`)).value;
  ok('and the panel can see a phone there will hear it', r?.alert_phone === '923009999999' && r?.phones === 1 && r?.minutes === 15, JSON.stringify(r));
  ok('a technician cannot see it', (await call('authenticated', BILAL, `SELECT public.admin_alerts()`)).value == null);
}
{
  const quiet = (await call('authenticated', AYESHA, POST, ['ac', 'Nobody wants this one', 300000, 'now', null])).value;
  const offered = (await call('authenticated', AYESHA, POST, ['ac', 'This one has an offer', 300000, 'now', null])).value;
  const ancient = (await call('authenticated', AYESHA, POST, ['ac', 'Posted two days ago', 300000, 'now', null])).value;
  await call('authenticated', BILAL, `SELECT public.make_offer($1, 300000, 30, NULL)`, [offered.id]);
  await setup(`UPDATE public.jobs SET created_at = now() - interval '20 minutes' WHERE id = ANY($1)`, [[quiet.id, offered.id]]);
  await setup(`UPDATE public.jobs SET created_at = now() - interval '2 days' WHERE id = $1`, [ancient.id]);
  await sentSince();

  const n = (await setup(`SELECT public.alert_needs_you() AS n`)).rows[0].n;
  const m = await sentSince();
  all.push(...m);
  const z = to(m, 'zohaib')[0];
  ok('one job needs him: not the one with an offer, not the two-day-old one', n === 1 && m.length === 1, JSON.stringify({ n, m }));
  ok('it says which, and what to do', z?.title === `No offers yet on ${quiet.ref}` && /^AC · F-11 · Rs 3,000, waiting 20 minutes/.test(z?.body ?? ''), JSON.stringify(z));
  ok('and only once, not every minute', (await setup(`SELECT public.alert_needs_you() AS n`)).rows[0].n === 0 && (await sentSince()).length === 0);

  await setup(`UPDATE public.staff SET active = false WHERE id = $1`, [OWNER]);
  const later = (await call('authenticated', AYESHA, POST, ['ac', 'Another quiet one', 300000, 'now', null])).value;
  await setup(`UPDATE public.jobs SET created_at = now() - interval '20 minutes' WHERE id = $1`, [later.id]);
  await sentSince();
  await setup(`SELECT public.alert_needs_you()`);
  ok('somebody switched off the office list is not told', (await sentSince()).length === 0);
  await setup(`UPDATE public.staff SET active = true WHERE id = $1`, [OWNER]);
  for (const j of [quiet, offered, ancient, later]) await call('authenticated', AYESHA, `SELECT public.cancel_job($1)`, [j.id]);
  await sentSince();
}

// =============================================================================
heading('The words');

nothing('nobody can read the words table directly', await as('authenticated', AYESHA, `SELECT * FROM public.push_words`));
ok('nobody can make the database say something', Boolean((await as('authenticated', AYESHA, `SELECT public.say('new_job.title', 'en')`)).error));
ok('every slot in every message was filled', all.every((m) => !/\{[a-z_]+\}/.test(`${m.title} ${m.body}`)), JSON.stringify(all.find((m) => /\{/.test(`${m.title} ${m.body}`))));
{
  const urdu = all.filter((m) => m.to === token('bilal'));
  ok('Bilal, who reads Roman Urdu, never got an English line', urdu.length >= 4 && urdu.every((m) => !/ the | you |Open it|Do not go/i.test(` ${m.title} ${m.body} `)), JSON.stringify(urdu.map((m) => m.title)));
}
{
  const { rows } = await setup(`SELECT key FROM public.push_words WHERE ur IS NULL AND key !~ '^(offer|office_assigned|office_cancelled|needs_you)\.'`);
  ok('every message a technician can get has a Roman Urdu line', rows.length === 0, JSON.stringify(rows));
}

// =============================================================================
heading('Nothing private ever leaves');

{
  ok('a fair number of messages were looked at', all.length >= 12, String(all.length));
  const text = all.map((m) => `${m.title} ${m.body} ${JSON.stringify(m.data)}`).join('\n');
  for (const [what, pattern] of [
    ['a street', /Street 34/],
    ['a house', /House 12/],
    ['a landmark', /markaz/i],
    ['a gate note', /Chowkidar|Rafiq/i],
    ['a phone number', /0?3\d{2}\s?\d{7}|92\d{10}/],
    ['a surname', /Ahmed|Mehmood/],
    ['a location', /33\.68|72\.99/],
  ]) ok(`no notification names ${what}`, !pattern.test(text), (text.match(pattern) ?? [])[0]);
}

// =============================================================================
heading('Deleting an account');

await call('authenticated', SARA, `SELECT public.delete_my_account()`);
ok('takes the phone\'s address with it', (await setup(`SELECT count(*)::int AS n FROM public.push_tokens WHERE user_id = $1`, [SARA])).rows[0].n === 0);

report();
