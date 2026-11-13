/**
 * The quiz questions (migration quiz_questions, D37 stage 3).
 *
 * What must hold: the rules quiz and the five safety drafts are in, each pool
 * big enough to be switched on (twice what is drawn), every answer points at
 * a real option, and nothing is switched on by the file: the owner does that,
 * a safety quiz only with the qualified person's name. A technician is given
 * questions, never the answers. It runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const OWNER = '9a999999-9999-4999-8999-999999999999';
const BILAL = '9a333333-3333-4333-8333-333333333333';
await setup(`INSERT INTO auth.users (id, email) VALUES ($1, 'owner@example.com')`, [OWNER]);
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, '923007551111')`, [BILAL]);
await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'pro', 'Bilal')`, [BILAL]);
await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, 'Bilal Ahmed', '{ac}', 6, '{F-11}', 'applied')`, [BILAL]);
const me = async (who, sql, params = []) => {
  const r = await as('authenticated', who, sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : r.error;
};

heading('The pools');
const pools = Object.fromEntries((await setup(`SELECT quiz, count(*)::int AS n FROM public.quiz_questions WHERE active GROUP BY quiz`)).rows.map((r) => [r.quiz, r.n]));
ok('the rules quiz has 24 questions', pools.rules === 24, JSON.stringify(pools));
for (const t of ['ac', 'electrician', 'plumber', 'solar', 'appliances']) ok(`the ${t} safety draft has 20`, pools[`safety:${t}`] === 20);
ok('every pool is at least twice what is drawn', (await setup(`SELECT bool_and((SELECT count(*) FROM public.quiz_questions x WHERE x.quiz = q.key) >= 2 * q.draw) AS b
  FROM public.quizzes q WHERE q.key IN (SELECT DISTINCT quiz FROM public.quiz_questions)`)).rows[0].b === true);
ok('every answer is one of its options', (await setup(`SELECT bool_and(answer < jsonb_array_length(options)) AS b FROM public.quiz_questions`)).rows[0].b === true);
ok('every question and option has Urdu and English', (await setup(`SELECT bool_and(length(ur) > 5 AND length(en) > 5
  AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(options) o WHERE coalesce(o ->> 'ur', '') = '' OR coalesce(o ->> 'en', '') = '')) AS b FROM public.quiz_questions`)).rows[0].b === true);
ok('the right answer is not always in the same place', (await setup(`SELECT count(DISTINCT answer)::int AS n FROM public.quiz_questions`)).rows[0].n >= 3);

heading('Nothing is switched on by the file');
ok('every quiz is off', (await setup(`SELECT bool_and(NOT is_on) AS b FROM public.quizzes`)).rows[0].b === true);
ok('a safety quiz cannot be switched on without the person who checked it',
  (await me(OWNER, `SELECT public.admin_set_quiz('safety:ac', true, NULL)`))?.field === 'checked_by');
ok('the rules quiz can be, by the owner', (await me(OWNER, `SELECT public.admin_set_quiz('rules', true, NULL)`))?.ok === true);

heading('A technician is given questions, never answers');
nothing('he cannot read the questions table', await as('authenticated', BILAL, `SELECT * FROM public.quiz_questions`));
await setup(`UPDATE public.settings SET value = 8000 WHERE key = 'quiz_pass_bps'`);
const q = await me(BILAL, `SELECT public.start_quiz('rules')`);
ok('ten questions, with no answer among them', q?.ok === true && q.questions.length === 10 && !JSON.stringify(q).includes('"answer"'), JSON.stringify(q).slice(0, 200));

heading('Runs twice');
{
  let error = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261113100000_quiz_questions.sql'), 'utf8'));
  } catch (e) {
    error = e.message;
  }
  ok('the file runs a second time', error === null, error);
  ok('and switches nothing off or on', (await setup(`SELECT is_on FROM public.quizzes WHERE key = 'rules'`)).rows[0].is_on === true);
}

report();
