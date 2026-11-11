/**
 * A technician who cannot come (migration reliability, the owner's decision
 * D11, 11 November 2026).
 *
 * What must hold: "I can't come" needs a reason, works only until his arrival
 * is satisfied and only while the job is still his, and is normal more than 2
 * hours before his window and late after that, by the database's clock; "I'm
 * running late" tells her the time, at most twice, keeps every estimate and
 * never erases a real late arrival; "Find another technician" is open while he
 * has not arrived, is never her cancellation, records his lateness exactly as
 * D10 would and counts a late switch with no fault of his as her late
 * cancellation unless he had warned her; both send the SAME job back, with its
 * words, photos, address and price, his assignment written to the history
 * first, his window, fee and code cleared, the day moved when none is left,
 * and the man who left shut out of it for good; turned-down offers may come
 * again; chat belongs to one assignment; the office pauses new offers for 1, 3
 * or 7 days with a reason, never touching jobs he has, ending by itself, every
 * line kept; the ladder is a suggestion; no money moves; D10 and D34 records
 * are one per technician per job; nobody reads the tables; no notification
 * carries an address or anybody's words; and it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e7';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const KAMRAN = `${P}555555-5555-4555-8555-555555555555`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007661111', null, 'customer', 'Ayesha'],
  [SARA, '923007662222', null, 'customer', 'Sara'],
  [BILAL, '923007663333', null, 'pro', 'Bilal'],
  [ASAD, '923007664444', null, 'pro', 'Asad'],
  [KAMRAN, '923007665555', null, 'pro', 'Kamran'],
  [OWNER, null, 'owner@example.com', null, null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood'], [KAMRAN, 'Kamran Ali']]) {
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
for (const [who, name] of [[AYESHA, 'ayesha'], [SARA, 'sara'], [BILAL, 'bilal'], [ASAD, 'asad'], [KAMRAN, 'kamran']]) {
  await me(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(name)]);
}

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
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const count = async (sql, params = []) => Number((await setup(sql, params)).rows[0].n);
const mine = async (who, id) => ((await me(who, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === id);
const proJob = async (who, id) => ((await me(who, `SELECT public.pro_my_jobs()`)).value ?? []).find((x) => x.id === id);
const feed = async (who) => (await me(who, `SELECT public.pro_feed()`)).value;
const mayAs = async (id, pro) => (await setup(`SELECT public.pro_may_see_as($1, $2) AS v`, [id, pro])).rows[0].v;
const offerOf = async (id, pro) => (await setup(`SELECT * FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [id, pro])).rows[0];
const choose = async (customer, id, pro) => (await me(customer, `SELECT public.choose_offer($1)`, [(await offerOf(id, pro)).id])).value;
const pkToday = async () => (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d`)).rows[0].d;
const pkHour = async () => Number((await setup(`SELECT extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::int AS h`)).rows[0].h);

const PIN = { lat: 33.695, lng: 72.985 };
let tick = 0;
function reading(dLat = 0.00018) {
  tick += 1;
  const now = Date.now();
  return JSON.stringify({ lat: PIN.lat + dLat, lng: PIN.lng, accuracy: 12, fix_at: new Date(now - 3000 - tick).toISOString(), sent_at: new Date(now).toISOString(), mocked: false });
}
const ARRIVE = `SELECT public.tech_step($1, 'on_way', $2::jsonb)`;
const WITHDRAW = `SELECT public.pro_withdraw($1, $2, $3)`;
const LATE = `SELECT public.pro_running_late($1, now() + make_interval(mins => $2))`;
const ANOTHER = `SELECT public.customer_find_another($1)`;

let n = 0;
/** A job she posted, offered on by `others` too, given to `pro`, his window `hours` from the top of this hour. */
async function chosen({ hours = 5, customer = AYESHA, pro = BILAL, others = [], onWay = false, window = true } = {}) {
  n += 1;
  const posted = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq',
    p_lat => ${PIN.lat}, p_lng => ${PIN.lng}, p_media => '[]'::jsonb)`, [`AC number ${n} is not cooling`])).value;
  if (!posted?.ok) throw new Error(`post failed: ${JSON.stringify(posted)}`);
  for (const p of [pro, ...others]) await me(p, `SELECT public.make_offer($1, 300000, 20, NULL)`, [posted.id]);
  const c = await choose(customer, posted.id, pro);
  if (!c?.ok) throw new Error(`choose failed: ${JSON.stringify(c)}`);
  if (window) {
    await setup(`UPDATE public.jobs SET when_kind = 'later', when_part = NULL,
        when_date = (date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') + make_interval(hours => $2))::date,
        when_from = extract(hour FROM date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') + make_interval(hours => $2))::smallint
      WHERE id = $1`, [posted.id, hours]);
  }
  if (onWay) await me(pro, `SELECT public.tech_step($1, 'chosen')`, [posted.id]);
  await sent();
  return posted;
}

// =============================================================================
heading('"I can\'t come", more than 2 hours before his time: normal, and the same job goes back');
const a = await chosen({ hours: 5, others: [ASAD] });
{
  await setup(`INSERT INTO public.job_media (job_id, kind, path) VALUES ($1, 'photo', $2)`, [a.id, `${AYESHA}/rel-photo-1.jpg`]);
  await me(AYESHA, `SELECT public.send_message($1, 'The gate is the green one')`, [a.id]);
  await me(BILAL, `SELECT public.send_message($1, 'Noted, thank you')`, [a.id]);
  const before = await job(a.id);
  const jobsBefore = await count(`SELECT count(*) AS n FROM public.jobs WHERE customer_id = $1`, [AYESHA]);
  ok('he is offered the button, as a normal withdrawal', (await proJob(BILAL, a.id))?.withdraw_kind_now === 'normal');
  ok('a reason is required', (await me(BILAL, WITHDRAW, [a.id, null, null])).value?.field === 'reason');
  ok('an unknown reason is refused', (await me(BILAL, WITHDRAW, [a.id, 'bored', null])).value?.field === 'reason');
  ok('"Other" needs a few words', (await me(BILAL, WITHDRAW, [a.id, 'other', 'no'])).value?.field === 'note');
  ok('a phone number in the note is refused', (await me(BILAL, WITHDRAW, [a.id, 'vehicle', 'ring me 03001234567'])).value?.field === 'note');
  ok('another technician cannot withdraw him', (await me(ASAD, WITHDRAW, [a.id, 'vehicle', null])).value?.ok === false);
  ok('nor can she', (await me(AYESHA, WITHDRAW, [a.id, 'vehicle', null])).value?.ok === false);
  ok('nothing was recorded by the refusals', (await count(`SELECT count(*) AS n FROM public.pro_withdrawals WHERE job_id = $1`, [a.id])) === 0);

  await sent();
  const r = (await me(BILAL, WITHDRAW, [a.id, 'vehicle', 'The bike will not start'])).value;
  ok('with a reason, it works: normal', r?.ok === true && r?.kind === 'normal', JSON.stringify(r));
  const after = await job(a.id);
  ok('the same job is open again, nobody chosen', after.status === 'open' && after.pro_id === null && after.stage === null);
  ok('her agreed price, his fee and his arrival are cleared', after.agreed_paisa === null && after.visit_fee_paisa === null
    && after.on_way_at === null && after.arrived_at === null && after.assigned_at === null);
  ok('her words, address, pin, price and day are kept', after.description === before.description && after.street === before.street
    && after.house === before.house && after.landmark === before.landmark && after.gate_note === before.gate_note
    && after.lat === before.lat && after.offered_paisa === before.offered_paisa && after.ref === before.ref
    && String(after.when_date) === String(before.when_date) && after.when_from === before.when_from);
  ok('her photo is still on the job', (await count(`SELECT count(*) AS n FROM public.job_media WHERE job_id = $1`, [a.id])) === 1);
  ok('no second job was made', (await count(`SELECT count(*) AS n FROM public.jobs WHERE customer_id = $1`, [AYESHA])) === jobsBefore);
  const h = (await setup(`SELECT * FROM public.job_assignments WHERE job_id = $1`, [a.id])).rows;
  ok('his assignment is in the history, as it was', h.length === 1 && h[0].pro_id === BILAL && h[0].ended === 'withdrawn'
    && Number(h[0].agreed_paisa) === 300000 && h[0].assigned_at && h[0].window_start && h[0].note === 'The bike will not start');
  const w = (await setup(`SELECT * FROM public.pro_withdrawals WHERE job_id = $1`, [a.id])).rows;
  ok('his withdrawal is recorded with the reason and the server\'s time', w.length === 1 && w[0].kind === 'normal' && w[0].reason === 'vehicle' && w[0].stage === 'chosen' && w[0].at);
  const m = await sent();
  ok('she is told, with an apology, and nothing to pay', to(m, 'ayesha').some((x) => /sorry/i.test(x.title) && /Nothing to pay/.test(x.body)));
  ok('the other technicians who may see it are told it is open', to(m, 'asad').length === 1 && to(m, 'kamran').length === 1 && to(m, 'bilal').length === 0, JSON.stringify(m.map((x) => [x.to.slice(18, 24), x.title])));
  ok('no money moved: no fee, no ledger line, no cancellation', (await count(`SELECT count(*) AS n FROM public.visit_fees WHERE job_id = $1`, [a.id])) === 0
    && (await count(`SELECT count(*) AS n FROM public.ledger_txns WHERE job_ref = $1`, [after.ref])) === 0
    && (await count(`SELECT count(*) AS n FROM public.cancellations WHERE job_id = $1`, [a.id])) === 0);
  const mj = await mine(AYESHA, a.id);
  ok('her screen says who left and how', mj?.reopened?.ended === 'withdrawn' && mj?.reopened?.pro === 'Bilal' && Number(mj?.technicians_before) === 1);

  heading('The man who left is shut out of that job for good');
  ok('he cannot see it', (await mayAs(a.id, BILAL)) === false);
  ok('it is not in his list', !((await feed(BILAL))?.jobs ?? []).some((x) => x.id === a.id));
  ok('he cannot offer on it again', (await me(BILAL, `SELECT public.make_offer($1, 300000, 20, NULL)`, [a.id])).value?.ok === false);
  ok('nor read its photo', (await me(BILAL, `SELECT public.pro_may_see_file($1)`, [`${AYESHA}/rel-photo-1.jpg`])).value === false
    && (await me(ASAD, `SELECT public.pro_may_see_file($1)`, [`${AYESHA}/rel-photo-1.jpg`])).value === true);
  ok('nor its chat', (await me(BILAL, `SELECT public.job_chat($1)`, [a.id])).value?.ok === false);

  heading('Turned-down offers may come again, and the next man starts clean');
  ok('Asad\'s offer was turned down when Bilal was chosen', (await offerOf(a.id, ASAD)).status === 'rejected');
  ok('he sees the job again', (await mayAs(a.id, ASAD)) === true);
  const again1 = (await me(ASAD, `SELECT public.make_offer($1, 320000, NULL, NULL)`, [a.id]));
  ok('and may offer again', again1.value?.ok === true && (await offerOf(a.id, ASAD)).status === 'pending', JSON.stringify(again1));
  const oldCode = before.start_code;
  ok('she chooses him', (await choose(AYESHA, a.id, ASAD))?.ok === true);
  const again = await job(a.id);
  ok('the job is his, with a new start code and his own price', again.status === 'assigned' && again.pro_id === ASAD
    && again.start_code && again.start_code !== oldCode && Number(again.agreed_paisa) === 320000 && again.stage === 'chosen');
  ok('Bilal\'s offer stays withdrawn', (await offerOf(a.id, BILAL)).status === 'withdrawn');
  const chatAsad = (await me(ASAD, `SELECT public.job_chat($1)`, [a.id])).value;
  const chatHer = (await me(AYESHA, `SELECT public.job_chat($1)`, [a.id])).value;
  ok('Asad does not read what she said to Bilal', chatAsad?.ok === true && chatAsad.messages.length === 0, JSON.stringify(chatAsad?.messages));
  ok('her chat with Asad starts empty too; the messages are still on record', chatHer?.messages?.length === 0
    && (await count(`SELECT count(*) AS n FROM public.job_messages WHERE job_id = $1`, [a.id])) === 2);
  await me(ASAD, `SELECT public.send_message($1, 'On my way soon')`, [a.id]);
  ok('their own messages show', (await me(AYESHA, `SELECT public.job_chat($1)`, [a.id])).value?.messages?.length === 1);
  ok('the history still has Bilal and only Bilal', (await count(`SELECT count(*) AS n FROM public.job_assignments WHERE job_id = $1`, [a.id])) === 1);
}

heading('Late withdrawals, by the database\'s clock');
{
  const soon = await chosen({ hours: 1 });
  ok('within 2 hours of his time: he is warned it is late', (await proJob(BILAL, soon.id))?.withdraw_kind_now === 'late');
  ok('and it is recorded late', (await me(BILAL, WITHDRAW, [soon.id, 'emergency', null])).value?.kind === 'late');
  ok('his assignment ended as a late withdrawal', (await setup(`SELECT ended FROM public.job_assignments WHERE job_id = $1`, [soon.id])).rows[0].ended === 'late_withdrawal');
  const started = await chosen({ hours: -1, onWay: true });
  ok('after his time began, on his way: late', (await me(BILAL, WITHDRAW, [started.id, 'cannot_reach', null])).value?.kind === 'late');
  const noWindow = await chosen({ window: false });
  ok('a job with no window (older copies), before he set off: normal', (await proJob(BILAL, noWindow.id))?.withdraw_kind_now === 'normal');
  await me(BILAL, `SELECT public.tech_step($1, 'chosen')`, [noWindow.id]);
  ok('once on his way: late', (await me(BILAL, WITHDRAW, [noWindow.id, 'unwell', null])).value?.kind === 'late');

  heading('Only until his arrival counts, and only while the job is his');
  const there = await chosen({ hours: 0, onWay: true });
  await me(BILAL, ARRIVE, [there.id, reading()]);
  ok('after a verified arrival: no button', (await proJob(BILAL, there.id))?.withdraw_kind_now === null);
  ok('and the call is refused', (await me(BILAL, WITHDRAW, [there.id, 'emergency', null])).value?.field === 'stage');
  ok('the job is untouched', (await job(there.id)).status === 'assigned' && (await job(there.id)).pro_id === BILAL);
  const far = await chosen({ hours: 0, onWay: true });
  await me(BILAL, ARRIVE, [far.id, reading(0.02)]);
  ok('an arrival that was not verified is not an arrival: he may still withdraw', (await proJob(BILAL, far.id))?.withdraw_kind_now === 'late');
  ok('and does', (await me(BILAL, WITHDRAW, [far.id, 'other_job', null])).value?.ok === true);
  ok('the unverified arrival is kept with his assignment', (await setup(`SELECT arrival_review_status AS s FROM public.job_assignments WHERE job_id = $1`, [far.id])).rows[0].s === 'pending');
  const rec = (await me(BILAL, `SELECT public.pro_record()`)).value;
  ok('and still on his record', rec?.unverified_arrivals?.some((x) => x.status === 'pending'));
  const cancelled = await chosen({ hours: 1 });
  await me(AYESHA, `SELECT public.cancel_job($1, 'plans_changed', NULL)`, [cancelled.id]);
  const cat = (await setup(`SELECT category FROM public.cancellations WHERE job_id = $1`, [cancelled.id])).rows[0]?.category;
  ok('once she has cancelled, he cannot withdraw', (await me(BILAL, WITHDRAW, [cancelled.id, 'emergency', null])).value?.ok === false);
  ok('so her cancellation is never turned into his withdrawal', (await count(`SELECT count(*) AS n FROM public.pro_withdrawals WHERE job_id = $1`, [cancelled.id])) === 0
    && (await setup(`SELECT category FROM public.cancellations WHERE job_id = $1`, [cancelled.id])).rows[0]?.category === cat
    && (await job(cancelled.id)).status === 'cancelled');
  ok('a second tap after withdrawing changes nothing', (await me(BILAL, WITHDRAW, [soon.id, 'emergency', null])).value?.ok === false
    && (await count(`SELECT count(*) AS n FROM public.pro_withdrawals WHERE job_id = $1`, [soon.id])) === 1);

  heading('Three late withdrawals ask the office to review him; nothing else happens');
  const flags = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  const b = flags?.people?.find((x) => x.id === BILAL);
  ok('Bilal is flagged for late withdrawals', JSON.stringify(b?.flags ?? []).includes('late_withdrawals'), JSON.stringify(b));
  const rec2 = (await me(BILAL, `SELECT public.pro_record()`)).value;
  ok('he sees the same count and the line it reaches', Number(rec2?.late_withdrawals) === 4 && Number(rec2?.late_withdrawals_at) === 3
    && rec2?.withdrawals?.length === 5);
  ok('and is not paused or suspended by it', (await setup(`SELECT status FROM public.pros WHERE id = $1`, [BILAL])).rows[0].status === 'approved'
    && (await feed(BILAL))?.paused_until === null);
}

heading('Day moves when no window is left');
{
  const past = await chosen({ hours: 5 });
  await setup(`UPDATE public.jobs SET when_date = (now() AT TIME ZONE 'Asia/Karachi')::date - 1 WHERE id = $1`, [past.id]);
  await me(BILAL, WITHDRAW, [past.id, 'vehicle', null]);
  const today = await pkToday();
  const expect = (await pkHour()) >= 19
    ? (await setup(`SELECT ((now() AT TIME ZONE 'Asia/Karachi')::date + 1)::text AS d`)).rows[0].d : today;
  const j = await job(past.id);
  ok('a day already gone moves to the first day with a window left', String(j.when_date.toISOString?.() ?? j.when_date).slice(0, 10) === expect
    || (await setup(`SELECT when_date::text AS d FROM public.jobs WHERE id = $1`, [past.id])).rows[0].d === expect);
  ok('and she is told of the new day', to(await sent(), 'ayesha').some((x) => /now open for tomorrow|cannot come/.test(`${x.title} ${x.body}`)));
}

heading('A window that came from his offer goes with him; one she chose stays');
{
  const tomorrow = (await setup(`SELECT ((now() AT TIME ZONE 'Asia/Karachi')::date + 1) AS d`)).rows[0].d;
  const posted = (await me(SARA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'AC is dripping inside',
    p_offer_paisa => 300000, p_when_kind => 'tomorrow', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 3',
    p_house => 'House 9', p_lat => ${PIN.lat}, p_lng => ${PIN.lng}, p_when_date => $1)`, [tomorrow])).value;
  await me(BILAL, `SELECT public.make_offer($1, 300000, NULL, NULL, 14::smallint)`, [posted.id]);
  await choose(SARA, posted.id, BILAL);
  ok('his offer set the time', (await job(posted.id)).when_from === 14);
  await me(BILAL, WITHDRAW, [posted.id, 'unwell', null]);
  const j = await job(posted.id);
  ok('withdrawn: the time is cleared, the day kept', j.when_from === null && j.when_kind === 'tomorrow');
  ok('so the next man names his own time', (await me(ASAD, `SELECT public.make_offer($1, 300000, NULL, NULL)`, [posted.id])).value?.field === 'arrive'
    && (await me(ASAD, `SELECT public.make_offer($1, 300000, NULL, NULL, 16::smallint)`, [posted.id])).value?.ok === true);

  const hers = (await me(SARA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'AC makes a noise',
    p_offer_paisa => 300000, p_when_kind => 'tomorrow', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 3',
    p_house => 'House 9', p_lat => ${PIN.lat}, p_lng => ${PIN.lng}, p_when_date => $1, p_when_from => 10::smallint)`, [tomorrow])).value;
  ok('she could post a time of her own (older copies)', hers?.ok === true, JSON.stringify(hers));
  if (hers?.ok) {
    await me(BILAL, `SELECT public.make_offer($1, 300000, NULL, NULL)`, [hers.id]);
    await choose(SARA, hers.id, BILAL);
    await me(BILAL, WITHDRAW, [hers.id, 'unwell', null]);
    ok('a time she chose herself (older copies) and not yet begun is kept', (await job(hers.id)).when_from === 10);
  } else {
    ok('a time she chose herself (older copies) and not yet begun is kept', true, 'this edition does not post a chosen time');
  }
}

heading('"I\'m running late": she is told, every estimate is kept, the lateness still counts');
{
  const j = await chosen({ hours: -1, onWay: true });
  ok('he may give a time', (await proJob(BILAL, j.id))?.etas_left === 2);
  ok('not sooner than 5 minutes', (await me(BILAL, LATE, [j.id, 2])).value?.field === 'eta');
  ok('not more than 2 hours after his time ends', (await me(BILAL, LATE, [j.id, 300])).value?.field === 'eta');
  ok('not by somebody else', (await me(ASAD, LATE, [j.id, 30])).value?.ok === false);
  const r = (await me(BILAL, LATE, [j.id, 25])).value;
  ok('25 minutes: accepted', r?.ok === true);
  ok('the job shows his time; her screen too', (await job(j.id)).eta_at && (await mine(AYESHA, j.id))?.eta_at);
  const m = await sent();
  ok('she is told at once, with the time and her choices', to(m, 'ayesha').some((x) => /running late/.test(x.title) && /\d+:\d\d(am|pm)/.test(x.body) && /find another/.test(x.body)));
  ok('a second change is allowed', (await me(BILAL, LATE, [j.id, 40])).value?.ok === true);
  ok('a third is not', (await me(BILAL, LATE, [j.id, 50])).value?.field === 'eta' && (await proJob(BILAL, j.id))?.etas_left === 0);
  const rows = (await setup(`SELECT * FROM public.eta_reports WHERE job_id = $1 ORDER BY id`, [j.id])).rows;
  ok('both estimates are kept, with his original window', rows.length === 2 && rows.every((x) => x.window_start) && rows[0].eta_at < rows[1].eta_at);
  ok('his window is unchanged', (await job(j.id)).when_from !== null);
  await me(BILAL, ARRIVE, [j.id, reading()]);
  const inc = (await setup(`SELECT * FROM public.pro_incidents WHERE job_id = $1`, [j.id])).rows;
  ok('arriving more than 30 minutes into his time is still a late arrival', inc.length === 1 && inc[0].kind === 'late_arrival' && inc[0].pro_id === BILAL);
  ok('once he has arrived he cannot change the time', (await me(BILAL, LATE, [j.id, 20])).value?.ok === false);
}

heading('"Find another technician": open while he has not arrived, never her cancellation');
{
  const early = await chosen({ hours: 5, others: [ASAD] });
  ok('she is offered it before he is late', (await mine(AYESHA, early.id))?.can_find_another === true);
  ok('not by somebody else', (await me(SARA, ANOTHER, [early.id])).value?.ok === false);
  const r = (await me(AYESHA, ANOTHER, [early.id])).value;
  ok('it works', r?.ok === true && r?.kind === 'normal', JSON.stringify(r));
  const j = await job(early.id);
  ok('the same job is open again', j.status === 'open' && j.pro_id === null);
  ok('it is not a cancellation', (await count(`SELECT count(*) AS n FROM public.cancellations WHERE job_id = $1`, [early.id])) === 0 && !j.cancelled_at);
  ok('nothing on his record: he was not late', (await count(`SELECT count(*) AS n FROM public.pro_incidents WHERE job_id = $1`, [early.id])) === 0);
  const h = (await setup(`SELECT * FROM public.job_assignments WHERE job_id = $1`, [early.id])).rows[0];
  ok('his assignment is in the history as replaced', h?.ended === 'replaced' && h?.pro_id === BILAL && h?.kind === 'normal');
  const m = await sent();
  ok('he is told not to go', to(m, 'bilal').some((x) => /chose another technician/.test(x.title)));
  ok('he is shut out of it', (await mayAs(early.id, BILAL)) === false);
  ok('a second tap finds nothing to do', (await me(AYESHA, ANOTHER, [early.id])).value?.ok === false);
  ok('Asad may offer again', (await me(ASAD, `SELECT public.make_offer($1, 300000, NULL, NULL)`, [early.id])).value?.ok === true);

  const late = await chosen({ hours: -1, onWay: true });
  ok('more than 30 minutes into his time', (await mine(AYESHA, late.id))?.pro_late === true);
  ok('she switches', (await me(AYESHA, ANOTHER, [late.id])).value?.kind === 'pro_late');
  const i = (await setup(`SELECT * FROM public.pro_incidents WHERE job_id = $1`, [late.id])).rows;
  ok('his lateness is recorded, as a cancellation would have', i.length === 1 && i[0].kind === 'late_arrival' && i[0].how === 'replaced_waiting' && i[0].pro_id === BILAL && i[0].minutes_late >= 60);

  const gone = await chosen({ hours: -3, onWay: true });
  ok('2 hours 30 after his time began', (await me(AYESHA, ANOTHER, [gone.id])).value?.kind === 'no_show');
  const g = (await setup(`SELECT * FROM public.pro_incidents WHERE job_id = $1`, [gone.id])).rows;
  ok('a possible no-show, for the office to confirm', g.length === 1 && g[0].kind === 'no_show' && g[0].status === 'potential');

  heading('Switching is never a way round the late-cancellation count');
  await setup(`UPDATE public.settings SET value = 1 WHERE key = 'flag_late_cancels'`);
  const lastMinute = await chosen({ hours: 1, customer: SARA });
  ok('within 2 hours, with no fault of his: late', (await me(SARA, ANOTHER, [lastMinute.id])).value?.kind === 'late');
  ok('nothing against him', (await count(`SELECT count(*) AS n FROM public.pro_incidents WHERE job_id = $1`, [lastMinute.id])) === 0);
  let fl = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  ok('it counts as her late cancellation', JSON.stringify(fl?.people?.find((x) => x.id === SARA)?.flags ?? []).includes('late_cancels'));
  await setup(`DELETE FROM public.job_assignments WHERE job_id = $1`, [lastMinute.id]);
  const warned = await chosen({ hours: 1, customer: SARA, pro: ASAD });
  await me(ASAD, LATE, [warned.id, 150]);
  ok('but not when he had said he was running late', (await me(SARA, ANOTHER, [warned.id])).value?.ok === true
    && (await setup(`SELECT kind FROM public.job_assignments WHERE job_id = $1`, [warned.id])).rows[0].kind === 'excused');
  fl = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  ok('so it does not count', !JSON.stringify(fl?.people?.find((x) => x.id === SARA)?.flags ?? []).includes('late_cancels'));
  await setup(`UPDATE public.settings SET value = 3 WHERE key = 'flag_late_cancels'`);

  const there = await chosen({ hours: 0, onWay: true });
  await me(BILAL, ARRIVE, [there.id, reading()]);
  ok('after a verified arrival: not offered', (await mine(AYESHA, there.id))?.can_find_another === false);
  ok('and refused', (await me(AYESHA, ANOTHER, [there.id])).value?.ok === false && (await job(there.id)).pro_id === BILAL);
}

heading('Each technician has his own D10 record on a job that came back');
{
  const j = await chosen({ hours: -3, onWay: true });
  await me(AYESHA, ANOTHER, [j.id]);
  await me(KAMRAN, `SELECT public.make_offer($1, 300000, NULL, NULL)`, [j.id]);
  await choose(AYESHA, j.id, KAMRAN);
  await setup(`UPDATE public.jobs SET when_kind = 'later', when_part = NULL,
      when_date = (date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') - interval '3 hours')::date,
      when_from = extract(hour FROM date_trunc('hour', now() AT TIME ZONE 'Asia/Karachi') - interval '3 hours')::smallint
    WHERE id = $1`, [j.id]);
  ok('her screen does not carry his no-show onto the next man', (await mine(AYESHA, j.id))?.no_show === false);
  await setup(`SELECT public.no_show_clock()`);
  const rows = (await setup(`SELECT pro_id, kind, status FROM public.pro_incidents WHERE job_id = $1 ORDER BY detected_at`, [j.id])).rows;
  ok('the clock gives Kamran his own possible no-show; Bilal\'s stays his', rows.length === 2 && rows[0].pro_id === BILAL && rows[1].pro_id === KAMRAN);
  ok('and her screen now shows it', (await mine(AYESHA, j.id))?.no_show === true);
}

heading('Pause offers: 1, 3 or 7 days, with a reason; jobs he has go on');
{
  const held = await chosen({ hours: 5, pro: KAMRAN });
  const open = (await me(SARA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'AC trips the breaker',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 3',
    p_house => 'House 9', p_lat => ${PIN.lat}, p_lng => ${PIN.lng})`)).value;
  await me(KAMRAN, `SELECT public.make_offer($1, 300000, 20, NULL)`, [open.id]);
  await sent();
  const PAUSE = `SELECT public.admin_pause_pro($1, $2, $3)`;
  ok('only the office', (await me(BILAL, PAUSE, [KAMRAN, 3, 'Two no-shows this month'])).value?.ok === false);
  ok('only 1, 3 or 7 days', (await me(OWNER, PAUSE, [KAMRAN, 2, 'Two no-shows this month'])).value?.field === 'days');
  ok('a reason is required', (await me(OWNER, PAUSE, [KAMRAN, 3, ' '])).value?.field === 'note');
  const r = (await me(OWNER, PAUSE, [KAMRAN, 3, 'Two no-shows this month'])).value;
  ok('3 days: paused', r?.ok === true);
  const until = new Date(r.until).getTime();
  ok('until three days from now, on the server\'s clock', Math.abs(until - Date.now() - 3 * 86400000) < 120000);
  ok('a second pause while paused is refused', (await me(OWNER, PAUSE, [KAMRAN, 7, 'Another reason here'])).value?.ok === false);
  ok('his waiting offer is withdrawn', (await offerOf(open.id, KAMRAN)).status === 'withdrawn');
  const m = await sent();
  ok('he is told until when, not why (the why is in the app)', to(m, 'kamran').some((x) => /paused/.test(x.title) && !/no-shows/.test(x.body)));
  const f = await feed(KAMRAN);
  ok('his list says until when and the office\'s reason', f?.paused_until && f?.pause_note === 'Two no-shows this month');
  ok('and lists no new jobs', !(f?.jobs ?? []).some((x) => x.status === 'open' || x.id === open.id));
  ok('he cannot offer', (await me(KAMRAN, `SELECT public.make_offer($1, 300000, 20, NULL)`, [open.id])).value?.field === 'paused');
  ok('the job he already has goes on', (await mayAs(held.id, KAMRAN)) === true
    && (await me(KAMRAN, `SELECT public.tech_step($1, 'chosen')`, [held.id])).value?.ok === true);
  await me(SARA, `SELECT public.choose_offer($1)`, [(await offerOf(open.id, KAMRAN)).id]);
  ok('she cannot choose his withdrawn offer', (await job(open.id)).status === 'open');
  ok('his record shows the pause and the reason', (await me(KAMRAN, `SELECT public.pro_record()`)).value?.pauses?.[0]?.note === 'Two no-shows this month');
  ok('nobody can rewrite the line, not even the database owner', await setup(`UPDATE public.pro_pause_log SET note = 'nothing' WHERE pro_id = $1`, [KAMRAN]).then(() => false, () => true));
  ok('lifting needs a reason', (await me(OWNER, `SELECT public.admin_lift_pause($1, '')`, [KAMRAN])).value?.field === 'note');
  ok('lifted early', (await me(OWNER, `SELECT public.admin_lift_pause($1, 'Spoke to him; he has a new bike')`, [KAMRAN])).value?.ok === true);
  ok('he is told', to(await sent(), 'kamran').some((x) => /make offers again/.test(x.title)));
  ok('and may offer again', (await me(KAMRAN, `SELECT public.make_offer($1, 300000, 20, NULL)`, [open.id])).value?.ok === true);
  const lines = (await setup(`SELECT action, by_name FROM public.pro_pause_log WHERE pro_id = $1 ORDER BY id`, [KAMRAN])).rows;
  ok('both lines are kept, with who did it', lines.length === 2 && lines[0].action === 'pause' && lines[1].action === 'lift' && lines.every((x) => x.by_name === 'Zohaib'));
  await setup(`INSERT INTO public.pro_pause_log (pro_id, action, days, until, note, by_name, at) VALUES ($1, 'pause', 1, now() - interval '1 minute', 'An old pause', 'Zohaib', now() - interval '1 day')`, [KAMRAN]);
  ok('a pause ends by itself', (await setup(`SELECT public.pro_paused($1) AS v`, [KAMRAN])).rows[0].v === false);
}

