/**
 * Cancellations, late arrivals and no-shows (migration cancellations, the
 * owner's decision D10).
 *
 * What must hold: cancelling is free and never creates a visit fee; each
 * cancellation gets exactly one category, on the database's clock, in the
 * owner's order (the technician's lateness before the customer's), so none
 * counts against both; she may cancel at the door before the start code and
 * not after; a reason is one of the list; the office says whom it cancels
 * for; an On my way tapped hours early does not make her cancellation late;
 * a late arrival is recorded when he taps Arrived more than 30 minutes into
 * his window; a potential no-show is recorded once, 30 minutes after the
 * window, and told to her, him and the office; he sees and disputes his own
 * record; the office confirms or dismisses with a note; the flags are 3 late
 * cancellations, 3 late arrivals or 1 confirmed no-show, and the old two are
 * gone; nobody reads the tables; messages carry no addresses or notes; and
 * it runs twice, copying an older cancellation in as "before the rules".
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'c4';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const NADIA = `${P}555555-5555-4555-8555-555555555555`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
const OWNER_PHONE = `${P}888888-8888-4888-8888-888888888888`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007331111', null, 'customer', 'Ayesha'],
  [SARA, '923007332222', null, 'customer', 'Sara'],
  [NADIA, '923007335555', null, 'customer', 'Nadia'],
  [BILAL, '923007333333', null, 'pro', 'Bilal'],
  [ASAD, '923007334444', null, 'pro', 'Asad'],
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
// The tests need a window starting at any hour, a few hours either side of
// now, so they can be late or early on the real clock. Which hours a window
// may start at is tested in offerwhen.test.mjs.
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
  const name = `${who}/file-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const mine = async (who, id) => ((await me(who, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === id);
const proJob = async (who, id) => ((await me(who, `SELECT public.pro_my_jobs()`)).value ?? []).find((x) => x.id === id);
const record = async (id) => (await setup(`SELECT * FROM public.cancellations WHERE job_id = $1`, [id])).rows[0];
const incident = async (id) => (await setup(`SELECT * FROM public.pro_incidents WHERE job_id = $1`, [id])).rows[0];
const count = async (sql, params = []) => Number((await setup(sql, params)).rows[0].n);
const CANCEL = `SELECT public.cancel_job($1, $2, $3)`;

let n = 0;
async function post(customer = AYESHA) {
  n += 1;
  const posted = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`AC number ${n} is not cooling`])).value;
  if (!posted?.ok) throw new Error(`post failed: ${JSON.stringify(posted)}`);
  return posted;
}
/**
 * A job given to `pro`, his two-hour window starting `hours` whole hours
 * from the top of this hour on Pakistan's clock (so +1 is 1 to 60 minutes
 * away, -1 is 60 to 120 minutes ago).
 */
async function chosen(hours, pro = BILAL, customer = AYESHA) {
  const posted = await post(customer);
  await me(pro, `SELECT public.make_offer($1, 300000, 20, NULL)`, [posted.id]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [posted.id, pro])).rows[0]?.id;
  if (!offer) throw new Error('no offer');
  const c = (await me(customer, `SELECT public.choose_offer($1)`, [offer])).value;
  if (!c?.ok) throw new Error(`choose failed: ${JSON.stringify(c)}`);
  await setup(`UPDATE public.jobs SET when_kind = 'later', when_part = NULL,
      when_date = (date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') + make_interval(hours => $2))::date,
      when_from = extract(hour FROM date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') + make_interval(hours => $2))::smallint
    WHERE id = $1`, [posted.id, hours]);
  await sent();
  return posted;
}
const onWay = (pro, id) => me(pro, `SELECT public.tech_step($1, 'chosen')`, [id]);
const arrive = (pro, id) => me(pro, `SELECT public.tech_step($1, 'on_way')`, [id]);
const start = async (pro, id) => me(pro, `SELECT public.start_work($1, $2, $3::jsonb)`, [id, (await job(id)).start_code, JSON.stringify([await upload(pro)])]);

