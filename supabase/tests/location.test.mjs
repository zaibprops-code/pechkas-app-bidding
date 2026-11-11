/**
 * Arriving, checked by location (migration arrival_by_location, the owner's
 * decision revising D34 on 11 November 2026).
 *
 * What must hold: one formula for distance; one function judging a reading;
 * verified only within the radius, within the accuracy, fresh, not faked, not
 * reused, inside Pakistan, with a pin on the job; every other reading is
 * recorded with its reason and never blocks the tap; an unverified tap is not
 * an arrival for D10 (the no-show watch goes on, her cancellation is not "at
 * the door", his lateness counts from when the arrival was satisfied); the
 * start code or the office (with a reason, kept for good) satisfies it; she is
 * told "verified" only when it was; nobody sees his coordinates but the office;
 * a nobody-home report needs a photo only when the check fails, or a reason
 * when the camera does not work; the visit fee still needs the start code;
 * coordinates are erased after 90 days at most, the result kept; three
 * unverified arrivals ask for a review; nobody reads the tables; no
 * notification carries a coordinate; and it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e6';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
const OWNER_PHONE = `${P}888888-8888-4888-8888-888888888888`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007551111', null, 'customer', 'Ayesha'],
  [SARA, '923007552222', null, 'customer', 'Sara'],
  [BILAL, '923007553333', null, 'pro', 'Bilal'],
  [ASAD, '923007554444', null, 'pro', 'Asad'],
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
// Windows at any hour (which hours a window may start at is tested in offerwhen.test.mjs).
await setup(`ALTER TABLE public.jobs DROP CONSTRAINT jobs_when_from_check`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
for (const [who, name] of [[AYESHA, 'ayesha'], [SARA, 'sara'], [BILAL, 'bilal'], [ASAD, 'asad'], [OWNER_PHONE, 'zohaib']]) {
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
  const name = `${who}/loc-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const checks = async (id) => (await setup(`SELECT * FROM public.location_checks WHERE job_id = $1 ORDER BY received_at, id`, [id])).rows;
const count = async (sql, params = []) => Number((await setup(sql, params)).rows[0].n);
const mine = async (who, id) => ((await me(who, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === id);
const proJob = async (who, id) => ((await me(who, `SELECT public.pro_my_jobs()`)).value ?? []).find((x) => x.id === id);

// Her pin, and readings around it. 0.00018 degrees of latitude is about 20 metres.
const PIN = { lat: 33.695, lng: 72.985 };
let tick = 0;
/** What the phone sends: a reading taken `age` seconds before it was sent. Each one is a new reading. */
function reading(dLat = 0.00018, o = {}) {
  tick += 1;
  const now = Date.now();
  const fixAt = o.fixAt ?? new Date(now - (o.age ?? 3) * 1000 - tick).toISOString();
  return JSON.stringify({ lat: PIN.lat + dLat, lng: PIN.lng, accuracy: o.acc ?? 12, fix_at: fixAt, sent_at: new Date(now).toISOString(), mocked: o.mocked ?? false });
}
const ARRIVE = `SELECT public.tech_step($1, 'on_way', $2::jsonb)`;
const RECHECK = `SELECT public.pro_check_arrival($1, $2::jsonb)`;

let n = 0;
/** A job given to `pro`, his window starting `hours` from the top of this hour, he on his way. */
async function onWay({ hours = -1, customer = AYESHA, pro = BILAL, pin = true } = {}) {
  n += 1;
  const posted = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`AC number ${n} is not cooling`])).value;
  if (!posted?.ok) throw new Error(`post failed: ${JSON.stringify(posted)}`);
  await me(pro, `SELECT public.make_offer($1, 300000, 20, NULL)`, [posted.id]);
  await me(customer, `SELECT public.choose_offer($1)`, [(await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [posted.id, pro])).rows[0].id]);
  await setup(`UPDATE public.jobs SET when_kind = 'later', when_part = NULL,
      when_date = (date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') + make_interval(hours => $2))::date,
      when_from = extract(hour FROM date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') + make_interval(hours => $2))::smallint,
      lat = CASE WHEN $3 THEN ${PIN.lat} END, lng = CASE WHEN $3 THEN ${PIN.lng} END
    WHERE id = $1`, [posted.id, hours, pin]);
  await me(pro, `SELECT public.tech_step($1, 'chosen')`, [posted.id]);
  await sent();
  return posted;
}
const arriveWith = async (loc, opts = {}) => {
  const j = await onWay(opts);
  const r = (await me(opts.pro ?? BILAL, ARRIVE, [j.id, loc])).value;
  return { j, r };
};

