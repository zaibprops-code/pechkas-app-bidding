import { useCallback, useEffect, useState } from 'react';
import { Head } from './Duo.tsx';
import { rupees } from '@pechkas/shared';
import { ask, supabase } from './supabase.ts';
import { shown } from './phones.ts';

/**
 * What each technician owes Pechkas, and recording what he paid.
 *
 * Every figure is read from the ledger, which nobody can edit: a payment
 * typed against the wrong man is undone with "Undo", which writes its
 * opposite and keeps both. Each payment form carries its own key, so a
 * double click or a retry records it once.
 */

type Rating = { count: number; avg: number | null; jobs_done: number };
type ProRow = { id: string; full_name: string; phone: string | null; status: string; owed_paisa: number; blocked: boolean; jobs_done: number; last_paid_at: string | null; rating: Rating };
type MoneyData = {
  credit_limit_paisa: number;
  pay_to: string | null;
  totals: { owed_paisa: number; commission_paisa: number; reserve_paisa: number; received_paisa: number };
  pros: ProRow[];
};
type Line = { txn: string; kind: 'commission' | 'settlement' | 'reversal'; ref: string | null; amount_paisa: number; method: string | null; reference: string | null; memo: string | null; at: string; by: string | null; reversed: boolean };

const METHODS = [
  ['jazzcash', 'JazzCash'],
  ['easypaisa', 'Easypaisa'],
  ['bank', 'Bank transfer'],
  ['cash', 'Cash'],
] as const;
const time = (t: string) => new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

export function Money() {
  const [d, setD] = useState<MoneyData | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_money');
    if (error) return setProblem(`Could not load: ${error.message}`);
    setProblem(null);
    setD(data as MoneyData);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <>
      <Head icon="wallet" title="Money" />
      <p className="lead">
        Customers pay technicians in cash. Each technician owes Pechkas 10% of his labour on every finished job, and pays it by
        JazzCash, Easypaisa, bank or cash. Over {d ? rupees(d.credit_limit_paisa) : 'the limit'}, he cannot make new offers until he pays.
      </p>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {d ? (
        <>
          <div className="tiles">
            <Tile label="Owed to Pechkas now" value={rupees(d.totals.owed_paisa)} />
            <Tile label="Received so far" value={rupees(d.totals.received_paisa)} />
            <Tile label="Earned (commission)" value={rupees(d.totals.commission_paisa)} />
            <Tile label="Guarantee reserve" value={rupees(d.totals.reserve_paisa)} />
          </div>
          <PayTo current={d.pay_to} onSaved={load} />
          <div className="list">
            {d.pros.length === 0 ? <p className="lead">No technicians yet.</p> : null}
            {d.pros.map((p) => (
              <ProMoney key={p.id} p={p} onChanged={load} />
            ))}
          </div>
        </>
      ) : null}
    </>
  );
}