// =============================================================================
heading('The rule, at its edges');
{
  const S = '2026-11-12 10:00:00+05';
  const kind = async (at, onWayAt, arrivedAt, stage, isChosen = true, startAt = S) =>
    (await setup(`SELECT public.cancel_kind($1::timestamptz, $2::timestamptz, $3::timestamptz, $4::timestamptz, $5, $6) AS k`,
      [at, startAt, onWayAt, arrivedAt, stage, isChosen])).rows[0].k;
  const t = (mins) => `(timestamptz '${S}' + interval '${mins} minutes')`;
  const at = async (mins) => (await setup(`SELECT ${t(mins)} AS v`)).rows[0].v.toISOString();
  ok('nobody chosen yet: before choosing, whatever the time', (await kind(await at(200), null, null, null, false)) === 'before_choosing');
  ok('three hours before his window: normal', (await kind(await at(-180), null, null, 'chosen')) === 'normal');
  ok('2 hours and a minute before: normal', (await kind(await at(-121), null, null, 'chosen')) === 'normal');
  ok('exactly 2 hours before: late', (await kind(await at(-120), null, null, 'chosen')) === 'late');
  ok('On my way 3 hours before, cancelled 2h30 before: late', (await kind(await at(-150), await at(-180), null, 'on_way')) === 'late');
  ok('On my way 3 hours and a minute before: not travelling yet, so normal', (await kind(await at(-150), await at(-181), null, 'on_way')) === 'normal');
  ok('at the door, early: late', (await kind(await at(-140), await at(-170), await at(-145), 'arrived')) === 'late');
  ok('29 minutes into his window, not arrived: late', (await kind(await at(29), null, null, 'on_way')) === 'late');
  ok('30 minutes in, not arrived: his lateness, not hers', (await kind(await at(30), null, null, 'on_way')) === 'pro_late');
  ok('at the door after he came 31 minutes late: still his', (await kind(await at(40), null, await at(31), 'arrived')) === 'pro_late');
  ok('at the door after he came 29 minutes in: hers', (await kind(await at(40), null, await at(29), 'arrived')) === 'late');
  ok('2h29 in, not arrived: late arrival', (await kind(await at(149), null, null, 'on_way')) === 'pro_late');
  ok('2h30 in (30 minutes after the window), not arrived: a no-show', (await kind(await at(150), null, null, 'chosen')) === 'no_show');
  ok('an older job with no window: normal', (await kind(await at(0), null, null, 'chosen', true, null)) === 'normal');
  ok('an older job with no window, after On my way: late', (await kind(await at(0), await at(-5), null, 'on_way', true, null)) === 'late');
  ok('an older job with no window, at the door: late', (await kind(await at(0), null, await at(-5), 'arrived', true, null)) === 'late');
}

// =============================================================================
heading('Before anybody is chosen');
{
  const j = await post(SARA);
  ok('a reason must be one of the list', (await me(SARA, CANCEL, [j.id, null, 'too_expensive'])).value?.field === 'reason');
  const r = (await me(SARA, CANCEL, [j.id, 'Neighbour fixed it', 'someone_else'])).value;
  ok('she cancels free, and is told what it counted as', r?.ok === true && r?.category === 'before_choosing', JSON.stringify(r));
  const c = await record(j.id);
  ok('one record: who, when, the reason and its words', c?.category === 'before_choosing' && c?.cancelled_by === 'customer'
    && c?.reason_code === 'someone_else' && c?.reason_text === 'Neighbour fixed it' && c?.pro_id === null && c?.cancelled_at);
  ok('her job says how it was recorded', (await mine(SARA, j.id))?.cancel_category === 'before_choosing' && (await mine(SARA, j.id))?.cancel_code === 'someone_else');
  ok('the reason words are optional', (await me(SARA, CANCEL, [(await post(SARA)).id, null, 'plans_changed'])).value?.ok === true);
  ok('and so is the reason itself (older copies send none)', (await me(SARA, `SELECT public.cancel_job($1, NULL)`, [(await post(SARA)).id])).value?.ok === true);
}

heading('Chosen, well ahead of his window: normal');
{
  const j = await chosen(5);
  const card = await mine(AYESHA, j.id);
  ok('her job says she may cancel and that it would be normal', card?.can_cancel === true && card?.cancel_kind_now === 'normal' && card?.pro_late === false, JSON.stringify(card).slice(0, 200));
  ok('she cancels', (await me(AYESHA, CANCEL, [j.id, null, 'plans_changed'])).value?.category === 'normal');
  ok('nothing on his record', (await incident(j.id)) === undefined);
  ok('he is named on her record, whose job it was', (await record(j.id))?.pro_id === BILAL && (await record(j.id))?.stage === 'chosen');
}