// =============================================================================
heading('One distance formula');
{
  const d = async (a, b, c, e) => (await setup(`SELECT public.distance_m($1, $2, $3, $4) AS d`, [a, b, c, e])).rows[0].d;
  ok('the same point is 0 metres', (await d(33.695, 72.985, 33.695, 72.985)) === 0);
  ok('0.0009 degrees of latitude is about 100 metres', Math.abs((await d(33.695, 72.985, 33.6959, 72.985)) - 100) <= 1);
  const across = await d(33.6938, 72.9867, 33.7004, 72.9757);
  ok('across F-11, about 1.2 kilometres', across > 1100 && across < 1400, String(across));
  ok('no point, no distance', (await d(null, 72.985, 33.695, 72.985)) === null);
}

heading('A good reading verifies the arrival');
{
  const { j, r } = await arriveWith(reading());
  ok('20 metres from her pin, accuracy 12: verified', r?.ok === true && r?.arrival?.result === 'verified' && r?.arrival?.distance_m >= 15 && r?.arrival?.distance_m <= 25, JSON.stringify(r));
  const row = await job(j.id);
  ok('the tap, the verification and the status are kept apart', row.arrived_at && row.arrival_verified_at && row.arrival_review_status === 'verified');
  const c = (await checks(j.id))[0];
  ok('one record: the reading, its accuracy, its two times, the database\'s time, distance and result', c.lat && c.accuracy_m === 12 && c.fix_at && c.sent_at && c.received_at
    && c.event === 'arrived' && c.result === 'verified' && c.mocked === false);
  ok('she is told it was verified', (await mine(AYESHA, j.id))?.arrival_verified === true);
  const her = JSON.stringify(await mine(AYESHA, j.id));
  ok('and nothing of where he was', !her.includes(String(PIN.lat + 0.00018).slice(0, 8)) && !her.includes('accuracy'));
  const his = await proJob(BILAL, j.id);
  ok('he sees his own result and distance, never coordinates', his?.arrival?.result === 'verified' && his.arrival.distance_m > 0
    && his.arrival.lat === undefined && !JSON.stringify(his.arrival).includes('"lat"'));
  ok('the customer is told he has arrived, as before', to(await sent(), 'ayesha').some((x) => x.title === 'Bilal has arrived'));
}

