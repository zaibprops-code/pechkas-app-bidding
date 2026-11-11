import { useCallback, useEffect, useState } from 'react';
import { Head } from './Duo.tsx';

import { ask, supabase } from './supabase.ts';
import { shown } from './phones.ts';

/**
 * Patterns worth a look, from public.admin_flags(). A flag is not a verdict:
 * every one of these also happens to honest people. Nothing here suspends,
 * blocks or charges anybody. You read, ring, write what you found, and — if
 * you decide to — suspend a technician by hand under Technicians.
 */

type Flag = { kind: string; n: number; of?: number; limit: number };
type Person = {
  side: 'pro' | 'customer';
  id: string;
  name: string;
  phone: string | null;
  status: string | null;
  flags: Flag[];
  checked_at: string | null;
  notes: { note: string; checked: boolean; by: string | null; at: string }[];
};
type Report = { days: number; limits: Record<string, number>; people: Person[] };

/** What each flag says, and what it may mean. Written for the owner, in plain words. */
const SAYS: Record<string, (f: Flag, limits: Record<string, number>) => [string, string]> = {
  stopped: (f) => [
    `${f.n} of his ${f.of} finished jobs ended with the customer refusing a new price at the door.`,
    'Offering low to win the job, then asking more at the gate. Or honest jobs that kept turning out bigger: look at the photos and reasons in each job.',
  ],
  raised: (f) => [
    `He asked for a new price on ${f.n} of his ${f.of} finished jobs.`,
    'The same pattern as above, even where the customer said yes.',
  ],
  parts: (f, l) => [
    `${f.n} jobs where parts were ${Math.round((l.flag_parts_bps ?? 0) / 100)}% or more of the price.`,
    'Parts lower the Pechkas fee. Open the receipts in those jobs and check the shop and the amounts.',
  ],
  codes: (f) => [`${f.n} wrong start codes were typed on his jobs.`, 'Somebody else at the gate, or a customer misreading the code. Ring the customers.'],
  late_arrivals: (f) => [
    `${f.n} late arrivals: more than 30 minutes after his time began.`,
    'Read them under Cancellations, with anything he wrote. Dismiss the ones that were not his fault; nothing happens to him on its own.',
  ],
  no_shows: (f) => [
    `${f.n} confirmed no-show${f.n === 1 ? '' : 's'}: he never arrived.`,
    'Ring him and ask what happened. A customer left waiting is the thing that most damages trust in Pechkas.',
  ],
  complaints: (f) => [`${f.n} problems or guarantee claims from customers.`, 'Read them under Problems.'],
  low_stars: (f) => [`${f.n} ratings of one or two stars.`, 'Read the words with them in the jobs.'],
  same_customer: (f) => [
    `${f.n} jobs done for the same customer.`,
    'A loyal customer — or ratings and job counts made up between friends. Check the photos are real work.',
  ],
  blocked: (f) => [
    `${f.n} customers blocked him: they never want him sent again.`,
    'Ring them and ask why. Open "Who blocked him" below for their names and words.',
  ],
  price_over: (f, l) => [
    `${f.n} jobs where his price for the work was more than ${Math.round((l.flag_price_over_bps ?? 0) / 100)}% above what jobs of that kind usually go for.`,
    'Some jobs really are bigger than they look. Open them, read the photos and any new price he asked for, and ring the customers to ask whether it felt fair.',
  ],
  unchecked: (f) => [
    `${f.n} of his ${f.of} finished jobs closed by themselves after 24 hours, with the customer never checking.`,
    'He may be finishing when nobody is watching. Ring a few of those customers and ask whether the work was done.',
  ],
  guarantee: (f) => [
    `${f.n} guarantee claims on his work in the last 60 days.`,
    'Read them under Guarantee and disputes. One claim happens to good technicians; a pattern means poor work.',
  ],
  guarantee_review: (f) => [
    `${f.n} guarantee claims on his work in the last 90 days.`,
    'Time to review his approval: watch him on a trial job again, or talk to him about what keeps failing. Nothing changes until you decide.',
  ],
  overruled: (f) => [
    `Pechkas found this customer wrong ${f.n} times after she said "not finished yet".`,
    'Read those disputes. "Not finished" may be how she avoids paying.',
  ],
  not_home: (f) => [
    `The office confirmed ${f.n} times that nobody was home when the technician came.`,
    'Each one was a wasted trip. Ring her before anything else; she may have a reason. Nothing happens on its own.',
  ],
  unverified_arrivals: (f) => [
    `${f.n} times his "I have arrived" could not be verified by location, and was not approved.`,
    'Open them under Cancellations → Arrivals to check. A poor signal or a wrong pin is not misconduct; a pattern far from the pin is worth a call.',
  ],
  not_home_reports: (f) => [
    `${f.n} "nobody home" reports made by him.`,
    'Most customers are home. Open his reports under Cancellations, look at the photos and times, and ring a few of those customers.',
  ],
  late_cancels: (f) => [
    `This customer cancelled ${f.n} jobs late: at the door, within 2 hours, or after he set off.`,
    'Each one may have cost a technician a trip. Cancelling stays free; ring her, then mark it reviewed under Cancellations.',
  ],
  reports: (f) => [`Technicians reported ${f.n} problems on this customer's jobs.`, 'Read them under Problems.'],
};

