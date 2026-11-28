/**
 * Helper jobs (A135, migration helper_jobs): the general mazdoor, bought by
 * time.
 *
 * What must hold: Helper is a kind of work bought by time, its four jobs have
 * no guarantee; a timed job is posted only with 2, 4 or 8 hours, through
 * post_timed_job(); an older copy calling post_job() straight cannot leave a
 * timed job without its hours; any other job never carries hours; the hours
 * reach her job and his lists; nothing can be claimed on a helper's job; the
 * notifications no longer name "Yes, it works"; and the migration runs twice.
 */
import { as, db, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e8';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, '923007712121')`, [AYESHA]);
await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'customer', 'Ayesha')`, [AYESHA]);
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return r.rows[0] ? Object.values(r.rows[0])[0] : undefined;
}
const moving = (await setup(`SELECT id FROM public.job_types WHERE trade = 'helper' AND name = 'Furniture moved within the house'`)).rows[0]?.id;
const timed = (hours, trade = 'helper', type = moving) => call(AYESHA, `SELECT public.post_timed_job(p_hours => $1::smallint, p_trade => $2, p_job_type => $3,
    p_description => 'Two sofas to the upstairs room', p_offer_paisa => 200000, p_when_kind => 'now', p_when_part => NULL,
    p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12')`, [hours, trade, type]);
const plain = (trade, type) => call(AYESHA, `SELECT public.post_job(p_trade => $1, p_job_type => $2, p_description => 'Something to sort out please',
    p_offer_paisa => 200000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12')`, [trade, type]);

// =============================================================================
heading('Helper is bought by time, with no guarantee');

{
  const t = (await setup(`SELECT name, by_time FROM public.trades WHERE slug = 'helper'`)).rows[0];
  ok('the kind of work is there, bought by time', t?.name === 'Helper' && t.by_time === true, JSON.stringify(t));
  ok('no other kind of work is bought by time', (await setup(`SELECT count(*)::int AS n FROM public.trades WHERE by_time AND slug <> 'helper'`)).rows[0].n === 0);
  const { rows } = await setup(`SELECT name, guarantee, risky, list_paisa FROM public.job_types WHERE trade = 'helper'`);
  ok('four jobs, not risky, no price', rows.length === 4 && rows.every((r) => r.risky === false && r.list_paisa === null), rows);
  const lists = (await as('anon', null, `SELECT public.app_lists() AS l`)).rows[0].l;
  ok('the phone is told which kind of work is bought by time', lists.trades.some((x) => x.slug === 'helper' && x.by_time === true) && lists.trades.some((x) => x.slug === 'plumber' && x.by_time === false));
}

// =============================================================================
heading('Posting a timed job');

let job;
{
  const none = await timed(null);
  ok('without hours it is refused, beside the hours', none?.ok === false && none.field === 'hours', JSON.stringify(none));
  ok('three hours is not a choice', (await timed(3))?.field === 'hours');
  const r = await timed(4);
  ok('half a day posts', r?.ok === true, JSON.stringify(r));
  job = r?.id;
  ok('and the job keeps its 4 hours', (await setup(`SELECT work_hours FROM public.jobs WHERE id = $1`, [job])).rows[0]?.work_hours === 4);
  ok('a plumber cannot be posted by time', (await timed(4, 'plumber', null))?.field === 'trade');
  const old = await as('authenticated', AYESHA, `SELECT public.post_job(p_trade => 'helper', p_job_type => $1, p_description => 'Two sofas to the upstairs room',
    p_offer_paisa => 200000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12')`, [moving]);
  ok('an older copy posting a helper with no hours is stopped', /how long/.test(old.error ?? ''), old.error ?? JSON.stringify(old.rows));
  const p = await plain('painting', null);
  ok('any other job still posts as before', p?.ok === true, JSON.stringify(p));
  ok('and carries no hours', (await setup(`SELECT work_hours FROM public.jobs WHERE id = $1`, [p?.id])).rows[0]?.work_hours === null);
  ok('the setting does not outlive the post', (await setup(`SELECT nullif(current_setting('pechkas.work_hours', true), '') AS v`)).rows[0].v === null);
}

// =============================================================================
heading('Where the hours are shown, and no guarantee');

{
  const mine = await call(AYESHA, `SELECT public.my_jobs()`);
  ok('her job says 4 hours', (mine ?? []).find((j) => j.id === job)?.work_hours === 4, JSON.stringify((mine ?? []).find((j) => j.id === job)?.work_hours));
  const defs = (await setup(`SELECT pg_get_functiondef('public.pro_feed()'::regprocedure) AS f, pg_get_functiondef('public.pro_my_jobs()'::regprocedure) AS m`)).rows[0];
  ok('his list and his jobs carry the hours', /work_hours/.test(defs.f) && /work_hours/.test(defs.m));
  ok('a helper\'s job has no guarantee days', Number((await setup(`SELECT public.guarantee_days_of($1) AS d`, [job])).rows[0].d) === 0);
  const words = (await setup(`SELECT string_agg(en, ' ') AS w FROM public.push_words WHERE key IN ('check_ready.body', 'check_closed.body')`)).rows[0].w;
  ok('the check notifications no longer name "Yes, it works" or the guarantee', !/Yes, it works|guarantee/.test(words), words);
}

// =============================================================================
heading('Running twice');

{
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261218000000_helper_jobs.sql', import.meta.url), 'utf8'));
  ok('the migration runs a second time', (await setup(`SELECT count(*)::int AS n FROM public.job_types WHERE trade = 'helper'`)).rows[0].n === 4);
  ok('and a timed job still posts', (await timed(8))?.ok === true);
}

report();