heading('Every way a reading can fail is recorded, and never stops the tap');
const failures = [];
for (const [what, loc, result, opts] of [
  ['150 metres away: too far', reading(0.00135), 'too_far'],
  ['accuracy 51 metres: poor', reading(0.00018, { acc: 51 }), 'poor_accuracy'],
  ['poor indoor signal, accuracy 80', reading(0.00018, { acc: 80 }), 'poor_accuracy'],
  ['a reading 200 seconds old: stale', reading(0.00018, { age: 200 }), 'stale'],
  ['a reading from two minutes in the future: stale', reading(0.00018, { age: -120 }), 'stale'],
  ['a fake-location app: faked', reading(0.00018, { mocked: true }), 'faked'],
  ['location refused on the phone', JSON.stringify({ reason: 'denied' }), 'no_location'],
  ['an older copy that sends nothing', null, 'no_location'],
  ['a job with no pin', reading(), 'no_pin', { pin: false }],
  ['a position outside Pakistan', JSON.stringify({ lat: 51.5, lng: -0.12, accuracy: 5, fix_at: new Date(Date.now() - 2000).toISOString(), sent_at: new Date().toISOString(), mocked: false }), 'outside_pakistan'],
]) {
  const { j, r } = await arriveWith(loc, opts);
  const row = await job(j.id);
  ok(what, r?.ok === true && r?.arrival?.result === result && row.stage === 'arrived' && row.arrival_review_status === 'pending' && row.arrival_verified_at === null,
    `${JSON.stringify(r)} ${row.arrival_review_status}`);
  failures.push(j);
}
{
  const [tooFar, , , , , , denied_, older, , abroad] = failures;
  ok('why there was no position is kept', (await checks(denied_.id))[0].app_reason === 'denied' && (await checks(older.id))[0].app_reason === 'older_app');
  ok('a position outside Pakistan is not kept at all', (await checks(abroad.id))[0].lat === null);
  ok('she is not told it was verified', (await mine(AYESHA, tooFar.id))?.arrival_verified === false);
}

heading('A reading sent twice, or older than the last one, is not fresh');
{
  const j = await onWay();
  const once = reading();
  ok('the first time: verified', (await me(BILAL, ARRIVE, [j.id, once])).value?.arrival?.result === 'verified');
  const k = await onWay();
  ok('the same reading again, on another job: stale', (await me(BILAL, ARRIVE, [k.id, once])).value?.arrival?.result === 'stale');
  // A first reading with poor accuracy leaves the arrival pending; a second one taken BEFORE it is replayed.
  const m = await onWay();
  await me(BILAL, ARRIVE, [m.id, reading(0.00018, { acc: 90 })]);
  const r = (await me(BILAL, RECHECK, [m.id, reading(0.00018, { age: 40 })])).value;
  ok('a reading taken before the last one on that job: stale', r?.arrival?.result === 'stale' && (await job(m.id)).arrival_review_status === 'pending', JSON.stringify(r));
}

heading('Checking again at the door');
{
  const { j } = await arriveWith(reading(0.00018, { acc: 120 }));
  ok('first reading poor', (await job(j.id)).arrival_review_status === 'pending');
  ok('another technician cannot check for him', (await me(ASAD, RECHECK, [j.id, reading()])).value?.ok === false);
  const r = (await me(BILAL, RECHECK, [j.id, reading()])).value;
  ok('a second, good reading verifies it', r?.arrival?.result === 'verified' && (await job(j.id)).arrival_review_status === 'verified');
  ok('both checks are kept', (await checks(j.id)).length === 2);
  ok('once verified, checking again changes nothing', (await me(BILAL, RECHECK, [j.id, reading()])).value?.already === true);
}

