import { useCallback, useEffect, useState } from 'react';
import { ask, supabase } from './supabase.ts';
import { Decide, People, when } from './Guarantee.tsx';

/**
 * Arrivals the location check could not verify, from public.admin_arrivals()
 * (arrival_by_location, the owner's decision). A failed check is never guilt:
 * a poor signal, a wrong pin or a refused permission ask the office to look.
 * The office approves (he was there) or rejects (he was not), with a reason
 * kept for good. Coordinates appear only here, as links to Google Maps, and
 * only while they are kept (90 days at most).
 */

export type Check = {
  event: 'arrived' | 'not_home';
  result: 'verified' | 'too_far' | 'poor_accuracy' | 'stale' | 'faked' | 'no_pin' | 'no_location' | 'outside_pakistan';
  distance_m: number | null;
  accuracy_m: number | null;
  lat: number | null;
  lng: number | null;
  mocked: boolean | null;
  app_reason: 'denied' | 'unavailable' | 'older_app' | null;
  received_at: string;
  erased: boolean;
};
type Arrival = {
  job_id: string;
  ref: string;
  trade: string;
  title: string;
  sector: string;
  status: string;
  stage: string | null;
  customer: string;
  customer_phone: string | null;
  pro: string | null;
  pro_phone: string | null;
  arrived_at: string;
  window_start: string | null;
  review_status: 'pending' | 'rejected';
  review_note: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  pin: { lat: number; lng: number } | null;
  needs_you: boolean;
  checks: Check[];
};
type ProCount = { pro_id: string; pro: string | null; unverified: number; verified: number; approved: number; code: number };
type Data = { radius_m: number; accuracy_m: number; keep_days: number; review_at: number; arrivals: Arrival[]; pros: ProCount[] };

const RESULT: Record<Check['result'], string> = {
  verified: 'Verified',
  too_far: 'Too far from the pin',
  poor_accuracy: 'Location not precise enough',
  stale: 'Old or reused reading',
  faked: 'Phone reported a fake location',
  no_pin: 'The job has no pin',
  no_location: 'No location sent',
  outside_pakistan: 'Reading outside Pakistan',
};
const REASON = { denied: 'he refused location on his phone', unavailable: 'his phone could not get a position', older_app: 'an older copy of the app' } as const;
const EVENT = { arrived: 'I have arrived', not_home: 'Nobody home report' } as const;
const maps = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

/** Every check on a job: what it found, and the two points as links while the coordinates are kept. */
export function LocationChecks({ checks, pin }: { checks: Check[]; pin: { lat: number; lng: number } | null }) {
  if (!checks.length) return <p className="muted small">No location check on this job.</p>;
  return (
    <div className="evidence">
      <h3>Location checks</h3>
      <ul>
        {checks.map((c, i) => (
          <li key={i}>
            {when(c.received_at)} · {EVENT[c.event]} · <strong>{RESULT[c.result]}</strong>
            {c.distance_m !== null ? ` · ${c.distance_m} m from the pin` : ''}
            {c.accuracy_m !== null ? ` · accuracy ${c.accuracy_m} m` : ''}
            {c.app_reason ? ` · ${REASON[c.app_reason]}` : ''}
            {c.lat !== null && c.lng !== null ? (
              <>
                {' · '}
                <a href={maps(c.lat, c.lng)} target="_blank" rel="noreferrer">
                  Where he was
                </a>
              </>
            ) : c.erased ? ' · exact point erased after the keeping time' : ''}
          </li>
        ))}
      </ul>
      {pin ? (
        <p className="muted small">
          <a href={maps(pin.lat, pin.lng)} target="_blank" rel="noreferrer">
            The customer's pin
          </a>
          . A pin can be on the wrong house; ring her if the distance looks odd.
        </p>
      ) : null}
    </div>
  );
}

