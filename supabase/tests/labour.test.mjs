/**
 * A104: the price limit on a new technician's first jobs is on his WORK.
 *
 * Parts he says are in his offer are taken off before the limit is checked,
 * when he offers and again when she chooses. A new price over the limit during
 * a first job is allowed if she agrees, but the job then does not count as one
 * of his first jobs; and at the finish, work that came to more than the limit
 * (price less the parts on the receipt) does not count either. Older copies
 * that send no parts are held to the whole price, as before.
 */
import { readFile } from 'node:fs/promises';
import { MIGRATIONS, as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const id = (n) => `ab${String(n).repeat(6)}-${String(n).repeat(4)}-4${String(n).repeat(3)}-8${String(n).repeat(3)}-${String(n).repeat(12)}`;
const AYESHA = id(1);
const SARA = id(2);
const HINA = id(3);
const NIDA = id(4);
const IMRAN = id(5); // on first jobs in AC
const ASAD = id(6); // approved the old way: no first jobs

for (const [who, phone, role, name] of [
  [AYESHA, '923007551111', 'customer', 'Ayesha'],
  [SARA, '923007552222', 'customer', 'Sara'],
  [HINA, '923007553333', 'customer', 'Hina'],
  [NIDA, '923007554444', 'customer', 'Nida'],
  [IMRAN, '923007555555', 'pro', 'Imran'],
  [ASAD, '923007556666', 'pro', 'Asad'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [who, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name, created_at) VALUES ($1, $2, $3, now() - interval '200 days')`, [who, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online, applied_at)
  VALUES ($1, 'Imran Khan', '{ac}', 4, '{F-11}', 'approved', true, now() - interval '30 days'),
         ($2, 'Asad Mehmood', '{ac}', 9, '{F-11}', 'approved', true, now() - interval '300 days')`, [IMRAN, ASAD]);
await setup(`INSERT INTO public.pro_trades (pro_id, trade, status) VALUES ($1, 'ac', 'trial')
             ON CONFLICT (pro_id, trade) DO UPDATE SET status = 'trial'`, [IMRAN]);
// His face photo: without it a trade on trial opens nothing.
await setup(`INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [`${IMRAN}/face.jpg`]);
await setup(`INSERT INTO public.pro_faces (pro_id, path) VALUES ($1, $2)`, [IMRAN, `${IMRAN}/face.jpg`]);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const SERVICE = (await setup(`SELECT id FROM public.job_types WHERE trade = 'ac' AND NOT risky ORDER BY id LIMIT 1`)).rows[0].id;
const tomorrow = (await setup(`SELECT ((now() AT TIME ZONE 'Asia/Karachi')::date + 1)::text AS d`)).rows[0].d;
const HOME = { [AYESHA]: [33.68, 73.0], [SARA]: [33.69, 73.0], [HINA]: [33.70, 73.0], [NIDA]: [33.71, 73.0] };
async function post(customer, price) {
  const r = (await call(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => $1, p_description => 'The AC is not cooling.',
    p_offer_paisa => $2, p_when_kind => 'later', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_lat => $3, p_lng => $4, p_media => '[]'::jsonb, p_when_date => $5::date, p_when_from => NULL)`,
  [SERVICE, price, HOME[customer][0], HOME[customer][1], tomorrow])).value;
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  return r.id;
}
const offer = (pro, job, price, parts) =>
  call(pro, `SELECT public.make_offer(p_job => $1, p_price_paisa => $2, p_arrive_from => 14::smallint, p_parts_paisa => $3)`, [job, price, parts]);
const oldOffer = (pro, job, price) => call(pro, `SELECT public.make_offer(p_job => $1, p_price_paisa => $2, p_arrive_from => 14::smallint)`, [job, price]);
const offerRow = async (pro, job) => (await setup(`SELECT * FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [job, pro])).rows[0];
const choose = async (customer, pro, job) => (await call(customer, `SELECT public.choose_offer($1)`, [(await offerRow(pro, job)).id])).value;
const trial = async (job) => (await setup(`SELECT * FROM public.trial_jobs WHERE job_id = $1`, [job])).rows[0];
let files = 0;
async function upload(who) {
  files += 1;
  const name = `${who}/labour-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
}
async function toWork(pro, job, customer) {
  await call(pro, `SELECT public.tech_step($1, 'chosen')`, [job]);
  const now = new Date().toISOString();
  const at = JSON.stringify({ lat: HOME[customer][0], lng: HOME[customer][1], accuracy: 8, fix_at: now, sent_at: now, mocked: false });
  await call(pro, `SELECT public.tech_step($1, 'on_way', $2::jsonb)`, [job, at]);
  // At her door she confirms he is the man in his photo.
  await call(customer, `SELECT public.customer_face_answer($1, true)`, [job]);
  const code = (await setup(`SELECT start_code FROM public.jobs WHERE id = $1`, [job])).rows[0].start_code;
  const s = (await call(pro, `SELECT public.start_work($1, $2, $3::jsonb)`, [job, code, JSON.stringify([await upload(pro)])])).value;
  if (!s?.ok) throw new Error(`start failed: ${JSON.stringify(s)}`);
}
async function finish(pro, job, customer, parts) {
  const receipt = parts ? await upload(pro) : null;
  const f = (await call(pro, `SELECT public.finish_work($1, $2::jsonb, $3, $4)`, [job, JSON.stringify([await upload(pro)]), parts, receipt])).value;
  if (!f?.ok) throw new Error(`finish failed: ${JSON.stringify(f)}`);
  const c = (await call(customer, `SELECT public.confirm_work($1)`, [job])).value;
  if (!c?.ok) throw new Error(`confirm failed: ${JSON.stringify(c)}`);
}
// What her job screen reads about a waiting new price (my_jobs().change).
const herChange = async (customer, job) => ((await call(customer, `SELECT public.my_jobs()`)).value ?? []).find((x) => x.id === job)?.change ?? null;
const review = async (job) => (await setup(`SELECT public.trial_review($1, $2) AS r`, [job, IMRAN])).rows[0].r;

// =============================================================================
heading('Before the limit is set, nobody on first jobs can offer');

const j1 = await post(AYESHA, 300000);
const unset = (await offer(IMRAN, j1, 300000, null)).value;
ok('refused while the limit is "not set"', unset?.ok === false && /not set the price limit/.test(unset.why), JSON.stringify(unset));

await setup(`UPDATE public.settings SET value = 500000 WHERE key = 'trial_price_cap_paisa'`);

// =============================================================================
heading('His offer: the limit is on the work, parts with a receipt are taken off');

const over = (await offer(IMRAN, j1, 600000, null)).value;
ok('Rs 6,000 of work is over a Rs 5,000 limit', over?.ok === false && over.field === 'price', JSON.stringify(over));
ok('the refusal says the limit is on his work and points to the parts box', /your work can come to at most Rs 5,000/.test(over?.why ?? '') && /parts box/.test(over?.why ?? ''));
const whole = (await offer(IMRAN, j1, 600000, 600000)).value;
ok('parts cannot be the whole price', whole?.ok === false && whole.field === 'parts', JSON.stringify(whole));
const odd = (await offer(IMRAN, j1, 600000, 150050)).value;
ok('parts are whole rupees', odd?.ok === false && odd.field === 'parts', JSON.stringify(odd));
const withParts = (await offer(IMRAN, j1, 600000, 150000)).value;
ok('Rs 6,000 with Rs 1,500 of parts is Rs 4,500 of work: accepted', withParts?.ok === true, JSON.stringify(withParts));
ok('the parts are kept on the offer', Number((await offerRow(IMRAN, j1)).parts_paisa) === 150000);
const feedJob = ((await call(IMRAN, `SELECT public.pro_feed()`)).value?.jobs ?? []).find((x) => x.id === j1);
ok('his job list keeps the parts on his own offer, so changing it starts there', Number(feedJob?.my_offer?.parts_paisa) === 150000, JSON.stringify(feedJob?.my_offer));
const seen = (await call(AYESHA, `SELECT public.job_offers($1)`, [j1])).value;
ok('she sees the parts on his offer', Number(seen?.[0]?.parts_paisa) === 150000, JSON.stringify(seen));
const moreParts = (await offer(IMRAN, j1, 700000, 100000)).value;
ok('changing the offer is checked again: Rs 6,000 of work is refused', moreParts?.ok === false && moreParts.field === 'price', JSON.stringify(moreParts));
ok('and the offer she sees stays as it was', Number((await offerRow(IMRAN, j1)).price_paisa) === 600000);

// An older copy sends no parts: the whole price counts, as before.
const j0 = await post(NIDA, 300000);
ok('an older copy (no parts sent) is held to the whole price', (await oldOffer(IMRAN, j0, 600000)).value?.ok === false);
ok('and may still offer within it', (await oldOffer(IMRAN, j0, 400000)).value?.ok === true);
ok('with no parts recorded', (await offerRow(IMRAN, j0)).parts_paisa === null);
await call(IMRAN, `SELECT public.withdraw_offer($1)`, [j0]).catch(() => {});

// A technician not on first jobs: parts are said at the finish, as always.
const jA = await post(SARA, 300000);
ok('a technician not on first jobs may offer over the limit', (await offer(ASAD, jA, 600000, 200000)).value?.ok === true);
ok('and no parts are kept on his offer', (await offerRow(ASAD, jA)).parts_paisa === null);

// =============================================================================
heading('Her choosing: checked again on the work');

await setup(`UPDATE public.settings SET value = 400000 WHERE key = 'trial_price_cap_paisa'`);
const lowered = await choose(AYESHA, IMRAN, j1);
ok('if the limit falls below his work before she chooses, she cannot choose him', lowered?.ok === false, JSON.stringify(lowered));
await setup(`UPDATE public.settings SET value = 500000 WHERE key = 'trial_price_cap_paisa'`);
const chose = await choose(AYESHA, IMRAN, j1);
ok('with the limit back, she chooses him', chose?.ok === true, JSON.stringify(chose));
ok('the first job keeps the limit in force when it was given', Number((await trial(j1))?.cap_paisa) === 500000, JSON.stringify(await trial(j1)));

// =============================================================================
heading('A new price over the limit: allowed if she agrees, and then it does not count');

await toWork(IMRAN, j1, AYESHA);
const asked = (await call(IMRAN, `SELECT public.ask_change(p_job => $1, p_price_paisa => $2, p_reason => 'The fan motor is burnt out.', p_photo => $3, p_parts_paisa => $4)`,
  [j1, 900000, await upload(IMRAN), 100000])).value;
ok('a new price whose work (Rs 8,000) is over the limit is NOT refused', asked?.ok === true, JSON.stringify(asked));
ok('he is told it is over the limit for first jobs', asked?.over_first_limit === true);
const pending = await herChange(AYESHA, j1);
ok('her card knows it is more than Pechkas allows new technicians', pending?.over_first_limit === true && Number(pending?.parts_paisa) === 100000, JSON.stringify(pending));
const yes = (await call(AYESHA, `SELECT public.decide_change($1, true)`, [pending.id])).value;
ok('she agrees', yes?.ok === true, JSON.stringify(yes));
ok('the first job is marked as over the limit', (await trial(j1))?.over_limit === true);
ok('and the job goes on at the new price', Number((await setup(`SELECT agreed_paisa FROM public.jobs WHERE id = $1`, [j1])).rows[0].agreed_paisa) === 900000);
await finish(IMRAN, j1, AYESHA, 100000);
ok('finished: it does not count as a first job', (await review(j1)) === 'not_counted');
ok('and the reason is over_limit', (await trial(j1))?.why === 'over_limit', JSON.stringify(await trial(j1)));
ok('commission is still on the price less the parts', Number((await setup(`SELECT commission_paisa FROM public.jobs WHERE id = $1`, [j1])).rows[0].commission_paisa) === 80000);

// =============================================================================
heading('A new price within the limit is an ordinary new price');

const j2 = await post(SARA, 300000);
ok('he offers on his next first job', (await offer(IMRAN, j2, 300000, null)).value?.ok === true);
ok('she chooses him', (await choose(SARA, IMRAN, j2))?.ok === true);
await toWork(IMRAN, j2, SARA);
const within = (await call(IMRAN, `SELECT public.ask_change(p_job => $1, p_price_paisa => $2, p_reason => 'A capacitor is needed.', p_photo => $3, p_parts_paisa => $4)`,
  [j2, 550000, await upload(IMRAN), 100000])).value;
ok('Rs 5,500 with Rs 1,000 of parts (Rs 4,500 of work) is within the limit', within?.ok === true && within.over_first_limit === false, JSON.stringify(within));
const p2 = await herChange(SARA, j2);
ok('her card does not warn her', p2?.over_first_limit === false);
await call(SARA, `SELECT public.decide_change($1, true)`, [p2.id]);
ok('agreed, the first job is not marked', (await trial(j2))?.over_limit === false);

// =============================================================================
heading('At the finish: work over the limit does not count');

// The receipt came to Rs 400, not the Rs 1,000 he said: Rs 5,100 of work, over the Rs 5,000 limit.
await finish(IMRAN, j2, SARA, 40000);
ok('it does not count: the work came to more than the limit', (await review(j2)) === 'not_counted' && (await trial(j2))?.why === 'over_limit',
  JSON.stringify(await trial(j2)));

const j3 = await post(HINA, 300000);
ok('he offers on a third job', (await offer(IMRAN, j3, 600000, 150000)).value?.ok === true);
ok('she chooses him', (await choose(HINA, IMRAN, j3))?.ok === true);
await setup(`UPDATE public.settings SET value = 400000 WHERE key = 'trial_price_cap_paisa'`);
await toWork(IMRAN, j3, HINA);
await finish(IMRAN, j3, HINA, 150000);
const r3 = await review(j3);
const t3 = await trial(j3);
ok('Rs 4,500 of work within the limit given with the job (Rs 5,000) is not over_limit, though the office lowered it since',
  t3?.why !== 'over_limit' && Number(t3?.cap_paisa) === 500000, `${r3} ${JSON.stringify(t3)}`);

// =============================================================================
heading('Who may call what');

const anonOffer = await as('anon', null, `SELECT public.make_offer(p_job => $1, p_price_paisa => 300000)`, [j3]);
ok('a stranger cannot make an offer', /permission denied/.test(anonOffer.error ?? ''), anonOffer.error);
const anonAsk = await as('anon', null, `SELECT public.ask_change(p_job => $1, p_price_paisa => 300000, p_reason => 'x', p_photo => 'x')`, [j3]);
ok('a stranger cannot ask a new price', /permission denied/.test(anonAsk.error ?? ''), anonAsk.error);
const trig = await as('authenticated', IMRAN, `SELECT public.change_over_first_limit()`);
ok('nobody can call the trigger function', Boolean(trig.error), trig.error);

// =============================================================================
heading('An older migration run again never makes the offer ambiguous');

// The owner may run a file twice. An older one puts back its own five-argument make_offer
// beside the new six-argument one: each call must still reach exactly one of them.
await db.exec(await readFile(`${MIGRATIONS}/20261117000000_payments_count_at_once.sql`, 'utf8'));
await db.exec(await readFile(`${MIGRATIONS}/20261118000000_first_job_labour.sql`, 'utf8'));
const j4 = await post(NIDA, 300000);
const plain = await oldOffer(ASAD, j4, 300000);
ok('an offer without parts still goes through', plain.value?.ok === true, plain.error ?? JSON.stringify(plain.value));
const j5 = await post(SARA, 300000);
const withP = await offer(ASAD, j5, 300000, null);
ok('and so does one that says its parts', withP.value?.ok === true, withP.error ?? JSON.stringify(withP.value));

report();
