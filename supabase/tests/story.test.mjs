/**
 * A finished job's own page (migration job_story).
 *
 * What must hold: my_job_story() answers only the customer whose job it is;
 * its steps are the job's real record, oldest first, in fixed kinds the
 * screen puts into words — never an address, phone, office note or his
 * refusal reason; how long the work took is from the start code to "work
 * finished"; a new price shows what it was and who said yes. His note for
 * her is his alone to write, only while finishing or for a day after,
 * refuses phone numbers and CNICs, and reaches her page only once the job
 * is over. And the migration runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'b8';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;

for (const [id, phone, role, name] of [
  [AYESHA, '923008111111', 'customer', 'Ayesha'],
  [SARA, '923008112222', 'customer', 'Sara'],
  [BILAL, '923008113333', 'pro', 'Bilal'],
  [ASAD, '923008114444', 'pro', 'Asad'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
let files = 0;
const upload = async (who) => {
  files += 1;
  const name = `${who}/file-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const story = async (who, id) => (await call(who, `SELECT public.my_job_story($1)`, [id])).value;
const NOTE = `SELECT public.pro_set_note($1, $2)`;

let n = 0;
async function posted(customer = AYESHA, price = 300000) {
  n += 1;
  const r = (await call(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => $1,
    p_offer_paisa => $2, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`,
  [`Water dripping inside, unit ${n}`, price])).value;
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  return r.id;
}
async function chosen(id, pro, price, customer = AYESHA) {
  const o = (await call(pro, `SELECT public.make_offer($1, $2, 20, NULL)`, [id, price])).value;
  if (!o?.ok) throw new Error(`offer failed: ${JSON.stringify(o)} ${JSON.stringify(left)}`);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [id, pro])).rows[0]?.id;
  const c = (await call(customer, `SELECT public.choose_offer($1)`, [offer])).value;
  if (!c?.ok) throw new Error(`choose failed: ${JSON.stringify(c)}`);
}
async function working(id, pro) {
  await call(pro, `SELECT public.tech_step($1, 'chosen')`, [id]);
  await call(pro, `SELECT public.tech_step($1, 'on_way')`, [id]);
  const r = (await call(pro, `SELECT public.start_work($1, $2, $3::jsonb)`, [id, (await job(id)).start_code, JSON.stringify([await upload(pro)])])).value;
  if (!r?.ok) throw new Error(`start failed: ${JSON.stringify(r)}`);
}
async function finish(id, pro) {
  const r = (await call(pro, `SELECT public.finish_work($1, $2::jsonb, 0, NULL)`, [id, JSON.stringify([await upload(pro)])])).value;
  if (!r?.ok) throw new Error(`finish failed: ${JSON.stringify(r)}`);
}

// One job with everything: a technician who could not come, another chosen,
// a new price she approved, a note from him, her stars and words.
let left = null;
const main = await posted();
await chosen(main, BILAL, 300000);
left = (await call(BILAL, `SELECT public.pro_withdraw($1, 'vehicle', NULL)`, [main])).value;
await chosen(main, ASAD, 300000);
await working(main, ASAD);
// The work took 78 minutes: the start code was given that long before he finished.
await setup(`UPDATE public.jobs SET started_at = now() - interval '78 minutes' WHERE id = $1`, [main]);
const change = (await call(ASAD, `SELECT public.ask_change($1, $2, $3, $4)`, [main, 350000, 'A part had worn out.', await upload(ASAD)])).value;
const changeId = (await setup(`SELECT id FROM public.job_changes WHERE job_id = $1`, [main])).rows[0]?.id;
const approved = (await call(AYESHA, `SELECT public.decide_change($1, true)`, [changeId])).value;

// =============================================================================
heading('His note for her');

{
  ok('the setup ran: he withdrew, a new price was asked and approved', left?.ok && change?.ok && approved?.ok, JSON.stringify([left, change, approved]));
  ok('he may write it while he finishes', (await call(ASAD, NOTE, [main, '  Clean the filters   every 3 months. '])).value?.ok === true);
  ok('it is kept tidy', (await job(main)).pro_note === 'Clean the filters every 3 months.');
  const phone = (await call(ASAD, NOTE, [main, 'Call me on 0300 1234567 any time'])).value;
  ok('a phone number is refused', phone?.ok === false && phone.field === 'note', JSON.stringify(phone));
  ok('a CNIC is refused', (await call(ASAD, NOTE, [main, `My card is ${['61101', '1234567', '1'].join('-')}`])).value?.ok === false);
  ok('300 letters at most', (await call(ASAD, NOTE, [main, 'x'.repeat(301)])).value?.ok === false);
  ok('and a refusal leaves the note as it was', (await job(main)).pro_note === 'Clean the filters every 3 months.');
  ok('the customer cannot write it', (await call(AYESHA, NOTE, [main, 'Fake note'])).value?.ok === false);
  ok('nor the man who withdrew', (await call(BILAL, NOTE, [main, 'Fake note'])).value?.ok === false);
  denied('a stranger cannot ask at all', await as('anon', null, NOTE, [main, 'x']));
  ok('while the job is on, her page does not show it yet', (await story(AYESHA, main)).pro_note === null);
}

await finish(main, ASAD);
await call(AYESHA, `SELECT public.confirm_work($1)`, [main]);
await call(AYESHA, `SELECT public.rate_job($1, 5, 'On time and tidy.')`, [main]);

// =============================================================================
heading('Her page: the whole story, in order');

{
  const s = await story(AYESHA, main);
  const whats = s.steps.map((x) => x.what);
  ok('it answers', s?.ok === true);
  ok('posted first', whats[0] === 'posted' && s.steps[0].paisa === 300000, whats.join(','));
  ok('Bilal chosen, then he could not come, then Asad chosen',
    whats.indexOf('assigned') < whats.indexOf('reopened') && whats.lastIndexOf('assigned') > whats.indexOf('reopened')
      && s.steps.filter((x) => x.what === 'assigned').map((x) => x.name).join(',') === 'Bilal,Asad', JSON.stringify(s.steps.filter((x) => x.what === 'assigned')));
  ok('how Bilal left is a kind, not his reason', s.steps.find((x) => x.what === 'reopened').kind === 'withdrawn' && !JSON.stringify(s).includes('vehicle'));
  ok('the new price, with his reason', s.steps.some((x) => x.what === 'change_asked' && x.paisa === 350000 && x.text === 'A part had worn out.'));
  ok('and that she said yes', s.steps.some((x) => x.what === 'change_approved' && x.by === 'customer'));
  ok('he said finished, then she said it works', whats.indexOf('checking') < whats.indexOf('confirmed') && s.steps.find((x) => x.what === 'confirmed').kind === 'customer');
  ok('oldest first', s.steps.every((x, i, a) => i === 0 || a[i - 1].at <= x.at));
  ok('only the kinds the screen knows: no rating or note lines', !whats.includes('rated') && !whats.includes('pro_note'));
  ok('first price and the price when chosen', s.first_paisa === 300000 && s.chosen_paisa === 300000);
  ok('the change, approved, by her', s.changes.length === 1 && s.changes[0].from_paisa === 300000 && s.changes[0].price_paisa === 350000
    && s.changes[0].status === 'approved' && s.changes[0].by === 'customer', JSON.stringify(s.changes));
  ok('the work took 78 minutes', s.took_minutes === 78, String(s.took_minutes));
  ok('his note, now the job is over', s.pro_note === 'Clean the filters every 3 months.' && Boolean(s.pro_note_at));
  ok('her words with her stars', s.my_words === 'On time and tidy.');
  ok('messages readable for a day after', Math.abs(new Date(s.chat_until) - new Date((await job(main)).finished_at) - 864e5) < 1000);
  ok('he has not left Pechkas', s.pro_left === false);
  ok('arrival, start and finish times', Boolean(s.started_at && s.said_done_at && s.finished_at));
  const text = JSON.stringify(s);
  ok('no street, house, landmark, gate note or phone', !/Street 34|House 12|markaz|Rafiq|92300|0300/.test(text));
  ok('no surname', !/Ahmed|Mehmood/.test(text));
}

// =============================================================================
heading('Only hers');

{
  nothing('another customer gets nothing', await as('authenticated', SARA, `SELECT public.my_job_story($1) AS s WHERE public.my_job_story($1) IS NOT NULL`, [main]));
  ok('nor does the technician', (await story(ASAD, main)) === null);
  denied('a stranger cannot ask', await as('anon', null, `SELECT public.my_job_story($1)`, [main]));
}

// =============================================================================
heading('His note after the job');

{
  ok('within a day he may still change it', (await call(ASAD, NOTE, [main, 'Clean the filters monthly in summer.'])).value?.ok === true);
  ok('and she sees the change', (await story(AYESHA, main)).pro_note === 'Clean the filters monthly in summer.');
  ok('an empty note takes it away', (await call(ASAD, NOTE, [main, '  '])).value?.ok === true && (await story(AYESHA, main)).pro_note === null);
  await setup(`UPDATE public.jobs SET finished_at = now() - interval '25 hours' WHERE id = $1`, [main]);
  ok('after a day, no more', (await call(ASAD, NOTE, [main, 'Late note'])).value?.ok === false);
}

// =============================================================================
heading('A cancelled job and a technician who left');

{
  const c = await posted();
  await call(AYESHA, `SELECT public.cancel_job($1, $2)`, [c, 'Fixed it myself']);
  const s = await story(AYESHA, c);
  ok('how it was cancelled, and her words', s.cancel?.by === 'customer' && s.cancel.category === 'before_choosing' && s.cancel.reason === 'Fixed it myself', JSON.stringify(s.cancel));
  ok('the steps end with cancelled, by her', s.steps.at(-1).what === 'cancelled' && s.steps.at(-1).kind === 'customer');
  ok('no offers, no technician, no messages', s.offers === 0 && s.pro_left === false && s.chat_until === null);

  const gone = await posted();
  await chosen(gone, BILAL, 300000);
  await working(gone, BILAL);
  await finish(gone, BILAL);
  await call(AYESHA, `SELECT public.confirm_work($1)`, [gone]);
  await call(BILAL, NOTE, [gone, 'Keep the drain pipe clear.']);
  await setup(`DELETE FROM public.pros WHERE id = $1`, [BILAL]);
  const g = await story(AYESHA, gone);
  ok('a technician who deleted his account: the page can say he left', g.pro_left === true);
  ok('his note stays with her job', g.pro_note === 'Keep the drain pipe clear.');
}

// =============================================================================
heading('The owner runs migrations by hand');

{
  let error = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261126000000_job_story.sql'), 'utf8'));
  } catch (e) {
    error = e.message;
  }
  ok('the file runs a second time', error === null, error);
  ok('and the page still answers', (await story(AYESHA, main))?.ok === true);
}

report();
