import { useCallback, useEffect, useState } from 'react';
import { rupees } from '@pechkas/shared';
import { Head } from './Duo.tsx';
import { ask, supabase } from './supabase.ts';
import { Decide, Evidence, People, when } from './Guarantee.tsx';

/**
 * Visit fees, from public.admin_visit_fees() (the owner's decision D12).
 *
 * A visit fee is what a customer pays the technician when he came, gave the
 * start code, asked a new price, and she said no. The technician keeps all
 * of it; Pechkas takes nothing. The app holds no money: she pays him at the
 * door, and this page records what happened. Only two things move money,
 * both through the ledger and only once each: Pechkas paying him a fee she
 * did not pay, and Pechkas paying her back a waived fee he would not return.
 *
 * Every action needs a reason; it is kept on the fee and in the job's
 * history, with the name of whoever pressed the button.
 */

type Change = { from_paisa: number; price_paisa: number; reason: string; photo: string; decided_at: string | null; decided_by: 'customer' | 'office' | null };
type Event = { at: string; what: string; by: string; detail: Record<string, unknown> | null };
type Fee = {
  id: string;
  job_id: string;
  ref: string;
  trade: string;
  title: string;
  sector: string;
  customer: string;
  customer_phone: string | null;
  pro: string | null;
  pro_phone: string | null;
  amount_paisa: number;
  payer: 'customer' | 'pechkas';
  status: 'due' | 'paid' | 'unpaid' | 'disputed' | 'waived' | 'covered';
  status_before: string | null;
  reason: 'declined' | 'office_declined' | 'office_fee' | 'office_no_fee';
  created_at: string;
  customer_said: 'disagree' | 'paid' | null;
  customer_text: string | null;
  customer_said_at: string | null;
  covered_unpaid: boolean;
  refund: 'owed' | 'returned' | 'charged' | null;
  cleared_at: string | null;
  office_note: string | null;
  office_by_name: string | null;
  office_at: string | null;
  change: Change | null;
  customer_unpaid_before: number;
  needs_you: boolean;
  history: Event[];
};
type PendingChange = {
  id: string;
  job_id: string;
  ref: string;
  trade: string;
  title: string;
  sector: string;
  customer: string;
  customer_phone: string | null;
  pro: string | null;
  pro_phone: string | null;
  from_paisa: number;
  price_paisa: number;
  reason: string;
  photo: string;
  created_at: string;
  pro_says_no_at: string | null;
  paid_by_pechkas: boolean;
  visit_fee_paisa: number;
};
type Earning = { pro_id: string; pro: string | null; paid_paisa: number; covered_paisa: number; waiting_paisa: number; count: number };
type Report = {
  fee_now: number;
  fees: Fee[];
  changes: PendingChange[];
  earnings: Earning[];
  setting_history: { at: string; by: string | null; from: number | null; to: number }[];
};

const money = (p: number | null | undefined) => rupees(p === null || p === undefined ? p : Number(p));
const STATUS: Record<Fee['status'], string> = {
  due: 'Owed by the customer',
  paid: 'Paid to the technician',
  unpaid: 'Not paid',
  disputed: 'Questioned',
  waived: 'Waived',
  covered: 'Paid by Pechkas',
};
const REASON: Record<Fee['reason'], string> = {
  declined: 'She declined a new price in the app.',
  office_declined: 'The office declined a new price for her.',
  office_fee: 'The office decided the work could not be finished, not through his fault.',
  office_no_fee: 'The office decided the work was not finished through his fault: no fee.',
};
const EVENT: Record<string, string> = {
  change_asked: 'He asked a new price',
  change_approved: 'New price approved',
  change_declined: 'New price declined',
  pro_says_declined: 'He said she declined at the door',
  visit_fee_recorded: 'Fee recorded',
  visit_fee_paid: 'He said he was paid',
  visit_fee_unpaid: 'He said he was not paid',
  visit_fee_disputed: 'The customer questioned it',
  visit_fee_waive: 'Waived',
  visit_fee_keep: 'Kept',
  visit_fee_mark_paid: 'Marked paid by the office',
  visit_fee_cover: 'Paid to him by Pechkas',
  visit_fee_clear: 'Customer cleared to post again',
  visit_fee_refund_returned: 'He gave the money back',
  visit_fee_refund_charge: 'Pechkas paid her back; added to what he owes',
};
const first = (name: string | null) => (name ? name.split(' ')[0] : 'The technician');