heading('Within 2 hours of his window: late, still free');
{
  const j = await chosen(1);
  ok('her job warns it would count as late', (await mine(AYESHA, j.id))?.cancel_kind_now === 'late');
  const r = (await me(AYESHA, CANCEL, [j.id, null, 'not_needed'])).value;
  ok('she cancels, free', r?.ok === true && r?.category === 'late');
  ok('no visit fee, nothing to collect', Number((await count(`SELECT count(*) AS n FROM public.visit_fees WHERE job_id = $1`, [j.id]))) === 0
    && (await job(j.id)).collect_paisa === null);
  ok('nothing on his record', (await incident(j.id)) === undefined);
}

heading('On my way: late only if he set off within 3 hours of his window');
{
  const near = await chosen(3);
  await onWay(BILAL, near.id);
  ok('he set off 2 to 3 hours before: her cancellation is late', (await me(AYESHA, CANCEL, [near.id, null, 'plans_changed'])).value?.category === 'late');
  ok('and the record keeps when he set off', Boolean((await record(near.id))?.on_way_at));
  const early = await chosen(5);
  await onWay(BILAL, early.id);
  ok('he tapped On my way 4 or 5 hours early: hers is normal', (await mine(AYESHA, early.id))?.cancel_kind_now === 'normal'
    && (await me(AYESHA, CANCEL, [early.id, null, 'plans_changed'])).value?.category === 'normal');
}

heading('At the door, before the start code');
{
  const j = await chosen(1);
  await onWay(BILAL, j.id);
  await arrive(BILAL, j.id);
  ok('he arrived on time: nothing on his record', (await incident(j.id)) === undefined);
  ok('she may still cancel, and is told it would be late', (await mine(AYESHA, j.id))?.can_cancel === true && (await mine(AYESHA, j.id))?.cancel_kind_now === 'late');
  const r = (await me(AYESHA, CANCEL, [j.id, null, 'not_needed'])).value;
  ok('"I no longer need this service": free, late', r?.ok === true && r?.category === 'late', JSON.stringify(r));
  ok('the record says it was at the door', (await record(j.id))?.stage === 'arrived' && Boolean((await record(j.id))?.arrived_at));
  ok('a cancellation is never a visit fee', (await count(`SELECT count(*) AS n FROM public.visit_fees WHERE job_id = $1`, [j.id])) === 0
    && (await job(j.id)).stop_reason === null && (await job(j.id)).status === 'cancelled');
  ok('he is told it was called off', to(await sent(), 'bilal').length >= 1);
}

heading('After the start code it is the office\'s');
{
  const j = await chosen(1);
  await onWay(BILAL, j.id);
  await arrive(BILAL, j.id);
  ok('he starts with her code', (await start(BILAL, j.id)).value?.ok === true);
  ok('her job no longer offers to cancel', (await mine(AYESHA, j.id))?.can_cancel === false);
  const r = (await me(AYESHA, CANCEL, [j.id, null, 'not_needed'])).value;
  ok('she is refused and told to call the office', r?.ok === false && /office/.test(r?.why ?? ''), JSON.stringify(r));
  ok('the office must say whom it cancels for, from the list', (await me(OWNER, `SELECT public.admin_cancel_job($1, $2, $3)`, [j.id, 'She asked us to stop', 'nobody'])).value?.field === 'for');
  const txns = await count(`SELECT count(*) AS n FROM public.ledger_txns`);
  ok('the office cancels for her', (await me(OWNER, `SELECT public.admin_cancel_job($1, $2, $3)`, [j.id, 'She asked us to stop the work', 'customer'])).value?.ok === true);
  const c = await record(j.id);
  ok('recorded as the office\'s, for the customer', c?.category === 'office' && c?.cancelled_by === 'office' && c?.cancel_for === 'customer' && c?.stage === 'working');
  ok('no visit fee and no money moves', (await count(`SELECT count(*) AS n FROM public.visit_fees WHERE job_id = $1`, [j.id])) === 0
    && (await count(`SELECT count(*) AS n FROM public.ledger_txns`)) === txns);
  const k = await post(SARA);
  ok('an office cancel with no "for" says other', (await me(OWNER, `SELECT public.admin_cancel_job($1, $2)`, [k.id, 'Duplicate job'])).value?.ok === true
    && (await record(k.id))?.cancel_for === 'other');
  ok('a customer cannot use the office\'s cancel', (await me(SARA, `SELECT public.admin_cancel_job($1, $2, $3)`, [(await post(SARA)).id, 'x', 'customer'])).value?.ok === false);
}

