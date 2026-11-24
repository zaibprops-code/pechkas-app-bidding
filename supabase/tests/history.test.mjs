/**
 * My jobs, Past: a customer's finished jobs, a page at a time.
 *
 * What must hold: she sees only her own jobs, only finished ones, and never
 * an address, a pin or a phone number; a stranger sees nothing. The search
 * needs every word it is given; each filter keeps what it says and nothing
 * else; pages follow on without a job twice or a job missed; "found" is the
 * real count. The facets offer only what is in her own jobs. And the
 * migration can be run a second time, because the owner runs them by hand.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'e1111111-1111-4111-8111-111111111111';
const SARA = 'e2222222-2222-4222-8222-222222222222';
const BILAL = 'e3333333-3333-4333-8333-333333333333';
const ASAD = 'e4444444-4444-4444-8444-444444444444';
const BILAL2 = 'e5555555-5555-4555-8555-555555555555'; // another Bilal

for (const [id, phone, role, name] of [
  [AYESHA, '923001111111', 'customer', 'Ayesha'],
  [SARA, '923002222222', 'customer', 'Sara'],
  [BILAL, '923003333333', 'pro', 'Bilal'],
  [ASAD, '923004444444', 'pro', 'Asad'],
  [BILAL2, '923005555555', 'pro', 'Bilal'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full, trades] of [[BILAL, 'Bilal Ahmed', '{plumber,ac}'], [ASAD, 'Asad Mehmood', '{ac}'], [BILAL2, 'Bilal Khan', '{plumber}']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status) VALUES ($1, $2, $3, 6, '{F-11}', 'approved')`, [id, full, trades]);
}

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const POST = `SELECT public.post_job(p_trade => $2, p_job_type => NULL, p_description => $1, p_offer_paisa => 250000,
  p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34', p_house => 'House 12',
  p_landmark => 'Behind the markaz mosque', p_lat => 33.68, p_lng => 72.99, p_gate_note => 'Chowkidar Rafiq will open',
  p_media => '[]'::jsonb)`;

/** A finished job, made the quick way: posted for real, then moved to how it ended with the triggers off. */
async function past(who, trade, words, how, pro, daysAgo, collect) {
  const posted = await call(who, POST, [words, trade]);
  if (posted.error) throw new Error(`posting failed: ${posted.error}`);
  const jobId = posted.value?.id ?? posted.value;
  await setup(`SET session_replication_role = replica`);
  const at = `now() - make_interval(days => ${daysAgo})`;
  if (how === 'done' || how === 'stopped') {
    await setup(`UPDATE public.jobs SET status = $2, pro_id = $3, finished_at = ${at}, collect_paisa = $4, agreed_paisa = $4, title = $5 WHERE id = $1`,
      [jobId, how, pro, collect, words]);
  } else {
    await setup(`UPDATE public.jobs SET status = 'cancelled', cancelled_by = $2, title = $3, created_at = ${at} WHERE id = $1`,
      [jobId, how === 'nobody' ? 'nobody' : 'customer', words]);
  }
  await setup(`SET session_replication_role = DEFAULT`);
  return jobId;
}

const ids = {
  geyser: await past(AYESHA, 'plumber', 'Geyser repair', 'done', BILAL, 3, 200000),
  tap: await past(AYESHA, 'plumber', 'Leaking tap', 'done', BILAL, 40, 120000),
  ac: await past(AYESHA, 'ac', 'AC service', 'done', ASAD, 200, 300000),
  fee: await past(AYESHA, 'plumber', 'Geyser not heating', 'stopped', BILAL, 60, 30000),
  cancelled: await past(AYESHA, 'ac', 'AC gas top-up', 'cancelled', null, 10, null),
  nobody: await past(AYESHA, 'plumber', 'Water motor', 'nobody', null, 15, null),
  sara: await past(SARA, 'plumber', 'Geyser repair', 'done', BILAL, 5, 180000),
};
const live = (await call(AYESHA, POST, ['Fan not working', 'ac'])).value;

const hist = async (who, args = '') => (await call(who, `SELECT public.my_history(${args})`)).value;
const titles = (r) => (r?.jobs ?? []).map((j) => j.title);

// =============================================================================
heading('Only her own finished jobs');