export function ArrivalSections() {
  const [d, setD] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_arrivals');
    if (error) {
      return setProblem(
        /admin_arrivals|schema cache|does not exist/i.test(error.message)
          ? 'Arrival checks need the database change 20261111100000_arrival_by_location.sql. Run it in Supabase first.'
          : `Could not load the arrival checks: ${error.message}`,
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
  const needs = d.arrivals.filter((a) => a.needs_you);
  const rest = d.arrivals.filter((a) => !a.needs_you);
  return (
    <>
      <section className="stack" aria-labelledby="ar-need">
        <h2 id="ar-need">Arrivals to check{needs.length ? ` (${needs.length})` : ''}</h2>
        <p className="muted small">
          "I have arrived" is verified when he is within {d.radius_m} m of her pin with accuracy of {d.accuracy_m} m or better. These were not.
          A poor signal, a wrong pin or a refused permission is not misconduct: ring, then approve or reject. {d.review_at} not approved in 60 days
          asks you to review him (Flags). Exact points are erased after {d.keep_days} days.
        </p>
        {needs.length === 0 ? <p className="card">No arrivals waiting.</p> : null}
        <div className="list">
          {needs.map((a) => (
            <ArrivalCard key={a.job_id} a={a} onDone={load} />
          ))}
        </div>
      </section>
      {rest.length || d.pros.length ? (
        <section className="card" aria-labelledby="ar-rest">
          <h2 id="ar-rest">Arrivals, last 60 days</h2>
          {d.pros.length ? (
            <div className="scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Technician</th>
                    <th>Not verified</th>
                    <th>Verified by location</th>
                    <th>Approved by you</th>
                    <th>Start code</th>
                  </tr>
                </thead>
                <tbody>
                  {d.pros.map((p) => (
                    <tr key={p.pro_id}>
                      <td>{p.pro ?? 'No longer on Pechkas'}</td>
                      <td>{p.unverified}</td>
                      <td>{p.verified}</td>
                      <td>{p.approved}</td>
                      <td>{p.code}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : null}
          <div className="lines">
            {rest.map((a) => (
              <ArrivalLine key={a.job_id} a={a} onDone={load} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}

function decide(a: Arrival, approve: boolean) {
  return (note: string) => ask('admin_arrival', { p_job: a.job_id, p_approve: approve, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
}

function ArrivalCard({ a, onDone }: { a: Arrival; onDone: () => void }) {
  const last = a.checks.filter((c) => c.event === 'arrived').slice(-1)[0];
  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">Arrival not verified{last ? ` · ${RESULT[last.result]}` : ''}</p>
          <h2>
            {a.ref} · {a.title}
          </h2>
          <p className="muted">
            {a.trade} · {a.sector} · tapped {when(a.arrived_at)}
            {a.window_start ? ` · his time began ${when(a.window_start)}` : ''}
            {a.status === 'assigned' ? ' · the job is still on' : ` · the job is ${a.status}`}
          </p>
        </div>
      </div>
      <People customer={a.customer} customerPhone={a.customer_phone} pro={a.pro} proPhone={a.pro_phone} />
      <LocationChecks checks={a.checks} pin={a.pin} />
      <Decide
        label="What you found (he reads this in the app; kept for good)"
        choices={[
          { text: 'Approve: he was there', run: decide(a, true) },
          { text: 'Reject: he was not there', secondary: true, run: decide(a, false) },
        ]}
        onDone={onDone}
      />
      <p className="muted small">Approving counts it as an arrival. Rejecting only records it: nothing is suspended or charged.</p>
    </article>
  );
}

function ArrivalLine({ a, onDone }: { a: Arrival; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="line-item">
      <p>
        <strong>{a.ref}</strong> · {a.pro ?? 'No longer on Pechkas'} · {a.review_status === 'rejected' ? 'Rejected' : 'Not verified'} · {when(a.arrived_at)}{' '}
        <button className="secondary small" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? 'Hide' : 'Details'}
        </button>
      </p>
      {open ? (
        <>
          {a.review_note ? (
            <p className="muted">
              {a.reviewed_by_name ?? 'The office'}
              {a.reviewed_at ? `, ${when(a.reviewed_at)}` : ''}: “{a.review_note}”
            </p>
          ) : null}
          <LocationChecks checks={a.checks} pin={a.pin} />
          {a.review_status === 'rejected' ? (
            <Decide label="Changed your mind? Say why (kept for good)" choices={[{ text: 'Approve: he was there', run: decide(a, true) }]} onDone={onDone} />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
