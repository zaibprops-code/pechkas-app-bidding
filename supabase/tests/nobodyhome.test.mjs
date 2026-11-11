/**
 * Nobody home (migration nobody_home, the owner's decision D34).
 *
 * What must hold: he can ask Pechkas to tell her only after tapping Arrived,
 * once his window has started, and (nobody answering) 15 minutes after the
 * later of the two; the guard case needs no wait; she has 10 minutes, and
 * "I'm coming" gives her 10 more, once; the start code or her cancelling
 * ends the asking; he reports only after her deadline, with his own fresh
 * photo; the job is cancelled by him, recorded in D10's record as its own
 * label, and never makes a visit fee, a debt or a payment; she may say "I
 * was home" within 24 hours; the office confirms or rejects with a note;
 * only confirmed, on-time, nobody-home reports count towards her review,
 * a disputed one counts for nobody, a guard report never counts; his own
 * reports are counted for him; every visit is kept in uncompensated_visits
 * with the job's visit fee as a reference only; nobody reads the tables;
 * the messages carry no address or anybody's words; and it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'd5';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const NADIA = `${P}555555-5555-4555-8555-555555555555`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
const OWNER_PHONE = `${P}888888-8888-4888-8888-888888888888`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007441111', null, 'customer', 'Ayesha'],
  [SARA, '923007442222', null, 'customer', 'Sara'],
  [NADIA, '923007445555', null, 'customer', 'Nadia'],
  [BILAL, '923007443333', null, 'pro', 'Bilal'],
  [ASAD, '923007444444', null, 'pro', 'Asad'],
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
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);
// Windows at any hour, so a test can stand a few hours either side of now
// (which hours a window may start at is tested in offerwhen.test.mjs).
await setup(`ALTER TABLE public.jobs DROP CONSTRAINT jobs_when_from_check`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name] of [[AYESHA, 'ayesha'], [SARA, 'sara'], [NADIA, 'nadia'], [BILAL, 'bilal'], [ASAD, 'asad'], [OWNER_PHONE, 'zohaib']]) {
  await me(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(name)]);
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
let files = 0;
const upload = async (who) => {
  files += 1;
  const name = `${who}/gate-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const rep = async (id) => (await setup(`SELECT * FROM public.not_home_reports WHERE job_id = $1`, [id])).rows[0];
const count = async (sql, params = []) => Number((await setup(sql, params)).rows[0].n);
const mine = async (who, id) => ((await me(who, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === id);
const proJob = async (who, id) => ((await me(who, `SELECT public.pro_my_jobs()`)).value ?? []).find((x) => x.id === id);
const ASK = `SELECT public.pro_cannot_get_in($1, $2)`;
const REPORT = `SELECT public.pro_report_not_home($1, $2, $3)`;
const COMING = `SELECT public.customer_not_home_coming($1)`;
const DISPUTE = `SELECT public.customer_dispute_not_home($1, $2)`;
const DECIDE = `SELECT public.admin_not_home($1, $2, $3)`;
/** Her answer time has run out (time travel for the test only). */
const expire = (id) => setup(`UPDATE public.not_home_reports SET deadline = now() - interval '1 minute' WHERE job_id = $1`, [id]);

let n = 0;
/**
 * A job at her door: his window started an hour or two ago, he tapped
 * Arrived, and the record says he arrived `after` minutes into it.
 */