export function VisitFees() {
  const [r, setR] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Fee['status']>('all');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_visit_fees');
    if (error) {
      return setProblem(
        /admin_visit_fees|schema cache|does not exist/i.test(error.message)
          ? 'This page needs the database change 20261110000000_visit_fee.sql. Run it in Supabase first.'
          : `Could not load: ${error.message}`,
      );
    }
    setProblem(null);
    setR((data as Report | null) ?? null);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const fees = r?.fees ?? [];
  const needs = fees.filter((f) => f.needs_you);
  const shown = fees.filter((f) => !f.needs_you && (filter === 'all' || f.status === filter));
  const changes = r?.changes ?? [];

  return (
    <>
      <Head icon="home" title="Visit fees" />
      <p className="lead">
        What a customer pays the technician when he came, gave the start code, asked a new price, and she said no.
        {r ? <> Now <strong>{money(r.fee_now)}</strong>, changed in Settings; a job keeps the fee shown when she chose him.</> : null} The
        technician keeps all of it; Pechkas takes nothing. Every action here needs a reason, and both sides are told.
      </p>
      <nav className="tabs" aria-label="Visit fees">
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {r === null && !problem ? <p className="lead">Loading…</p> : null}

      {r ? (
        <div className="stack">
          <section className="stack" aria-labelledby="fees-need">
            <h2 id="fees-need">Needs you{needs.length + changes.length ? ` (${needs.length + changes.length})` : ''}</h2>
            {needs.length + changes.length === 0 ? <p className="card">Nothing needs you.</p> : null}
            <div className="list">
              {changes.map((c) => (
                <ChangeCard key={c.id} c={c} onDone={load} />
              ))}
              {needs.map((f) => (
                <FeeCard key={f.id} f={f} onDone={load} />
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="fees-all">
            <h2 id="fees-all">All visit fees</h2>
            <div className="chips" role="group" aria-label="Show">
              {(['all', 'due', 'paid', 'covered', 'waived'] as const).map((k) => (
                <button key={k} className={filter === k ? 'chip on' : 'chip'} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {k === 'all' ? 'All' : STATUS[k]}
                </button>
              ))}
            </div>
            {shown.length === 0 ? <p className="muted">None.</p> : null}
            <div className="lines">
              {shown.map((f) => (
                <FeeLine key={f.id} f={f} onDone={load} />
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="fees-earn">
            <h2 id="fees-earn">What technicians earned from visit fees</h2>
            {r.earnings.length === 0 ? <p className="muted">No visit fees yet.</p> : null}
            {r.earnings.length ? (
              <div className="scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Technician</th>
                      <th>Paid by customers</th>
                      <th>Paid by Pechkas</th>
                      <th>Still waiting</th>
                      <th>Fees</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.earnings.map((e) => (
                      <tr key={e.pro_id}>
                        <td>{e.pro ?? 'No longer on Pechkas'}</td>
                        <td>{money(e.paid_paisa)}</td>
                        <td>{money(e.covered_paisa)}</td>
                        <td>{money(e.waiting_paisa)}</td>
                        <td>{e.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="card">
            <details>
              <summary>Changes to the visit fee ({r.setting_history.length})</summary>
              {r.setting_history.length === 0 ? <p className="muted">Never changed since it was set.</p> : null}
              <div className="lines">
                {r.setting_history.map((h, i) => (
                  <p key={i} className="line-item">
                    {when(h.at)}: {h.from !== null ? money(h.from) : 'not set'} → <strong>{money(h.to)}</strong>
                    {h.by ? ` by ${h.by}` : ''}
                  </p>
                ))}
              </div>
            </details>
          </section>
        </div>
      ) : null}
    </>
  );
}

/** A new price only the office can answer: a guarantee repair, or one she answered at the door but not in the app. */
function ChangeCard({ c, onDone }: { c: PendingChange; onDone: () => void }) {
  const decide = (approve: boolean) => (note: string) =>
    ask('admin_decide_change', { p_change: c.id, p_approve: approve, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">
            {c.paid_by_pechkas ? 'New price on a guarantee repair · Pechkas pays' : `${first(c.pro)} says the customer said no at the door`}
          </p>
          <h2>
            {c.ref} · {c.title}
          </h2>
          <p className="muted">
            {c.trade} · {c.sector} · asked {when(c.created_at)}
            {c.pro_says_no_at ? ` · he reported her answer ${when(c.pro_says_no_at)}` : ''}
          </p>
        </div>
        <div className="price">
          <strong>{money(c.price_paisa)}</strong>
          <span className="muted">instead of {money(c.from_paisa)}</span>
        </div>
      </div>
      <People customer={c.customer} customerPhone={c.customer_phone} pro={c.pro} proPhone={c.pro_phone} />
      <div className="evidence">
        <h3>His reason</h3>
        <p className="about">“{c.reason}”</p>
      </div>
      <Evidence title="His photo" paths={[c.photo]} />
      <Decide
        label={c.paid_by_pechkas ? 'Why (kept on the job’s record)' : 'What she told you on the phone (kept on the job’s record)'}
        choices={[
          { text: `Approve ${money(c.price_paisa)}`, run: decide(true) },
          {
            text: c.paid_by_pechkas ? `Decline: Pechkas pays him the visit fee, ${money(c.visit_fee_paisa)}` : `Decline: she owes the visit fee, ${money(c.visit_fee_paisa)}`,
            secondary: true,
            run: decide(false),
          },
        ]}
        onDone={onDone}
      />
      <p className="muted small">
        {c.paid_by_pechkas
          ? 'Approving means Pechkas pays the higher price for this repair. Declining stops the job; she pays nothing.'
          : 'Ring her first. Record only what she told you. Declining stops the job with the visit fee owed by her.'}
      </p>
    </article>
  );
}

/** A fee that needs a person: not paid, questioned, or money owed back to her. */
function FeeCard({ f, onDone }: { f: Fee; onDone: () => void }) {
  const act = (action: string) => (note: string) =>
    ask('admin_visit_fee', { p_fee: f.id, p_action: action, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
  const choices: { text: string; secondary?: boolean; run: (note: string) => Promise<{ ok: boolean; why?: string }> }[] = [];
  let kind = '';
  let help = '';
  if (f.refund === 'owed') {
    kind = `Waived after she paid · ${first(f.pro)} must give back ${money(f.amount_paisa)}`;
    choices.push({ text: 'He gave it back', run: act('refund_returned') });
    choices.push({ text: `He will not: Pechkas pays her back, add ${money(f.amount_paisa)} to what he owes`, secondary: true, run: act('refund_charge') });
    help = 'Charging him adds the fee to what he owes Pechkas. Pay her back yourself before you press it.';
  } else if (f.status === 'unpaid' || (f.status === 'disputed' && f.status_before === 'unpaid' && f.customer_said === 'paid')) {
    kind = f.status === 'unpaid' ? `${first(f.pro)} says the customer did not pay` : `${first(f.pro)} says not paid; ${f.customer} says she paid`;
    if (f.status === 'disputed') choices.push({ text: 'She paid: mark it paid', run: act('mark_paid') });
    choices.push({ text: `Pechkas pays ${first(f.pro)} ${money(f.amount_paisa)}`, run: act('cover') });
    if (f.status === 'disputed') choices.push({ text: 'Keep it as not paid', secondary: true, run: act('keep') });
    choices.push({ text: 'Waive it: no fee', secondary: true, run: act('waive') });
    help =
      f.customer_unpaid_before > 0
        ? `She has left ${f.customer_unpaid_before} visit fee${f.customer_unpaid_before === 1 ? '' : 's'} unpaid before.`
        : 'Her first unpaid fee. Paying him keeps technicians trusting the rule; she cannot post again until she settles with Pechkas.';
  } else if (f.status === 'disputed') {
    kind = `${f.customer} questions the fee`;
    choices.push({ text: 'Keep the fee', run: act('keep') });
    choices.push({ text: 'Waive it: no fee', secondary: true, run: act('waive') });
    help = f.status_before === 'paid' ? 'She has paid it. Waiving means he must give it back.' : 'Keeping it means she still owes it.';
  }
  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">{kind}</p>
          <h2>
            {f.ref} · {f.title}
          </h2>
          <p className="muted">
            {f.trade} · {f.sector} · {when(f.created_at)}
          </p>
        </div>
        <div className="price">
          <strong>{money(f.amount_paisa)}</strong>
          <span className="muted">{STATUS[f.status]}</span>
        </div>
      </div>
      <People customer={f.customer} customerPhone={f.customer_phone} pro={f.pro} proPhone={f.pro_phone} />
      <FeeFacts f={f} />
      <Decide label="Why (both of them can read this in the app)" choices={choices} onDone={onDone} />
      {help ? <p className="muted small">{help}</p> : null}
    </article>
  );
}

/** Why the fee exists, its proof, and every step taken on it. */
function FeeFacts({ f }: { f: Fee }) {
  return (
    <>
      <div className="evidence">
        <h3>Why</h3>
        <p>{REASON[f.reason]}</p>
        {f.change ? (
          <p>
            New price {money(f.change.price_paisa)} instead of {money(f.change.from_paisa)}: “{f.change.reason}”
            {f.change.decided_by === 'office' ? ' · answered by the office' : ''}
          </p>
        ) : null}
        {f.customer_text ? (
          <p>
            <strong>{f.customer} wrote:</strong> “{f.customer_text}”
          </p>
        ) : null}
        {f.office_note ? (
          <p className="muted">
            The office{f.office_by_name ? ` (${f.office_by_name})` : ''}
            {f.office_at ? `, ${when(f.office_at)}` : ''}: “{f.office_note}”
          </p>
        ) : null}
      </div>
      {f.change?.photo ? <Evidence title="His photo with the new price" paths={[f.change.photo]} /> : null}
      {f.history.length ? (
        <details>
          <summary>History ({f.history.length})</summary>
          <ul>
            {f.history.map((h, i) => (
              <li key={i}>
                {when(h.at)} · {EVENT[h.what] ?? h.what} · by {h.by}
                {h.detail && typeof h.detail.note === 'string' ? `: “${h.detail.note}”` : ''}
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </>
  );
}

/** One fee in the full list, with the actions still open on it. */
function FeeLine({ f, onDone }: { f: Fee; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const act = (action: string) => (note: string) =>
    ask('admin_visit_fee', { p_fee: f.id, p_action: action, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
  const choices: { text: string; secondary?: boolean; run: (note: string) => Promise<{ ok: boolean; why?: string }> }[] = [];
  if (f.payer === 'customer' && ['due', 'paid'].includes(f.status)) choices.push({ text: 'Waive it', secondary: true, run: act('waive') });
  if (f.status === 'due') choices.push({ text: 'Mark it paid', run: act('mark_paid') });
  if (f.status === 'covered' && f.covered_unpaid && !f.cleared_at) choices.push({ text: 'Let her post again', run: act('clear') });
  return (
    <div className="line-item">
      <p>
        <strong>
          {f.ref} · {f.title}
        </strong>{' '}
        <span className="muted">
          · {f.customer} · {f.pro ?? 'technician gone'} · {when(f.created_at)}
        </span>
      </p>
      <p>
        {money(f.amount_paisa)} · {STATUS[f.status]} · {f.payer === 'pechkas' ? 'Pechkas pays' : 'the customer pays'}
        {f.refund === 'returned' ? ' · he gave it back' : f.refund === 'charged' ? ' · Pechkas paid her back' : ''}
      </p>
      <button className="secondary small" onClick={() => setOpen(!open)}>
        {open ? 'Close' : 'Details'}
      </button>
      {open ? (
        <>
          <FeeFacts f={f} />
          {choices.length ? <Decide label="Why (kept on the record)" choices={choices} onDone={onDone} /> : null}
        </>
      ) : null}
    </div>
  );
}
