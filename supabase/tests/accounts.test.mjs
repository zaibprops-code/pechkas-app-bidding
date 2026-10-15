/**
 * Phase 1: accounts, technician applications, and the office deciding.
 *
 * Tries every way round the rules: a stranger, a technician approving
 * himself, a customer reading somebody else's application, a switched-off
 * member of staff, a CNIC number slipped into a note.
 */
import { as, denied, heading, migrate, nothing, ok, report, setup } from './harness.mjs';

await migrate();

const BILAL = '22222222-2222-4222-8222-222222222222'; // applies as a technician
const AYESHA = '33333333-3333-4333-8333-333333333333'; // a customer
const KAMRAN = '44444444-4444-4444-8444-444444444444'; // a customer who later applies
const OWNER = '55555555-5555-4555-8555-555555555555'; // the owner, in the office
const GONE = '66666666-6666-4666-8666-666666666666'; // staff, switched off

for (const [id, phone, email] of [
  [BILAL, '923001111111', null],
  [AYESHA, '923002222222', null],
  [KAMRAN, '923003333333', null],
  [OWNER, null, 'owner@example.com'],
  [GONE, null, 'gone@example.com'],
]) {
  await setup(`INSERT INTO auth.users (id, phone, email) VALUES ($1, $2, $3)`, [id, phone, email]);
}

/** Calls a function as somebody and gives back its jsonb answer (or the error). */
async function call(role, who, sql, params = []) {
  const r = await as(role, who, sql, params);
  return { ...r, value: r.rows[0] ? Object.values(r.rows[0])[0] : undefined };
}

// A made-up CNIC-shaped number, put together at run time, so that not even a
// fake one sits in the repository for the guard in foundations.test.mjs to
// (rightly) complain about.
const FAKE_CNIC = ['61101', '1234567', '1'].join('-');
const FAKE_CNIC_SPACED = FAKE_CNIC.replaceAll('-', ' ');

const APPLY = `SELECT public.apply_as_pro($1, $2::text[], $3, $4::text[], $5)`;
const bilalForm = ['Bilal Ahmed', ['ac', 'electrician'], 8, ['F-11', 'E-11'], 'AC and wiring, eight years.'];

// =============================================================================
heading('A stranger with the key printed inside the app');

for (const table of ['profiles', 'pros', 'pro_checks', 'staff', 'trades', 'sectors']) {
  nothing(`cannot read ${table}`, await as('anon', null, `SELECT * FROM public.${table}`));
}
for (const [what, sql] of [
  ['my_account', `SELECT public.my_account()`],
  ['start_as', `SELECT public.start_as('pro', 'X')`],
  ['apply_as_pro', `SELECT public.apply_as_pro('X Y Z', '{ac}', 1, '{F-11}', null)`],
  ['delete_my_account', `SELECT public.delete_my_account()`],
  ['admin_applications', `SELECT * FROM public.admin_applications()`],
  ['admin_decide', `SELECT public.admin_decide('${BILAL}', 'approve', null)`],
  ['make_owner', `SELECT public.make_owner('x@example.com', 'X')`],
]) {
  denied(`cannot call ${what}`, await as('anon', null, sql));
}
{
  const r = await call('anon', null, `SELECT public.app_lists()`);
  ok('can see the list of trades and sectors, which the website prints anyway',
    r.value?.trades?.some((t) => t.slug === 'ac') && r.value?.sectors?.[0] === 'F-11');
}

// =============================================================================
heading('Signing up');

{
  const r = await call('authenticated', BILAL, `SELECT public.start_as('pro', '')`);
  ok('an empty first name is refused, beside the name box', r.value?.ok === false && r.value?.field === 'first_name');
}
{
  const r = await call('authenticated', BILAL, `SELECT public.start_as('boss', 'Bilal')`);
  ok('a made-up role is refused', r.value?.ok === false && r.value?.field === 'role');
}
ok('Bilal starts as a technician', (await call('authenticated', BILAL, `SELECT public.start_as('pro', 'Bilal')`)).value?.ok === true);
ok('Ayesha starts as a customer', (await call('authenticated', AYESHA, `SELECT public.start_as('customer', 'Ayesha')`)).value?.ok === true);
ok('Kamran starts as a customer', (await call('authenticated', KAMRAN, `SELECT public.start_as('customer', 'Kamran')`)).value?.ok === true);
{
  const r = await call('authenticated', BILAL, `SELECT public.start_as('customer', 'Bilal')`);
  ok('a technician cannot quietly turn his account into a customer one', r.value?.ok === false);
}

// =============================================================================
heading('Applying');

