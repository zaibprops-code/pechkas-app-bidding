/**
 * Deleting an account (migration delete_account).
 *
 * What must hold: the page's numbers are the asker's own; deleting waits
 * while a job is on — a customer's open or assigned job, a technician's
 * assigned one — and says which job; once it is finished or cancelled the
 * account goes, with what cascades from it; an office account is never
 * deleted from a phone; a stranger gets nothing.
 */
import { as, db, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'e7';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const OWNER = `${P}999999-9999-4999-8999-999999999999`;

for (const [id, phone, email, role, name] of [
  [AYESHA, '923007711111', null, 'customer', 'Ayesha'],
  [SARA, '923007712222', null, 'customer', 'Sara'],
  [BILAL, '923007713333', null, 'pro', 'Bilal'],
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
async function post(customer) {
  const r = (await call(customer, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Not cooling',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => NULL, p_gate_note => NULL, p_media => '[]'::jsonb)`)).value;
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  return r.id;
}
const quiet = async (sql, params) => {
  await setup(`SET session_replication_role = replica`);
  await setup(sql, params);
  await setup(`SET session_replication_role = DEFAULT`);
};
const summary = async (who) => (await call(who, `SELECT public.my_delete_summary()`)).value;
const DELETE = `SELECT public.delete_my_account()`;

const open = await post(AYESHA);
await setup(`INSERT INTO public.job_media (job_id, kind, path) VALUES ($1, 'photo', $2), ($1, 'video', $3), ($1, 'voice', $4)`,
  [open, `${AYESHA}/a.jpg`, `${AYESHA}/b.mp4`, `${AYESHA}/c.m4a`]);

// =============================================================================
heading('The page\'s numbers');

{
  const s = await summary(AYESHA);
  ok('her own jobs, photos and videos, and voice notes', s.customer.jobs === 1 && s.customer.media === 2 && s.customer.voice === 1, JSON.stringify(s.customer));
  ok('her name and since when', s.name === 'Ayesha' && Boolean(s.since));
  ok('a customer is not a technician', s.pro === false);
  ok('Sara counts only hers', (await summary(SARA)).customer.jobs === 0);
  denied('a stranger gets nothing', await as('anon', null, `SELECT public.my_delete_summary()`));
}

// =============================================================================
heading('Never in the middle of a job');

{
  const s = await summary(AYESHA);
  ok('an open job is in the way, and named', s.blocker?.id === open && s.blocker.side === 'customer' && /^PK-/.test(s.blocker.ref), JSON.stringify(s.blocker));
  const r = (await call(AYESHA, DELETE)).value;
  ok('so deleting waits, naming the job', r?.ok === false && r.field === 'job' && r.why.includes(s.blocker.ref), JSON.stringify(r));

  await quiet(`UPDATE public.jobs SET status = 'assigned', stage = 'on_way', pro_id = $2, agreed_paisa = 300000 WHERE id = $1`, [open, BILAL]);
  ok('assigned: still in the way, with who is coming', (await summary(AYESHA)).blocker?.pro_name === 'Bilal');
  const b = await summary(BILAL);
  ok('and in his way too', b.blocker?.id === open && b.blocker.side === 'pro' && b.pro === true, JSON.stringify(b.blocker));
  ok('he cannot delete either', (await call(BILAL, DELETE)).value?.field === 'job');

  await quiet(`UPDATE public.jobs SET status = 'done', stage = NULL, finished_at = now() WHERE id = $1`, [open]);
  ok('finished: nothing in the way', (await summary(AYESHA)).blocker === null && (await summary(BILAL)).blocker === null);
}

// =============================================================================
heading('Deleting');

{
  ok('the office cannot delete itself from a phone', (await call(OWNER, DELETE)).value?.ok === false);
  ok('his numbers count his jobs', (await summary(BILAL)).technician.jobs === 1);
  const r = (await call(AYESHA, DELETE)).value;
  ok('then she deletes', r?.ok === true, JSON.stringify(r));
  ok('her sign-in is gone', (await setup(`SELECT count(*)::int AS n FROM auth.users WHERE id = $1`, [AYESHA])).rows[0].n === 0);
  ok('and her jobs with it', (await setup(`SELECT count(*)::int AS n FROM public.jobs WHERE customer_id = $1`, [AYESHA])).rows[0].n === 0);
  ok('and their media', (await setup(`SELECT count(*)::int AS n FROM public.job_media WHERE path LIKE $1`, [`${AYESHA}/%`])).rows[0].n === 0);
  ok('he can delete now too', (await call(BILAL, DELETE)).value?.ok === true);
}

// =============================================================================
heading('Running twice');

{
  const { readFile } = await import('node:fs/promises');
  await db.exec(await readFile(new URL('../migrations/20261201000000_delete_account.sql', import.meta.url), 'utf8'));
  ok('the migration runs a second time', (await summary(SARA)).customer.jobs === 0);
}

report();
