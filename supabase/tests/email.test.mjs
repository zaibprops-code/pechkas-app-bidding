/**
 * Signing in with an email code.
 *
 * What must hold: somebody who signed in by email can be rung — they give a
 * number before they can post or apply, and every function that hands out
 * a number hands out theirs. A typed number is never mistaken for a checked
 * one: the office sees which is which, and the office's own alerts go only
 * to a number Supabase checked by SMS, so nobody can type the owner's number
 * and start receiving his alerts.
 */
import { as, denied, heading, migrate, ok, report, setup } from './harness.mjs';

await migrate();

const NIDA = 'b1111111-1111-4111-8111-111111111111'; // customer, signed in by email
const BILAL = 'b3333333-3333-4333-8333-333333333333'; // technician, signed in by SMS
const ZAIN = 'b4444444-4444-4444-8444-444444444444'; // technician, signed in by email
const OWNER = 'b9999999-9999-4999-8999-999999999999';
const OWNER_PHONE = 'b8888888-8888-4888-8888-888888888888'; // the owner's own phone, signed in by SMS

for (const [id, phone, email] of [
  [NIDA, null, 'nida@example.com'],
  [BILAL, '923003333333', null],
  [ZAIN, null, 'zain@example.com'],
  [OWNER, null, 'owner@example.com'],
  [OWNER_PHONE, '923009999999', null],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
}
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);

async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}
const me = (who, sql, params) => call('authenticated', who, sql, params);
const account = async (who) => (await me(who, `SELECT public.my_account()`)).value;
const SET = `SELECT public.set_my_phone($1)`;
const POST = `SELECT public.post_job(p_trade => 'ac', p_job_type => NULL, p_description => 'The AC is not cooling at all',
  p_offer_paisa => 300000, p_when_kind => 'now', p_when_part => NULL, p_sector => 'F-11', p_street => 'Street 9',
  p_house => 'House 3', p_media => '[]'::jsonb)`;
const APPLY = `SELECT public.apply_as_pro($1, $2::text[], $3, $4::text[], $5)`;

// =============================================================================
heading('An email account has no number until it gives one');

{
  ok('a number cannot be set before the account is made', (await me(NIDA, SET, ['0300 7777777'])).value?.ok === false);
  ok('Nida starts as a customer, signed in by email', (await me(NIDA, `SELECT public.start_as('customer', 'Nida')`)).value?.ok === true);
  const a = await account(NIDA);
  ok('her account says how she signed in, and that it needs a number', a?.email === 'nida@example.com' && a?.phone === null && a?.phone_checked === false && a?.needs_phone === true, JSON.stringify(a));
  const r = await me(NIDA, POST);
  ok('she cannot post a job without one', Boolean(r.error) && /mobile number/.test(r.error), r.error ?? JSON.stringify(r.value));
  ok('nothing was posted', (await setup(`SELECT count(*)::int AS n FROM public.jobs`)).rows[0].n === 0);
  ok('letters are refused', (await me(NIDA, SET, ['call me maybe'])).value?.field === 'phone');
  ok('a landline is refused: a code can never reach it', (await me(NIDA, SET, ['051 1234567'])).value?.field === 'phone');
  ok('a foreign number is refused', (await me(NIDA, SET, ['+44 7700 900123'])).value?.field === 'phone');
  const s = (await me(NIDA, SET, ['0300 777-7777'])).value;
  ok('0300 777-7777 is accepted, kept the way Supabase keeps a checked one', s?.ok === true && s?.phone === '923007777777', JSON.stringify(s));
  const b = await account(NIDA);
  ok('her account now has it, marked not checked', b?.phone === '923007777777' && b?.phone_checked === false && b?.needs_phone === false);
  ok('and now she can post', (await me(NIDA, POST)).value?.ok === true);
  denied('a stranger cannot set a number', await as('anon', null, SET, ['0300 7777777']));
}
{
  await me(BILAL, `SELECT public.start_as('pro', 'Bilal')`);
  const a = await account(BILAL);
  ok('Bilal signed in by SMS: his number is the checked one', a?.phone === '923003333333' && a?.phone_checked === true && a?.needs_phone === false && a?.email === null);
  ok('and he cannot type a different one over it', (await me(BILAL, SET, ['0300 1231234'])).value?.field === 'phone' && (await account(BILAL))?.phone === '923003333333');
}
{
  await me(ZAIN, `SELECT public.start_as('pro', 'Zain')`);
  const r = await me(ZAIN, APPLY, ['Zain Ali', ['ac'], 5, ['F-11'], null]);
  ok('Zain, signed in by email, cannot apply without a number', Boolean(r.error) && /mobile number/.test(r.error), r.error ?? JSON.stringify(r.value));
  await me(ZAIN, SET, ['0333 5555555']);
  ok('with one, he can', (await me(ZAIN, APPLY, ['Zain Ali', ['ac'], 5, ['F-11'], null])).value?.ok === true);
}

// =============================================================================
heading('The number reaches whoever needs to ring');

