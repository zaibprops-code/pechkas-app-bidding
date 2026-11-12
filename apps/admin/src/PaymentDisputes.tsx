import { useCallback, useEffect, useState } from 'react';
import { rupees } from '@pechkas/shared';
import { Head } from './Duo.tsx';
import { ask, supabase } from './supabase.ts';
import { Evidence, People, when } from './Guarantee.tsx';

/**
 * Payment disputes, from public.admin_payment_cases() (the owner's decision D35).
 *
 * A technician says the customer did not pay him in full. His commission on
 * the job is held from that moment: it counts towards nothing until money
 * is received. The customer answers once, "That's right" or "I have paid";
 * silence for 3 days brings it here and blocks nobody. Commission is only
 * ever charged on the labour he actually received (parts first), and the
 * database works every figure out: this page records what the office found.
 *
 * Every action needs a reason, kept on the case and the job's history with
 * the name of whoever pressed the button; both of them read it in the app.
 * She cannot post new jobs only while she owes — agreed by her, or decided
 * here — and "Clear her" lets her post again while the case stays open.
 */

type Event = { at: string; what: string; by: string | null };
type Case = {
  id: string;
  job_id: string;
  ref: string;
  trade: string;
  title: string;
  customer: string;
  customer_phone: string | null;
  pro: string | null;
  pro_phone: string | null;
  status: 'asked' | 'owed' | 'office' | 'closed';
  agreed_paisa: number;
  parts_paisa: number;
  reported_paisa: number;
  received_paisa: number;
  posted_commission_paisa: number;
  commission_bps: number;
  answer_due: string;
  customer_answer: 'agrees' | 'paid' | null;
  customer_text: string | null;
  customer_photo: string | null;
  blocked: boolean;
  outcome: 'paid_full' | 'now_paid' | 'closed' | null;
  false_report: boolean;
  office_note: string | null;
  office_by_name: string | null;
  office_at: string | null;
  created_at: string;
  closed_at: string | null;
  claim_open: boolean;
  needs_you: boolean;
  history: Event[];
};

const money = (p: number | null | undefined) => rupees(p === null || p === undefined ? p : Number(p));
const first = (name: string | null) => (name ? name.split(' ')[0] : 'The technician');
const STATUS: Record<Case['status'], string> = {
  asked: 'Waiting for her answer',
  owed: 'She owes the rest',
  office: 'Needs the office',
  closed: 'Closed',
};
const OUTCOME: Record<NonNullable<Case['outcome']>, string> = {
  paid_full: 'Paid in full (office)',
  now_paid: 'He said he has now been paid',
  closed: 'Closed unpaid: commission only on what he received',
};
const EVENT: Record<string, string> = {
  payment_reported: 'He reported it; commission held',
  payment_corrected: 'He changed his amount',
  payment_answered: 'She answered',
  payment_no_answer: 'No answer in 3 days: to the office',
  payment_now_paid: 'He said he has now been paid',
  payment_received: 'Office recorded a payment',
  payment_correct: 'Office corrected his amount',
  payment_owes: 'Office decided she owes the rest',
  payment_paid_full: 'Office: paid in full',
  payment_close: 'Office closed it unpaid',
  payment_clear: 'Office let her post again',
  payment_false_report: 'Office found his report false',
};
/** Commission on the labour received, the database's way: whole paisa, rounded down. */
const commissionOn = (c: Case, received: number) => Math.floor((Math.max(received - c.parts_paisa, 0) * c.commission_bps) / 10000);