for (const [what, form, field] of [
  ['a one-letter name', ['B', ['ac'], 8, ['F-11'], null], 'full_name'],
  ['no kind of work', ['Bilal Ahmed', [], 8, ['F-11'], null], 'trades'],
  ['a kind of work we do not offer', ['Bilal Ahmed', ['astrology'], 8, ['F-11'], null], 'trades'],
  ['negative years', ['Bilal Ahmed', ['ac'], -1, ['F-11'], null], 'years'],
  ['no area', ['Bilal Ahmed', ['ac'], 8, [], null], 'sectors'],
  ['an area we do not know', ['Bilal Ahmed', ['ac'], 8, ['Atlantis'], null], 'sectors'],
  ['a CNIC number written into "about me"', ['Bilal Ahmed', ['ac'], 8, ['F-11'], `My CNIC is ${FAKE_CNIC}`], 'about'],
]) {
  const r = await call('authenticated', BILAL, APPLY, form);
  ok(`${what} is refused, beside the right box`, r.value?.ok === false && r.value?.field === field, JSON.stringify(r.value ?? r.error));
}
{
  const { rows } = await setup(`SELECT count(*)::int AS n FROM public.pros`);
  ok('and none of those left an application behind', rows[0].n === 0);
}

ok('a proper application goes in', (await call('authenticated', BILAL, APPLY, bilalForm)).value?.status === 'applied');
{
  const r = await call('authenticated', BILAL, `SELECT public.my_account()`);
  ok('he sees his own application, waiting', r.value?.role === 'pro' && r.value?.pro?.status === 'applied' && r.value?.is_staff === false);
}
{
  const r = await call('authenticated', AYESHA, `SELECT public.my_account()`);
  ok('a customer sees only her own account, not his', r.value?.first_name === 'Ayesha' && r.value?.pro === null);
}
nothing('a customer cannot read the applications table', await as('authenticated', AYESHA, `SELECT * FROM public.pros`));
nothing('nor can he read his own row directly', await as('authenticated', BILAL, `SELECT * FROM public.pros`));
denied('he cannot write his own status', await as('authenticated', BILAL, `UPDATE public.pros SET status = 'approved'`));
nothing('he gets no applications from the office list', await as('authenticated', BILAL, `SELECT * FROM public.admin_applications()`));
{
  const r = await call('authenticated', BILAL, `SELECT public.admin_decide($1, 'approve', null)`, [BILAL]);
  ok('he cannot approve himself', r.value?.ok === false);
}
{
  const r = await call('authenticated', BILAL, `SELECT public.admin_record_check($1, 'identity', 'in_person', current_date, null)`, [BILAL]);
  ok('he cannot record a check on himself', r.value?.ok === false);
}
denied('he cannot make himself the owner', await as('authenticated', BILAL, `SELECT public.make_owner('owner@example.com', 'Me')`));

{
  const r = await call('authenticated', KAMRAN, APPLY, ['Kamran Shah', ['plumber'], 3, ['G-13'], null]);
  const me = await call('authenticated', KAMRAN, `SELECT public.my_account()`);
  ok('a customer can apply to become a technician', r.value?.ok === true && me.value?.role === 'pro');
}

// =============================================================================
heading('The office');

{
  const { rows } = await setup(`SELECT public.make_owner('OWNER@example.com', 'Zohaib') AS m`);
  ok('the owner is added by hand in the SQL editor', /^Done/.test(rows[0].m));
  await setup(`INSERT INTO public.staff (id, name, role, active) VALUES ($1, 'Gone', 'office', false)`, [GONE]);
}
{
  const r = await as('authenticated', OWNER, `SELECT * FROM public.admin_applications('applied')`);
  const bilal = r.rows.find((x) => x.id === BILAL);
  ok('the owner sees waiting applications, with the number to ring', r.rows.length === 2 && bilal?.phone === '923001111111');
}
{
  const r = await call('authenticated', OWNER, `SELECT public.admin_decide($1, 'approve', null)`, [BILAL]);
  ok('approving with no checks on record is refused', r.value?.ok === false && r.value?.field === 'checks', JSON.stringify(r.value));
}

