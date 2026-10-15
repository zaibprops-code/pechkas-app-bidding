/**
 * Phase 4: doing the job.
 *
 * What must hold: only the chosen technician moves his job, forward, one step
 * at a time, from where it really is. Nobody starts without the customer's
 * code, and wrong codes are remembered even though each one is refused. A
 * price changes only by the customer's own tap; declined, only the visit fee
 * is owed. Photos are required, real, and seen by the right people. The chat
 * is between those two only, and its words never reach a lock screen. The
 * office sees everything that happened and can change none of it.
 */
import { as, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'd1111111-1111-4111-8111-111111111111'; // customer
const SARA = 'd2222222-2222-4222-8222-222222222222'; // another customer
const BILAL = 'd3333333-3333-4333-8333-333333333333'; // AC, F-11, approved, Roman Urdu
const ASAD = 'd4444444-4444-4444-8444-444444444444'; // AC, F-11, approved, the other one
const OWNER = 'd9999999-9999-4999-8999-999999999999';
const OWNER_PHONE = 'd8888888-8888-4888-8888-888888888888'; // the owner, in the app

for (const [id, phone, email, role, name] of [
  [AYESHA, '923001111111', null, 'customer', 'Ayesha'],
  [SARA, '923002222222', null, 'customer', 'Sara'],
  [BILAL, '923003333333', null, 'pro', 'Bilal'],
  [ASAD, '923004444444', null, 'pro', 'Asad'],
  [OWNER, null, 'owner@example.com', null, null],
  [OWNER_PHONE, '923009999999', null, 'customer', 'Zohaib'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name, lang] of [[AYESHA, 'ayesha', 'en'], [SARA, 'sara', 'en'], [BILAL, 'bilal', 'ur'], [ASAD, 'asad', 'en'], [OWNER_PHONE, 'zohaib', 'en']]) {
  await me(who, `SELECT public.save_push_token($1, 'android', $2)`, [token(name), lang]);
}
await me(OWNER, `SELECT public.admin_set_alert_phone('923009999999')`);

let seen = 0;
const all = [];
async function sent() {
  const { rows } = await setup(`SELECT id, body FROM net.sent WHERE id > $1 ORDER BY id`, [seen]);
  if (rows.length) seen = rows[rows.length - 1].id;
  const m = rows.flatMap((r) => r.body);
  all.push(...m);
  return m;
}
const to = (m, name) => m.filter((x) => x.to === token(name));
const upload = async (who, name) => {
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const mine = async (who, id) => ((await me(who, `SELECT public.my_jobs()`)).value ?? []).find((j) => j.id === id);
const proJobs = async (who) => (await me(who, `SELECT public.pro_my_jobs()`)).value ?? [];

let n = 0;
/** A job Ayesha posts, Bilal offers on at her price, and she chooses him. */
async function chosenJob() {
  n += 1;
  const posted = (await me(AYESHA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => 550000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`AC number ${n} not cooling`])).value;
  await me(BILAL, `SELECT public.make_offer($1, 550000, 20, NULL)`, [posted.id]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [posted.id, BILAL])).rows[0].id;
  const r = (await me(AYESHA, `SELECT public.choose_offer($1)`, [offer])).value;
  if (!r?.ok) throw new Error(`could not set up a chosen job: ${JSON.stringify(r)}`);
  await sent();
  return posted;
}
const STEP = `SELECT public.tech_step($1, $2)`;
const START = `SELECT public.start_work($1, $2, $3::jsonb)`;

// =============================================================================
heading('Chosen: a start code, for her eyes only');

const j1 = await chosenJob();
{
  const row = await job(j1.id);
  ok('the job is at its first step', row.status === 'assigned' && row.stage === 'chosen');
  ok('and has a four-digit start code', /^[0-9]{4}$/.test(row.start_code ?? ''));
  const a = await mine(AYESHA, j1.id);
  ok('Ayesha sees her code', a?.start_code === row.start_code);
  const b = (await proJobs(BILAL)).find((x) => x.id === j1.id);
  ok('Bilal does not', b && !('start_code' in b) && !JSON.stringify(b).includes(`"${row.start_code}"`));
  ok('Sara does not see the job at all', !(await mine(SARA, j1.id)));
  nothing('nobody can read the jobs table for it', await as('authenticated', BILAL, `SELECT start_code FROM public.jobs WHERE id = $1`, [j1.id]));
  ok('the codes differ from job to job', (await setup(`SELECT count(DISTINCT public.new_start_code())::int AS n FROM generate_series(1, 50)`)).rows[0].n > 30);
}

// =============================================================================
heading('On my way, arrived: his steps, forward, once');

ok('Asad cannot move Bilal\'s job', (await me(ASAD, STEP, [j1.id, 'chosen'])).value?.ok === false);
ok('Ayesha cannot either', (await me(AYESHA, STEP, [j1.id, 'chosen'])).value?.ok === false);
ok('Bilal cannot skip to Arrived', (await me(BILAL, STEP, [j1.id, 'on_way'])).value?.field === 'stage');
ok('Bilal sets off', (await me(BILAL, STEP, [j1.id, 'chosen'])).value?.ok === true);
{
  const m = await sent();
  const a = to(m, 'ayesha')[0];
  ok('Ayesha is told he is on his way', a?.title === `Bilal is on his way to ${j1.ref}`, JSON.stringify(m));
  const c = (await job(j1.id)).start_code;
  ok('and the code is not in the notification', !m.some((x) => `${x.title} ${x.body}`.includes(c)));
}
ok('the same tap again moves nothing', (await me(BILAL, STEP, [j1.id, 'chosen'])).value?.field === 'stage' && (await job(j1.id)).stage === 'on_way');
ok('Bilal arrives', (await me(BILAL, STEP, [j1.id, 'on_way'])).value?.ok === true);
ok('Ayesha is told he is at the door', to(await sent(), 'ayesha')[0]?.title === 'Bilal has arrived');
ok('Arrived cannot be skipped past without the code', (await me(BILAL, STEP, [j1.id, 'arrived'])).value?.field === 'stage');
ok('Ayesha cannot cancel with him at the gate', (await me(AYESHA, `SELECT public.cancel_job($1)`, [j1.id])).value?.ok === false);

// =============================================================================
heading('The start code');

const before = await upload(BILAL, `${BILAL}/before-1.jpg`);
const code = (await job(j1.id)).start_code;
const wrong = code === '0000' ? '1111' : '0000';
ok('no photo, no start', (await me(BILAL, START, [j1.id, code, '[]'])).value?.field === 'photos');
ok('a photo that never uploaded is refused', (await me(BILAL, START, [j1.id, code, JSON.stringify([`${BILAL}/ghost.jpg`])])).value?.field === 'photos');
{
  const saras = await upload(SARA, `${SARA}/her-photo.jpg`);
  ok('a photo from somebody else\'s folder is refused', (await me(BILAL, START, [j1.id, code, JSON.stringify([saras])])).value?.field === 'photos');
}
{
  const r = (await me(BILAL, START, [j1.id, wrong, JSON.stringify([before])])).value;
  ok('a wrong code is refused', r?.field === 'code' && /not the code/.test(r?.why ?? ''), JSON.stringify(r));
  ok('and remembered, though it was refused', (await job(j1.id)).code_tries === 1);
  ok('he is told how many tries are left', (await proJobs(BILAL)).find((x) => x.id === j1.id)?.code_tries_left === 4);
}
for (let i = 0; i < 4; i += 1) await me(BILAL, START, [j1.id, wrong, JSON.stringify([before])]);
{
  const row = await job(j1.id);
  ok('five wrong codes lock it', row.code_locked_at !== null && row.stage === 'arrived');
  const m = await sent();
  ok('and the office is told on the owner\'s phone', to(m, 'zohaib')[0]?.title === `Start code locked on ${j1.ref}`, JSON.stringify(m));
  ok('locked, even the right code is refused', (await me(BILAL, START, [j1.id, code, JSON.stringify([before])])).value?.field === 'code');
  ok('Ayesha\'s screen knows it is locked', (await mine(AYESHA, j1.id))?.code_locked === true);
  const list = (await me(OWNER, `SELECT * FROM public.admin_jobs('assigned')`)).rows;
  ok('the admin panel says why it needs you', list.find((x) => x.id === j1.id)?.why === 'Start code locked');
  ok('a technician cannot unlock it', (await me(BILAL, `SELECT public.admin_unlock_code($1)`, [j1.id])).value?.ok === false);
  ok('the office unlocks it, after ringing them', (await me(OWNER, `SELECT public.admin_unlock_code($1)`, [j1.id])).value?.ok === true);
}
ok('the right code and a photo start the job', (await me(BILAL, START, [j1.id, ` ${code} `, JSON.stringify([before])])).value?.ok === true);
{
  const row = await job(j1.id);
  ok('it is working, with the time it started', row.stage === 'working' && row.started_at !== null);
  ok('the code is no longer shown to her', (await mine(AYESHA, j1.id))?.start_code == null);
  const see = (who) => as('authenticated', who, `SELECT name FROM storage.objects WHERE name = $1`, [before]);
  ok('Ayesha can open his before photo', (await see(AYESHA)).rows.length === 1);
  nothing('Sara cannot', await see(SARA));
  nothing('Asad cannot', await see(ASAD));
  ok('a photo cannot be used twice', (await me(BILAL, `SELECT public.finish_work($1, $2::jsonb)`, [j1.id, JSON.stringify([before])])).value?.field === 'photos');
}

// =============================================================================
heading('A new price at the door');

const CHANGE = `SELECT public.ask_change($1, $2, $3, $4)`;
const receipt = await upload(BILAL, `${BILAL}/compressor-receipt.jpg`);
ok('Asad cannot ask for a new price on Bilal\'s job', (await me(ASAD, CHANGE, [j1.id, 700000, 'Compressor is gone', receipt])).value?.ok === false);
ok('a reason is needed', (await me(BILAL, CHANGE, [j1.id, 700000, '', receipt])).value?.field === 'reason');
ok('a photo is needed', (await me(BILAL, CHANGE, [j1.id, 700000, 'Compressor capacitor burnt', null])).value?.field === 'photos');
ok('whole rupees only', (await me(BILAL, CHANGE, [j1.id, 700050, 'Compressor capacitor burnt', receipt])).value?.field === 'price');
ok('Bilal asks Rs 7,000, with a reason and the receipt', (await me(BILAL, CHANGE, [j1.id, 700000, 'Compressor capacitor burnt, new one Rs 1,500', receipt])).value?.ok === true);
ok('not a second one while she has not answered', (await me(BILAL, CHANGE, [j1.id, 800000, 'And the fan motor too', receipt])).value?.ok === false);
ok('he cannot finish while she has not answered', (await me(BILAL, `SELECT public.finish_work($1, '[]'::jsonb)`, [j1.id])).value?.field === 'stage');
{
  const m = await sent();
  const a = to(m, 'ayesha')[0];
  ok('Ayesha is told, with both prices', a?.title === 'Bilal asks a new price: Rs 7,000' && /instead of Rs 5,500/.test(a?.body ?? ''), JSON.stringify(a));
  ok('the price has NOT changed yet', Number((await job(j1.id)).agreed_paisa) === 550000);
  const c = (await mine(AYESHA, j1.id))?.change;
  ok('her screen shows the request, the reason and the photo', c?.price_paisa === 700000 && /capacitor/.test(c?.reason) && c?.photo === receipt);
  ok('and what declining would cost her', (await mine(AYESHA, j1.id))?.visit_fee_paisa === 30000);
  ok('she can open the receipt photo', (await as('authenticated', AYESHA, `SELECT name FROM storage.objects WHERE name = $1`, [receipt])).rows.length === 1);
  ok('Sara cannot answer it', (await me(SARA, `SELECT public.decide_change($1, true)`, [c.id])).value?.ok === false);
  ok('Bilal cannot answer it himself', (await me(BILAL, `SELECT public.decide_change($1, true)`, [c.id])).value?.ok === false);
  denied('nobody can write a price straight into the job', await as('authenticated', BILAL, `UPDATE public.jobs SET agreed_paisa = 9900000 WHERE id = $1`, [j1.id]));
  denied('nor approve a request by hand', await as('authenticated', AYESHA, `UPDATE public.job_changes SET status = 'approved' WHERE id = $1`, [c.id]));
  ok('Ayesha approves', (await me(AYESHA, `SELECT public.decide_change($1, true)`, [c.id])).value?.ok === true);
  ok('now it is the agreed price', Number((await job(j1.id)).agreed_paisa) === 700000);
  ok('Bilal is told, in Roman Urdu', to(await sent(), 'bilal')[0]?.title === 'Nayi price manzoor: Rs 7,000');
  ok('answering twice does nothing', (await me(AYESHA, `SELECT public.decide_change($1, false)`, [c.id])).value?.ok === false && (await job(j1.id)).status === 'assigned');
}

// =============================================================================
heading('Done');

{
  ok('no after photo, not done', (await me(BILAL, `SELECT public.finish_work($1, '[]'::jsonb)`, [j1.id])).value?.field === 'photos');
  const after = await upload(BILAL, `${BILAL}/after-1.jpg`);
  const r = (await me(BILAL, `SELECT public.finish_work($1, $2::jsonb)`, [j1.id, JSON.stringify([after])])).value;
  ok('Bilal marks it done', r?.ok === true && r?.collect_paisa === 700000, JSON.stringify(r));
  const row = await job(j1.id);
  ok('it is done, and what he collects is fixed', row.status === 'done' && Number(row.collect_paisa) === 700000 && row.stage === null);
  ok('Ayesha is told what to pay', /Pay Bilal Rs 7,000 in cash/.test(to(await sent(), 'ayesha')[0]?.body ?? ''));
  ok('the address has left Bilal\'s phone', !(await proJobs(BILAL)).some((x) => x.id === j1.id));
  const fin = ((await me(BILAL, `SELECT public.pro_finished()`)).value ?? []).find((x) => x.id === j1.id);
  ok('his finished list says what to collect, and nothing about the house', fin?.collect_paisa === 700000 && !/Street|House|markaz|Rafiq/.test(JSON.stringify(fin)));
  const a = await mine(AYESHA, j1.id);
  ok('Ayesha keeps his first name, no longer his number', a?.pro?.first_name === 'Bilal' && !('phone' in (a?.pro ?? {})));
  ok('she sees the before and after photos', a?.photos?.map((p) => p.stage).join() === 'before,change,after');
  ok('nothing more can be done to a finished job', (await me(BILAL, STEP, [j1.id, 'working'])).value?.ok === false);
}

// =============================================================================
heading('Something is wrong');

{
  const R = `SELECT public.report_problem($1, $2)`;
  ok('Sara cannot report Ayesha\'s job', (await me(SARA, R, [j1.id, 'Not cooling again'])).value?.ok === false);
  ok('a few words are needed', (await me(AYESHA, R, [j1.id, 'bad'])).value?.field === 'problem');
  ok('Ayesha reports it', (await me(AYESHA, R, [j1.id, 'Cooling for an hour, then warm again'])).value?.ok === true);
  ok('the owner\'s phone is told', to(await sent(), 'zohaib')[0]?.title === `Problem reported on ${j1.ref}`);
  ok('once is enough', (await me(AYESHA, R, [j1.id, 'Still warm, again'])).value?.ok === false);
  ok('the admin panel shows it first', (await me(OWNER, `SELECT * FROM public.admin_jobs('finished')`)).rows.find((x) => x.id === j1.id)?.why === 'Problem reported');
}

// =============================================================================
heading('Declined: the job stops, and only the visit fee is owed');

{
  const j2 = await chosenJob();
  await me(BILAL, STEP, [j2.id, 'chosen']);
  await me(BILAL, STEP, [j2.id, 'on_way']);
  const b2 = await upload(BILAL, `${BILAL}/before-2.jpg`);
  await me(BILAL, START, [j2.id, (await job(j2.id)).start_code, JSON.stringify([b2])]);
  const p2 = await upload(BILAL, `${BILAL}/change-2.jpg`);
  await me(BILAL, CHANGE, [j2.id, 1500000, 'The whole outdoor unit has to be replaced', p2]);
  await sent();
  const c = (await mine(AYESHA, j2.id)).change;
  ok('Ayesha declines Rs 15,000', (await me(AYESHA, `SELECT public.decide_change($1, false)`, [c.id])).value?.ok === true);
  const row = await job(j2.id);
  ok('the job stops, owing the visit fee of Rs 300', row.status === 'stopped' && Number(row.collect_paisa) === 30000 && Number(row.agreed_paisa) === 550000);
  const b = to(await sent(), 'bilal')[0];
  ok('Bilal is told to collect only that', b?.title === `Kaam band: ${j2.ref}` && /visit fee Rs 300/.test(b?.body ?? ''), JSON.stringify(b));
  const lists = (await me(AYESHA, `SELECT public.app_lists()`)).value;
  ok('the post screen is told the visit fee range', lists?.visit_fee_min_paisa === 30000 && lists?.visit_fee_max_paisa === 100000);
  await setup(`UPDATE public.jobs SET finished_at = now() - interval '25 hours' WHERE id = $1`, [j2.id]);
  ok('after a day, the app sends her to the office instead', (await me(AYESHA, `SELECT public.report_problem($1, 'Was charged for nothing')`, [j2.id])).value?.ok === false && (await mine(AYESHA, j2.id))?.can_report === false);
}

// =============================================================================
heading('Cancelling while he is on the way');

{
  const j3 = await chosenJob();
  await me(BILAL, STEP, [j3.id, 'chosen']);
  await sent();
  ok('Ayesha can still cancel', (await me(AYESHA, `SELECT public.cancel_job($1)`, [j3.id])).value?.ok === true);
  ok('Bilal is told not to go', /^Mat jayein/.test(to(await sent(), 'bilal')[0]?.body ?? ''));
  ok('the step is cleared', (await job(j3.id)).stage === null);
}

// =============================================================================
heading('Chat');

{
  const j4 = await chosenJob();
  const SEND = `SELECT public.send_message($1, $2)`;
  const CHAT = `SELECT public.job_chat($1)`;
  ok('Ayesha writes to Bilal', (await me(AYESHA, SEND, [j4.id, 'The gate is the green one, House 12, ring twice'])).value?.ok === true);
  {
    const m = await sent();
    const b = to(m, 'bilal')[0];
    ok('Bilal is told there is a message, in Roman Urdu', b?.title === 'Naya message: Ayesha', JSON.stringify(b));
    ok('but not what it says', !/green|House 12|ring/.test(JSON.stringify(m)));
  }
  const c = (await me(BILAL, CHAT, [j4.id])).value;
  ok('Bilal reads it', c?.ok && c.messages.length === 1 && c.messages[0].mine === false && c.other_name === 'Ayesha' && c.can_send);
  ok('Bilal replies', (await me(BILAL, SEND, [j4.id, '15 minute mein pohanch raha hoon'])).value?.ok === true);
  ok('Ayesha is told', to(await sent(), 'ayesha')[0]?.title === 'New message from Bilal');
  await me(BILAL, SEND, [j4.id, 'Traffic hai']);
  ok('a second message within the minute does not buzz her again', (await sent()).length === 0);
  ok('Sara cannot read it', (await me(SARA, CHAT, [j4.id])).value?.ok === false);
  ok('Asad cannot read it', (await me(ASAD, CHAT, [j4.id])).value?.ok === false);
  ok('Asad cannot write in it', (await me(ASAD, SEND, [j4.id, 'Hello'])).value?.ok === false);
  nothing('nobody can read the messages table', await as('authenticated', AYESHA, `SELECT body FROM public.job_messages`));
  ok('an empty message is refused', (await me(AYESHA, SEND, [j4.id, '   '])).value?.field === 'body');
  const cnic = ['35202', '1234567', '1'].join('-');
  ok('a CNIC number is refused', (await me(AYESHA, SEND, [j4.id, `My CNIC is ${cnic}`])).value?.field === 'body');
  const d = (await me(OWNER, `SELECT public.admin_job_detail($1)`, [j4.id])).value;
  ok('the office can read the whole chat', d?.messages?.length === 3 && d.messages[0].from === 'customer' && d.messages[1].from === 'pro');
  ok('a technician cannot read the office\'s view', (await me(BILAL, `SELECT public.admin_job_detail($1)`, [j4.id])).value == null);
  await me(AYESHA, `SELECT public.cancel_job($1)`, [j4.id]);
  ok('once the job is over, nobody can write', (await me(AYESHA, SEND, [j4.id, 'Sorry'])).value?.ok === false);
}

// =============================================================================
heading('The record');

{
  const d = (await me(OWNER, `SELECT public.admin_job_detail($1)`, [j1.id])).value;
  const whats = d?.events?.map((e) => e.what) ?? [];
  const expected = ['posted', 'assigned', 'on_way', 'arrived', 'code_wrong', 'code_locked', 'code_unlocked', 'working', 'change_asked', 'change_approved', 'done', 'problem'];
  ok('every step is in the job\'s history, in order', expected.every((w, i) => whats.indexOf(w) >= (i ? whats.indexOf(expected[i - 1]) : 0) && whats.includes(w)), whats.join(', '));
  ok('with who did each', d.events.find((e) => e.what === 'on_way')?.actor === 'pro' && d.events.find((e) => e.what === 'assigned')?.actor === 'customer' && d.events.find((e) => e.what === 'code_unlocked')?.actor === 'office');
  ok('five wrong codes, each written down', whats.filter((w) => w === 'code_wrong').length === 5);
  nothing('nobody can read the history directly', await as('authenticated', OWNER, `SELECT * FROM public.job_events`));
  denied('nobody can write it', await as('authenticated', OWNER, `INSERT INTO public.job_events (job_id, actor, what) VALUES ($1, 'office', 'nothing happened')`, [j1.id]));
}

// =============================================================================
heading('Nothing private ever leaves');

{
  const codes = (await setup(`SELECT start_code FROM public.jobs WHERE start_code IS NOT NULL`)).rows.map((r) => r.start_code);
  const text = all.map((m) => `${m.title} ${m.body}`).join('\n');
  ok('a fair number of messages were looked at', all.length >= 20, String(all.length));
  for (const [what, pattern] of [['a street', /Street 34/], ['a house', /House 12/], ['a landmark', /markaz/i], ['a gate note', /Rafiq|Chowkidar/i], ['a phone number', /0?3\d{2}\s?\d{7}|92\d{10}/]]) {
    ok(`no notification names ${what}`, !pattern.test(text), (text.match(pattern) ?? [])[0]);
  }
  ok('no notification carries a start code', codes.every((c) => !new RegExp(`\\b${c}\\b`).test(text.replace(/PK-\d+/g, ''))));
  ok('every slot was filled', !/\{[a-z_]+\}/.test(text), (text.match(/.*\{[a-z_]+\}.*/) ?? [])[0]);
}

report();