heading('An unverified tap is not an arrival for D10');
{
  // His time ended 30 minutes ago; he tapped Arrived from across the city.
  const far = (await arriveWith(reading(0.02), { hours: -3 })).j;
  const near = (await arriveWith(reading(), { hours: -3 })).j;
  await sent();
  const found = (await setup(`SELECT public.no_show_clock() AS n`)).rows[0].n;
  ok('the no-show watch still finds the unverified one, and only it', found === 1
    && (await setup(`SELECT kind, status FROM public.pro_incidents WHERE job_id = $1`, [far.id])).rows[0]?.status === 'potential'
    && (await count(`SELECT count(*) AS n FROM public.pro_incidents WHERE job_id = $1 AND kind = 'no_show'`, [near.id])) === 0);
  const m = await sent();
  ok('she is not told he has not come (she knows if he is at her door); he and the office are',
    to(m, 'ayesha').length === 0 && to(m, 'bilal').some((x) => x.title === `Your arrival is not verified: ${far.ref}`)
    && to(m, 'zohaib').some((x) => x.title === `Arrival not verified: ${far.ref}`));
  ok('it is only potential: never a confirmed no-show by itself', (await setup(`SELECT status FROM public.pro_incidents WHERE job_id = $1`, [far.id])).rows[0].status === 'potential');

  const late = (await arriveWith(reading(0.02), { hours: -1 })).j;
  ok('her job says he is late, not at her door', (await mine(AYESHA, late.id))?.pro_late === true && (await mine(AYESHA, late.id))?.cancel_kind_now === 'pro_late');
  ok('so cancelling never counts against her', (await me(AYESHA, `SELECT public.cancel_job($1, NULL, 'pro_late')`, [late.id])).value?.category === 'pro_late');
  const verified = (await arriveWith(reading(), { hours: 1 })).j;
  ok('with his arrival verified, the same cancel at the door is hers', (await me(AYESHA, `SELECT public.cancel_job($1, NULL, 'not_needed')`, [verified.id])).value?.category === 'late');

  const lateFix = (await arriveWith(reading(0.02), { hours: -1 })).j;
  ok('no late arrival recorded for an unverified tap', (await count(`SELECT count(*) AS n FROM public.pro_incidents WHERE job_id = $1`, [lateFix.id])) === 0);
  await me(BILAL, RECHECK, [lateFix.id, reading()]);
  const inc = (await setup(`SELECT * FROM public.pro_incidents WHERE job_id = $1`, [lateFix.id])).rows[0];
  ok('verified later, he is late from the moment it was verified', inc?.kind === 'late_arrival' && inc?.minutes_late >= 60);
}

heading('Her start code proves he was there');
{
  const { j } = await arriveWith(JSON.stringify({ reason: 'denied' }), { hours: 1 });
  const r = (await me(BILAL, `SELECT public.start_work($1, $2, $3::jsonb)`, [j.id, (await job(j.id)).start_code, JSON.stringify([await upload(BILAL)])])).value;
  ok('he starts with her code', r?.ok === true);
  ok('the arrival is satisfied by the code, not by GPS', (await job(j.id)).arrival_review_status === 'code' && (await job(j.id)).arrival_verified_at === null);
  ok('and she is not told it was GPS-verified', (await mine(AYESHA, j.id))?.arrival_verified === false);
  heading('D12: the visit fee still follows only the start code');
  const ask = (await me(BILAL, `SELECT public.ask_change($1, 550000, 'Compressor needs replacing', $2)`, [j.id, await upload(BILAL)])).value;
  ok('he can ask a new price only now, after the code', ask?.ok === true);
  const ch = (await setup(`SELECT id FROM public.job_changes WHERE job_id = $1 AND status = 'pending'`, [j.id])).rows[0].id;
  await me(AYESHA, `SELECT public.decide_change($1, false)`, [ch]);
  ok('declined: the fee is owed exactly as before, whatever the GPS said', (await setup(`SELECT status FROM public.visit_fees WHERE job_id = $1`, [j.id])).rows[0]?.status === 'due');
  const noCode = (await arriveWith(reading(), { hours: 1 })).j;
  ok('a verified arrival alone never allows a new price', (await me(BILAL, `SELECT public.ask_change($1, 550000, 'x reason', $2)`, [noCode.id, await upload(BILAL)])).value?.field === 'stage');
}