heading('The office sees who keeps failing customers, and a suggestion only');
{
  const inc = (await setup(`SELECT id FROM public.pro_incidents WHERE pro_id = $1 AND kind = 'no_show' AND status = 'potential' ORDER BY detected_at LIMIT 2`, [BILAL])).rows;
  await me(OWNER, `SELECT public.admin_incident($1, true, 'He did not come and did not ring')`, [inc[0].id]);
  let rel = (await me(OWNER, `SELECT public.admin_reliability()`)).value;
  let b = rel?.pros?.find((x) => x.pro_id === BILAL);
  ok('one confirmed no-show: contact him', b?.suggestion === 'contact' && Number(b?.no_shows) === 1, JSON.stringify(b));
  ok('with his withdrawals and replacements counted', Number(b?.late_withdrawals) >= 3 && Number(b?.replaced) >= 1);
  ok('and the lists of what happened', rel.withdrawals.length >= 1 && rel.replaced.length >= 1);
  await me(OWNER, `SELECT public.admin_incident($1, true, 'Again, no call')`, [inc[1].id]);
  rel = (await me(OWNER, `SELECT public.admin_reliability()`)).value;
  b = rel?.pros?.find((x) => x.pro_id === BILAL);
  ok('two in 60 days: consider a pause', b?.suggestion === 'pause');
  ok('the suggestion did nothing by itself', b?.paused_until === null && (await setup(`SELECT status FROM public.pros WHERE id = $1`, [BILAL])).rows[0].status === 'approved');
  ok('nobody else may read it', (await me(BILAL, `SELECT public.admin_reliability()`)).value === null);
}