heading('He is late: her cancellation is his lateness, not hers');
{
  const j = await chosen(-1);
  await onWay(BILAL, j.id);
  const card = await mine(AYESHA, j.id);
  ok('her job says he is late, and that cancelling would not count against her', card?.pro_late === true && card?.cancel_kind_now === 'pro_late');
  ok('his own job says he is late', (await proJob(BILAL, j.id))?.late === true);
  ok('she cancels', (await me(AYESHA, CANCEL, [j.id, null, 'pro_late'])).value?.category === 'pro_late');
  const i = await incident(j.id);
  ok('a late arrival on his record, from her waiting', i?.kind === 'late_arrival' && i?.status === 'recorded' && i?.how === 'cancelled_waiting' && i?.pro_id === BILAL && i?.minutes_late >= 60);
}

heading('He taps Arrived late');
{
  const j = await chosen(-1);
  await onWay(BILAL, j.id);
  await arrive(BILAL, j.id);
  const i = await incident(j.id);
  ok('a late arrival, with how late', i?.kind === 'late_arrival' && i?.how === 'arrived_late' && i?.minutes_late >= 60 && i?.minutes_late < 121 && Boolean(i?.arrived_at));
  const m = await sent();
  ok('he is told, with the minutes', to(m, 'bilal').some((x) => x.title === `Late arrival recorded: ${j.ref}` && /\d+ minutes/.test(x.body)));
  ok('nobody else is told it was late', !m.some((x) => x.to !== token('bilal') && /late/i.test(`${x.title} ${x.body}`)));
  ok('she cancels at the door: his lateness, so not counted against her', (await me(AYESHA, CANCEL, [j.id, null, 'pro_late'])).value?.category === 'pro_late');
  ok('still one record on him for this job', (await count(`SELECT count(*) AS n FROM public.pro_incidents WHERE job_id = $1`, [j.id])) === 1);
}

heading('A potential no-show, on the clock');
let noShow;
{
  noShow = await chosen(-3);
  const other = await chosen(-1, ASAD, SARA);
  const found = (await setup(`SELECT public.no_show_clock() AS n`)).rows[0].n;
  ok('30 minutes after his window, not arrived: found', found === 1, String(found));
  const i = await incident(noShow.id);
  ok('recorded as potential, never confirmed by the clock', i?.kind === 'no_show' && i?.status === 'potential' && i?.how === 'clock');
  ok('a job still inside its window is not', (await incident(other.id)) === undefined);
  const m = await sent();
  ok('she is told she can cancel free or wait', to(m, 'ayesha').some((x) => x.title === 'Bilal has not arrived' && /cancel free/.test(x.body)));
  ok('he is told', to(m, 'bilal').some((x) => x.title === `You have not arrived: ${noShow.ref}`));
  ok('the office is told', to(m, 'zohaib').some((x) => x.title === `Technician not arrived: ${noShow.ref}`));
  ok('the clock again finds nothing new', (await setup(`SELECT public.no_show_clock() AS n`)).rows[0].n === 0 && (await sent()).length === 0);
  const card = await mine(AYESHA, noShow.id);
  ok('her job says he has not come', card?.no_show === true && card?.cancel_kind_now === 'no_show' && card?.can_cancel === true);
  ok('she cancels, free', (await me(AYESHA, CANCEL, [noShow.id, null, 'pro_late'])).value?.category === 'no_show');
  ok('the no-show stays potential until the office looks', (await incident(noShow.id))?.status === 'potential');
  await me(SARA, CANCEL, [other.id, null, 'plans_changed']);
}
{
  const j = await chosen(-3);
  await setup(`SELECT public.no_show_clock()`);
  await sent();
  await onWay(BILAL, j.id);
  await arrive(BILAL, j.id);
  const i = await incident(j.id);
  ok('he turns up after all: it becomes a late arrival', i?.kind === 'late_arrival' && i?.status === 'recorded' && i?.how === 'arrived_late' && i?.minutes_late >= 180);
  ok('and her job no longer says he has not come', (await mine(AYESHA, j.id))?.no_show === false);
  await start(BILAL, j.id);
}

