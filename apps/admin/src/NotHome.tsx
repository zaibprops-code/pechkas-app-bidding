import { useCallback, useEffect, useState } from 'react';
import { rupees } from '@pechkas/shared';
import { ask, supabase } from './supabase.ts';
import { Decide, Evidence, People, when } from './Guarantee.tsx';
import { LocationChecks, type Check } from './Arrivals.tsx';

/**
 * Nobody home and guard refused entry, from public.admin_not_home_reports()
 * (the owner's decision D34). A report is the technician's word, not a
 * finding: the office confirms or rejects every one, with a note both read.
 * Only a confirmed "nobody home", with him on time, counts towards the
 * customer's review; a guard report counts against nobody. Nothing here
 * charges or pays anybody: the uncompensated visits are kept to see what
 * no-shows cost, before deciding whether Pechkas should pay for them.
 */

type Report = {
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
  reason: 'nobody_home' | 'guard';
  status: 'asking' | 'coming' | 'submitted' | 'disputed' | 'confirmed' | 'rejected';
  arrived_at: string | null;
  window_start: string | null;
  pro_was_late: boolean;
  minutes_late: number | null;
  asked_at: string;
  customer_told_at: string | null;
  coming_at: string | null;
  deadline: string;
  submitted_at: string | null;
  photo: string | null;
  pro_note: string | null;
  customer_text: string | null;
  customer_said_at: string | null;
  office_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  needs_you: boolean;
  /** Location evidence (arrival_by_location): strong, partial or unverified, and every check. */
  evidence?: 'strong' | 'partial' | 'unverified' | null;
  no_camera?: boolean;
  pin?: { lat: number; lng: number } | null;
  checks?: Check[];
  history: { at: string; what: string; by: string }[];
  told: { at: string; kind: string; phones: number }[];
};
type Visit = { job_ref: string; trade: string; sector: string; day: string; reason: 'nobody_home' | 'guard'; pro: string | null; minutes_waited: number; visit_fee_ref_paisa: number | null; outcome: string };
type Month = { month: string; visits: number; nobody_home: number; guard: number; confirmed: number; minutes_waited: number; visit_fee_ref_paisa: number | null };
type Data = { reports: Report[]; uncompensated: Visit[]; uncompensated_by_month: Month[] };

const REASON = { nobody_home: 'Nobody home', guard: 'Guard refused entry' } as const;
const STATUS: Record<Report['status'], string> = {
  asking: 'Customer told, waiting for her',
  coming: 'She said she is coming',
  submitted: 'Report submitted · awaiting review',
  disputed: 'Disputed: she says she was home',
  confirmed: 'Confirmed',
  rejected: 'Rejected',
};
const STEP: Record<string, string> = {
  arrived: 'He tapped I have arrived',
  not_home_asked: 'He asked Pechkas to tell her',
  not_home_coming: 'She tapped I am coming',
  not_home_reported: 'He reported it',
  not_home_disputed: 'She said she was home',
  not_home_decided: 'The office decided',
  cancelled: 'The job closed',
};
const TOLD: Record<string, string> = {
  arrived: 'Customer told he had arrived',
  not_home_ask: 'Customer told nobody answered',
  guard_ask: 'Customer told about the guard',
  not_home_coming: 'Technician told she is coming',
  not_home_reported: 'Customer told the job closed',
  guard_reported: 'Customer told the job closed',
  not_home_disputed_pro: 'Technician told she disagrees',
  not_home_decided: 'Customer told of the decision',
  not_home_decided_pro: 'Technician told of the decision',
};
const EVIDENCE = {
  strong: 'Strong: his arrival and his report were both verified by location',
  partial: 'Partial: one location check verified, or a photo',
  unverified: 'Unverified: no location check verified and no photo',
} as const;
const first = (name: string | null) => (name ? name.split(' ')[0] : 'The technician');
const money = (p: number | null | undefined) => rupees(p === null || p === undefined ? p : Number(p));

