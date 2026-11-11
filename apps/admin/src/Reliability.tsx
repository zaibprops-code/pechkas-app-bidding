import { useCallback, useEffect, useState } from 'react';
import { ask, supabase } from './supabase.ts';
import { Decide, when } from './Guarantee.tsx';
import { shown } from './phones.ts';

/**
 * Who keeps failing customers, from public.admin_reliability() (the owner's
 * decision D11). The counts are the database's; the suggested step is the
 * owner's ladder — first confirmed no-show: contact him; second in 60 days:
 * consider a 1 to 3 day pause; third: review his approval — and it is only a
 * suggestion. Nothing on this page happens to anybody until the office presses
 * a button, and a pause stops only NEW offers: jobs he has go on. Every pause
 * and lift is kept with its reason and who did it, and he reads the reason.
 */

type Pause = { action: 'pause' | 'lift'; days: number | null; until: string | null; note: string; by: string | null; at: string };
type Pro = {
  pro_id: string;
  pro: string;
  phone: string | null;
  no_shows: number;
  late_arrivals: number;
  late_withdrawals: number;
  withdrawals: number;
  replaced: number;
  suggestion: 'contact' | 'pause' | 'review' | null;
  paused_until: string | null;
  pauses: Pause[];
};
type Withdrawal = {
  job_id: string;
  ref: string;
  trade: string;
  pro: string | null;
  kind: 'normal' | 'late';
  reason: string;
  note: string | null;
  at: string;
  window_start: string | null;
  stage: string | null;
  job_status: string;
};
type Replaced = { job_id: string; ref: string; trade: string; pro: string | null; at: string; window_start: string | null; eta_at: string | null; etas: number; job_status: string };
type Data = { days: number; late_withdrawals_at: number; pros: Pro[]; withdrawals: Withdrawal[]; replaced: Replaced[] };

const SUGGEST = {
  contact: 'Suggested: ring him. One confirmed no-show.',
  pause: 'Suggested: consider pausing his offers for 1 to 3 days. Two confirmed no-shows.',
  review: 'Suggested: review his approval. Three or more confirmed no-shows.',
} as const;
const REASON: Record<string, string> = {
  emergency: 'A family emergency',
  vehicle: 'Bike or car broke down',
  other_job: 'Last job taking longer',
  cannot_reach: 'Cannot reach the address',
  unwell: 'Unwell',
  other: 'Other',
};
const STAGE: Record<string, string> = { chosen: 'before setting off', on_way: 'on his way', arrived: 'at the door, arrival not verified' };