const time = (t: string) => new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
const tel = (p: string) => `tel:+${p.replace(/^\+/, '')}`;

export function Flags() {
  const [r, setR] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_flags');
    if (error) return setProblem(`Could not load: ${error.message}`);
    setProblem(null);
    setR(data as Report);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Head icon="flag" title="Flags" />
      <p className="lead">
        Patterns worth a look over the last {r?.days ?? '…'} days. A flag is not proof of anything, and nothing here changes anybody's
        account. The limits are starting guesses; they are settings, and can be changed once real jobs show what is normal.
      </p>
      <nav className="tabs" aria-label="Flags">
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {r === null && !problem ? <p className="lead">Loading…</p> : null}
      {r?.people.length === 0 ? <p className="lead">Nobody is flagged.</p> : null}
      <div className="list">
        {r?.people.map((p) => <PersonCard key={p.id} p={p} limits={r.limits} onChanged={load} />)}
      </div>
    </>
  );
}

function PersonCard({ p, limits, onChanged }: { p: Person; limits: Record<string, number>; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(checked: boolean) {
    setBusy(true);
    setMsg(null);
    const r = await ask('admin_note_flag', { p_side: p.side, p_id: p.id, p_note: note, p_checked: checked });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setNote('');
    onChanged();
  }

  return (
    <article className={p.checked_at ? 'card checked' : 'card'}>
      <div className="card-head">
        <div>
          <p className="kind">
            {p.side === 'pro' ? 'Technician' : 'Customer'}
            {p.status && p.status !== 'approved' ? ` · ${p.status}` : ''}
            {p.checked_at ? ` · checked ${time(p.checked_at)}` : ''}
          </p>
          <h2>{p.name}</h2>
        </div>
        {p.phone ? <a className="call" href={tel(p.phone)}>Call · {shown(p.phone)}</a> : null}
      </div>
      <ul className="flags">
        {p.flags.map((f) => {
          const [says, means] = SAYS[f.kind]?.(f, limits) ?? [`${f.kind}: ${f.n}`, ''];
          return (
            <li key={f.kind}>
              <strong>{says}</strong>
              {means ? <span className="muted"> {means}</span> : null}
            </li>
          );
        })}
      </ul>
      {p.side === 'pro' && p.flags.some((f) => f.kind === 'blocked') ? <Blocks pro={p.id} /> : null}
      {p.notes.length ? (
        <div className="history">
          <h3>Notes</h3>
          <ul className="events">
            {p.notes.map((n, i) => (
              <li key={i}>
                {time(n.at)}
                {n.by ? ` · ${n.by}` : ''}
                {n.checked ? ' · checked' : ''}: {n.note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <section className="decide">
        <label>
          What you found (kept, with your name)
          <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="buttons">
          <button disabled={busy} onClick={() => save(true)}>Checked — it is fine</button>
          <button className="secondary" disabled={busy} onClick={() => save(false)}>Save a note</button>
        </div>
        {msg ? <p className="error" role="alert">{msg}</p> : null}
      </section>
    </article>
  );
}

type Block = { customer: string; phone: string | null; ref: string | null; reason: string | null; at: string };

/** Who blocked a technician, and what they said. Only the office sees this; he is never told. */
function Blocks({ pro }: { pro: string }) {
  const [rows, setRows] = useState<Block[] | null>(null);
  async function open() {
    const { data } = (await supabase?.rpc('admin_blocks', { p_pro: pro })) ?? { data: null };
    setRows((data as Block[]) ?? []);
  }
  if (rows === null) {
    return (
      <div className="buttons">
        <button className="secondary small" onClick={open}>Who blocked him</button>
      </div>
    );
  }
  return (
    <div className="history">
      <h3>Who blocked him (he is not told)</h3>
      <ul className="events">
        {rows.map((b, i) => (
          <li key={i}>
            {time(b.at)} · {b.customer}
            {b.phone ? ` · ${shown(b.phone)}` : ''}
            {b.ref ? ` · after ${b.ref}` : ''}
            {b.reason ? `: “${b.reason}”` : ''}
          </li>
        ))}
      </ul>
    </div>
  );
}
