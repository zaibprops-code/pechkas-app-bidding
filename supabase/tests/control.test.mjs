/**
 * The office's two switches: "please update" and "paused for work".
 *
 * What must hold: anybody, signed in or not, can ask what the switches say,
 * and gets back exactly three things — never the table itself. Only an
 * active office login can move them; a customer, a technician, a stranger
 * and a switched-off clerk cannot. A note shown on every phone refuses a
 * phone number and a CNIC. Every move is written down with who made it.
 * And the migration can be run a second time without undoing the switches.
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { MIGRATIONS, as, db, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const AYESHA = 'c1111111-1111-4111-8111-111111111111';
const BILAL = 'c3333333-3333-4333-8333-333333333333';
const OWNER = 'c9999999-9999-4999-8999-999999999999';
const CLERK = 'c8888888-8888-4888-8888-888888888888';

for (const [id, phone, email] of [
  [AYESHA, '923001111111', null],
  [BILAL, '923003333333', null],
  [OWNER, null, 'owner@example.com'],
  [CLERK, null, 'clerk@example.com'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
}
await setup(`INSERT INTO public.profiles (id, role, first_name) VALUES ($1, 'customer', 'Ayesha'), ($2, 'pro', 'Bilal')`, [AYESHA, BILAL]);
await setup(`SELECT public.make_owner('owner@example.com', 'Zohaib')`);
await setup(`INSERT INTO public.staff (id, name, role, active) VALUES ($1, 'Former clerk', 'office', false)`, [CLERK]);

const one = async (role, who, sql, params = []) => {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
};
const status = async (role = 'anon', who = null) => (await one(role, who, `SELECT public.app_status()`)).value;
const stored = async () => (await setup(`SELECT * FROM public.app_control`)).rows[0];
const PAUSE = `SELECT public.admin_set_pause($1, $2)`;
const EDITION = `SELECT public.admin_set_min_edition($1)`;

heading('Anybody may ask, and is told three things only');
{
  const s = await status();
  ok('a stranger can ask what the switches say', s && s.min_edition === 0 && s.paused === false, JSON.stringify(s));
  ok('and gets exactly the lowest edition, paused, and the note', s && Object.keys(s).sort().join(',') === 'min_edition,note,paused', JSON.stringify(s));
  ok('with no note while nothing is paused', s && s.note === null);
  const signedIn = await status('authenticated', AYESHA);
  ok('somebody signed in gets the same answer', JSON.stringify(signedIn) === JSON.stringify(s));
  nothing('a stranger cannot read the table itself', await as('anon', null, `SELECT * FROM public.app_control`));
  nothing('nor can a customer', await as('authenticated', AYESHA, `SELECT * FROM public.app_control`));
  denied('a stranger cannot write to it', await as('anon', null, `UPDATE public.app_control SET paused = true`));
  denied('nor can a customer', await as('authenticated', AYESHA, `UPDATE public.app_control SET min_edition = 99`));
}

heading('Only an active office login can move them');
{
  denied('a stranger cannot pause the app', await as('anon', null, PAUSE, [true, 'x']));
  denied('a stranger cannot ask for an update', await as('anon', null, EDITION, [5]));
  ok('a customer is refused the pause', (await one('authenticated', AYESHA, PAUSE, [true, 'Back soon'])).value?.ok === false);
  ok('a technician is refused the update', (await one('authenticated', BILAL, EDITION, [5])).value?.ok === false);
  ok('a switched-off clerk is refused', (await one('authenticated', CLERK, PAUSE, [true, 'Back soon'])).value?.ok === false);
  const s = await stored();
  ok('and none of them moved anything', s.paused === false && s.min_edition === 0);
  ok('a customer cannot see the office view', (await one('authenticated', AYESHA, `SELECT public.admin_app_control()`)).value === null);
}

heading('Pausing, with a note everybody reads');
{
  const r = (await one('authenticated', OWNER, PAUSE, [true, '  Pechkas is being updated. Back by 3 pm.  '])).value;
  ok('the owner can pause the app', r?.ok === true, JSON.stringify(r));
  const s = await status();
  ok('a stranger is told it is paused', s.paused === true);
  ok('and reads the note, trimmed', s.note === 'Pechkas is being updated. Back by 3 pm.', s.note);
  const view = (await one('authenticated', OWNER, `SELECT public.admin_app_control()`)).value;
  ok('the office view says who paused it', view?.changed_by === 'Zohaib' && view?.paused === true, JSON.stringify(view));

  for (const [what, note] of [
    ['a phone number', 'Call 0300 1234567 for help'],
    ['a +92 number', 'WhatsApp +923001234567'],
    // Put together here: a CNIC-shaped number never appears whole in this repository.
    ['a CNIC', `Ask for ${['35202', '1234567', '1'].join('-')}`],
    ['more than 300 letters', 'a'.repeat(301)],
  ]) {
    const x = (await one('authenticated', OWNER, PAUSE, [true, note])).value;
    ok(`a note with ${what} is refused, beside the note`, x?.ok === false && x?.field === 'note', JSON.stringify(x));
  }
  ok('and the note shown is still the good one', (await status()).note === 'Pechkas is being updated. Back by 3 pm.');

  ok('the owner can let it carry on', (await one('authenticated', OWNER, PAUSE, [false, ''])).value?.ok === true);
  const after = await status();
  ok('nobody is told it is paused any more', after.paused === false && after.note === null, JSON.stringify(after));

  ok('a pause with a note left over shows no note once lifted', (await one('authenticated', OWNER, PAUSE, [true, 'Short break'])).value?.ok === true
    && (await one('authenticated', OWNER, PAUSE, [false, 'Short break'])).value?.ok === true
    && (await status()).note === null);
}

heading('Asking older copies to update');
{
  ok('the owner can ask every copy older than edition 3 to update', (await one('authenticated', OWNER, EDITION, [3])).value?.ok === true);
  ok('everybody is told 3', (await status()).min_edition === 3);
  for (const bad of [-1, 10001, null]) {
    const x = (await one('authenticated', OWNER, EDITION, [bad])).value;
    ok(`${bad} is refused`, x?.ok === false, JSON.stringify(x));
  }
  ok('and a mistake is put right at once by going back to 0', (await one('authenticated', OWNER, EDITION, [0])).value?.ok === true
    && (await status()).min_edition === 0);
  ok('asking for the same edition twice changes nothing', (await one('authenticated', OWNER, EDITION, [0])).value?.same === true);
}

heading('Every move is written down');
{
  const { rows } = await setup(`SELECT key, old_value, new_value, by_name FROM public.setting_changes WHERE key LIKE 'app:%' ORDER BY id`);
  const line = (k, o, n) => rows.some((r) => r.key === k && Number(r.old_value) === o && Number(r.new_value) === n && r.by_name === 'Zohaib');
  ok('the pause, with who', line('app:paused', 0, 1));
  ok('the pause lifted, with who', line('app:paused', 1, 0));
  ok('the edition raised and lowered, with who', line('app:min_edition', 0, 3) && line('app:min_edition', 3, 0));
  ok('refusals wrote nothing', rows.length === 6, `${rows.length} lines`);
}

heading('The owner runs migrations by hand');
{
  await one('authenticated', OWNER, PAUSE, [true, 'Still paused']);
  await one('authenticated', OWNER, EDITION, [2]);
  let error = null;
  try {
    await db.exec(await readFile(join(MIGRATIONS, '20261031000000_update_and_pause.sql'), 'utf8'));
  } catch (e) {
    error = e.message;
  }
  ok('running it a second time works', error === null, error);
  const s = await status();
  ok('and leaves both switches where the office put them', s.paused === true && s.min_edition === 2 && s.note === 'Still paused', JSON.stringify(s));
}

report();
