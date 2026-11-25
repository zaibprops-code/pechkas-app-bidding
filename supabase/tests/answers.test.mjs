/**
 * The office answers in the app (migration office_answers).
 *
 * What must hold: the office answers a report in writing; only the person
 * who sent it reads the answer, through my_reports(); they are told by a
 * notification that carries the job number but never the answer; the
 * office's own closing note is never shown to them; nobody but the office
 * can answer; an answer refuses a CNIC; and no refusal promises a call.
 */
import { as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e5';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007511111', null, 'customer', 'Ayesha'],
  [SARA, '923007512222', null, 'customer', 'Sara'],
  [BILAL, '923007513333', null, 'pro', 'Bilal'],
  [OWNER, null, 'owner@example.com', null, null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
  if (role) await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'approved', true)`, [BILAL]);
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
async function onJob(customer) {
  const r = (await call(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Not cooling',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`)).value;
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  await setup(`SET session_replication_role = replica`);
  await setup(`UPDATE public.jobs SET status = 'assigned', stage = 'working', pro_id = $2, agreed_paisa = 300000 WHERE id = $1`, [r.id, BILAL]);
  await setup(`SET session_replication_role = DEFAULT`);
  return r.id;
}
const reports = async (who, job = null) => (await call(who, `SELECT public.my_reports($1)`, [job])).value;
const ANSWER = `SELECT public.admin_answer_problem($1, $2)`;

await call(AYESHA, `SELECT public.save_push_token($1, 'android', 'en')`, [`ExponentPushToken[${'ayesha'.padEnd(22, 'x')}]`]);
const j1 = await onJob(AYESHA);
const j2 = await onJob(SARA);

// =============================================================================
heading('Reporting, and what the refusals say');

{
  const r = (await call(AYESHA, `SELECT public.report($1, 'problem', $2)`, [j1, 'The unit is leaking again'])).value;
  ok('she reports a problem', r?.ok === true, JSON.stringify(r));
  const again = (await call(AYESHA, `SELECT public.report($1, 'problem', $2)`, [j1, 'Still leaking'])).value;
  ok('a second while one is open is refused', again?.ok === false);
  ok('and the refusal promises an answer in the app, not a call', /in the app/.test(again.why) && !/call/i.test(again.why), again.why);
  const b = (await call(BILAL, `SELECT public.report($1, 'problem', $2)`, [j1, 'Customer not letting me finish'])).value;
  ok('he can report on the same job', b?.ok === true, JSON.stringify(b));
  ok('Sara reports on her own job', (await call(SARA, `SELECT public.report($1, 'problem', $2)`, [j2, 'He left without fixing it'])).value?.ok === true);
}

// =============================================================================
heading('Before the office answers');

{
  const mine = await reports(AYESHA, j1);
  ok('she sees her own report on the job', mine.length === 1 && mine[0].body === 'The unit is leaking again', JSON.stringify(mine));
  ok('it is open and unanswered', mine[0].open === true && mine[0].answer === null);
  ok('she never sees his report', !JSON.stringify(mine).includes('not letting me finish'));
  ok('his list is his own', (await reports(BILAL)).every((x) => x.body !== 'The unit is leaking again'));
  ok('Sara\'s list has nothing of Ayesha\'s', (await reports(SARA)).every((x) => x.job_id === j2));
  ok('Sara cannot read Ayesha\'s job\'s reports', (await reports(SARA, j1)).length === 0);
  denied('a stranger gets nothing', await as('anon', null, `SELECT public.my_reports(NULL)`));
}

// =============================================================================
heading('The office answers');

