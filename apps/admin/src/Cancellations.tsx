import { useCallback, useEffect, useState } from 'react';
import { Head } from './Duo.tsx';
import { ask, supabase } from './supabase.ts';
import { Decide, People, when } from './Guarantee.tsx';
import { shown } from './phones.ts';
import { NotHomeSections } from './NotHome.tsx';
import { ArrivalSections } from './Arrivals.tsx';
import { ReliabilitySections } from './Reliability.tsx';

/**
 * Cancellations, late arrivals and no-shows, from public.admin_cancellations()
 * (the owner's decision D10).
 *
 * Cancelling is free for customers and never creates a visit fee. Each
 * cancellation has one category, worked out by the database on its own
 * clock, so none counts against both people. This page is for looking, not
 * punishing: a customer with too many late cancellations, a technician with
 * late arrivals or a confirmed no-show, are put in front of the office.
 * Nothing here suspends, blocks or charges anybody.
 */

type Category = 'before_choosing' | 'normal' | 'late' | 'pro_late' | 'no_show' | 'office' | 'unclaimed' | 'before_rules' | 'not_home' | 'guard';
type Cancellation = {
  id: string;
  job_id: string;
  ref: string;
  trade: string;
  title: string;
  sector: string;
  customer_id: string;
  customer: string;
  pro: string | null;
  cancelled_by: 'customer' | 'office' | 'nobody' | 'pro';
  cancel_for: 'customer' | 'pro' | 'other' | null;
  category: Category;
  reason_code: string | null;
  reason_text: string | null;
  cancelled_at: string;
  stage: string | null;
  window_start: string | null;
  on_way_at: string | null;
  arrived_at: string | null;
  reviewed_at: string | null;
  reviewed_by_name: string | null;
  review_note: string | null;
};
type Incident = {
  id: string;
  job_id: string;
  ref: string;
  trade: string;
  title: string;
  sector: string;
  pro_id: string;
  pro: string | null;
  pro_phone: string | null;
  customer: string;
  customer_phone: string | null;
  kind: 'late_arrival' | 'no_show';
  status: 'recorded' | 'potential' | 'confirmed' | 'dismissed' | 'disputed';
  how: 'arrived_late' | 'cancelled_waiting' | 'clock';
  window_start: string | null;
  arrived_at: string | null;
  minutes_late: number | null;
  detected_at: string;
  pro_text: string | null;
  office_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  job_status: string;
  needs_you: boolean;
};
type ToReview = { customer_id: string; customer: string; phone: string | null; late: number; unreviewed: number };
type ProCount = { pro_id: string; pro: string | null; late_arrivals: number; no_shows: number; waiting: number };
type Report = {
  days: number;
  late_cancels_at: number;
  late_arrivals_at: number;
  no_shows_at: number;
  cancellations: Cancellation[];
  customers_to_review: ToReview[];
  incidents: Incident[];
  pros: ProCount[];
};

const CATEGORY: Record<Category, string> = {
  before_choosing: 'Before choosing',
  normal: 'Normal',
  late: 'Late',
  pro_late: 'Technician late',
  no_show: 'Technician did not arrive',
  office: 'By the office',
  unclaimed: 'Nobody took it',
  before_rules: 'Before the rules',
  not_home: 'Nobody home',
  guard: 'Guard refused entry',
};
const MEANS: Record<Category, string> = {
  before_choosing: 'No technician had been chosen.',
  normal: 'Cancelled well before his time.',
  late: 'Cancelled at the door, within 2 hours of his time, or after he set off. Counts towards a review of her account.',
  pro_late: 'He was more than 30 minutes late. Counted as his lateness, never hers.',
  no_show: 'He had not arrived 30 minutes after his time ended.',
  office: 'The office cancelled it.',
  unclaimed: 'Nobody offered by 8pm on its day.',
  before_rules: 'Cancelled before 10 November 2026, when these rules began. Counted nowhere.',
  not_home: 'The technician reported nobody answered. Counts only once you confirm it, below under Could not get in.',
  guard: 'The technician reported the guard would not let him in. Counts against nobody.',
};
const REASON: Record<string, string> = {
  fixed_myself: 'Fixed it herself',
  someone_else: 'Someone else fixed it',
  plans_changed: 'Plans changed',
  pro_late: 'The technician is late',
  better_price: 'Found a better price',
  not_needed: 'No longer needs the service',
  other: 'Other',
};
const STATUS: Record<Incident['status'], string> = {
  recorded: 'Recorded',
  potential: 'Potential no-show: check it',
  confirmed: 'Confirmed',
  dismissed: 'Dismissed',
  disputed: 'He disputes it',
};
const FOR: Record<string, string> = { customer: 'for the customer', pro: 'for the technician', other: '' };
const first = (name: string | null) => (name ? name.split(' ')[0] : 'The technician');
const tel = (p: string) => `tel:+${p.replace(/^\+/, '')}`;