{
  const r = await hist(AYESHA);
  ok('six finished jobs, the live one left out', r?.found === 6 && r.jobs.length === 6, JSON.stringify(r?.found));
  ok('none of Sara\'s', !r.jobs.some((j) => j.id === ids.sara));
  ok('newest first', r.jobs[0].id === ids.geyser && r.jobs.at(-1).id === ids.ac, titles(r).join(', '));
  const text = JSON.stringify(r);
  ok('no street, house, landmark, pin, gate note or phone', !/Street 34|House 12|markaz|Rafiq|33\.68|72\.99|92300/.test(text));
  ok('the technician is a first name only', r.jobs.find((j) => j.id === ids.geyser).pro === 'Bilal' && !/Ahmed|Mehmood/.test(text));
  ok('a cancelled job names nobody', r.jobs.find((j) => j.id === ids.cancelled).pro === null);
  ok('what she paid is what was collected', r.jobs.find((j) => j.id === ids.tap).paid_paisa === 120000);
  ok('a done job has its guarantee; a fresh one is still covered', r.jobs.find((j) => j.id === ids.geyser).covered === true);
  ok('an old one is not', r.jobs.find((j) => j.id === ids.ac).covered === false);
  const s = await hist(SARA);
  ok('Sara sees her one job', s.found === 1 && s.jobs[0].id === ids.sara);
  denied('a stranger cannot ask', await as('anon', null, `SELECT public.my_history()`));
  denied('nor for the facets', await as('anon', null, `SELECT public.my_history_facets()`));
  denied('and nobody may call the row helper', await as('authenticated', AYESHA, `SELECT * FROM public.history_rows($1)`, [SARA]));
  ok('the live job is still in my_jobs', JSON.stringify((await call(AYESHA, `SELECT public.my_jobs()`)).value).includes('Fan not working') && Boolean(live));
}

// =============================================================================
heading('Search and filters');

{
  ok('"geyser" finds the two geyser jobs', titles(await hist(AYESHA, `p_q => 'geyser'`)).sort().join('|') === 'Geyser not heating|Geyser repair');
  ok('every word must match: "geyser repair"', titles(await hist(AYESHA, `p_q => 'geyser repair'`)).join('|') === 'Geyser repair');
  ok('the technician\'s name: "asad"', titles(await hist(AYESHA, `p_q => 'ASAD'`)).join('|') === 'AC service');
  const ref = (await setup(`SELECT ref FROM public.jobs WHERE id = $1`, [ids.tap])).rows[0].ref;
  ok('the job number', titles(await hist(AYESHA, `p_q => '${ref.toLowerCase()}'`)).join('|') === 'Leaking tap');
  ok('the kind of work by name: "plumber"', (await hist(AYESHA, `p_q => 'plumber'`)).found === 4);
  ok('nothing found is an empty page, not an error', (await hist(AYESHA, `p_q => 'xyzzy'`)).found === 0);
  ok('a % in the search is just a letter', (await hist(AYESHA, `p_q => '%'`)).found === 0);
  ok('Done', (await hist(AYESHA, `p_what => 'done'`)).found === 3);
  ok('Still under guarantee', titles(await hist(AYESHA, `p_what => 'covered'`)).join('|') === 'Geyser repair');
  ok('Visit fee only', titles(await hist(AYESHA, `p_what => 'fee'`)).join('|') === 'Geyser not heating');
  ok('Cancelled is hers, not "nobody took it"', titles(await hist(AYESHA, `p_what => 'cancelled'`)).join('|') === 'AC gas top-up');
  ok('Nobody took it', titles(await hist(AYESHA, `p_what => 'nobody'`)).join('|') === 'Water motor');
  ok('a kind of work', (await hist(AYESHA, `p_trade => 'ac'`)).found === 2);
  const from = (await setup(`SELECT public.pk_day(now() - interval '20 days') AS d`)).rows[0].d;
  ok('from a day', (await hist(AYESHA, `p_from => '${from.toISOString().slice(0, 10)}'`)).found === 3);
  ok('between two days', (await hist(AYESHA, `p_from => current_date - 70, p_to => current_date - 30`)).found === 2);
  ok('filters together', titles(await hist(AYESHA, `p_q => 'geyser', p_what => 'done', p_trade => 'plumber'`)).join('|') === 'Geyser repair');
}

// =============================================================================
heading('A page at a time');

{
  const seen = [];
  let r = await hist(AYESHA, `p_limit => 2`);
  ok('two on the first page, and more to come', r.jobs.length === 2 && r.more === true && r.found === 6);
  seen.push(...r.jobs.map((j) => j.id));
  for (let i = 0; i < 5 && r.more; i++) {
    const last = r.jobs.at(-1);
    r = await hist(AYESHA, `p_limit => 2, p_before => '${last.at}', p_before_id => '${last.id}'`);
    seen.push(...r.jobs.map((j) => j.id));
  }
  ok('the pages follow on: every job once, none twice', seen.length === 6 && new Set(seen).size === 6);
  ok('and the last page says there is no more', r.more === false);
  ok('a page is never more than 50', (await hist(AYESHA, `p_limit => 5000`)).jobs.length === 6);
}

