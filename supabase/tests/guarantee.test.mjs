/**
 * The guarantee (migration checks_and_guarantee).
 *
 * What must hold: 30 days for repairs, 7 for services, from the moment the
 * job counted as done. A claim needs words and a photo or video. He has 24
 * hours — reminded at 12 and 20 — to answer "I'll come" (a window starting
 * within 48 hours) or "not my work" (the office decides). No answer, or a
 * missed visit: his new offers stop and a replacement is arranged — she
 * chooses the day, the job goes to the others (never him), capped at the
 * original labour, paid by Pechkas from the reserve, and he is charged —
 * never more than his original labour — with one appeal. The office can
 * lift a block and pay out what Pechkas owes. Before he accepts he sees no
 * address; every message is free of addresses and numbers; patterns are
 * flags; nobody reads the tables directly; and it runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'a8';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;
const OWNER_PHONE = `${P}888888-8888-4888-8888-888888888888`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007221111', null, 'customer', 'Ayesha'],
  [SARA, '923007222222', null, 'customer', 'Sara'],
  [BILAL, '923007223333', null, 'pro', 'Bilal'],
  [ASAD, '923007224444', null, 'pro', 'Asad'],
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

const CLAIM = `SELECT public.claim_guarantee($1, $2, $3::jsonb)`;
const ANSWER = `SELECT public.answer_claim($1, $2, $3::date, $4::smallint, $5)`;
const claimOf = async (jobId) => (await setup(`SELECT * FROM public.guarantee_claims WHERE job_id = $1 ORDER BY created_at DESC LIMIT 1`, [jobId])).rows[0];
const claims = async (who) => (await me(who, `SELECT public.pro_claims()`)).value ?? [];
const pk = (await setup(`SELECT (now() AT TIME ZONE 'Asia/Karachi')::date::text AS d, extract(hour FROM now() AT TIME ZONE 'Asia/Karachi')::int AS h`)).rows[0];
const plus = async (n) => (await setup(`SELECT ($1::date + $2::int)::text AS d`, [pk.d, n])).rows[0].d;
const tomorrow = await plus(1);
const typeId = async (name) => (await setup(`SELECT id FROM public.job_types WHERE trade = 'ac' AND name LIKE $1`, [name])).rows[0].id;
const SERVICE = await typeId('General service%');
const INSTALL = await typeId('Split AC installation');
const offerAs = (pro, id, price) => me(pro, `SELECT public.make_offer(p_job => $1, p_price_paisa => $2, p_eta_minutes => NULL, p_note => NULL, p_arrive_from => 10::smallint)`, [id, price]);
const canOffer = async (pro) => {
  const other = (await me(SARA, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Another AC job here', p_offer_paisa => 200000,
    p_when_kind => 'tomorrow', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 9', p_house => 'House 3',
    p_lat => 33.68, p_lng => 72.99, p_media => '[]'::jsonb, p_when_date => $1::date, p_when_from => NULL)`, [tomorrow])).value;
  return (await offerAs(pro, other.id, 200000)).value;
};

// =============================================================================
heading('How long the guarantee lasts');
const repair = await done(BILAL, 550000, AYESHA, 150000, INSTALL);
const service = await done(BILAL, 250000, AYESHA, 0, SERVICE);
const other = await done(BILAL, 300000, AYESHA);
const days = async (id) => (await setup(`SELECT public.guarantee_days_of($1) AS d`, [id])).rows[0].d;
ok('an installation: 30 days', (await days(repair.id)) === 30);
ok('a service: 7 days', (await days(service.id)) === 7);
ok('"Something else": 30 days', (await days(other.id)) === 30);
{
  const a = await mine(AYESHA, service.id);
  ok('her card says until when', a?.guarantee_days === 7 && a?.can_claim === true && Math.abs(new Date(a.guarantee_until) - Date.now() - 7 * 864e5) < 120e3);
}
await setup(`UPDATE public.jobs SET finished_at = now() - interval '8 days' WHERE id = $1`, [service.id]);
ok('a service finished 8 days ago has no guarantee left', (await me(AYESHA, CLAIM, [service.id, 'Dusty and not cooling again', JSON.stringify([await upload(AYESHA)])])).value?.ok === false);
ok('and her card says she cannot claim', (await mine(AYESHA, service.id))?.can_claim === false);

heading('Claiming');
ok('Sara cannot claim on Ayesha\'s job', (await me(SARA, CLAIM, [repair.id, 'Leaking water again', JSON.stringify([await upload(SARA)])])).value?.ok === false);
ok('words are needed', (await me(AYESHA, CLAIM, [repair.id, 'bad', JSON.stringify([await upload(AYESHA)])])).value?.field === 'text');
ok('a photo or video is needed', (await me(AYESHA, CLAIM, [repair.id, 'Water leaking from the indoor unit again', '[]'])).value?.field === 'media');
const faultVideo = await upload(AYESHA, 'mp4');
const c1 = (await me(AYESHA, CLAIM, [repair.id, 'Water leaking from the indoor unit again', JSON.stringify([faultVideo])])).value;
ok('Ayesha claims, with a video of the fault', c1?.ok === true, JSON.stringify(c1));
ok('one open claim at a time', (await me(AYESHA, CLAIM, [repair.id, 'Still leaking water', JSON.stringify([await upload(AYESHA)])])).value?.ok === false);
let m = await sent();
ok('Bilal is told, with the deadline and what happens if he does not answer', to(m, 'bilal').some((x) => x.title === `Guarantee claim on job ${repair.ref}` && /Answer by .+, or your new offers stop/.test(x.body)), JSON.stringify(to(m, 'bilal')));
let pc = (await claims(BILAL)).find((x) => x.id === c1.claim_id);
ok('his list shows the claim, her first name and the sector', pc?.status === 'waiting' && pc?.customer_first_name === 'Ayesha' && pc?.sector === 'F-11' && pc?.can_answer === true);
ok('but not the address or her number before he accepts', pc?.street === null && pc?.house === null && pc?.customer_phone === null);
ok('he can watch her video of the fault', await canRead(BILAL, faultVideo));
ok('Asad cannot', !(await canRead(ASAD, faultVideo)));
ok('her card shows the claim waiting for his answer', (await mine(AYESHA, repair.id))?.claim?.status === 'waiting');

heading('He comes back');
ok('Asad cannot answer Bilal\'s claim', (await me(ASAD, ANSWER, [c1.claim_id, true, tomorrow, 10, null])).value?.ok === false);
ok('a time that has started is refused', (await me(BILAL, ANSWER, [c1.claim_id, true, pk.d, 8, null])).value?.field === 'visit' || pk.h < 8);
ok('a time beyond 48 hours is refused', (await me(BILAL, ANSWER, [c1.claim_id, true, await plus(4), 10, null])).value?.field === 'visit');
ok('"I\'ll come" tomorrow, 10am to 12pm', (await me(BILAL, ANSWER, [c1.claim_id, true, tomorrow, 10, null])).value?.ok === true);
m = await sent();
ok('Ayesha is told when he will come', to(m, 'ayesha').some((x) => x.title === 'Bilal will come back' && /10am–12pm/.test(x.body)), JSON.stringify(to(m, 'ayesha')));
pc = (await claims(BILAL)).find((x) => x.id === c1.claim_id);
ok('now he has the address and her number, as with any job', pc?.status === 'coming' && pc?.street === 'Street 34' && pc?.customer_phone);
ok('fixed needs a photo', (await me(BILAL, `SELECT public.claim_fixed($1, '[]'::jsonb)`, [c1.claim_id])).value?.field === 'photos');
const fixPhoto = await upload(BILAL);
ok('he fixes it, with a photo', (await me(BILAL, `SELECT public.claim_fixed($1, $2::jsonb)`, [c1.claim_id, JSON.stringify([fixPhoto])])).value?.ok === true);
ok('she is asked to check it', to(await sent(), 'ayesha').some((x) => x.title === 'Bilal says the fault is fixed'));
ok('she can see his photo of the repair', await canRead(AYESHA, fixPhoto));
ok('Sara cannot check Ayesha\'s claim', (await me(SARA, `SELECT public.check_claim($1, true, NULL)`, [c1.claim_id])).value?.ok === false);
ok('Ayesha confirms it is fixed', (await me(AYESHA, `SELECT public.check_claim($1, true, NULL)`, [c1.claim_id])).value?.ok === true);
ok('the claim is closed, at no cost to anybody', (await claimOf(repair.id)).status === 'fixed' && (await claimOf(repair.id)).charge_paisa === null);
ok('Bilal is told', to(await sent(), 'bilal').some((x) => x.title === `The guarantee claim on job ${repair.ref} is closed`));

heading('"This isn\'t my work": the office decides');
const c2 = (await me(AYESHA, CLAIM, [other.id, 'The new socket sparks when used', JSON.stringify([await upload(AYESHA)])])).value;
ok('a reason is needed', (await me(BILAL, ANSWER, [c2.claim_id, false, null, null, 'no'])).value?.field === 'reason');
ok('Bilal says it is not his work, with a reason', (await me(BILAL, ANSWER, [c2.claim_id, false, null, null, 'I fixed the AC, the socket is a separate old fault'])).value?.ok === true);
m = await sent();
ok('Ayesha is told Pechkas will decide', to(m, 'ayesha').some((x) => x.title === 'Bilal says this is not his work'));
ok('the owner\'s phone is told', to(m, 'zohaib').some((x) => x.title === `Guarantee claim needs you: ${other.ref}`));
ok('his reason never reaches her card', !JSON.stringify(await mine(AYESHA, other.id)).includes('separate old fault'));
ok('his offers are not stopped: he answered', (await canOffer(BILAL))?.ok === true);
const g1 = (await me(OWNER, `SELECT public.admin_guarantee()`)).value?.claims?.find((x) => x.id === c2.claim_id);
ok('the office sees his reason, her words and photos, marked as needing a decision', g1?.refuse_reason?.includes('separate old fault') && g1?.media?.length === 1 && g1?.needs_you === true);
ok('a customer cannot decide', (await me(AYESHA, `SELECT public.admin_decide_claim($1, true, 'Yes it is')`, [c2.claim_id])).value?.ok === false);
ok('the office must write what it found', (await me(OWNER, `SELECT public.admin_decide_claim($1, false, '')`, [c2.claim_id])).value?.field === 'note');
ok('the office finds it not covered', (await me(OWNER, `SELECT public.admin_decide_claim($1, false, 'The socket was not part of this job. Book it as a new job.')`, [c2.claim_id])).value?.ok === true);
ok('she reads why on her card', (await mine(AYESHA, other.id))?.claim?.office_note === 'The socket was not part of this job. Book it as a new job.');
ok('both are told there is a decision', to(await sent(), 'ayesha').some((x) => x.title === 'Pechkas has decided on the guarantee claim'));

heading('No answer: reminded, then his offers stop');
const third = await done(BILAL, 550000, AYESHA, 150000, INSTALL);
const c3 = (await me(AYESHA, CLAIM, [third.id, 'Not cooling at all again', JSON.stringify([await upload(AYESHA)])])).value;
await sent();
const age = (id, hours) => setup(`UPDATE public.guarantee_claims SET created_at = now() - make_interval(hours => $2), answer_due = now() - make_interval(hours => $2) + interval '24 hours' WHERE id = $1`, [id, hours]);
await age(c3.claim_id, 13);
await setup(`SELECT public.claim_clock()`);
ok('reminded after 12 hours', to(await sent(), 'bilal').filter((x) => x.title === `Answer the guarantee claim on job ${third.ref}`).length === 1);
await setup(`SELECT public.claim_clock()`);
ok('not twice', to(await sent(), 'bilal').length === 0);
await age(c3.claim_id, 21);
await setup(`SELECT public.claim_clock()`);
ok('reminded again at 20 hours', to(await sent(), 'bilal').length === 1);
await age(c3.claim_id, 25);
await setup(`SELECT public.claim_clock()`);
let c = await claimOf(third.id);
ok('after 24 hours it goes to a replacement, and he will be charged', c.status === 'replacing' && c.why_replacing === 'no_answer' && c.charge_original === true);
m = await sent();
ok('he is told his offers have stopped', to(m, 'bilal').some((x) => x.title === 'Your new offers have stopped'));
ok('she is told Pechkas will send another technician', to(m, 'ayesha').some((x) => x.title === 'Pechkas will send another technician'));
ok('his new offers are refused', (await canOffer(BILAL))?.field === 'guarantee');
ok('his feed says why', (await me(BILAL, `SELECT public.pro_feed()`)).value?.guarantee_block?.ref === third.ref);
ok('he may still answer late, until a day is booked', (await claims(BILAL)).find((x) => x.id === c3.claim_id)?.can_answer === true);
ok('he answers late: "I\'ll come"', (await me(BILAL, ANSWER, [c3.claim_id, true, tomorrow, 14, null])).value?.ok === true);
ok('and his offers come back', (await canOffer(BILAL))?.ok === true);
c = await claimOf(third.id);
ok('no charge, since he is coming', c.status === 'coming' && c.charge_original === false);

heading('A missed visit');
await setup(`UPDATE public.guarantee_claims SET visit_date = ((now() AT TIME ZONE 'Asia/Karachi') - interval '7 hours')::date,
  visit_from = 8 WHERE id = $1`, [c3.claim_id]);
await setup(`UPDATE public.guarantee_claims SET visit_date = visit_date - 1 WHERE id = $1`, [c3.claim_id]);
await setup(`SELECT public.claim_clock()`);
c = await claimOf(third.id);
ok('a visit that never happened goes to a replacement too', c.status === 'replacing' && c.why_replacing === 'missed_visit' && c.charge_original === true);
ok('and his offers stop again', (await canOffer(BILAL))?.field === 'guarantee');
ok('he cannot "answer" his way out of a missed visit', (await me(BILAL, ANSWER, [c3.claim_id, true, tomorrow, 16, null])).value?.ok === false);

heading('The replacement, paid by Pechkas');
ok('Bilal cannot book it', (await me(BILAL, `SELECT public.book_replacement($1, $2::date)`, [c3.claim_id, tomorrow])).value?.ok === false);
ok('a day too far is refused', (await me(AYESHA, `SELECT public.book_replacement($1, $2::date)`, [c3.claim_id, await plus(9)])).value?.field === 'day');
const booked = (await me(AYESHA, `SELECT public.book_replacement($1, $2::date)`, [c3.claim_id, tomorrow])).value;
ok('Ayesha chooses tomorrow', booked?.ok === true, JSON.stringify(booked));
const rj = await job(booked.job_id);
ok('a new job: a guarantee repair, paid by Pechkas, capped at the original labour (Rs 4,000)', rj.paid_by_pechkas === true && Number(rj.pay_cap_paisa) === 400000 && Number(rj.offered_paisa) === 400000 && rj.title.startsWith('Guarantee repair: '));
ok('her video of the fault goes with it', Number((await setup(`SELECT count(*) AS n FROM public.job_media WHERE job_id = $1`, [booked.job_id])).rows[0].n) === 1);
ok('Bilal can no longer answer', (await claims(BILAL)).find((x) => x.id === c3.claim_id)?.can_answer === false);
ok('Bilal never sees it in his feed', !(await me(BILAL, `SELECT public.pro_feed()`)).value?.jobs?.some((x) => x.id === booked.job_id));
ok('nor can he offer on it', (await offerAs(BILAL, booked.job_id, 300000)).value?.ok === false);
const asadSees = (await me(ASAD, `SELECT public.pro_feed()`)).value?.jobs?.find((x) => x.id === booked.job_id);
ok('Asad sees it, marked as paid by Pechkas', asadSees?.paid_by_pechkas === true && asadSees?.pay_cap_paisa === 400000);
ok('an offer above the cap is refused', (await offerAs(ASAD, booked.job_id, 450000)).value?.field === 'price');
ok('Asad offers Rs 3,500', (await offerAs(ASAD, booked.job_id, 350000)).value?.ok === true);
{
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [booked.job_id, ASAD])).rows[0].id;
  ok('Ayesha chooses Asad', (await me(AYESHA, `SELECT public.choose_offer($1)`, [offer])).value?.ok === true);
}
await me(ASAD, `SELECT public.tech_step($1, 'chosen')`, [booked.job_id]);
await me(ASAD, `SELECT public.tech_step($1, 'on_way')`, [booked.job_id]);
await me(ASAD, `SELECT public.start_work($1, $2, $3::jsonb)`, [booked.job_id, (await job(booked.job_id)).start_code, JSON.stringify([await upload(ASAD)])]);
const bilalBefore = await owed(BILAL);
const asadBefore = await owed(ASAD);
const reserveBefore = -Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries WHERE account = 'reserve'`)).rows[0].n);
const fr = await finish(ASAD, booked.job_id);
ok('nothing for Ayesha to pay, and no commission', fr?.ok === true && fr?.collect_paisa === 0 && fr?.commission_paisa === 0, JSON.stringify(fr));
ok('Asad\'s job says Pechkas pays him', (await proJob(ASAD, booked.job_id))?.paid_by_pechkas === true);
ok('she confirms it works', (await me(AYESHA, `SELECT public.confirm_work($1)`, [booked.job_id])).value?.ok === true);
c = await claimOf(third.id);
ok('the claim is fixed', c.status === 'fixed');
ok('Pechkas pays Asad Rs 3,500: what he owes drops by that', (await owed(ASAD)) === asadBefore - 350000);
ok('Bilal is charged Rs 3,500 — less than his Rs 4,000 labour', (await owed(BILAL)) === bilalBefore + 350000 && Number(c.charge_paisa) === 350000);
ok('the reserve paid and was refilled', -Number((await setup(`SELECT coalesce(sum(amount_paisa), 0) AS n FROM public.ledger_entries WHERE account = 'reserve'`)).rows[0].n) === reserveBefore);
ok('the ledger adds up to nothing', await balanced());
m = await sent();
ok('Bilal is told the charge and that he can appeal', to(m, 'bilal').some((x) => x.title === 'Guarantee repair charged: Rs 3,500' && /appeal within 7 days/.test(x.body)));
ok('Asad is told Pechkas paid him', to(m, 'asad').some((x) => x.title === `Pechkas has paid you for job ${booked.ref ?? rj.ref}`));
ok('a guarantee repair is not a market price', Number((await setup(`SELECT count(*) AS n FROM public.price_record WHERE job_id = $1`, [booked.job_id])).rows[0].n) === 0);
ok('the block lifts when the claim closes', (await setup(`SELECT public.claim_blocks($1) AS b`, [BILAL])).rows[0].b === null);

heading('The appeal');
pc = (await claims(BILAL)).find((x) => x.id === c3.claim_id);
ok('he can appeal, within 7 days', pc?.can_appeal === true && pc?.charge_paisa === 350000);
await setup(`UPDATE public.guarantee_claims SET charged_at = now() - interval '8 days' WHERE id = $1`, [c3.claim_id]);
ok('not after 7 days', (await me(BILAL, `SELECT public.appeal_charge($1, $2)`, [c3.claim_id, 'I was in hospital that day, here is the slip'])).value?.ok === false);
await setup(`UPDATE public.guarantee_claims SET charged_at = now() WHERE id = $1`, [c3.claim_id]);
ok('a few words are not enough', (await me(BILAL, `SELECT public.appeal_charge($1, $2)`, [c3.claim_id, 'unfair'])).value?.field === 'text');
ok('Bilal appeals', (await me(BILAL, `SELECT public.appeal_charge($1, $2, $3::jsonb)`, [c3.claim_id, 'I was in hospital that day and rang the office to say so', JSON.stringify([await upload(BILAL)])])).value?.ok === true);
ok('once', (await me(BILAL, `SELECT public.appeal_charge($1, $2)`, [c3.claim_id, 'Again, I was in hospital'])).value?.ok === false);
ok('the office is told', to(await sent(), 'zohaib').some((x) => x.title === `Guarantee claim needs you: ${third.ref}`));
ok('Asad cannot decide it', (await me(ASAD, `SELECT public.admin_decide_appeal($1, true, 'Cancelled')`, [c3.claim_id])).value?.ok === false);
const beforeAppeal = await owed(BILAL);
ok('the office cancels the charge', (await me(OWNER, `SELECT public.admin_decide_appeal($1, true, 'Hospital slip seen. Charge cancelled.')`, [c3.claim_id])).value?.ok === true);
ok('it is reversed in the ledger, not edited', (await owed(BILAL)) === beforeAppeal - 350000 && Number((await setup(`SELECT count(*) AS n FROM public.ledger_txns WHERE reverses = $1`, [(await claimOf(third.id)).charge_txn])).rows[0].n) === 1);
ok('the ledger adds up to nothing', await balanced());
ok('decided once', (await me(OWNER, `SELECT public.admin_decide_appeal($1, false, 'Changed my mind')`, [c3.claim_id])).value?.ok === false);
ok('he is told', to(await sent(), 'bilal').some((x) => x.title === `Your appeal on job ${third.ref} has been decided`));

heading('Pechkas pays out what it owes');
{
  const list = (await me(OWNER, `SELECT public.admin_owed_to_pros()`)).value;
  const a = list?.find((x) => x.pro_id === ASAD);
  ok('the office sees Pechkas owes Asad', a?.owed_to_him_paisa === -(await owed(ASAD)) && a.owed_to_him_paisa > 0, JSON.stringify(list));
  ok('not more than it owes', (await me(OWNER, `SELECT public.admin_pay_pro($1, $2, 'jazzcash', 'TX1', 'payout-key-1')`, [ASAD, a.owed_to_him_paisa + 10000])).value?.field === 'amount');
  ok('Asad cannot pay himself', (await me(ASAD, `SELECT public.admin_pay_pro($1, $2, 'jazzcash', 'TX1', 'payout-key-1')`, [ASAD, a.owed_to_him_paisa])).value?.ok === false);
  ok('the office records paying him', (await me(OWNER, `SELECT public.admin_pay_pro($1, $2, 'jazzcash', 'TX1', 'payout-key-1')`, [ASAD, a.owed_to_him_paisa])).value?.recorded === true);
  ok('and now nobody owes anybody', (await owed(ASAD)) === 0);
  ok('the same form twice records once', (await me(OWNER, `SELECT public.admin_pay_pro($1, 10000, 'jazzcash', 'TX1', 'payout-key-1')`, [ASAD])).value?.ok === false && (await owed(ASAD)) === 0);
  ok('the ledger adds up to nothing', await balanced());
}

heading('Still broken after his visit, and the office lifting a block');
{
  const j = await done(BILAL, 400000, SARA, 0, INSTALL);
  const cl = (await me(SARA, CLAIM, [j.id, 'Leaks again from the pipe', JSON.stringify([await upload(SARA)])])).value;
  await me(BILAL, ANSWER, [cl.claim_id, true, tomorrow, 12, null]);
  await me(BILAL, `SELECT public.claim_fixed($1, $2::jsonb)`, [cl.claim_id, JSON.stringify([await upload(BILAL)])]);
  ok('still broken needs words', (await me(SARA, `SELECT public.check_claim($1, false, '')`, [cl.claim_id])).value?.field === 'text');
  ok('Sara says it is still broken', (await me(SARA, `SELECT public.check_claim($1, false, 'Still leaking from the same pipe')`, [cl.claim_id])).value?.ok === true);
  ok('it goes to the office', (await claimOf(j.id)).status === 'disputed');
  ok('the office finds it covered', (await me(OWNER, `SELECT public.admin_decide_claim($1, true, 'Photos show the same leak. Another technician will go.')`, [cl.claim_id])).value?.ok === true);
  const cc = await claimOf(j.id);
  ok('a replacement, charged to him', cc.status === 'replacing' && cc.why_replacing === 'office' && cc.charge_original === true);
  ok('but his offers are not stopped: he did answer', (await canOffer(BILAL))?.ok === true);

  const k = await done(BILAL, 300000, SARA, 0, INSTALL);
  const ck = (await me(SARA, CLAIM, [k.id, 'Making a loud noise now', JSON.stringify([await upload(SARA)])])).value;
  await age(ck.claim_id, 25);
  await setup(`SELECT public.claim_clock()`);
  ok('another claim left unanswered stops his offers', (await canOffer(BILAL))?.field === 'guarantee');
  ok('the office must say why it lifts it', (await me(OWNER, `SELECT public.admin_lift_block($1, '')`, [ck.claim_id])).value?.field === 'note');
  ok('the office lifts it', (await me(OWNER, `SELECT public.admin_lift_block($1, 'He rang: phone was broken, coming tomorrow')`, [ck.claim_id])).value?.ok === true);
  ok('and his offers come back', (await canOffer(BILAL))?.ok === true);
}

heading('Flags');
{
  const f = (await me(OWNER, `SELECT public.admin_flags()`)).value.people.find((x) => x.id === BILAL)?.flags ?? [];
  ok('many claims on one technician\'s work ask the office to review him', f.some((x) => x.kind === 'guarantee_review' && x.n >= 3), JSON.stringify(f));
}

heading('Nobody reads the tables');
denied('a signed-in person cannot read the claims', await as('authenticated', AYESHA, `SELECT * FROM public.guarantee_claims`));
denied('nor the checks', await as('authenticated', BILAL, `SELECT * FROM public.job_checks`));
nothing('a stranger cannot claim', await as('anon', null, `SELECT public.claim_guarantee('${repair.id}', 'Some words here', '[]'::jsonb)`));
nothing('a stranger cannot read the office list', await as('anon', null, `SELECT public.admin_guarantee()`));
ok('a customer reads nothing from the office list', (await me(AYESHA, `SELECT public.admin_guarantee()`)).value == null);

heading('What the phones were told');
await sent();
{
  const bad = all.filter((x) => /Street|House|markaz|Rafiq|92300|\+92|separate old fault|Hospital/.test(`${x.title} ${x.body}`));
  ok('no message carried an address, a number, his reasons or the office\'s words', bad.length === 0, JSON.stringify(bad[0]));
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
  ok('and the claims are still there', Number((await setup(`SELECT count(*) AS n FROM public.guarantee_claims`)).rows[0].n) >= 5);
  ok('the services are still services', (await days(service.id)) === 7);
}

report();