const CHECK = `SELECT public.admin_record_check($1, $2, $3, $4::date, $5)`;
{
  const r = await call('authenticated', OWNER, CHECK, [BILAL, 'identity', 'in_person', '2099-01-01', null]);
  ok('a check dated in the future is refused', r.value?.ok === false && r.value?.field === 'checked_on');
}
{
  const r = await call('authenticated', OWNER, CHECK, [BILAL, 'identity', 'in_person', new Date().toISOString().slice(0, 10), `Card ${FAKE_CNIC_SPACED} seen`]);
  ok('a CNIC number in the note is refused', r.value?.ok === false && r.value?.field === 'notes');
}
{
  const r = await call('authenticated', OWNER, CHECK, [BILAL, 'identity', 'by_photo', new Date().toISOString().slice(0, 10), null]);
  ok('identity "checked" from a photo is not a method', r.value?.ok === false && r.value?.field === 'method');
}
const today = new Date().toISOString().slice(0, 10);
ok('identity, checked in person', (await call('authenticated', OWNER, CHECK, [BILAL, 'identity', 'in_person', today, 'Met at the office'])).value?.ok === true);
ok('a trial job, watched', (await call('authenticated', OWNER, CHECK, [BILAL, 'trial_job', 'in_person', today, null])).value?.ok === true);
{
  const r = await call('authenticated', OWNER, `SELECT public.admin_decide($1, 'approve', null)`, [BILAL]);
  ok('still refused with one check missing, and it says which', r.value?.ok === false && /rules/.test(r.value?.why ?? ''));
}
ok('the rules, explained', (await call('authenticated', OWNER, CHECK, [BILAL, 'rules', 'video_call', today, null])).value?.ok === true);
ok('now he can be approved', (await call('authenticated', OWNER, `SELECT public.admin_decide($1, 'approve', null)`, [BILAL])).value?.status === 'approved');
ok('and his phone says so', (await call('authenticated', BILAL, `SELECT public.my_account()`)).value?.pro?.status === 'approved');

{
  const r = await call('authenticated', BILAL, APPLY, ['Bilal Ahmed', ['ac', 'solar', 'cctv'], 30, ['F-11'], null]);
  ok('once approved, he cannot rewrite the record the owner checked', r.value?.ok === false);
}
{
  const r = await call('authenticated', OWNER, `SELECT public.admin_decide($1, 'reject', '')`, [KAMRAN]);
  ok('turning somebody down needs a reason he will read', r.value?.ok === false && r.value?.field === 'reason');
}
ok('turned down, with the reason', (await call('authenticated', OWNER, `SELECT public.admin_decide($1, 'reject', 'We need two references first.')`, [KAMRAN])).value?.status === 'rejected');
{
  const me = await call('authenticated', KAMRAN, `SELECT public.my_account()`);
  ok('he sees why', me.value?.pro?.status === 'rejected' && /references/.test(me.value?.pro?.status_reason ?? ''));
  const again = await call('authenticated', KAMRAN, APPLY, ['Kamran Shah', ['plumber'], 3, ['G-13'], 'Two references attached by phone.']);
  const after = await call('authenticated', KAMRAN, `SELECT public.my_account()`);
  ok('and can apply again, back in the queue', again.value?.ok === true && after.value?.pro?.status === 'applied');
}

ok('a suspension needs a reason too', (await call('authenticated', OWNER, `SELECT public.admin_decide($1, 'suspend', null)`, [BILAL])).value?.ok === false);
ok('suspended, with the reason', (await call('authenticated', OWNER, `SELECT public.admin_decide($1, 'suspend', 'Customer complaint, checking.')`, [BILAL])).value?.status === 'suspended');
ok('and reinstated', (await call('authenticated', OWNER, `SELECT public.admin_decide($1, 'reinstate', null)`, [BILAL])).value?.status === 'approved');

heading('Somebody switched off');
nothing('sees no applications', await as('authenticated', GONE, `SELECT * FROM public.admin_applications()`));
ok('cannot decide anything', (await call('authenticated', GONE, `SELECT public.admin_decide($1, 'suspend', 'x')`, [BILAL])).value?.ok === false);
ok('is not staff, as far as the app is concerned', (await call('authenticated', GONE, `SELECT public.is_staff()`)).value === false);

// =============================================================================
heading('Deleting an account');

ok('a customer can delete her own account', (await call('authenticated', AYESHA, `SELECT public.delete_my_account()`)).value?.ok === true);
{
  const { rows } = await setup(`SELECT (SELECT count(*) FROM auth.users WHERE id = $1)::int AS u, (SELECT count(*) FROM public.profiles WHERE id = $1)::int AS p`, [AYESHA]);
  ok('and it is really gone: the login and the profile', rows[0].u === 0 && rows[0].p === 0);
}
ok('a technician can too, and his application goes with it', (await call('authenticated', KAMRAN, `SELECT public.delete_my_account()`)).value?.ok === true);
{
  const { rows } = await setup(`SELECT count(*)::int AS n FROM public.pros WHERE id = $1`, [KAMRAN]);
  ok('nothing of his is left', rows[0].n === 0);
}
ok('the office cannot delete itself from a phone', (await call('authenticated', OWNER, `SELECT public.delete_my_account()`)).value?.ok === false);

report();
