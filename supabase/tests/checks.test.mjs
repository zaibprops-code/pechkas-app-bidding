/**
 * He says finished, she confirms (migration checks_and_guarantee).
 *
 * What must hold: "Work finished" no longer closes a job — it waits for the
 * customer's check, and nothing is owed to Pechkas until it counts as done.
 * "Yes, it works" closes it. "Not finished yet" needs one of four reasons,
 * sends it back to him with the reason, and lets him answer in one line;
 * the second time it is disputed and goes to the office, which decides
 * finished, not finished (visit fee, no commission) or go back. Nobody
 * answering: reminded at 2 hours and 4 hours before the end, closed by the
 * clock at 24. Each side sees only what it should, every message is free of
 * addresses and numbers, the patterns become flags, and it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'a7';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
const OWNER_PHONE = `${P}888888-8888-4888-8888-888888888888`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007111111', null, 'customer', 'Ayesha'],
  [SARA, '923007112222', null, 'customer', 'Sara'],
  [BILAL, '923007113333', null, 'pro', 'Bilal'],
  [ASAD, '923007114444', null, 'pro', 'Asad'],
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
const upload = async (who, ext = 'jpg') => {
  files += 1;
  const name = `${who}/file-${files}.${ext}`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const canRead = async (who, name) => (await as('authenticated', who, `SELECT name FROM storage.objects WHERE name = $1`, [name])).rows.length === 1;
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const owed = async (pro) => Number((await setup(`SELECT public.pro_owed($1) AS n`, [pro])).rows[0].n);
const balanced = async () => Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries`)).rows[0].n) === 0;
const mine = async (who, id) => ((await me(who, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === id);
const proJob = async (who, id) => ((await me(who, `SELECT public.pro_my_jobs()`)).value ?? []).find((x) => x.id === id);

let n = 0;
/** A job for `pro` at `price`, taken all the way to working. */
async function working(pro, price, customer = AYESHA, jobType = null) {
  n += 1;
  const posted = (await me(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => $3, p_description => $1,
    p_offer_paisa => $2, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`AC number ${n} is not cooling`, price, jobType])).value;
  if (!posted?.ok) throw new Error(`post failed: ${JSON.stringify(posted)}`);
  await me(pro, `SELECT public.make_offer($1, $2, 20, NULL)`, [posted.id, price]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [posted.id, pro])).rows[0]?.id;
  if (!offer) throw new Error('no offer');
  await me(customer, `SELECT public.choose_offer($1)`, [offer]);
  await me(pro, `SELECT public.tech_step($1, 'chosen')`, [posted.id]);
  await me(pro, `SELECT public.tech_step($1, 'on_way')`, [posted.id]);
  const r = (await me(pro, `SELECT public.start_work($1, $2, $3::jsonb)`, [posted.id, (await job(posted.id)).start_code, JSON.stringify([await upload(pro)])])).value;
  if (!r?.ok) throw new Error(`start failed: ${JSON.stringify(r)}`);
  await sent();
  return posted;
}
const FINISH = `SELECT public.finish_work($1, $2::jsonb, $3, $4)`;
const finish = async (pro, id, parts = 0) =>
  (await me(pro, FINISH, [id, JSON.stringify([await upload(pro)]), parts, parts ? await upload(pro) : null])).value;
/** Finished, and checked by the customer. */
async function done(pro, price, customer = AYESHA, parts = 0, jobType = null) {
  const j = await working(pro, price, customer, jobType);
  const r = await finish(pro, j.id, parts);
  if (!r?.ok) throw new Error(`finish failed: ${JSON.stringify(r)}`);
  const c = (await me(customer, `SELECT public.confirm_work($1)`, [j.id])).value;
  if (!c?.ok) throw new Error(`confirm failed: ${JSON.stringify(c)}`);
  await sent();
  return j;
}

const CONFIRM = `SELECT public.confirm_work($1)`;
const NOT = `SELECT public.not_finished($1, $2, $3, $4)`;
const back = (id, hours) => setup(`UPDATE public.jobs SET checking_at = now() - make_interval(hours => $2) WHERE id = $1`, [id, hours]);