heading('The office approves or rejects, with a reason kept for good');
let wrongPin;
{
  // The customer's pin is on the wrong house: he is at her gate, 300 metres from it.
  wrongPin = (await arriveWith(reading(0.0027))).j;
  ok('a wrong pin reads as too far', (await job(wrongPin.id)).arrival_review_status === 'pending');
  const page = (await me(OWNER, `SELECT public.admin_arrivals()`)).value;
  const a = page?.arrivals?.find((x) => x.job_id === wrongPin.id);
  ok('the office sees it, with every check and both points', a?.needs_you === true && a?.checks?.[0]?.result === 'too_far' && a?.checks?.[0]?.lat && a?.pin?.lat);
  ok('nobody else can read that page', (await me(BILAL, `SELECT public.admin_arrivals()`)).value === null && (await me(AYESHA, `SELECT public.admin_arrivals()`)).value === null);
  ok('a customer cannot decide', (await me(AYESHA, `SELECT public.admin_arrival($1, true, 'He was here')`, [wrongPin.id])).value?.ok === false);
  ok('a reason is needed', (await me(OWNER, `SELECT public.admin_arrival($1, true, '')`, [wrongPin.id])).value?.field === 'note');
  ok('the office approves it', (await me(OWNER, `SELECT public.admin_arrival($1, true, 'Rang her: her pin is on the house behind; he was at her gate.')`, [wrongPin.id])).value?.ok === true);
  const row = await job(wrongPin.id);
  ok('approved, by name, with the reason and the time', row.arrival_review_status === 'approved' && row.arrival_reviewed_by_name === 'Zohaib' && row.arrival_reviewed_at && /pin/.test(row.arrival_review_note));
  ok('approved is an arrival again, but not "verified" to her', (await mine(AYESHA, wrongPin.id))?.arrival_verified === false && (await mine(AYESHA, wrongPin.id))?.pro_late === false);
  const rv = (await setup(`SELECT * FROM public.location_reviews WHERE job_id = $1`, [wrongPin.id])).rows[0];
  ok('a review line is written, with the evidence the office saw', rv?.decision === 'approved' && rv?.by_name === 'Zohaib' && rv?.evidence?.[0]?.result === 'too_far');
  const edit = await setup(`UPDATE public.location_reviews SET note = 'changed later' WHERE job_id = $1`, [wrongPin.id]).then(() => 'allowed', (e) => e.message);
  ok('nobody can change it, not even the database owner', /written once/.test(edit), edit);
  ok('he is told to read it in the app', to(await sent(), 'bilal').some((x) => x.title === `The office has looked at your arrival: ${wrongPin.ref}`));
  ok('it cannot be decided twice', (await me(OWNER, `SELECT public.admin_arrival($1, false, 'Changed my mind on this')`, [wrongPin.id])).value?.ok === false);
  const far = (await arriveWith(reading(0.02))).j;
  ok('the office can reject one: he was not there', (await me(OWNER, `SELECT public.admin_arrival($1, false, 'Rang her: nobody came at all.')`, [far.id])).value?.ok === true
    && (await job(far.id)).arrival_review_status === 'rejected');
}