async function atDoor({ customer = AYESHA, pro = BILAL, after = 10, hours = -1 } = {}) {
  n += 1;
  const posted = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`AC number ${n} is not cooling`])).value;
  if (!posted?.ok) throw new Error(`post failed: ${JSON.stringify(posted)}`);
  await me(pro, `SELECT public.make_offer($1, 300000, 20, NULL)`, [posted.id]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [posted.id, pro])).rows[0].id;
  await me(customer, `SELECT public.choose_offer($1)`, [offer]);
  await setup(`UPDATE public.jobs SET when_kind = 'later', when_part = NULL,
      when_date = (date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') + make_interval(hours => $2))::date,
      when_from = extract(hour FROM date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') + make_interval(hours => $2))::smallint
    WHERE id = $1`, [posted.id, hours]);
  await me(pro, `SELECT public.tech_step($1, 'chosen')`, [posted.id]);
  await me(pro, `SELECT public.tech_step($1, 'on_way')`, [posted.id]);
  if (after !== null) {
    await setup(`UPDATE public.jobs SET arrived_at = public.window_start(when_date, when_from) + make_interval(mins => $2) WHERE id = $1`, [posted.id, after]);
    // He tapped Arrived on the real clock; the test moves his arrival, so the
    // late arrival that tap recorded goes too.
    await setup(`DELETE FROM public.pro_incidents WHERE job_id = $1`, [posted.id]);
  }
  await sent();
  return posted;
}
/** Asked, her time run out, and reported with a fresh photo. */
async function reported(opts = {}, reason = 'nobody_home') {
  const j = await atDoor(opts);
  const pro = opts.pro ?? BILAL;
  const a = (await me(pro, ASK, [j.id, reason])).value;
  if (!a?.ok) throw new Error(`ask failed: ${JSON.stringify(a)}`);
  await expire(j.id);
  const r = (await me(pro, REPORT, [j.id, await upload(pro), null])).value;
  if (!r?.ok) throw new Error(`report failed: ${JSON.stringify(r)}`);
  await sent();
  return j;
}