// =============================================================================
heading('Work finished: it waits for her check');
const j1 = await working(BILAL, 550000);
const before = await owed(BILAL);
const f1 = await finish(BILAL, j1.id);
ok('Bilal says it is finished', f1?.ok === true && f1?.checking === true, JSON.stringify(f1));
let row = await job(j1.id);
ok('the job is still his, waiting for her check', row.status === 'assigned' && row.stage === 'checking' && Number(row.collect_paisa) === 550000);
ok('nothing is owed to Pechkas yet', (await owed(BILAL)) === before);
ok('Ayesha is asked to check it before she pays', to(await sent(), 'ayesha').some((x) => x.title === 'Bilal says the work is finished' && /Check it before you pay/.test(x.body)));
let a = await mine(AYESHA, j1.id);
ok('her card says when it closes by itself', a?.stage === 'checking' && a?.check_due && Math.abs(new Date(a.check_due) - Date.now() - 24 * 3600e3) < 120e3);
ok('he cannot say it twice', (await finish(BILAL, j1.id))?.field === 'stage');
ok('Sara cannot answer for Ayesha', (await me(SARA, CONFIRM, [j1.id])).value?.ok === false);
ok('nor can Bilal', (await me(BILAL, CONFIRM, [j1.id])).value?.ok === false);
ok('he cannot ask a new price while she checks', (await me(BILAL, `SELECT public.ask_change($1, 600000, 'More work found here', $2)`, [j1.id, await upload(BILAL)])).value?.ok === false);

heading('Not finished yet');
ok('a reason must be one of the four', (await me(AYESHA, NOT, [j1.id, 'lazy', null, null])).value?.field === 'reason');
ok('a CNIC in the note is refused', (await me(AYESHA, NOT, [j1.id, 'not_working', ['61101', '1234567', '1'].join('-'), null])).value?.field === 'note');
ok('a photo that is not hers is refused', (await me(AYESHA, NOT, [j1.id, 'not_working', null, `${BILAL}/nope.jpg`])).value?.field === 'photo');
const herPhoto = await upload(AYESHA);
ok('Ayesha says: still not working, with a photo', (await me(AYESHA, NOT, [j1.id, 'not_working', 'Still blowing warm air', herPhoto])).value?.disputed === false);
row = await job(j1.id);
ok('it goes back to working', row.stage === 'working' && row.not_finished === 1 && row.status === 'assigned');
ok('Bilal is told the reason', to(await sent(), 'bilal').some((x) => x.title === `Ayesha says job ${j1.ref} is not finished` && /Reason: Still not working/.test(x.body)));
let p = await proJob(BILAL, j1.id);
ok('his job shows her reason, her words and photo', p?.last_check?.reason === 'Still not working' && p?.last_check?.note === 'Still blowing warm air' && p?.last_check?.photo === herPhoto && p?.last_check?.can_reply === true);
ok('he can open her photo', await canRead(BILAL, herPhoto));
ok('Asad cannot', !(await canRead(ASAD, herPhoto)));
ok('his reply must be a real line', (await me(BILAL, `SELECT public.reply_check($1, 'ok')`, [j1.id])).value?.field === 'reply');
ok('he answers in one line', (await me(BILAL, `SELECT public.reply_check($1, 'The gas pressure was low, I am topping it up now')`, [j1.id])).value?.ok === true);
ok('once per round', (await me(BILAL, `SELECT public.reply_check($1, 'And again')`, [j1.id])).value?.ok === false);
a = await mine(AYESHA, j1.id);
ok('she reads his answer on her card', a?.checks?.[0]?.pro_reply === 'The gas pressure was low, I am topping it up now' && a?.checks?.[0]?.reason === 'Still not working');