// =============================================================================
heading('His record, and disputing it');
let rec = (await me(BILAL, `SELECT public.pro_record()`)).value;
ok('Bilal sees his late arrivals and the no-show, with the thresholds', rec?.late_arrivals === 3 && rec?.no_shows === 0
  && rec?.incidents?.length === 4 && Number(rec?.review_at) === 3 && Number(rec?.days) === 60, JSON.stringify(rec).slice(0, 300));
ok('a potential no-show is not yet counted as one', rec.incidents.some((x) => x.kind === 'no_show' && x.status === 'potential'));
ok('his record names jobs only by number and trade, never her address', !JSON.stringify(rec).match(/Street|House|markaz|Rafiq|Ayesha/));
{
  // Sara cancelled the job Asad was an hour late for: his own lateness, on his own record.
  const asad = (await me(ASAD, `SELECT public.pro_record()`)).value?.incidents ?? [];
  ok('Asad sees only his own', asad.length === 1 && asad[0].how === 'cancelled_waiting' && !asad.some((x) => x.ref === noShow.ref));
}
const nsInc = (await incident(noShow.id)).id;
ok('a dispute needs words', (await me(BILAL, `SELECT public.pro_dispute_incident($1, $2)`, [nsInc, 'no'])).value?.field === 'text');
ok('nobody else can dispute it', (await me(ASAD, `SELECT public.pro_dispute_incident($1, $2)`, [nsInc, 'He was there, I saw him'])).value?.ok === false
  && (await me(AYESHA, `SELECT public.pro_dispute_incident($1, $2)`, [nsInc, 'He was there, I saw him'])).value?.ok === false);
ok('he disputes it', (await me(BILAL, `SELECT public.pro_dispute_incident($1, $2)`, [nsInc, 'I was at the gate, the guard sent me away'])).value?.ok === true);
{
  const m = await sent();
  ok('the office is told, without his words', to(m, 'zohaib').some((x) => x.title === `A technician disputes a record: ${noShow.ref}` && !/guard/.test(x.body)));
}
ok('once', (await me(BILAL, `SELECT public.pro_dispute_incident($1, $2)`, [nsInc, 'Again: I was at the gate'])).value?.ok === false);

heading('The office decides');
ok('a customer cannot', (await me(AYESHA, `SELECT public.admin_incident($1, true, $2)`, [nsInc, 'He did not come at all'])).value?.ok === false);
ok('a note is needed', (await me(OWNER, `SELECT public.admin_incident($1, true, '')`, [nsInc])).value?.field === 'note');
ok('the office confirms the no-show', (await me(OWNER, `SELECT public.admin_incident($1, true, $2)`, [nsInc, 'Rang both. He went to the wrong sector.'])).value?.ok === true);
{
  const i = await incident(noShow.id);
  ok('confirmed, by name, with the note', i?.status === 'confirmed' && i?.decided_by_name === 'Zohaib' && /wrong sector/.test(i?.office_note));
  const m = await sent();
  ok('he is told to read it in the app, not the note itself', to(m, 'bilal').some((x) => x.title === `The office has looked at job ${noShow.ref}` && !/wrong sector/.test(x.body)));
}
ok('it cannot be decided twice', (await me(OWNER, `SELECT public.admin_incident($1, false, $2)`, [nsInc, 'Changed my mind about this'])).value?.ok === false);
rec = (await me(BILAL, `SELECT public.pro_record()`)).value;
ok('his record shows the outcome and the office\'s words', rec?.no_shows === 1 && rec.incidents.some((x) => x.id === nsInc && x.status === 'confirmed' && /wrong sector/.test(x.office_note) && x.can_dispute === false));