function Tile({ label, value }: { label: string; value: string }) {
  return (
    <div className="tile">
      <span className="muted">{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

/** Where technicians are told to send money. Shown to them exactly as typed here. */
function PayTo({ current, onSaved }: { current: string | null; onSaved: () => void }) {
  const [text, setText] = useState(current ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const r = await ask('admin_set_pay_to', { p_text: text });
    setBusy(false);
    setMsg(r.ok ? 'Saved. Technicians see this on their account screen.' : r.why);
    if (r.ok) onSaved();
  }

  return (
    <section className="alerts">
      <h2>Where technicians pay</h2>
      <div className="row">
        <label className="grow">
          The account they send to, as they should see it (for example: JazzCash 03xx xxxxxxx, account name)
          <input value={text} maxLength={300} onChange={(e) => setText(e.target.value)} placeholder="[NOT SET — technicians are told to ask the office]" />
        </label>
        <button disabled={busy} onClick={save}>Save</button>
      </div>
      {msg ? <p className="muted">{msg}</p> : null}
    </section>
  );
}

function ProMoney({ p, onChanged }: { p: ProRow; onChanged: () => void }) {
  const [paying, setPaying] = useState(false);
  const [showLines, setShowLines] = useState(false);

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>{p.full_name}</h2>
          <p className="muted">
            {p.phone ? shown(p.phone) : 'no number'} · {p.jobs_done} {p.jobs_done === 1 ? 'job' : 'jobs'} done ·{' '}
            {p.rating.avg !== null ? `${Number(p.rating.avg).toFixed(1)} stars from ${p.rating.count}` : `New (${p.rating.count} ${p.rating.count === 1 ? 'rating' : 'ratings'})`}
            {p.status !== 'approved' ? ` · ${p.status}` : ''}
          </p>
        </div>
        <div className="price">
          <strong>{rupees(p.owed_paisa)}</strong>
          <span className={p.blocked ? 'error' : 'muted'}>{p.blocked ? 'over the limit: cannot offer' : 'owed'}</span>
        </div>
      </div>
      <p className="muted">{p.last_paid_at ? `Last paid ${time(p.last_paid_at)}` : 'Has not paid yet'}</p>
      <div className="buttons">
        {p.owed_paisa > 0 && !paying ? <button onClick={() => setPaying(true)}>Record a payment</button> : null}
        <button className="secondary" onClick={() => setShowLines(!showLines)}>{showLines ? 'Hide account' : 'Account, line by line'}</button>
        {p.phone ? <a className="call" href={`tel:+${p.phone.replace(/^\+/, '')}`}>Call</a> : null}
      </div>
      {paying ? <PayForm p={p} onDone={() => { setPaying(false); onChanged(); }} onCancel={() => setPaying(false)} /> : null}
      {showLines ? <Lines pro={p.id} onChanged={onChanged} /> : null}
    </article>
  );
}

function PayForm({ p, onDone, onCancel }: { p: ProRow; onDone: () => void; onCancel: () => void }) {
  // One key per form: pressing Save twice, or again after bad signal, records it once.
  const [key] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(String(p.owed_paisa / 100));
  const [method, setMethod] = useState('');
  const [reference, setReference] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    const rupeesWhole = Number(amount.replace(/[, ]/g, ''));
    if (!Number.isInteger(rupeesWhole) || rupeesWhole <= 0) return setMsg('Write the amount in whole rupees.');
    setBusy(true);
    const r = await ask('admin_settle', { p_pro: p.id, p_amount_paisa: rupeesWhole * 100, p_method: method, p_reference: reference, p_key: key });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    onDone();
  }

  return (
    <section className="assign">
      <h3>Record what {p.full_name.split(' ')[0]} paid</h3>
      <div className="row">
        <label>
          Amount (Rs)
          <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </label>
        <label>
          How
          <select value={method} onChange={(e) => setMethod(e.target.value)}>
            <option value="">Choose…</option>
            {METHODS.map(([v, l]) => (
              <option key={v} value={v}>{l}</option>
            ))}
          </select>
        </label>
        <label className="grow">
          Transaction ID (for cash: who received it)
          <input value={reference} maxLength={80} onChange={(e) => setReference(e.target.value)} />
        </label>
      </div>
      <div className="buttons">
        <button disabled={busy} onClick={save}>Save payment</button>
        <button className="secondary" onClick={onCancel}>Cancel</button>
      </div>
      {msg ? <p className="error" role="alert">{msg}</p> : null}
    </section>
  );
}

function Lines({ pro, onChanged }: { pro: string; onChanged: () => void }) {
  const [lines, setLines] = useState<Line[] | null>(null);

  const load = useCallback(async () => {
    const { data } = (await supabase?.rpc('admin_ledger', { p_pro: pro })) ?? { data: null };
    setLines((data as Line[]) ?? []);
  }, [pro]);

  useEffect(() => {
    load();
  }, [load]);

  async function undo(l: Line) {
    const reason = window.prompt('Why is this being undone? It stays in the record with your reason.');
    if (!reason) return;
    const r = await ask('admin_reverse', { p_txn: l.txn, p_reason: reason });
    if (!r.ok) return window.alert(r.why);
    load();
    onChanged();
  }

  if (!lines) return <p className="muted">Loading…</p>;
  if (!lines.length) return <p className="muted">Nothing in his account yet.</p>;
  return (
    <table className="ledger">
      <thead>
        <tr>
          <th>When</th>
          <th>What</th>
          <th className="num">He owes</th>
          <th />
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => (
          <tr key={i} className={l.reversed ? 'struck' : ''}>
            <td>{time(l.at)}</td>
            <td>
              {l.kind === 'commission' ? `Commission on ${l.ref}` : l.kind === 'settlement' ? `Paid by ${l.method}` : 'Undone'}
              {l.reference ? ` · ${l.reference}` : ''}
              {l.memo ? ` · “${l.memo}”` : ''}
              {l.by ? <span className="muted"> · {l.by}</span> : null}
            </td>
            <td className="num">{l.amount_paisa > 0 ? '+' : '−'} {rupees(Math.abs(l.amount_paisa))}</td>
            <td>{l.kind !== 'reversal' && !l.reversed ? <button className="secondary small" onClick={() => undo(l)}>Undo</button> : null}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