heading('The second time it goes to the office');
ok('he finishes again, with a new photo', (await finish(BILAL, j1.id))?.ok === true);
await sent();
ok('Ayesha says it again: work left unfinished', (await me(AYESHA, NOT, [j1.id, 'unfinished', null, null])).value?.disputed === true);
row = await job(j1.id);
ok('the job is disputed', row.stage === 'disputed' && row.not_finished === 2 && row.status === 'assigned');
let m = await sent();
ok('both are told Pechkas will look', to(m, 'ayesha').some((x) => x.title === `Pechkas will look at job ${j1.ref}`) && to(m, 'bilal').some((x) => x.title === `Pechkas will look at job ${j1.ref}`));
ok('the owner\'s phone is told', to(m, 'zohaib').some((x) => x.title === `Disagreement on job ${j1.ref}`));
ok('nobody can finish or confirm while the office decides', (await finish(BILAL, j1.id))?.ok === false && (await me(AYESHA, CONFIRM, [j1.id])).value?.ok === false);
const g = (await me(OWNER, `SELECT public.admin_guarantee()`)).value;
const d1 = g?.disputes?.find((x) => x.job_id === j1.id);
ok('the office sees both rounds, both sides\' words and the photos', d1?.checks?.length === 2 && d1.checks[0].pro_reply && d1.checks[0].photo === herPhoto && d1.photos.some((x) => x.stage === 'after'));
ok('a customer cannot decide', (await me(AYESHA, `SELECT public.admin_decide_dispute($1, 'done', 'It is fine')`, [j1.id])).value?.ok === false);
ok('the office must say what it found', (await me(OWNER, `SELECT public.admin_decide_dispute($1, 'return', '')`, [j1.id])).value?.field === 'note');
ok('the office sends him back to fix it', (await me(OWNER, `SELECT public.admin_decide_dispute($1, 'return', 'Rang both. Gas still low, Bilal will top it up properly')`, [j1.id])).value?.ok === true);
row = await job(j1.id);
ok('back to working, with the office\'s words on it', row.stage === 'working' && row.dispute_outcome === 'return');
ok('both read the decision in the app', (await mine(AYESHA, j1.id))?.dispute_note && (await proJob(BILAL, j1.id))?.dispute_note);
ok('he finishes a third time', (await finish(BILAL, j1.id))?.ok === true);
ok('and she says yes, it works', (await me(AYESHA, CONFIRM, [j1.id])).value?.ok === true);
row = await job(j1.id);
ok('now it is done, confirmed by her', row.status === 'done' && row.confirmed_by === 'customer' && row.stage === null);
ok('and only now is the commission owed', (await owed(BILAL)) === before + 55000);
ok('the ledger adds up to nothing', await balanced());

heading('The office: not finished, so only the visit fee');
{
  const j = await working(ASAD, 400000, SARA);
  const ownedBefore = await owed(ASAD);
  await finish(ASAD, j.id);
  await me(SARA, NOT, [j.id, 'mess', null, null]);
  await finish(ASAD, j.id);
  await me(SARA, NOT, [j.id, 'not_working', null, null]);
  ok('disputed', (await job(j.id)).stage === 'disputed');
  ok('the office finds it not finished', (await me(OWNER, `SELECT public.admin_decide_dispute($1, 'stopped', 'The unit still does not cool, looked at the photos')`, [j.id])).value?.ok === true);
  const r = await job(j.id);
  ok('the job stops, she owes only the visit fee', r.status === 'stopped' && Number(r.collect_paisa) === Number((await setup(`SELECT value FROM public.settings WHERE key = 'visit_fee_min_paisa'`)).rows[0].value));
  ok('and there is no commission', (await owed(ASAD)) === ownedBefore && Number(r.commission_paisa) === 0);
}

