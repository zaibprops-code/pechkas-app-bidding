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
  cancelled: (f) => [
    `${f.n} jobs were cancelled after he was chosen.`,
    'Sometimes the job is then done for cash outside the app, with no Pechkas fee. Ring the customers and ask what happened.',
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
  cancels: (f) => [`This customer cancelled ${f.n} jobs.`, 'Each one may have cost a technician a trip.'],
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