export function ReliabilitySections() {
  const [d, setD] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_reliability');
    if (error) {
      return setProblem(
        /admin_reliability|schema cache|does not exist/i.test(error.message)
          ? 'Reliability needs the database change 20261112000000_reliability.sql. Run it in Supabase first.'
          : `Could not load reliability: ${error.message}`,
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
  return (
    <>
      <section className="stack" aria-labelledby="rel-pros">
        <h2 id="rel-pros">Reliability, last {d.days} days</h2>
        <p className="muted small">
          A suggested step is only a suggestion: nothing is suspended, paused or charged until you press a button. A pause stops his new offers
          for 1, 3 or 7 days; jobs he already has go on, it ends by itself, and he reads your reason. {d.late_withdrawals_at} late "I can't
          come" in {d.days} days also show under Flags.
        </p>
        {d.pros.length === 0 ? <p className="card">Nobody to look at.</p> : null}
        <div className="list">
          {d.pros.map((p) => (
            <ProCard key={p.pro_id} p={p} onDone={load} />
          ))}
        </div>
      </section>

      {d.withdrawals.length ? (
        <section className="card" aria-labelledby="rel-wd">
          <h2 id="rel-wd">"I can't come" ({d.withdrawals.length})</h2>
          <p className="muted small">The job went straight back to other technicians each time, with everything the customer posted.</p>
          <ul>
            {d.withdrawals.map((w) => (
              <li key={`${w.job_id}-${w.at}`}>
                {when(w.at)} · <strong>{w.ref}</strong> · {w.pro ?? 'No longer on Pechkas'} · {w.kind === 'late' ? <strong>Late</strong> : 'Normal'} ·{' '}
                {REASON[w.reason] ?? w.reason}
                {w.note ? ` · “${w.note}”` : ''}
                {w.stage ? ` · ${STAGE[w.stage] ?? w.stage}` : ''}
                {w.window_start ? ` · his time began ${when(w.window_start)}` : ''} · the job is now {w.job_status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {d.replaced.length ? (
        <section className="card" aria-labelledby="rel-rep">
          <h2 id="rel-rep">Customers who found another technician ({d.replaced.length})</h2>
          <p className="muted small">
            Not cancellations: the same job went to others. When he was more than 30 minutes late it is on his lateness record; just before his
            time with no fault of his, it counts as her late cancellation unless he had said he was running late.
          </p>
          <ul>
            {d.replaced.map((r) => (
              <li key={`${r.job_id}-${r.at}`}>
                {when(r.at)} · <strong>{r.ref}</strong> · {r.pro ?? 'No longer on Pechkas'}
                {r.window_start ? ` · his time began ${when(r.window_start)}` : ''}
                {r.etas ? ` · he said he was running late${r.eta_at ? `, by ${when(r.eta_at)}` : ''} (${r.etas}×)` : ''} · the job is now {r.job_status}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </>
  );
}

function ProCard({ p, onDone }: { p: Pro; onDone: () => void }) {
  const [open, setOpen] = useState(false);
  const pause = (days: number) => (note: string) =>
    ask('admin_pause_pro', { p_pro: p.pro_id, p_days: days, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
  const lift = (note: string) => ask('admin_lift_pause', { p_pro: p.pro_id, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
  return (
    <article className={`card${p.suggestion ? ' urgent' : ''}`}>
      <div className="card-head">
        <div>
          <p className="kind">{p.paused_until ? `Offers paused until ${when(p.paused_until)}` : p.suggestion ? SUGGEST[p.suggestion] : 'No step suggested'}</p>
          <h2>{p.pro}</h2>
          <p className="muted">
            {p.phone ? (
              <a href={`tel:+${p.phone.replace(/^\+/, '')}`}>{shown(p.phone)}</a>
            ) : (
              'No number'
            )}
          </p>
        </div>
      </div>
      <p>
        Confirmed no-shows <strong>{p.no_shows}</strong> · late arrivals <strong>{p.late_arrivals}</strong> · "I can't come"{' '}
        <strong>{p.withdrawals}</strong> ({p.late_withdrawals} late) · customers found another <strong>{p.replaced}</strong>
      </p>
      {p.pauses.length ? (
        <details>
          <summary>Pauses and lifts ({p.pauses.length})</summary>
          <ul>
            {p.pauses.map((x, i) => (
              <li key={i}>
                {when(x.at)} · {x.action === 'pause' ? `Paused ${x.days} day${x.days === 1 ? '' : 's'}, until ${x.until ? when(x.until) : ''}` : 'Lifted'} ·{' '}
                {x.by ?? 'the office'}: “{x.note}”
              </li>
            ))}
          </ul>
        </details>
      ) : null}
      {open ? (
        p.paused_until ? (
          <Decide label="Why are you lifting it? (he reads this; kept for good)" choices={[{ text: 'Lift the pause', run: lift }]} onDone={() => { setOpen(false); onDone(); }} />
        ) : (
          <Decide
            label="Why are you pausing his offers? (he reads this in the app; kept for good)"
            choices={[
              { text: 'Pause 1 day', run: pause(1) },
              { text: 'Pause 3 days', run: pause(3) },
              { text: 'Pause 7 days', secondary: true, run: pause(7) },
            ]}
            onDone={() => {
              setOpen(false);
              onDone();
            }}
          />
        )
      ) : (
        <button className="secondary" onClick={() => setOpen(true)}>
          {p.paused_until ? 'Lift the pause…' : 'Pause his new offers…'}
        </button>
      )}
      <p className="muted small">Ring him first. A pause withdraws his waiting offers and stops new ones; it never touches a job he has.</p>
    </article>
  );
}
