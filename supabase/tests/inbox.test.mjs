/**
 * Notifications: what Pechkas told you (migration notifications_inbox).
 *
 * What must hold: each person sees only their own notifications, only from
 * the last 90 days, newest first, a page at a time with nothing twice or
 * missed; unread is counted and marking read touches only their own; an
 * offer, a new price and a new job say what became of them; nothing in it
 * carries an address or a phone number; a stranger gets nothing; the office
 * record older than 90 days is kept; and the migration runs twice.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const P = 'c9';
const AYESHA = `${P}111111-1111-4111-8111-111111111111`;
const SARA = `${P}222222-2222-4222-8222-222222222222`;
const BILAL = `${P}333333-3333-4333-8333-333333333333`;
const ASAD = `${P}444444-4444-4444-8444-444444444444`;

for (const [id, phone, role, name] of [
  [AYESHA, '923009111111', 'customer', 'Ayesha'],
  [SARA, '923009112222', 'customer', 'Sara'],
  [BILAL, '923009113333', 'pro', 'Bilal'],
  [ASAD, '923009114444', 'pro', 'Asad'],
]) {
  await setup(`INSERT INTO auth.users (id, phone) VALUES ($1, $2)`, [id, phone]);
  await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, $2, $3)`, [id, role, name]);
}
for (const [id, full] of [[BILAL, 'Bilal Ahmed'], [ASAD, 'Asad Mehmood']]) {
  await setup(`INSERT INTO public.pros (id, full_name, trades, years, sectors, status, online) VALUES ($1, $2, '{ac}', 6, '{F-11}', 'approved', true)`, [id, full]);
}
await setup(`UPDATE public.settings SET value = 1000 WHERE key IN ('max_open_jobs', 'max_posts_per_day')`);
await setup(`UPDATE public.settings SET value = 100000000 WHERE key = 'credit_limit_paisa'`);
const token = (n) => `ExponentPushToken[${n.padEnd(22, 'x')}]`;

async function call(who, sql, params = []) {
  const r = await as('authenticated', who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
for (const [who, n] of [[AYESHA, 'ayesha'], [BILAL, 'bilal'], [ASAD, 'asad']]) await call(who, `SELECT public.save_push_token($1, 'android', 'en')`, [token(n)]);
let files = 0;
const upload = async (who) => {
  files += 1;
  const name = `${who}/file-${files}.jpg`;
  await as('authenticated', who, `INSERT INTO storage.objects (bucket_id, name) VALUES ('job-media', $1)`, [name]);
  return name;
};
const job = async (id) => (await setup(`SELECT * FROM public.jobs WHERE id = $1`, [id])).rows[0];
const inbox = async (who, args = '') => (await call(who, `SELECT public.my_notifications(${args})`)).value;
const post = async (who = AYESHA) => {
  const r = (await call(who, `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'Water dripping inside',
    p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 34',
    p_house => 'House 12', p_landmark => 'Behind the markaz mosque', p_gate_note => 'Chowkidar Rafiq', p_media => '[]'::jsonb)`)).value;
  if (!r?.ok) throw new Error(`post failed: ${JSON.stringify(r)}`);
  return r.id;
};
const offer = async (id, pro, price = 300000) => {
  const o = (await call(pro, `SELECT public.make_offer($1, $2, 20, NULL)`, [id, price])).value;
  if (!o?.ok) throw new Error(`offer failed: ${JSON.stringify(o)}`);
  return (await setup(`SELECT id FROM public.offers WHERE job_id = $1 AND pro_id = $2`, [id, pro])).rows[0].id;
};

// One job: two offers, she chooses Asad, he starts and asks a new price, she approves.
const main = await post();
await offer(main, BILAL, 320000);
const o2 = await offer(main, ASAD);
await call(AYESHA, `SELECT public.choose_offer($1)`, [o2]);
await call(ASAD, `SELECT public.tech_step($1, 'chosen')`, [main]);
await call(ASAD, `SELECT public.tech_step($1, 'on_way')`, [main]);
await call(ASAD, `SELECT public.start_work($1, $2, $3::jsonb)`, [main, (await job(main)).start_code, JSON.stringify([await upload(ASAD)])]);
await call(ASAD, `SELECT public.ask_change($1, $2, $3, $4)`, [main, 350000, 'A part had worn out.', await upload(ASAD)]);
const ch = (await setup(`SELECT id FROM public.job_changes WHERE job_id = $1`, [main])).rows[0].id;
await call(AYESHA, `SELECT public.decide_change($1, true)`, [ch]);
// A second job still open, so Bilal's new-job notice stays open to him.
const open = await post();

// =============================================================================
heading('Her own, newest first');

{
  const r = await inbox(AYESHA);
  const kinds = r.items.map((x) => x.kind);
  ok('she has her notifications', r.items.length >= 4, kinds.join(','));
  ok('newest first', r.items.every((x, i, a) => i === 0 || a[i - 1].id > x.id));
  ok('two offers on her job', kinds.filter((k) => k === 'offer').length === 2);
  ok('the offer says whom she chose', r.items.filter((x) => x.kind === 'offer').every((x) => x.state === 'chose' && x.chose === 'Asad'), JSON.stringify(r.items.filter((x) => x.kind === 'offer')));
  ok('the new price says it was approved', r.items.find((x) => x.kind === 'change')?.state === 'approved');
  ok('her side of the job, with its number and kind of work', r.items.every((x) => !x.job_id || (x.side === 'customer' && x.ref && x.trade === 'ac')));
  ok('all unread at first', r.unread === r.items.length && r.items.every((x) => x.read === false));
  const text = JSON.stringify(r);
  ok('no street, house, landmark, gate note or phone', !/Street 34|House 12|markaz|Rafiq|92300|0300/.test(text));
  ok('no surname', !/Ahmed|Mehmood/.test(text));
  const s = await inbox(SARA);
  ok('Sara sees none of hers', s.items.length === 0 && s.unread === 0);
  denied('a stranger cannot ask', await as('anon', null, `SELECT public.my_notifications()`));
  denied('nor mark anything read', await as('anon', null, `SELECT public.mark_notifications_read()`));
}

// =============================================================================
heading('A technician: what became of a new job');

{
  const b = await inbox(BILAL);
  const jobs = b.items.filter((x) => x.kind === 'new_job');
  ok('Bilal was told of both jobs', jobs.length === 2, JSON.stringify(b.items.map((x) => x.kind)));
  ok('the one Asad got is gone for him', jobs.find((x) => x.job_id === main)?.state === 'gone');
  ok('the other is still open', jobs.find((x) => x.job_id === open)?.state === 'open');
  ok('his side', jobs.every((x) => x.side === 'pro'));
  await offer(open, BILAL);
  ok('once he offers, it says so', (await inbox(BILAL)).items.find((x) => x.kind === 'new_job' && x.job_id === open)?.state === 'offered');
  const a = await inbox(ASAD);
  ok('for Asad the first job is his', a.items.find((x) => x.kind === 'new_job' && x.job_id === main)?.state === 'yours');
}

// =============================================================================
heading('Read and unread');

{
  const r = await inbox(AYESHA);
  const first = r.items[0].id;
  const m = (await call(AYESHA, `SELECT public.mark_notifications_read($1::bigint[])`, [[first]])).value;
  ok('one marked read', m?.ok && m.unread === r.unread - 1);
  ok('it reads as read', (await inbox(AYESHA)).items.find((x) => x.id === first).read === true);
  ok('Unread leaves it out', !(await inbox(AYESHA, 'p_unread => true')).items.some((x) => x.id === first));
  const bilalBefore = (await call(BILAL, `SELECT public.my_unread_notifications()`)).value;
  await call(AYESHA, `SELECT public.mark_notifications_read($1::bigint[])`, [(await inbox(BILAL)).items.map((x) => x.id)]);
  ok('nobody can mark another person\'s read', (await call(BILAL, `SELECT public.my_unread_notifications()`)).value === bilalBefore && bilalBefore > 0);
  await call(AYESHA, `SELECT public.mark_notifications_read()`);
  ok('Mark all read', (await call(AYESHA, `SELECT public.my_unread_notifications()`)).value === 0 && (await inbox(AYESHA)).unread === 0);
}

// =============================================================================
heading('Pages and 90 days');

{
  for (let i = 0; i < 65; i++) {
    await setup(`INSERT INTO public.push_log (kind, user_id, phones, title, body, created_at) VALUES ('test', $1, 1, $2, 'x', now() - make_interval(mins => $3))`, [SARA, `Note ${i}`, i]);
  }
  await setup(`INSERT INTO public.push_log (kind, user_id, phones, title, body, created_at) VALUES ('test', $1, 1, 'Old', 'x', now() - interval '91 days')`, [SARA]);
  const p1 = await inbox(SARA);
  ok('30 at a time', p1.items.length === 30 && p1.more === true);
  const p2 = await inbox(SARA, `p_before_id => ${p1.items.at(-1).id}`);
  const p3 = await inbox(SARA, `p_before_id => ${p2.items.at(-1).id}`);
  const all = [...p1.items, ...p2.items, ...p3.items].map((x) => x.id);
  ok('pages follow on: 65, none twice', all.length === 65 && new Set(all).size === 65 && p3.more === false, `${all.length}`);
  ok('nothing older than 90 days is shown', !all.length || ![...p1.items, ...p2.items, ...p3.items].some((x) => x.title === 'Old'));
  ok('or counted', p1.unread === 65);
  ok('but the record is kept', (await setup(`SELECT count(*)::int AS n FROM public.push_log WHERE user_id = $1 AND title = 'Old'`, [SARA])).rows[0].n === 1);
  ok('50 at most per page, whatever is asked', (await inbox(SARA, 'p_limit => 500')).items.length === 50);
}

// =============================================================================
heading('The owner runs migrations by hand');

{
  let error = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261127000000_notifications_inbox.sql'), 'utf8'));
  } catch (e) {
    error = e.message;
  }
  ok('the file runs a second time', error === null, error);
  ok('and the inbox still answers', (await inbox(SARA)).items.length === 30);
}

report();