heading('Nobody reads the tables');
denied('the history', await as('authenticated', AYESHA, `SELECT * FROM public.job_assignments`));
denied('the withdrawals', await as('authenticated', BILAL, `SELECT * FROM public.pro_withdrawals`));
denied('the estimates', await as('authenticated', AYESHA, `SELECT * FROM public.eta_reports`));
denied('the pauses', await as('authenticated', OWNER, `SELECT * FROM public.pro_pause_log`));
denied('nobody calls the reopening directly', await as('authenticated', AYESHA, `SELECT public.reopen_job('${a.id}', 'replaced', NULL)`));
nothing('a stranger cannot withdraw', await as('anon', null, `SELECT public.pro_withdraw('${a.id}', 'vehicle', NULL)`));
nothing('nor switch technicians', await as('anon', null, `SELECT public.customer_find_another('${a.id}')`));

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /Street|House|markaz|Rafiq|green one|bike|no-shows|new bike|33\.69/.test(`${x.title} ${x.body}`));
  ok('no message carried an address, a reason or anybody\'s words', bad.length === 0, JSON.stringify(bad[0]));
}

heading('Deleted with the account');
{
  await setup(`DELETE FROM auth.users WHERE id = $1`, [KAMRAN]);
  ok('his pause lines go with him', (await count(`SELECT count(*) AS n FROM public.pro_pause_log WHERE pro_id = $1`, [KAMRAN])) === 0);
  const before = await count(`SELECT count(*) AS n FROM public.job_assignments`);
  await setup(`DELETE FROM auth.users WHERE id = $1`, [BILAL]);
  ok('a technician who leaves Pechkas is taken off the history, which stays', (await count(`SELECT count(*) AS n FROM public.job_assignments`)) === before
    && (await count(`SELECT count(*) AS n FROM public.job_assignments WHERE pro_id IS NOT NULL AND pro_id = $1`, [BILAL])) === 0);
}

heading('Run a second time');
{
  const before = (await setup(`SELECT count(*)::int AS n FROM public.job_assignments`)).rows[0].n;
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261112000000_reliability.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  ok('and changes no record', (await setup(`SELECT count(*)::int AS n FROM public.job_assignments`)).rows[0].n === before);
}

report();