export function Cancellations() {
  const [r, setR] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | Category>('all');

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_cancellations');
    if (error) {
      return setProblem(
        /admin_cancellations|schema cache|does not exist/i.test(error.message)
          ? 'This page needs the database change 20261110100000_cancellations.sql. Run it in Supabase first.'
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

  const incidents = r?.incidents ?? [];
  const needs = incidents.filter((i) => i.needs_you);
  const others = incidents.filter((i) => !i.needs_you);
  const list = (r?.cancellations ?? []).filter((c) => filter === 'all' || c.category === filter);

  return (
    <>
      <Head icon="clock" title="Cancellations" />
      <p className="lead">
        Cancelling is free for customers and never creates a visit fee. Each cancellation is put in one category by the database, so it
        never counts against both people. Nothing here happens to anybody on its own: this page shows who to look at.
        {r ? (
          <>
            {' '}
            Reviews start at <strong>{r.late_cancels_at}</strong> late cancellations for a customer, or <strong>{r.late_arrivals_at}</strong> late
            arrivals or <strong>{r.no_shows_at}</strong> confirmed no-show{Number(r.no_shows_at) === 1 ? '' : 's'} for a technician, in {r.days} days
            (Settings → Flags).
          </>
        ) : null}
      </p>
      <nav className="tabs" aria-label="Cancellations">
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {r === null && !problem ? <p className="lead">Loading…</p> : null}

      {r ? (
        <div className="stack">
          <section className="stack" aria-labelledby="cx-need">
            <h2 id="cx-need">Needs you{needs.length + r.customers_to_review.length ? ` (${needs.length + r.customers_to_review.length})` : ''}</h2>
            {needs.length + r.customers_to_review.length === 0 ? <p className="card">Nothing needs you.</p> : null}
            <div className="list">
              {needs.map((i) => (
                <IncidentCard key={i.id} i={i} onDone={load} />
              ))}
              {r.customers_to_review.map((c) => (
                <ReviewCard key={c.customer_id} c={c} days={r.days} rows={r.cancellations.filter((x) => x.customer_id === c.customer_id && x.category === 'late')} onDone={load} />
              ))}
            </div>
          </section>

          <ArrivalSections />

          <NotHomeSections />

          <ReliabilitySections />

          <section className="card" aria-labelledby="cx-all">
            <h2 id="cx-all">Every cancellation</h2>
            <div className="chips" role="group" aria-label="Show">
              {(['all', 'late', 'normal', 'before_choosing', 'pro_late', 'no_show', 'not_home', 'guard', 'office', 'unclaimed', 'before_rules'] as const).map((k) => (
                <button key={k} className={filter === k ? 'chip on' : 'chip'} aria-pressed={filter === k} onClick={() => setFilter(k)}>
                  {k === 'all' ? 'All' : CATEGORY[k]}
                </button>
              ))}
            </div>
            {filter !== 'all' ? <p className="muted small">{MEANS[filter]}</p> : null}
            {list.length === 0 ? <p className="muted">None.</p> : null}
            <div className="lines">
              {list.map((c) => (
                <CancelLine key={c.id} c={c} />
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="cx-pros">
            <h2 id="cx-pros">Technicians, last {r.days} days</h2>
            {r.pros.length === 0 ? <p className="muted">Nobody has been late.</p> : null}
            {r.pros.length ? (
              <div className="scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Technician</th>
                      <th>Late arrivals</th>
                      <th>Confirmed no-shows</th>
                      <th>Waiting on you</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.pros.map((p) => (
                      <tr key={p.pro_id}>
                        <td>{p.pro ?? 'No longer on Pechkas'}</td>
                        <td>{p.late_arrivals}</td>
                        <td>{p.no_shows}</td>
                        <td>{p.waiting}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </section>

          <section className="card" aria-labelledby="cx-inc">
            <h2 id="cx-inc">Late arrivals and no-shows</h2>
            <p className="muted small">A dismissed one stops counting. He reads your note in the app.</p>
            {others.length === 0 ? <p className="muted">None.</p> : null}
            <div className="lines">
              {others.map((i) => (
                <IncidentLine key={i.id} i={i} onDone={load} />
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

/** What the record says happened, in a line or two. */
function IncidentFacts({ i }: { i: Incident }) {
  return (
    <div className="evidence">
      <p>
        {i.kind === 'no_show'
          ? `Had not arrived 30 minutes after his time ended (${i.minutes_late ?? '?'} minutes after it began).`
          : i.how === 'cancelled_waiting'
            ? `The customer cancelled after waiting ${i.minutes_late ?? '?'} minutes from the start of his time.`
            : `Arrived ${i.minutes_late ?? '?'} minutes after his time began${i.arrived_at ? `, at ${when(i.arrived_at)}` : ''}.`}
        {i.window_start ? ` His time began ${when(i.window_start)}.` : ''}
      </p>
      {i.pro_text ? (
        <p>
          <strong>{first(i.pro)} says:</strong> “{i.pro_text}”
        </p>
      ) : null}
      {i.office_note ? (
        <p className="muted">
          The office{i.decided_by_name ? ` (${i.decided_by_name})` : ''}
          {i.decided_at ? `, ${when(i.decided_at)}` : ''}: “{i.office_note}”
        </p>
      ) : null}
    </div>
  );
}

function decide(i: Incident, confirm: boolean) {
  return (note: string) => ask('admin_incident', { p_incident: i.id, p_confirm: confirm, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
}

/** A potential no-show or a disputed record: ring both, then confirm or dismiss. */
function IncidentCard({ i, onDone }: { i: Incident; onDone: () => void }) {
  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">{STATUS[i.status]}</p>
          <h2>
            {i.ref} · {i.title}
          </h2>
          <p className="muted">
            {i.trade} · {i.sector} · {i.kind === 'no_show' ? 'not arrived' : 'late arrival'} · found {when(i.detected_at)}
            {i.job_status === 'assigned' ? ' · the job is still on' : ''}
          </p>
        </div>
      </div>
      <People customer={i.customer} customerPhone={i.customer_phone} pro={i.pro} proPhone={i.pro_phone} />
      <IncidentFacts i={i} />
      <Decide
        label={`What you found (${first(i.pro)} reads this in the app)`}
        choices={[
          { text: i.kind === 'no_show' ? 'Confirm: he did not come' : 'Confirm: he was late', run: decide(i, true) },
          { text: 'Dismiss: it does not count', secondary: true, run: decide(i, false) },
        ]}
        onDone={onDone}
      />
      <p className="muted small">Confirming only records it. Nothing is suspended or charged.</p>
    </article>
  );
}

/** A record already settled or simply recorded, with the decision still open on a recorded one. */
function IncidentLine({ i, onDone }: { i: Incident; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="line-item">
      <p>
        <strong>{i.ref}</strong> · {i.pro ?? 'No longer on Pechkas'} · {i.kind === 'no_show' ? 'not arrived' : `late ${i.minutes_late ?? '?'} min`} ·{' '}
        {STATUS[i.status]} · {when(i.detected_at)}{' '}
        <button className="secondary small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Details'}
        </button>
      </p>
      {open ? (
        <>
          <IncidentFacts i={i} />
          {i.status === 'recorded' ? (
            <Decide
              label={`What you found (${first(i.pro)} reads this in the app)`}
              choices={[
                { text: 'Confirm', run: decide(i, true) },
                { text: 'Dismiss: it does not count', secondary: true, run: decide(i, false) },
              ]}
              onDone={onDone}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}

/** A customer who has reached the review line: ring her, then note what you found. */
function ReviewCard({ c, days, rows, onDone }: { c: ToReview; days: number; rows: Cancellation[]; onDone: () => void }) {
  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">Customer to review</p>
          <h2>
            {c.customer}: {c.late} late cancellations in {days} days
          </h2>
          <p className="muted">{c.unreviewed} not yet reviewed. Cancelling stays free; this is only for the office to know.</p>
        </div>
      </div>
      <div className="buttons">
        {c.phone ? <a className="call" href={tel(c.phone)}>Call {c.customer} · {shown(c.phone)}</a> : <span className="muted">No number for {c.customer}.</span>}
      </div>
      <ul>
        {rows.map((x) => (
          <li key={x.id}>
            {x.ref} · {when(x.cancelled_at)} · {x.stage === 'arrived' ? 'at the door' : x.stage === 'on_way' ? 'after he set off' : 'close to his time'}
            {x.reason_code ? ` · ${REASON[x.reason_code] ?? x.reason_code}` : ''}
            {x.reviewed_at ? ' · reviewed' : ''}
          </li>
        ))}
      </ul>
      <Decide
        label="What you found (kept on her record; she is not told)"
        choices={[{ text: 'Mark reviewed', run: (note) => ask('admin_review_cancellations', { p_customer: c.customer_id, p_note: note }) as Promise<{ ok: boolean; why?: string }> }]}
        onDone={onDone}
      />
    </article>
  );
}

/** One cancellation in the full list. */
function CancelLine({ c }: { c: Cancellation }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="line-item">
      <p>
        <strong>{c.ref}</strong> · {CATEGORY[c.category]} · {c.customer}
        {c.pro ? ` · ${first(c.pro)}` : ''} · {when(c.cancelled_at)}{' '}
        <button className="secondary small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Details'}
        </button>
      </p>
      {open ? (
        <div className="evidence">
          <p>{MEANS[c.category]}</p>
          <p>
            {c.trade} · {c.title} · {c.sector}
          </p>
          <p>
            Cancelled by {c.cancelled_by === 'office' ? `the office ${FOR[c.cancel_for ?? 'other']}`.trim() : c.cancelled_by === 'nobody' ? 'nobody (closed by the clock)' : c.cancelled_by === 'pro' ? 'the technician (he could not get in)' : 'the customer'}
            {c.stage ? ` · at step: ${c.stage.replace('_', ' ')}` : ''}
          </p>
          {c.reason_code || c.reason_text ? (
            <p>
              Reason: {c.reason_code ? REASON[c.reason_code] ?? c.reason_code : ''}
              {c.reason_text ? ` “${c.reason_text}”` : ''}
            </p>
          ) : null}
          <p className="muted">
            {c.window_start ? `His time began ${when(c.window_start)}. ` : 'No window on this job. '}
            {c.on_way_at ? `On my way ${when(c.on_way_at)}. ` : ''}
            {c.arrived_at ? `Arrived ${when(c.arrived_at)}.` : ''}
          </p>
          {c.reviewed_at ? (
            <p className="muted">
              Reviewed by {c.reviewed_by_name ?? 'the office'}, {when(c.reviewed_at)}: “{c.review_note}”
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