heading('The flags');
let flags = (await me(OWNER, `SELECT public.admin_flags()`)).value;
const who = (id) => flags?.people?.find((x) => x.id === id);
const kinds = (id) => (who(id)?.flags ?? []).map((x) => x.kind).sort().join(',');
ok('Bilal: 3 late arrivals and 1 confirmed no-show', kinds(BILAL) === 'late_arrivals,no_shows'
  && who(BILAL).flags.find((x) => x.kind === 'late_arrivals').n === 3, kinds(BILAL));
ok('the retired flags are never raised', !flags.people.some((p) => p.flags.some((x) => x.kind === 'cancelled' || x.kind === 'cancels')));
ok('nor shown among the limits', flags.limits.flag_cancelled === undefined && flags.limits.flag_customer_cancels === undefined
  && Number(flags.limits.flag_late_cancels) === 3 && Number(flags.limits.flag_late_arrivals) === 3 && Number(flags.limits.flag_no_shows) === 1);
// Ayesha so far: late x3 (within 2 hours, On my way, at the door), normal x2, his lateness x3.
ok('Ayesha: 3 late cancellations, and none of his lateness counted', kinds(AYESHA) === 'late_cancels'
  && who(AYESHA).flags[0].n === 3, JSON.stringify(who(AYESHA)?.flags));