// =============================================================================
heading('Before he may ask');
{
  n += 1;
  const posted = (await me(AYESHA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Not yet at the door',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`)).value;
  await me(BILAL, `SELECT public.make_offer($1, 300000, 20, NULL)`, [posted.id]);
  await me(AYESHA, `SELECT public.choose_offer($1)`, [(await setup(`SELECT id FROM public.offers WHERE job_id = $1`, [posted.id])).rows[0].id]);
  ok('not before he has tapped Arrived', (await me(BILAL, ASK, [posted.id, 'nobody_home'])).value?.field === 'stage');
  await me(AYESHA, `SELECT public.cancel_job($1, NULL, NULL)`, [posted.id]);

  const early = await atDoor({ hours: 2, after: null });
  const r = (await me(BILAL, ASK, [early.id, 'nobody_home'])).value;
  ok('not before his window has started, even if he came early', r?.field === 'wait' && Boolean(r?.from), JSON.stringify(r));
  ok('the guard case waits for the window too', (await me(BILAL, ASK, [early.id, 'guard'])).value?.field === 'wait');
  await me(AYESHA, `SELECT public.cancel_job($1, NULL, NULL)`, [early.id]);

  const just = await atDoor();
  await setup(`UPDATE public.jobs SET arrived_at = now() - interval '5 minutes' WHERE id = $1`, [just.id]);
  const w = (await me(BILAL, ASK, [just.id, 'nobody_home'])).value;
  ok('not until 15 minutes after he arrived', w?.field === 'wait' && Math.abs(new Date(w.from) - Date.now() - 10 * 60000) < 90000, JSON.stringify(w));
  ok('his job says from when', Math.abs(new Date((await proJob(BILAL, just.id))?.not_home_from) - new Date(w.from)) < 2000);
  ok('nobody else can ask on his job', (await me(ASAD, ASK, [just.id, 'nobody_home'])).value?.ok === false
    && (await me(AYESHA, ASK, [just.id, 'nobody_home'])).value?.ok === false);
  ok('a reason from the list only', (await me(BILAL, ASK, [just.id, 'raining'])).value?.field === 'reason');
  await me(AYESHA, `SELECT public.cancel_job($1, NULL, NULL)`, [just.id]);
}

heading('He asks, she is told, she has 10 minutes');
const first = await atDoor();
{
  const a = (await me(BILAL, ASK, [first.id, 'nobody_home'])).value;
  ok('15 minutes after the later of Arrived and his window: he may ask', a?.ok === true);
  ok('her deadline is 10 minutes away', Math.abs(new Date(a.deadline) - Date.now() - 10 * 60000) < 60000);
  const m = await sent();
  ok('she is told he is at her door', to(m, 'ayesha').some((x) => x.title === 'Bilal is at your door' && /I am coming/.test(x.body)));
  ok('the office is not', to(m, 'zohaib').length === 0);
  const r = await rep(first.id);
  ok('the database stamps every time itself', r?.status === 'asking' && r?.asked_at && r?.customer_told_at && r?.arrived_at && r?.window_start && r?.pro_was_late === false);
  ok('asking twice is refused', (await me(BILAL, ASK, [first.id, 'nobody_home'])).value?.ok === false);
  ok('he cannot report while she still has time', (await me(BILAL, REPORT, [first.id, await upload(BILAL), null])).value?.field === 'wait');
  const card = (await mine(AYESHA, first.id))?.not_home;
  ok('her job shows it, with I\'m coming', card?.status === 'asking' && card?.can_say_coming === true && card?.can_dispute === false);
  ok('another customer cannot answer for her', (await me(SARA, COMING, [first.id])).value?.ok === false);
  const c = (await me(AYESHA, COMING, [first.id])).value;
  ok('"I\'m coming" gives her 10 more minutes', c?.ok === true && new Date((await rep(first.id)).deadline) > new Date(r.deadline));
  ok('he is told she is coming', to(await sent(), 'bilal').some((x) => x.title === 'Ayesha is coming'));
  ok('only once', (await me(AYESHA, COMING, [first.id])).value?.already === true);
}

heading('He reports it');
{
  await expire(first.id);
  ok('a photo is needed', (await me(BILAL, REPORT, [first.id, null, null])).value?.field === 'photos');
  ok('his own photo, really uploaded', (await me(BILAL, REPORT, [first.id, `${ASAD}/someone-else.jpg`, null])).value?.field === 'photos');
  ok('no phone number in his note', (await me(BILAL, REPORT, [first.id, await upload(BILAL), 'Ring me on 0300 1234567'])).value?.field === 'note');
  const txns = await count(`SELECT count(*) AS n FROM public.ledger_txns`);
  const owedBefore = await count(`SELECT public.pro_owed($1) AS n`, [BILAL]);
  const photo = await upload(BILAL);
  ok('he reports, with the photo and a short note', (await me(BILAL, REPORT, [first.id, photo, 'Rang the bell and called twice'])).value?.ok === true);
  const j = await job(first.id);
  ok('the job is cancelled, by him', j.status === 'cancelled' && j.cancelled_by === 'pro' && j.cancel_for === 'customer');
  const c = (await setup(`SELECT * FROM public.cancellations WHERE job_id = $1`, [first.id])).rows[0];
  ok('D10\'s record labels it "not home", never a late cancellation', c?.category === 'not_home' && c?.cancelled_by === 'pro');
  ok('no visit fee, no debt, no payment', (await count(`SELECT count(*) AS n FROM public.visit_fees WHERE job_id = $1`, [first.id])) === 0
    && j.collect_paisa === null && j.stop_reason === null
    && (await count(`SELECT count(*) AS n FROM public.ledger_txns`)) === txns && (await count(`SELECT public.pro_owed($1) AS n`, [BILAL])) === owedBefore);
  ok('nothing on his lateness record', (await count(`SELECT count(*) AS n FROM public.pro_incidents WHERE job_id = $1`, [first.id])) === 0);
  const r = await rep(first.id);
  ok('the report is submitted, awaiting review, with the photo', r.status === 'submitted' && r.photo_path === photo && r.submitted_at);
  ok('the photo is kept on the job, and she can see it', (await as('authenticated', AYESHA, `SELECT name FROM storage.objects WHERE name = $1`, [photo])).rows.length === 1);
  const u = (await setup(`SELECT * FROM public.uncompensated_visits WHERE report_id = $1`, [r.id])).rows[0];
  ok('an uncompensated visit is recorded: the job\'s Rs 300 as a reference, never charged', u?.job_ref === first.ref
    && Number(u.visit_fee_ref_paisa) === 30000 && u.outcome === 'submitted' && u.minutes_waited > 0 && u.reason === 'nobody_home');
  const m = await sent();
  ok('she is told, and told she may say she was home', to(m, 'ayesha').some((x) => x.title === `Job ${first.ref} was closed` && /within 24 hours/.test(x.body)));
  ok('he is not told to stay away from his own job', !to(m, 'bilal').some((x) => /cancelled/i.test(x.title)));
  ok('reporting twice changes nothing', (await me(BILAL, REPORT, [first.id, await upload(BILAL), null])).value?.ok === false);
  const card = (await mine(AYESHA, first.id))?.not_home;
  ok('her job offers "I was home" for 24 hours', card?.status === 'submitted' && card?.can_dispute === true && Boolean(card?.dispute_until));
}

heading('The asking ends when she lets him in, or the job ends another way');
{
  const j = await atDoor();
  await me(BILAL, ASK, [j.id, 'nobody_home']);
  await me(BILAL, `SELECT public.start_work($1, $2, $3::jsonb)`, [j.id, (await job(j.id)).start_code, JSON.stringify([await upload(BILAL)])]);
  ok('she gave him the code: answered, and nothing to report', (await rep(j.id)).status === 'answered'
    && (await me(BILAL, REPORT, [j.id, await upload(BILAL), null])).value?.ok === false);
  const k = await atDoor();
  await me(BILAL, ASK, [k.id, 'nobody_home']);
  ok('she may cancel instead, free', (await me(AYESHA, `SELECT public.cancel_job($1, NULL, 'plans_changed')`, [k.id])).value?.ok === true);
  ok('the asking is closed, and it is her cancellation, as D10 records it', (await rep(k.id)).status === 'closed'
    && (await setup(`SELECT category FROM public.cancellations WHERE job_id = $1`, [k.id])).rows[0].category === 'late');
  await sent();
}

heading('The guard will not let him in');
let guardJob;
{
  guardJob = await atDoor({ after: 10 });
  await setup(`UPDATE public.jobs SET arrived_at = now() - interval '1 minute' WHERE id = $1`, [guardJob.id]);
  ok('nobody answering would still need the wait', (await me(BILAL, ASK, [guardJob.id, 'nobody_home'])).value?.field === 'wait');
  ok('the guard case does not: she can ring her guard at once', (await me(BILAL, ASK, [guardJob.id, 'guard'])).value?.ok === true);
  ok('she is told to tell the guard', to(await sent(), 'ayesha').some((x) => x.title === 'Bilal cannot get past the gate'));
  await expire(guardJob.id);
  ok('he reports it', (await me(BILAL, REPORT, [guardJob.id, await upload(BILAL), null])).value?.ok === true);
  ok('its own label', (await setup(`SELECT category FROM public.cancellations WHERE job_id = $1`, [guardJob.id])).rows[0].category === 'guard');
  ok('she is told it does not count against her', to(await sent(), 'ayesha').some((x) => /does not count against you/.test(x.body)));
  ok('there is nothing for her to dispute', (await mine(AYESHA, guardJob.id))?.not_home?.can_dispute === false
    && (await me(AYESHA, DISPUTE, [guardJob.id, 'I told the guard myself'])).value?.ok === false);
}

heading('She says she was home');
{
  ok('a sentence is needed', (await me(AYESHA, DISPUTE, [first.id, 'no'])).value?.field === 'text');
  ok('another customer cannot', (await me(SARA, DISPUTE, [first.id, 'I was home all day'])).value?.ok === false);
  ok('she disputes it', (await me(AYESHA, DISPUTE, [first.id, 'I was home, the bell has not worked since the load-shedding'])).value?.ok === true);
  const m = await sent();
  ok('the office is told, and he is', to(m, 'zohaib').some((x) => x.title === `Nobody-home report disputed: ${first.ref}`)
    && to(m, 'bilal').some((x) => x.title === `The customer disagrees: ${first.ref}`));
  ok('the analysis record follows', (await setup(`SELECT outcome FROM public.uncompensated_visits WHERE job_ref = $1`, [first.ref])).rows[0].outcome === 'disputed');
  ok('once', (await me(AYESHA, DISPUTE, [first.id, 'Again: I was home'])).value?.ok === false);
  const old = await reported();
  await setup(`UPDATE public.not_home_reports SET submitted_at = now() - interval '25 hours' WHERE job_id = $1`, [old.id]);
  ok('not after 24 hours', (await me(AYESHA, DISPUTE, [old.id, 'I was home that day'])).value?.ok === false);
}

heading('The office decides');
{
  const id = (await rep(first.id)).id;
  ok('a customer cannot', (await me(AYESHA, DECIDE, [id, false, 'She was home, I believe her'])).value?.ok === false);
  ok('nor a technician', (await me(BILAL, DECIDE, [id, true, 'Nobody was home at all'])).value?.ok === false);
  ok('a note is needed', (await me(OWNER, DECIDE, [id, true, ''])).value?.field === 'note');
  ok('the office rejects it, with a note', (await me(OWNER, DECIDE, [id, false, 'Rang both: the bell was dead, she was home.'])).value?.ok === true);
  const r = await rep(first.id);
  ok('rejected, by name', r.status === 'rejected' && r.decided_by_name === 'Zohaib' && /bell/.test(r.office_note));
  const m = await sent();
  ok('both are told to read it in the app, without the note', to(m, 'ayesha').some((x) => x.title === `The office has looked at job ${first.ref}` && !/bell/.test(x.body))
    && to(m, 'bilal').some((x) => x.title === `The office has looked at job ${first.ref}`));
  ok('once', (await me(OWNER, DECIDE, [id, true, 'Changed my mind about it'])).value?.ok === false);
  ok('she reads the office\'s words', /bell/.test((await mine(AYESHA, first.id))?.not_home?.office_note ?? ''));
}

heading('What counts against her');
{
  // Nadia: three confirmed nobody-home reports, all with him on time.
  const nadia = [];
  for (let i = 0; i < 3; i += 1) nadia.push(await reported({ customer: NADIA }));
  // And three that must not count: he was late, a guard, and one still disputed.
  const late = await reported({ customer: NADIA, after: 40 });
  ok('he arrived 40 minutes into his window: marked, and it can never count against her', (await rep(late.id)).pro_was_late === true);
  const guard = await reported({ customer: NADIA }, 'guard');
  const disputed = await reported({ customer: NADIA });
  await me(NADIA, DISPUTE, [disputed.id, 'I was home the whole time']);
  const flagsOf = async () => (await me(OWNER, `SELECT public.admin_flags()`)).value;
  let f = await flagsOf();
  ok('reports alone count for nothing: only the office\'s confirmation does', !f.people.some((p) => p.id === NADIA && p.flags.some((x) => x.kind === 'not_home')));
  for (const j of [...nadia, late, guard]) await me(OWNER, DECIDE, [(await rep(j.id)).id, true, 'Rang her: she was out all afternoon.']);
  f = await flagsOf();
  const nf = f.people.find((p) => p.id === NADIA)?.flags.find((x) => x.kind === 'not_home');
  ok('three confirmed, on time, nobody home: her review', nf?.n === 3, JSON.stringify(nf));
  ok('the late one, the guard one and the disputed one did not count', nf?.n === 3);
  await me(OWNER, DECIDE, [(await rep(disputed.id)).id, true, 'Rang her neighbour: nobody was in.']);
  f = await flagsOf();
  ok('once the office confirms the disputed one, it counts', f.people.find((p) => p.id === NADIA)?.flags.find((x) => x.kind === 'not_home')?.n === 4);
  ok('none of it is a late cancellation', !f.people.some((p) => p.id === NADIA && p.flags.some((x) => x.kind === 'late_cancels')));
  ok('and she can still post: nothing is automatic', (await me(NADIA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Still able to post here',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`)).value?.ok === true);
}

heading('What counts for him');
{
  const f = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  const bf = f.people.find((p) => p.id === BILAL)?.flags.find((x) => x.kind === 'not_home_reports');
  const expected = await count(`SELECT count(*) AS n FROM public.not_home_reports WHERE pro_id = $1 AND reason = 'nobody_home' AND status IN ('submitted', 'confirmed', 'rejected')`, [BILAL]);
  ok('his own nobody-home reports are counted, disputed ones aside', bf?.n === expected && expected >= 3, `${JSON.stringify(bf)} vs ${expected}`);
  ok('he is still approved and can still offer', (await setup(`SELECT status FROM public.pros WHERE id = $1`, [BILAL])).rows[0].status === 'approved');
  ok('Asad, with none, is not flagged for it', !f.people.some((p) => p.id === ASAD && p.flags.some((x) => x.kind === 'not_home_reports')));
  ok('the limits are shown', Number(f.limits.flag_not_home) === 3 && Number(f.limits.flag_not_home_reports) === 3);
  const rec = (await me(BILAL, `SELECT public.pro_record()`)).value;
  ok('he sees his reports and what the office decided, without her address', rec?.not_home_reports?.some((x) => x.ref === first.ref && x.status === 'rejected' && /bell/.test(x.office_note))
    && !JSON.stringify(rec).match(/Street|House|markaz|Rafiq/));
  ok('Asad sees none of them', ((await me(ASAD, `SELECT public.pro_record()`)).value?.not_home_reports ?? []).length === 0);
}

heading('The office\'s list');
{
  const page = (await me(OWNER, `SELECT public.admin_not_home_reports()`)).value;
  const one = page?.reports?.find((x) => x.ref === guardJob.ref);
  ok('every report, with the times and the photo', one?.reason === 'guard' && one?.photo && one?.asked_at && one?.customer_told_at && one?.deadline && one?.submitted_at);
  ok('with its history', one?.history?.some((h) => h.what === 'not_home_asked') && one?.history?.some((h) => h.what === 'not_home_reported'));
  ok('and the notifications sent, as proof she was told', one?.told?.some((t) => t.kind === 'guard_ask'));
  ok('the asking that ended in the code is not a report', !page.reports.some((x) => x.status === 'answered' || x.status === 'closed'));
  ok('uncompensated visits, by job and by month', page.uncompensated.length >= 9 && page.uncompensated_by_month.length >= 1
    && Number(page.uncompensated_by_month[0].visit_fee_ref_paisa) >= 30000 * 9);
  ok('nobody else can read it', (await me(AYESHA, `SELECT public.admin_not_home_reports()`)).value === null
    && (await me(BILAL, `SELECT public.admin_not_home_reports()`)).value === null);
  const c = (await me(OWNER, `SELECT public.admin_cancellations()`)).value;
  ok('D10\'s page shows the new labels', c.cancellations.some((x) => x.category === 'not_home') && c.cancellations.some((x) => x.category === 'guard'));
}

heading('Nobody reads the tables');
denied('a signed-in person cannot read the reports', await as('authenticated', AYESHA, `SELECT * FROM public.not_home_reports`));
denied('nor the uncompensated visits', await as('authenticated', BILAL, `SELECT * FROM public.uncompensated_visits`));
denied('nor change a report', await as('authenticated', BILAL, `UPDATE public.not_home_reports SET status = 'confirmed'`));
nothing('a stranger cannot report', await as('anon', null, `SELECT public.pro_report_not_home('${first.id}', NULL, NULL)`));
denied('nor ask the inner helpers', await as('authenticated', AYESHA, `SELECT public.not_home_view('${first.id}', 'pro')`));

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /Street|House|markaz|Rafiq|92300|\+92|bell|load-shedding|Rang|called twice|neighbour/.test(`${x.title} ${x.body}`));
  ok('no message carried an address, a number, or anybody\'s words', bad.length === 0, JSON.stringify(bad[0]));
}

heading('Deleted with the account, except the anonymous cost record');
{
  const before = await count(`SELECT count(*) AS n FROM public.uncompensated_visits`);
  await setup(`DELETE FROM auth.users WHERE id = $1`, [NADIA]);
  ok('her reports go with her account', (await count(`SELECT count(*) AS n FROM public.not_home_reports WHERE customer_id = $1`, [NADIA])) === 0);
  ok('the uncompensated visits stay, naming nobody', (await count(`SELECT count(*) AS n FROM public.uncompensated_visits`)) === before
    && (await count(`SELECT count(*) AS n FROM public.uncompensated_visits WHERE report_id IS NULL`)) >= 6);
  await setup(`DELETE FROM auth.users WHERE id = $1`, [BILAL]);
  ok('his name comes off them when he deletes his', (await count(`SELECT count(*) AS n FROM public.uncompensated_visits WHERE pro_id = $1`, [BILAL])) === 0
    && (await count(`SELECT count(*) AS n FROM public.uncompensated_visits`)) === before);
}

heading('Run a second time');
{
  const before = (await setup(`SELECT id, status FROM public.not_home_reports ORDER BY id`)).rows;
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261111000000_nobody_home.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  const now = (await setup(`SELECT id, status FROM public.not_home_reports ORDER BY id`)).rows;
  ok('and changes no report', JSON.stringify(now) === JSON.stringify(before));
}

report();