{
  await me(BILAL, APPLY, ['Bilal Ahmed', ['ac'], 8, ['F-11'], null]);
  await setup(`UPDATE public.pros SET status = 'approved' WHERE id IN ($1, $2)`, [BILAL, ZAIN]);
  const job = (await setup(`SELECT id FROM public.jobs WHERE customer_id = $1`, [NIDA])).rows[0].id;
  await me(ZAIN, `SELECT public.make_offer($1, 300000, 20, NULL)`, [job]);
  const offer = (await setup(`SELECT id FROM public.offers WHERE job_id = $1`, [job])).rows[0].id;
  ok('Nida chooses Zain', (await me(NIDA, `SELECT public.choose_offer($1)`, [offer])).value?.ok === true);
  ok('Zain is given Nida\'s typed number', ((await me(ZAIN, `SELECT public.pro_my_jobs()`)).value ?? [])[0]?.customer_phone === '923007777777');
  ok('and Nida is given Zain\'s', ((await me(NIDA, `SELECT public.my_jobs()`)).value ?? [])[0]?.pro?.phone === '923335555555');
  const office = (await me(OWNER, `SELECT * FROM public.admin_jobs(NULL)`)).rows[0];
  ok('the office sees both numbers', office?.customer_phone === '923007777777' && office?.pro_phone === '923335555555');
  const apps = (await me(OWNER, `SELECT * FROM public.admin_applications('approved')`)).rows;
  ok('and the technicians\' numbers, typed and checked', apps.some((x) => x.phone === '923335555555') && apps.some((x) => x.phone === '923003333333'), JSON.stringify(apps.map((x) => x.phone)));
}

// =============================================================================
heading('A typed number is never treated as a checked one');

{
  const list = (await me(OWNER, `SELECT public.admin_unchecked_phones()`)).value;
  ok('the office is told which numbers nobody has checked', JSON.stringify([...list].sort()) === JSON.stringify(['923007777777', '923335555555']), JSON.stringify(list));
  ok('a checked number is not on that list', !list.includes('923003333333'));
  // Later, Zain proves a number by SMS (once Twilio is live). That one wins, and he leaves the list.
  await setup(`UPDATE auth.users SET phone = '923336666666' WHERE id = $1`, [ZAIN]);
  ok('a number proved by SMS is used instead of the typed one', (await account(ZAIN))?.phone === '923336666666' && (await account(ZAIN))?.phone_checked === true);
  ok('and his old typed number leaves the unchecked list', !(await me(OWNER, `SELECT public.admin_unchecked_phones()`)).value.includes('923335555555'));
  await setup(`UPDATE auth.users SET phone = NULL WHERE id = $1`, [ZAIN]);
  ok('a customer cannot ask for that list', (await me(NIDA, `SELECT public.admin_unchecked_phones()`)).value === null);
  denied('nor a stranger', await as('anon', null, `SELECT public.admin_unchecked_phones()`));

  // Nida types the owner's alert number as her own. She must not get his alerts.
  const token = (name) => `ExponentPushToken[${name.padEnd(22, 'x')}]`;
  await me(OWNER, `SELECT public.admin_set_alert_phone('+923009999999')`);
  await me(OWNER_PHONE, `SELECT public.start_as('customer', 'Zohaib')`);
  await me(OWNER_PHONE, `SELECT public.save_push_token($1, 'android', 'en')`, [token('owner')]);
  await me(NIDA, SET, ['0300 9999999']);
  await me(NIDA, `SELECT public.save_push_token($1, 'android', 'en')`, [token('nida')]);
  const lonely = (await me(NIDA, POST)).value;
  await setup(`UPDATE public.jobs SET created_at = now() - interval '30 minutes' WHERE id = $1`, [lonely.id]);
  const before = (await setup(`SELECT coalesce(max(id), 0) AS n FROM net.sent`)).rows[0].n;
  await setup(`SELECT public.alert_needs_you()`);
  const sent = (await setup(`SELECT body FROM net.sent WHERE id > $1`, [before])).rows.flatMap((r) => r.body);
  ok('the owner\'s phone, signed in by SMS, is told', sent.some((m) => m.to === token('owner') && /No offers yet/.test(m.title)), JSON.stringify(sent));
  ok('Nida, who typed his number, is not', !sent.some((m) => m.to === token('nida')));
}

// =============================================================================
heading('One rule for a mobile number, in the app and in the database');

{
  // The same cases as packages/shared/test/phone.test.ts.
  for (const typed of ['03001234567', '0300 1234567', '0300-1234567', '+92 300 1234567', '923001234567', '+923001234567', '3001234567', ' 0300 123 4567 ']) {
    ok(`"${typed}" is 923001234567`, (await setup(`SELECT public.tidy_mobile($1) AS p`, [typed])).rows[0].p === '923001234567');
  }
  for (const typed of ['', '051 1234567', '0300123456', '030012345678', '0400 1234567', 'abc', '+44 7700 900123', '0300-12a4567']) {
    ok(`"${typed}" is refused`, (await setup(`SELECT public.tidy_mobile($1) AS p`, [typed])).rows[0].p === null);
  }
}

report();