export function NotHomeSections() {
  const [d, setD] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_not_home_reports');
    if (error) {
      return setProblem(
        /admin_not_home_reports|schema cache|does not exist/i.test(error.message)
          ? 'The nobody-home reports need the database change 20261111000000_nobody_home.sql. Run it in Supabase first.'
          : `Could not load the nobody-home reports: ${error.message}`,
      );
    }
    setProblem(null);
    setD((data as Data | null) ?? null);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  if (problem) return <p className="error" role="alert">{problem}</p>;
  if (!d) return null;
  const needs = d.reports.filter((r) => r.needs_you);
  const rest = d.reports.filter((r) => !r.needs_you);

  return (
    <>
      <section className="stack" aria-labelledby="nh-need">
        <h2 id="nh-need">Could not get in{needs.length ? ` (${needs.length})` : ''}</h2>
        <p className="muted small">
          A report is the technician's word, not a finding. Only a confirmed "nobody home", with him on time, counts towards a review of the
          customer; a guard report counts against nobody; a disputed one counts for nobody until you decide. Nothing is charged or paid.
        </p>
        {needs.length === 0 ? <p className="card">No reports waiting.</p> : null}
        <div className="list">
          {needs.map((r) => (
            <ReportCard key={r.id} r={r} onDone={load} />
          ))}
        </div>
      </section>

      {rest.length ? (
        <section className="card" aria-labelledby="nh-rest">
          <h2 id="nh-rest">Earlier reports, and customers being asked now</h2>
          <div className="lines">
            {rest.map((r) => (
              <ReportLine key={r.id} r={r} />
            ))}
          </div>
        </section>
      ) : null}

      <section className="card" aria-labelledby="nh-cost">
        <h2 id="nh-cost">Uncompensated visits</h2>
        <p className="muted small">
          Every trip a technician made that nobody paid for. The visit fee is the figure fixed on each job, shown only to judge the cost: it
          was never charged to the customer and never paid to him.
        </p>
        {d.uncompensated_by_month.length === 0 ? <p className="muted">None yet.</p> : null}
        {d.uncompensated_by_month.length ? (
          <div className="scroll">
            <table className="ledger">
              <thead>
                <tr>
                  <th>Month</th>
                  <th>Visits</th>
                  <th>Nobody home</th>
                  <th>Guard</th>
                  <th>Confirmed</th>
                  <th>Minutes waited</th>
                  <th>Visit fees not paid</th>
                </tr>
              </thead>
              <tbody>
                {d.uncompensated_by_month.map((m) => (
                  <tr key={m.month}>
                    <td>{m.month}</td>
                    <td>{m.visits}</td>
                    <td>{m.nobody_home}</td>
                    <td>{m.guard}</td>
                    <td>{m.confirmed}</td>
                    <td>{m.minutes_waited}</td>
                    <td>{money(m.visit_fee_ref_paisa)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        {d.uncompensated.length ? (
          <details>
            <summary>Each visit ({d.uncompensated.length})</summary>
            <ul>
              {d.uncompensated.map((v, i) => (
                <li key={i}>
                  {v.day} · {v.job_ref} · {v.trade} · {v.sector} · {REASON[v.reason]} · {v.pro ?? 'no longer on Pechkas'} · waited {v.minutes_waited} min ·{' '}
                  {money(v.visit_fee_ref_paisa)} · {v.outcome}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </>
  );
}

/** The times, the photo, what each side said, and every step and message, so the office can judge. */
function Facts({ r }: { r: Report }) {
  return (
    <>
      {r.evidence ? (
        <p>
          <strong>Evidence:</strong> {EVIDENCE[r.evidence]}
          {r.no_camera ? ' · he said his camera was not working' : ''}
        </p>
      ) : null}
      {r.checks ? <LocationChecks checks={r.checks} pin={r.pin ?? null} /> : null}
      <div className="evidence">
        <p>
          {r.window_start ? `His time began ${when(r.window_start)}. ` : 'No window on this job. '}
          {r.arrived_at ? `He tapped I have arrived ${when(r.arrived_at)}. ` : ''}
          {r.submitted_at ? `He reported ${when(r.submitted_at)}.` : `She has until ${when(r.deadline)}.`}
        </p>
        {r.pro_was_late ? (
          <p>
            <strong>He arrived {r.minutes_late ?? 'more than 30'} minutes after his time began.</strong> This report can never count against
            her.
          </p>
        ) : null}
        {r.pro_note ? (
          <p>
            <strong>{first(r.pro)} wrote:</strong> “{r.pro_note}”
          </p>
        ) : null}
        {r.customer_text ? (
          <p>
            <strong>{r.customer} says:</strong> “{r.customer_text}”
          </p>
        ) : null}
        {r.office_note ? (
          <p className="muted">
            The office{r.decided_by_name ? ` (${r.decided_by_name})` : ''}
            {r.decided_at ? `, ${when(r.decided_at)}` : ''}: “{r.office_note}”
          </p>
        ) : null}
      </div>
      {r.photo ? <Evidence title="His photo of the gate or door" paths={[r.photo]} /> : null}
      <details>
        <summary>What happened, and who was told ({r.history.length + r.told.length})</summary>
        <ul>
          {[...r.history.map((h) => ({ at: h.at, text: `${STEP[h.what] ?? h.what} · by ${h.by}` })), ...r.told.map((t) => ({ at: t.at, text: `${TOLD[t.kind] ?? t.kind} (${t.phones} phone${t.phones === 1 ? '' : 's'})` }))]
            .sort((a, b) => a.at.localeCompare(b.at))
            .map((x, i) => (
              <li key={i}>
                {when(x.at)} · {x.text}
              </li>
            ))}
        </ul>
      </details>
    </>
  );
}

function ReportCard({ r, onDone }: { r: Report; onDone: () => void }) {
  const decide = (confirm: boolean) => (note: string) =>
    ask('admin_not_home', { p_report: r.id, p_confirm: confirm, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">
            {REASON[r.reason]} · {STATUS[r.status]}
          </p>
          <h2>
            {r.ref} · {r.title}
          </h2>
          <p className="muted">
            {r.trade} · {r.sector}
          </p>
        </div>
      </div>
      <People customer={r.customer} customerPhone={r.customer_phone} pro={r.pro} proPhone={r.pro_phone} />
      <Facts r={r} />
      <Decide
        label="What you found (both of them read this in the app)"
        choices={[
          { text: r.reason === 'guard' ? 'Confirm: the guard refused him' : 'Confirm: nobody was home', run: decide(true) },
          { text: 'Reject: it was not as he said', secondary: true, run: decide(false) },
        ]}
        onDone={onDone}
      />
      <p className="muted small">
        Ring both first. Confirming only records it.
        {r.reason === 'guard' || r.pro_was_late ? ' This one counts against neither of them.' : ' Three confirmed in 60 days asks you to review her account.'}
      </p>
    </article>
  );
}

function ReportLine({ r }: { r: Report }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="line-item">
      <p>
        <strong>{r.ref}</strong> · {REASON[r.reason]} · {STATUS[r.status]} · {r.customer} · {first(r.pro)} · {when(r.submitted_at ?? r.asked_at)}{' '}
        <button className="secondary small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Details'}
        </button>
      </p>
      {open ? <Facts r={r} /> : null}
    </div>
  );
}