ok('Sara, who only cancelled early or before choosing, is not flagged', !who(SARA));
{
  const a = await me(OWNER, `SELECT public.admin_set_setting('flag_cancelled', 9)`);
  ok('the office can no longer change a retired flag', a.value?.ok !== true);
  ok('but can change the new ones', (await me(OWNER, `SELECT public.admin_set_setting('flag_late_cancels', 4)`)).value?.ok === true);
  flags = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  ok('raised to 4, Ayesha is no longer flagged', !who(AYESHA));
  await me(OWNER, `SELECT public.admin_set_setting('flag_late_cancels', 3)`);
}
{
  await me(OWNER, `SELECT public.admin_incident($1, false, $2)`, [(await setup(`SELECT id FROM public.pro_incidents WHERE pro_id = $1 AND how = 'arrived_late' ORDER BY detected_at LIMIT 1`, [BILAL])).rows[0].id, 'Traffic accident on the Expressway, confirmed']);
  flags = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  ok('a dismissed late arrival no longer counts', kinds(BILAL) === 'no_shows', kinds(BILAL));
  ok('nor in his own count', (await me(BILAL, `SELECT public.pro_record()`)).value?.late_arrivals === 2);
}
ok('nothing happened to either automatically', (await setup(`SELECT status FROM public.pros WHERE id = $1`, [BILAL])).rows[0].status === 'approved'
  && (await me(AYESHA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Still able to post here', p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12', p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`)).value?.ok === true);

heading('The office\'s Cancellations page');
{
  const raw = await me(OWNER, `SELECT public.admin_cancellations()`);
  const page = raw.value;
  if (!page) console.log(raw.error);
  ok('every cancellation, newest first, with its category', page?.cancellations?.length >= 14
    && page.cancellations.some((x) => x.category === 'office' && x.cancel_for === 'customer')
    && page.cancellations.some((x) => x.category === 'no_show'));
  const ay = page.customers_to_review.find((x) => x.customer_id === AYESHA);
  ok('Ayesha is waiting to be reviewed, with 3 late cancellations', Number(ay?.late) === 3 && Number(ay?.unreviewed) === 3 && Boolean(ay?.phone));
  ok('incidents waiting on the office come first', page.incidents[0]?.needs_you === true || page.incidents.every((x) => !x.needs_you));
  ok('per technician counts', page.pros.some((x) => x.pro_id === BILAL && Number(x.no_shows) === 1 && Number(x.late_arrivals) === 2));
  ok('nobody but the office can read it', (await me(AYESHA, `SELECT public.admin_cancellations()`)).value === null
    && (await me(BILAL, `SELECT public.admin_cancellations()`)).value === null);
  ok('a review needs a note', (await me(OWNER, `SELECT public.admin_review_cancellations($1, '')`, [AYESHA])).value?.field === 'note');
  ok('a customer cannot review herself', (await me(AYESHA, `SELECT public.admin_review_cancellations($1, $2)`, [AYESHA, 'All fine with me'])).value?.ok === false);
  ok('the office reviews her', (await me(OWNER, `SELECT public.admin_review_cancellations($1, $2)`, [AYESHA, 'Rang her. Plans keep changing; no action.'])).value?.reviewed === 3);
  const after = (await me(OWNER, `SELECT public.admin_cancellations()`)).value;
  ok('she is no longer waiting', !after.customers_to_review.some((x) => x.customer_id === AYESHA));
  ok('the note is kept on each, by name', after.cancellations.filter((x) => x.customer_id === AYESHA && x.category === 'late').every((x) => x.reviewed_by_name === 'Zohaib' && /no action/.test(x.review_note)));
  ok('reviewing again finds nothing to review', (await me(OWNER, `SELECT public.admin_review_cancellations($1, $2)`, [AYESHA, 'Rang her again today'])).value?.ok === false);
}

heading('Nobody reads the tables');
denied('a signed-in person cannot read cancellations', await as('authenticated', AYESHA, `SELECT * FROM public.cancellations`));
denied('nor the technicians\' record', await as('authenticated', BILAL, `SELECT * FROM public.pro_incidents`));
denied('nor change his own record', await as('authenticated', BILAL, `UPDATE public.pro_incidents SET status = 'dismissed' WHERE pro_id = '${BILAL}'`));
denied('nor run the clock', await as('authenticated', AYESHA, `SELECT public.no_show_clock()`));
denied('nor ask the rule directly', await as('authenticated', AYESHA, `SELECT public.cancel_kind(now(), now(), NULL, NULL, 'chosen', true)`));
nothing('a stranger cannot cancel anything', await as('anon', null, `SELECT public.cancel_job('${noShow.id}', NULL, NULL)`));

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /Street|House|markaz|Rafiq|92300|\+92|guard|wrong sector|Expressway|no action|Neighbour/.test(`${x.title} ${x.body}`));
  ok('no message carried an address, a number, his words or the office\'s notes', bad.length === 0, JSON.stringify(bad[0]));
  // Only potential no-shows and disputes reach the office's phone at once; cancellations wait on its page.
  ok('a cancellation alerted nobody at the office', all.filter((x) => x.to === token('zohaib')).every((x) => /^(Technician not arrived|A technician disputes)/.test(x.title)));
}

heading('Deleted with the account');
{
  const asadBefore = await count(`SELECT count(*) AS n FROM public.pro_incidents WHERE pro_id = $1`, [ASAD]);
  await setup(`DELETE FROM auth.users WHERE id = $1`, [ASAD]);
  ok('a technician who deletes his account takes his record with him', asadBefore === 1
    && (await count(`SELECT count(*) AS n FROM public.pro_incidents WHERE pro_id = $1`, [ASAD])) === 0);
  ok('and is no longer named on a customer\'s cancellation', (await count(`SELECT count(*) AS n FROM public.cancellations WHERE pro_id = $1`, [ASAD])) === 0);
  const sara = await count(`SELECT count(*) AS n FROM public.cancellations WHERE customer_id = $1`, [SARA]);
  await setup(`DELETE FROM auth.users WHERE id = $1`, [SARA]);
  ok('a customer who deletes hers takes her cancellations with her', sara > 0
    && (await count(`SELECT count(*) AS n FROM public.cancellations WHERE customer_id = $1`, [SARA])) === 0);
}

heading('Run a second time');
{
  // An older cancellation, as if it had happened before this migration ran.
  const old = await post(NADIA);
  await setup(`UPDATE public.jobs SET status = 'cancelled', cancelled_by = 'customer', cancel_reason = 'Old one' WHERE id = $1`, [old.id]);
  await setup(`DELETE FROM public.cancellations WHERE job_id = $1`, [old.id]);
  const before = (await setup(`SELECT job_id, category FROM public.cancellations ORDER BY job_id`)).rows;
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261110100000_cancellations.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  const now = (await setup(`SELECT job_id, category FROM public.cancellations ORDER BY job_id`)).rows;
  ok('a cancellation from before the rules is copied in as that, and counted nowhere', (await record(old.id))?.category === 'before_rules'
    && (await record(old.id))?.reason_text === 'Old one');
  ok('nothing already recorded is reinterpreted', before.every((b) => now.find((x) => x.job_id === b.job_id)?.category === b.category));
  ok('the clock is scheduled once', (await count(`SELECT count(*) AS n FROM cron.job WHERE jobname = 'pechkas-no-show-clock'`)) === 1);
}

report();