heading('Nobody home: GPS first, a photo when it fails');
async function asked({ arrival = reading() } = {}) {
  const { j } = await arriveWith(arrival);
  await setup(`UPDATE public.jobs SET arrived_at = public.window_start(when_date, when_from) + interval '10 minutes',
      arrival_verified_at = CASE WHEN arrival_verified_at IS NOT NULL THEN public.window_start(when_date, when_from) + interval '10 minutes' END WHERE id = $1`, [j.id]);
  await setup(`DELETE FROM public.pro_incidents WHERE job_id = $1`, [j.id]);
  const a = (await me(BILAL, `SELECT public.pro_cannot_get_in($1, 'nobody_home')`, [j.id])).value;
  if (!a?.ok) throw new Error(`ask: ${JSON.stringify(a)}`);
  await setup(`UPDATE public.not_home_reports SET deadline = now() - interval '1 minute' WHERE job_id = $1`, [j.id]);
  await sent();
  return j;
}
const NH = `SELECT public.pro_report_not_home($1, $2, $3, $4::jsonb, $5)`;
const rep = async (id) => (await setup(`SELECT * FROM public.not_home_reports WHERE job_id = $1`, [id])).rows[0];
{
  const strong = await asked();
  ok('both checks verified: no photo needed', (await me(BILAL, NH, [strong.id, null, null, reading(), false])).value?.ok === true);
  const s = await rep(strong.id);
  ok('the evidence is strong, and both checks are kept', s.evidence === 'strong' && s.arrival_check === 'verified' && s.report_check === 'verified'
    && (await checks(strong.id)).some((c) => c.event === 'not_home' && c.result === 'verified'));

  const weak = await asked();
  const r1 = (await me(BILAL, NH, [weak.id, null, null, JSON.stringify({ reason: 'denied' }), false])).value;
  ok('location refused at the report: a photo is needed', r1?.field === 'photos' && r1?.location === 'no_location', JSON.stringify(r1));
  ok('the failed check is still recorded', (await checks(weak.id)).some((c) => c.event === 'not_home' && c.result === 'no_location'));
  ok('with the photo, it is accepted as partial', (await me(BILAL, NH, [weak.id, await upload(BILAL), null, reading(0.00135), false])).value?.ok === true
    && (await rep(weak.id)).evidence === 'partial');

  const noCam = await asked({ arrival: JSON.stringify({ reason: 'denied' }) });
  ok('camera broken: a reason is needed', (await me(BILAL, NH, [noCam.id, null, 'no', JSON.stringify({ reason: 'denied' }), true])).value?.field === 'note');
  ok('with a reason, it goes to the office as unverified', (await me(BILAL, NH, [noCam.id, null, 'My phone camera is broken since this morning', JSON.stringify({ reason: 'denied' }), true])).value?.ok === true
    && (await rep(noCam.id)).evidence === 'unverified' && (await rep(noCam.id)).no_camera === true);
  const page = (await me(OWNER, `SELECT public.admin_not_home_reports()`)).value;
  const one = page.reports.find((x) => x.ref === noCam.ref);
  ok('the office sees the evidence grade and every check', one?.evidence === 'unverified' && one?.no_camera === true && one?.checks?.length >= 2);
  ok('the office can still confirm it, with a reason', (await me(OWNER, `SELECT public.admin_not_home($1, true, $2)`, [one.id, 'Rang her: she was out, confirmed by her neighbour.'])).value?.ok === true);
  const rv = (await setup(`SELECT * FROM public.location_reviews WHERE job_id = $1`, [noCam.id])).rows[0];
  ok('kept for good: who, why, and what the evidence was', rv?.decision === 'confirmed' && rv?.evidence?.evidence === 'unverified' && rv?.by_name === 'Zohaib');
  ok('a report never makes a visit fee', (await count(`SELECT count(*) AS n FROM public.visit_fees WHERE job_id IN ($1, $2, $3)`, [strong.id, weak.id, noCam.id])) === 0);
}

heading('Three unverified arrivals ask for a review');
{
  const f = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  const b = f.people.find((p) => p.id === BILAL)?.flags.find((x) => x.kind === 'unverified_arrivals');
  const expected = await count(`SELECT count(*) AS n FROM public.jobs WHERE pro_id = $1 AND arrival_review_status IN ('pending', 'rejected')`, [BILAL]);
  ok('his unverified, unapproved arrivals are counted', b?.n === expected && expected >= 3, `${JSON.stringify(b)} vs ${expected}`);
  ok('approved, verified and code arrivals are not', (await count(`SELECT count(*) AS n FROM public.jobs WHERE pro_id = $1 AND arrival_review_status IN ('approved', 'verified', 'code')`, [BILAL])) > 0);
  ok('the limit is shown', Number(f.limits.flag_unverified_arrivals) === 3);
  ok('he is still approved: nothing automatic', (await setup(`SELECT status FROM public.pros WHERE id = $1`, [BILAL])).rows[0].status === 'approved');
  const rec = (await me(BILAL, `SELECT public.pro_record()`)).value;
  ok('he sees his unverified arrivals and what the office said', rec?.unverified_arrivals?.some((x) => x.ref === wrongPin.ref && x.status === 'approved' && /pin/.test(x.note)));
}