export function PaymentDisputes() {
  const [cases, setCases] = useState<Case[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<'open' | 'closed'>('open');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_payment_cases');
    if (error) {
      return setProblem(
        /admin_payment_cases|schema cache|does not exist/i.test(error.message)
          ? 'This page needs the database change 20261112300000_payment_disputes.sql. Run it in Supabase first.'
          : `Could not load: ${error.message}`,
      );
    }
    setProblem(null);
    setCases((data as Case[] | null) ?? []);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const all = cases ?? [];
  const needs = all.filter((c) => c.needs_you);
  const rest = all.filter((c) => !c.needs_you && (filter === 'open' ? c.status !== 'closed' : c.status === 'closed'));

  return (
    <>
      <Head icon="wallet" title="Payment disputes" />
      <p className="lead">
        A technician says a customer did not pay him in full. His commission on that job is held until money is received, and then
        charged only on the labour he actually received. She answers once; if she says she paid, or does not answer in 3 days, it
        comes here. She is stopped from posting only once she agreed, or you decided, that she owes. Every action needs a reason,
        and both of them read it.
      </p>
      <nav className="tabs" aria-label="Payment disputes">
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {cases === null && !problem ? <p className="lead">Loading…</p> : null}

      {cases ? (
        <div className="stack">
          <section className="stack" aria-labelledby="pay-need">
            <h2 id="pay-need">Needs you{needs.length ? ` (${needs.length})` : ''}</h2>
            {needs.length === 0 ? <p className="card">Nothing needs you.</p> : null}
            <div className="list">
              {needs.map((c) => (
                <CaseCard key={c.id} c={c} onDone={load} />
              ))}
            </div>
          </section>

          <section className="stack" aria-labelledby="pay-all">
            <h2 id="pay-all">Every case</h2>
            <div className="chips" role="group" aria-label="Show">
              {(['open', 'closed'] as const).map((k) => (
                <button key={k} className={filter === k ? 'chip on' : 'chip'} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {k === 'open' ? 'Open' : 'Closed (60 days)'}
                </button>
              ))}
            </div>
            {rest.length === 0 ? <p className="card muted">None.</p> : null}
            <div className="list">
              {rest.map((c) => (
                <CaseCard key={c.id} c={c} onDone={load} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

type Action = 'received' | 'paid_full' | 'owes' | 'close' | 'clear' | 'correct' | 'false_report';

function CaseCard({ c, onDone }: { c: Case; onDone: () => void }) {
  const [note, setNote] = useState('');
  const [amount, setAmount] = useState('');
  const [falseReport, setFalseReport] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const outstanding = c.agreed_paisa - Math.max(c.received_paisa, c.reported_paisa);
  const full = commissionOn(c, c.agreed_paisa);
  const open = c.status !== 'closed';

  async function go(action: Action) {
    if (note.trim().length < 5) return setMsg('Write what you found, in a sentence, before deciding.');
    const needsAmount = action === 'received' || action === 'correct';
    const paisa = needsAmount ? Number(amount) * 100 : null;
    if (needsAmount && (!amount || !Number.isFinite(paisa))) return setMsg('Write the amount in whole rupees first.');
    setBusy(true);
    setMsg(null);
    const r = (await ask('admin_payment_case', {
      p_case: c.id,
      p_action: action,
      p_note: note.trim(),
      p_amount_paisa: paisa,
      p_false_report: falseReport,
    })) as { ok: boolean; why?: string };
    setBusy(false);
    if (!r.ok) return setMsg(r.why ?? 'The database refused.');
    setNote('');
    setAmount('');
    setFalseReport(false);
    onDone();
  }

  const kind = !open
    ? `Closed · ${c.outcome ? OUTCOME[c.outcome] : ''}`
    : c.customer_answer === 'paid'
      ? `${first(c.pro)} says not paid in full; ${c.customer} says she paid`
      : c.status === 'office' && !c.customer_answer
        ? `${first(c.pro)} says not paid in full; ${c.customer} did not answer in 3 days`
        : c.status === 'owed'
          ? c.blocked
            ? `${c.customer} owes the rest · she cannot post new jobs`
            : `${c.customer} owes the rest · you let her post again`
          : `Waiting for ${c.customer}'s answer, until ${when(c.answer_due)}`;

  return (
    <article className={c.needs_you ? 'card urgent' : 'card'}>
      <div className="card-head">
        <div>
          <p className="kind">{kind}</p>
          <h2>
            {c.ref} · {c.title}
          </h2>
          <p className="muted">
            {c.trade} · reported {when(c.created_at)} · {STATUS[c.status]}
            {c.false_report ? ' · his report found false' : ''}
          </p>
        </div>
        <div className="price">
          <strong>{money(outstanding)}</strong>
          <span className="muted">unpaid of {money(c.agreed_paisa)}</span>
        </div>
      </div>
      <People customer={c.customer} customerPhone={c.customer_phone} pro={c.pro} proPhone={c.pro_phone} />

      <div className="evidence">
        <h3>The money</h3>
        <p>
          Price {money(c.agreed_paisa)}
          {c.parts_paisa ? `, of which parts ${money(c.parts_paisa)} (receipt on the job)` : ''}. He says he received{' '}
          <strong>{money(c.reported_paisa)}</strong>
          {c.received_paisa !== c.reported_paisa ? `; recorded as received so far: ${money(c.received_paisa)}` : ''}.
        </p>
        <p>
          Commission charged so far: <strong>{money(c.posted_commission_paisa)}</strong> of {money(full)} in full, at{' '}
          {(c.commission_bps / 100).toFixed(c.commission_bps % 100 ? 1 : 0)}% of the labour received. The rest is held.
        </p>
        {c.claim_open ? (
          <p>
            <strong>A guarantee claim on this job is waiting for you</strong> in Guarantee and disputes. Her guarantee is not affected by
            this case.
          </p>
        ) : null}
      </div>

      {c.customer_answer ? (
        <div className="evidence">
          <h3>Her answer</h3>
          <p>{c.customer_answer === 'agrees' ? 'That’s right: she still owes it.' : 'I have paid.'}</p>
          {c.customer_text ? <p className="about">“{c.customer_text}”</p> : null}
        </div>
      ) : null}
      {c.customer_photo ? <Evidence title="Her screenshot" paths={[c.customer_photo]} /> : null}
      {c.office_note ? (
        <p className="muted">
          Last decision{c.office_by_name ? ` by ${c.office_by_name}` : ''}
          {c.office_at ? `, ${when(c.office_at)}` : ''}: “{c.office_note}”
        </p>
      ) : null}

      <section className="decide">
        <label>
          Why (both of them can read this in the app)
          <textarea rows={3} value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </label>
        {open ? (
          <div className="row">
            <label className="grow">
              Amount in rupees, for the two amount buttons
              <input inputMode="numeric" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))} />
            </label>
          </div>
        ) : null}
        <label className="check">
          <input type="checkbox" checked={falseReport || c.false_report} disabled={c.false_report} onChange={(e) => setFalseReport(e.target.checked)} />
          His report was false (only when you found it so; it raises a flag, nothing else)
        </label>
        <div className="buttons">
          {open ? (
            <>
              <button disabled={busy} onClick={() => go('paid_full')}>She paid in full</button>
              <button disabled={busy} onClick={() => go('received')}>She has paid this much in all</button>
              {c.status !== 'owed' || !c.blocked ? (
                <button className="secondary" disabled={busy} onClick={() => go('owes')}>She owes the rest: stop her posting</button>
              ) : null}
              {c.status === 'owed' && c.blocked ? (
                <button className="secondary" disabled={busy} onClick={() => go('clear')}>Let her post again</button>
              ) : null}
              <button className="secondary" disabled={busy} onClick={() => go('correct')}>He received this much: correct his amount</button>
              <button className="secondary" disabled={busy} onClick={() => go('close')}>Close unpaid</button>
            </>
          ) : !c.false_report ? (
            <button className="secondary" disabled={busy || !falseReport} onClick={() => go('false_report')}>Record his report as false</button>
          ) : null}
        </div>
        {msg ? <p className="error" role="alert">{msg}</p> : null}
      </section>
      {open ? (
        <p className="muted small">
          Ring both first. “Close unpaid” charges commission only on what he received and stops nothing for her. A payment recorded here
          releases commission on that labour only, due 14 days from today.
        </p>
      ) : null}

      {c.history.length ? (
        <details>
          <summary>History ({c.history.length})</summary>
          <div className="lines">
            {c.history.map((h, i) => (
              <p key={i} className="line-item">
                {when(h.at)}: {EVENT[h.what] ?? h.what}
                {h.by ? ` · ${({ customer: c.customer, pro: first(c.pro), office: 'the office', system: 'the 3-day clock' } as Record<string, string>)[h.by] ?? h.by}` : ''}
              </p>
            ))}
          </div>
        </details>
      ) : null}
    </article>
  );
}