const ayeshas = (await setup(`SELECT id FROM public.problems WHERE job_id = $1 AND from_id = $2`, [j1, AYESHA])).rows[0].id;
{
  const sent = Number((await setup(`SELECT count(*) AS n FROM net.sent`)).rows[0].n);
  ok('a customer cannot answer', (await call(AYESHA, ANSWER, [ayeshas, 'All fine now'])).value?.ok === false);
  ok('a technician cannot answer', (await call(BILAL, ANSWER, [ayeshas, 'All fine now'])).value?.ok === false);
  ok('an empty answer is refused', (await call(OWNER, ANSWER, [ayeshas, '  '])).value?.field === 'answer');
  ok('a CNIC is refused', (await call(OWNER, ANSWER, [ayeshas, ['Send 61101', '1234567', '1'].join('-')])).value?.ok === false);
  const r = (await call(OWNER, ANSWER, [ayeshas, 'We have spoken to Bilal. He comes back tomorrow at 10am to reseal the pipe.'])).value;
  ok('the office answers', r?.ok === true, JSON.stringify(r));

  const mine = await reports(AYESHA, j1);
  ok('she reads the answer on the job', /reseal the pipe/.test(mine[0].answer) && Boolean(mine[0].answered_at), JSON.stringify(mine));
  ok('and in her list', (await reports(AYESHA)).some((x) => /reseal/.test(x.answer ?? '')));
  ok('he does not see her answer', !JSON.stringify(await reports(BILAL)).includes('reseal'));

  const log = (await setup(`SELECT title, body, kind FROM public.push_log WHERE user_id = $1 AND kind = 'office_answer'`, [AYESHA])).rows;
  ok('she is told the office answered', log.length === 1 && /answered/.test(log[0].title), JSON.stringify(log));
  ok('the notification sends her to the app', /Pechkas app/.test(log[0].body), log[0].body);
  ok('but never the answer itself', !/reseal|Bilal|10am/.test(log[0].title + log[0].body));
  ok('a push went out', Number((await setup(`SELECT count(*) AS n FROM net.sent`)).rows[0].n) > sent);
  ok('it is in the job\'s record', (await setup(`SELECT count(*)::int AS n FROM public.job_events WHERE job_id = $1 AND what = 'problem_answered'`, [j1])).rows[0].n === 1);

  const fix = (await call(OWNER, ANSWER, [ayeshas, 'Correction: he comes at 11am, not 10am.'])).value;
  ok('the office can correct its answer', fix?.ok === true && /11am/.test((await reports(AYESHA, j1))[0].answer));
}

// =============================================================================
heading('The office\'s own note stays the office\'s');

{
  const c = (await call(OWNER, `SELECT public.admin_close_problem($1, $2)`, [ayeshas, 'Internal: customer seemed upset, watch this one'])).value;
  ok('closed with an internal note', c?.ok === true, JSON.stringify(c));
  const mine = await reports(AYESHA, j1);
  ok('closed shows as not open', mine[0].open === false);
  ok('the answer is still there', /11am/.test(mine[0].answer));
  ok('the internal note is never shown to her', !JSON.stringify(await reports(AYESHA)).includes('Internal'));
  const list = (await call(OWNER, `SELECT public.admin_problems('closed')`)).value;
  ok('the office sees its answer in its list', list.some((p) => /11am/.test(p.answer ?? '') && p.answered_by === 'Zohaib'), JSON.stringify(list.map((p) => p.answer)));
  ok('reopening the question: she may report again', (await call(AYESHA, `SELECT public.report($1, 'problem', $2)`, [j1, 'Leaking a third time'])).value?.ok === true);
  nothing('nobody reads the problems table directly', await as('authenticated', AYESHA, `SELECT * FROM public.problems`));
}

// =============================================================================
heading('A report from somebody who has left');

{
  const saras = (await setup(`SELECT id FROM public.problems WHERE job_id = $1 AND from_id = $2`, [j2, SARA])).rows[0].id;
  await setup(`UPDATE public.problems SET from_id = NULL WHERE id = $1`, [saras]);
  const r = (await call(OWNER, ANSWER, [saras, 'Sorry to hear it.'])).value;
  ok('an answer nobody can read is refused, and says why', r?.ok === false && /deleted/.test(r.why), JSON.stringify(r));
  const list = (await call(OWNER, `SELECT public.admin_problems('open')`)).value;
  ok('and the office is told before it writes', list.find((p) => p.id === saras)?.can_answer === false);
}

// =============================================================================
heading('Running twice');

{
  const { readFile } = await import('node:fs/promises');
  const sql = await readFile(new URL('../migrations/20261129000000_office_answers.sql', import.meta.url), 'utf8');
  await db.exec(sql);
  ok('the migration runs a second time', (await reports(AYESHA, j1)).length === 2);
}

report();