heading('The settings are the office\'s, within limits');
{
  ok('the radius can be widened after the street test', (await me(OWNER, `SELECT public.admin_set_setting('arrival_radius_m', 150)`)).value?.ok === true);
  const { r } = await arriveWith(reading(0.00117));
  ok('130 metres now verifies', r?.arrival?.result === 'verified', JSON.stringify(r));
  await me(OWNER, `SELECT public.admin_set_setting('arrival_radius_m', 100)`);
  ok('coordinates can never be kept beyond 90 days', (await me(OWNER, `SELECT public.admin_set_setting('location_keep_days', 120)`)).value?.ok !== true);
  ok('a shorter time is allowed', (await me(OWNER, `SELECT public.admin_set_setting('location_keep_days', 60)`)).value?.ok === true);
  await me(OWNER, `SELECT public.admin_set_setting('location_keep_days', 90)`);
}

heading('Exact coordinates are erased after 90 days');
{
  const [a, b] = (await setup(`SELECT id FROM public.location_checks WHERE lat IS NOT NULL ORDER BY received_at LIMIT 2`)).rows.map((x) => x.id);
  await setup(`UPDATE public.location_checks SET received_at = now() - interval '91 days' WHERE id = $1`, [a]);
  await setup(`UPDATE public.location_checks SET received_at = now() - interval '89 days' WHERE id = $1`, [b]);
  ok('the nightly clean-up is scheduled', (await count(`SELECT count(*) AS n FROM cron.job WHERE jobname = 'pechkas-erase-old-locations'`)) === 1);
  const erased = (await setup(`SELECT public.erase_old_locations() AS n`)).rows[0].n;
  const ra = (await setup(`SELECT * FROM public.location_checks WHERE id = $1`, [a])).rows[0];
  const rb = (await setup(`SELECT * FROM public.location_checks WHERE id = $1`, [b])).rows[0];
  ok('91 days old: the coordinates are gone', erased >= 1 && ra.lat === null && ra.lng === null && ra.erased_at);
  ok('what the check found is kept: distance, accuracy, times, result', ra.distance_m !== null && ra.accuracy_m !== null && ra.result && ra.received_at);
  ok('89 days old: kept', rb.lat !== null);
}

heading('Nobody reads the tables');
denied('a signed-in person cannot read location checks', await as('authenticated', BILAL, `SELECT * FROM public.location_checks`));
denied('nor the reviews', await as('authenticated', OWNER, `SELECT * FROM public.location_reviews`));
denied('nor write a check directly', await as('authenticated', BILAL, `SELECT public.check_location('${wrongPin.id}', 'arrived', '{}'::jsonb)`));
denied('nor run the clean-up', await as('authenticated', OWNER, `SELECT public.erase_old_locations()`));
nothing('a stranger cannot arrive', await as('anon', null, `SELECT public.tech_step('${wrongPin.id}', 'on_way', NULL)`));

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /33\.69|72\.98|metres|Street|House|markaz|Rafiq|neighbour|pin is on/.test(`${x.title} ${x.body}`));
  ok('no message carried a coordinate, a distance, an address or the office\'s words', bad.length === 0, JSON.stringify(bad[0]));
}

heading('Deleted with the job and the account');
{
  const before = await count(`SELECT count(*) AS n FROM public.location_checks WHERE pro_id = $1`, [ASAD]);
  await arriveWith(reading(), { pro: ASAD, customer: SARA });
  ok('Asad has a check', (await count(`SELECT count(*) AS n FROM public.location_checks WHERE pro_id = $1`, [ASAD])) === before + 1);
  await setup(`DELETE FROM auth.users WHERE id = $1`, [SARA]);
  ok('her account gone, the checks on her jobs go too', (await count(`SELECT count(*) AS n FROM public.location_checks WHERE pro_id = $1`, [ASAD])) === before);
}

heading('Run a second time');
{
  const before = (await setup(`SELECT count(*)::int AS n FROM public.location_checks`)).rows[0].n;
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261111100000_arrival_by_location.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  ok('and changes no record', (await setup(`SELECT count(*)::int AS n FROM public.location_checks`)).rows[0].n === before
    && (await count(`SELECT count(*) AS n FROM public.jobs WHERE arrival_review_status = 'approved'`)) >= 1);
}

report();