heading('The office: finished after all — and a pattern');
for (let i = 0; i < 2; i++) {
  const j = await working(ASAD, 300000, AYESHA);
  await finish(ASAD, j.id);
  await me(AYESHA, NOT, [j.id, 'price', null, null]);
  await finish(ASAD, j.id);
  await me(AYESHA, NOT, [j.id, 'price', null, null]);
  ok(`the office finds job ${i + 1} finished`, (await me(OWNER, `SELECT public.admin_decide_dispute($1, 'done', 'Photos show it working, price was as agreed in the chat')`, [j.id])).value?.ok === true);
  const r = await job(j.id);
  ok(`  done, confirmed by the office`, r.status === 'done' && r.confirmed_by === 'office' && r.dispute_outcome === 'done');
}
{
  const flags = (await me(OWNER, `SELECT public.admin_flags()`)).value;
  ok('a customer the office twice found wrong is a flag', flags.people.find((x) => x.id === AYESHA)?.flags.some((f) => f.kind === 'overruled' && f.n === 2), JSON.stringify(flags.people.find((x) => x.id === AYESHA)));
}

heading('Nobody answers: reminded twice, then closed by the clock');
{
  const j = await working(BILAL, 250000, SARA);
  await finish(BILAL, j.id);
  await sent();
  await back(j.id, 1);
  await setup(`SELECT public.check_clock()`);
  ok('nothing after an hour', to(await sent(), 'sara').length === 0);
  await back(j.id, 3);
  await setup(`SELECT public.check_clock()`);
  const r1 = to(await sent(), 'sara');
  ok('reminded after 2 hours, with the time it closes', r1.length === 1 && r1[0].title === `Please check job ${j.ref}` && /counts as finished at/.test(r1[0].body), JSON.stringify(r1));
  await setup(`SELECT public.check_clock()`);
  ok('not twice', to(await sent(), 'sara').length === 0);
  await back(j.id, 21);
  await setup(`SELECT public.check_clock()`);
  ok('reminded again, 4 hours before the end', to(await sent(), 'sara').length === 1);
  await back(j.id, 25);
  await setup(`SELECT public.check_clock()`);
  const r = await job(j.id);
  ok('closed by the clock', r.status === 'done' && r.confirmed_by === 'clock');
  m = await sent();
  ok('she is told it counts as finished; he is told too', to(m, 'sara').some((x) => x.title === `Job ${j.ref} counts as finished`) && to(m, 'bilal').some((x) => x.title === `Job ${j.ref} is finished`));
}

heading('Too many unchecked jobs is a flag');
for (let i = 0; i < 3; i++) {
  const j = await working(ASAD, 200000, SARA);
  await finish(ASAD, j.id);
  await back(j.id, 25);
}
await setup(`SELECT public.check_clock()`);
{
  const f = (await me(OWNER, `SELECT public.admin_flags()`)).value.people.find((x) => x.id === ASAD)?.flags.find((x) => x.kind === 'unchecked');
  ok('Asad: most of his finished jobs closed with nobody checking', f?.n === 3, JSON.stringify(f));
}

heading('"Show it working"');
{
  const j = await working(BILAL, 200000, SARA);
  ok('a video that is not his is refused', (await me(BILAL, `SELECT public.finish_work($1, $2::jsonb, 0, NULL, $3)`, [j.id, JSON.stringify([await upload(BILAL)]), `${ASAD}/x.mp4`])).value?.field === 'video');
  const video = await upload(BILAL, 'mp4');
  ok('his short video goes with the finish', (await me(BILAL, `SELECT public.finish_work($1, $2::jsonb, 0, NULL, $3)`, [j.id, JSON.stringify([await upload(BILAL)]), video])).value?.ok === true);
  ok('and she can watch it', (await mine(SARA, j.id))?.photos?.some((x) => x.stage === 'video' && x.path === video) && (await canRead(SARA, video)));
}

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /Street|House|markaz|Rafiq|92300|\+92/.test(`${x.title} ${x.body}`));
  ok('no message carried an address or a number', bad.length === 0, JSON.stringify(bad[0]));
}

heading('Run a second time');
{
  let twice = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261106000000_checks_and_guarantee.sql'), 'utf8'));
  } catch (e) {
    twice = e.message;
  }
  ok('the migration runs again without complaint', twice === null, twice);
  const j = await working(BILAL, 200000, SARA);
  ok('and finishing still waits for her check', (await finish(BILAL, j.id))?.checking === true);
}

report();