// =============================================================================
heading('What the filters may offer');

{
  const f = (await call(AYESHA, `SELECT public.my_history_facets()`)).value;
  ok('six in all', f.total === 6);
  ok('only her kinds of work, most used first', f.trades.map((t) => `${t.trade}:${t.n}`).join(',') === 'plumber:4,ac:2', JSON.stringify(f.trades));
  ok('each "what happened" counted', ['done:3', 'covered:1', 'fee:1', 'cancelled:1', 'nobody:1'].every((x) => f.what[x.split(':')[0]] === Number(x.split(':')[1])), JSON.stringify(f.what));
  ok('a day for every finished job', f.days.length >= 5);
  ok('months with counts and what she paid', f.months.reduce((n, m) => n + m.n, 0) === 6 && f.months.reduce((n, m) => n + m.paid_paisa, 0) === 650000);
  ok('still under guarantee: the fresh geyser job, with Bilal', f.covered.length === 1 && f.covered[0].id === ids.geyser && f.covered[0].pro === 'Bilal');
  ok('no address in the facets either', !/Street 34|House 12|markaz|33\.68/.test(JSON.stringify(f)));
}

// =============================================================================
heading('Her own words, who came, and where');

{
  const sink = await past(AYESHA, 'plumber', 'Sink repair', 'done', BILAL2, 7, 150000);
  await setup(`UPDATE public.jobs SET description = 'kitchen sink leaking under the cabinet', sector = 'G-11' WHERE id = $1`, [sink]);
  ok('the search reads what she wrote: "cabinet"', titles(await hist(AYESHA, `p_q => 'cabinet'`)).join('|') === 'Sink repair');
  ok('and her sector', titles(await hist(AYESHA, `p_q => 'g-11'`)).join('|') === 'Sink repair');
  const f = (await call(AYESHA, `SELECT public.my_history_facets()`)).value;
  const bilals = f.pros.filter((x) => x.name === 'Bilal');
  ok('two men called Bilal are two choices', bilals.length === 2 && bilals[0].key !== bilals[1].key, JSON.stringify(f.pros));
  ok('each with how many jobs and the kinds of work', bilals.find((x) => x.n === 3)?.trades.join(',') === 'Plumber', JSON.stringify(bilals));
  ok('only men who worked on her jobs', f.pros.length === 3 && f.pros.every((x) => /^[a-f0-9]{32}$/.test(x.key)));
  ok('no surname, no account id', !/Ahmed|Khan|Mehmood|e3333333|e5555555/.test(JSON.stringify(f.pros)));
  const first = bilals.find((x) => x.n === 3);
  ok('Who came: the first Bilal\'s three jobs', (await hist(AYESHA, `p_pro => '${first.key}'`)).found === 3);
  const other = bilals.find((x) => x.n === 1);
  ok('the other Bilal\'s one', titles(await hist(AYESHA, `p_pro => '${other.key}'`)).join('|') === 'Sink repair');
  const saraKey = (await call(SARA, `SELECT public.my_history_facets()`)).value.pros[0]?.key;
  ok('the same man is a different key for another customer', saraKey && saraKey !== first.key);
  ok('and her key finds nothing in Ayesha\'s jobs', (await hist(AYESHA, `p_pro => '${saraKey}'`)).found === 0);
  ok('Where: her two sectors, with counts', f.sectors.map((x) => `${x.sector}:${x.n}`).join(',') === 'F-11:6,G-11:1', JSON.stringify(f.sectors));
  ok('Where filters', titles(await hist(AYESHA, `p_sector => 'G-11'`)).join('|') === 'Sink repair');
  ok('every filter together', (await hist(AYESHA, `p_q => 'sink', p_pro => '${other.key}', p_sector => 'G-11', p_trade => 'plumber', p_what => 'done'`)).found === 1);
}

// =============================================================================
heading('The owner runs migrations by hand');

{
  let error = null;
  try {
    for (const file of ['20261125000000_history_who_where.sql', '20261124000000_job_history.sql', '20261125000000_history_who_where.sql'])
      await db.exec(await readFile(join(MIGRATIONS, file), 'utf8'));
  } catch (e) {
    error = e.message;
  }
  ok('both files run again, in either order', error === null, error);
  ok('and it still answers, with every filter', (await hist(AYESHA)).found === 7 && (await hist(AYESHA, `p_sector => 'G-11'`)).found === 1);
}

report();
