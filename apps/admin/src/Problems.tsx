import { useCallback, useEffect, useState } from 'react';
import { Head } from './Duo.tsx';
import { rupees } from '@pechkas/shared';
import { ask, supabase } from './supabase.ts';
import { shown } from './phones.ts';

/**
 * Everything somebody has told Pechkas is wrong: emergencies first, then
 * guarantee claims and problems. Each has the address, both numbers to ring
 * and, for an emergency, where the phone was. Nothing is closed without a
 * note of what was done.
 */

type Problem = {
  id: string;
  kind: 'problem' | 'guarantee' | 'emergency';
  side: 'customer' | 'pro';
  body: string | null;
  lat: number | null;
  lng: number | null;
  mistake: boolean;
  status: 'open' | 'closed';
  office_note: string | null;
  created_at: string;
  closed_at: string | null;
  closed_by: string | null;
  urgent: boolean;
  job: { id: string; ref: string; title: string; status: string; stage: string | null; address: string; job_lat: number | null; job_lng: number | null; finished_at: string | null; collect_paisa: number | null };
  customer: { name: string; phone: string | null };
  pro: { name: string; phone: string | null } | null;
};

const KIND = { emergency: 'EMERGENCY', guarantee: 'Guarantee claim', problem: 'Problem' } as const;
const time = (t: string) => new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });
const tel = (p: string) => `tel:+${p.replace(/^\+/, '')}`;
const map = (lat: number, lng: number) => `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;

export function Problems() {
  const [status, setStatus] = useState<'open' | 'closed'>('open');
  const [rows, setRows] = useState<Problem[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_problems', { p_status: status });
    if (error) return setProblem(`Could not load: ${error.message}`);
    setProblem(null);
    setRows((data as Problem[]) ?? []);
  }, [status]);

  useEffect(() => {
    setRows(null);
    load();
    // Every 15 seconds: an emergency must not wait for a click.
    const t = setInterval(load, 15000);
    return () => clearInterval(t);
  }, [load]);

  return (
    <>
      <Head icon="help" title="Problems" />
      <nav className="tabs" aria-label="Problems">
        <button className={status === 'open' ? 'tab on' : 'tab'} aria-pressed={status === 'open'} onClick={() => setStatus('open')}>Open</button>
        <button className={status === 'closed' ? 'tab on' : 'tab'} aria-pressed={status === 'closed'} onClick={() => setStatus('closed')}>Closed</button>
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {rows === null ? <p className="lead">Loading…</p> : null}
      {rows?.length === 0 ? <p className="lead">{status === 'open' ? 'Nothing open. Nobody has told us anything is wrong.' : 'Nothing closed yet.'}</p> : null}
      <div className="list">
        {rows?.map((p) => <ProblemCard key={p.id} p={p} onChanged={load} />)}
      </div>
    </>
  );
}

function ProblemCard({ p, onChanged }: { p: Problem; onChanged: () => void }) {
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const who = p.side === 'customer' ? `The customer, ${p.customer.name}` : `The technician, ${p.pro?.name ?? ''}`;

  async function close() {
    setBusy(true);
    const r = await ask('admin_close_problem', { p_id: p.id, p_note: note });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    onChanged();
  }

  return (
    <article className={p.urgent ? 'card urgent' : 'card'}>
      <div className="card-head">
        <div>
          <p className={p.kind === 'emergency' && !p.mistake ? 'kind emergency' : 'kind'}>
            {KIND[p.kind]}
            {p.mistake ? ' — pressed by mistake, they say' : ''}
          </p>
          <h2>
            {p.job.ref} · {p.job.title}
          </h2>
          <p className="muted">
            {who} · {time(p.created_at)}
          </p>
        </div>
      </div>
      {p.body && p.kind !== 'emergency' ? <p className="about">“{p.body}”</p> : null}
      <p>
        <strong>Where:</strong> {p.job.address}
        {p.job.job_lat !== null && p.job.job_lng !== null ? (
          <>
            {' · '}
            <a href={map(p.job.job_lat, p.job.job_lng)} target="_blank" rel="noreferrer">the job's pin</a>
          </>
        ) : null}
      </p>
      {p.lat !== null && p.lng !== null ? (
        <p>
          <strong>The phone was here when the button was pressed:</strong>{' '}
          <a href={map(p.lat, p.lng)} target="_blank" rel="noreferrer">open in Google Maps</a>
        </p>
      ) : p.kind === 'emergency' ? (
        <p className="muted">The phone did not say where it was.</p>
      ) : null}
      <p className="muted">
        Job: {p.job.status}
        {p.job.stage ? ` · ${p.job.stage.replace('_', ' ')}` : ''}
        {p.job.collect_paisa ? ` · collected ${rupees(p.job.collect_paisa)}` : ''}
        {p.job.finished_at ? ` · finished ${time(p.job.finished_at)}` : ''}
      </p>
      <div className="buttons">
        {p.customer.phone ? <a className="call" href={tel(p.customer.phone)}>Call {p.customer.name} · {shown(p.customer.phone)}</a> : null}
        {p.pro?.phone ? <a className="call" href={tel(p.pro.phone)}>Call {p.pro.name.split(' ')[0]} · {shown(p.pro.phone)}</a> : null}
      </div>
      {p.status === 'open' ? (
        <section className="decide">
          <label>
            What was done about it (kept in the record)
            <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="buttons">
            <button disabled={busy} onClick={close}>Close it</button>
          </div>
          {msg ? <p className="error" role="alert">{msg}</p> : null}
        </section>
      ) : (
        <p>
          <strong>Closed {p.closed_at ? time(p.closed_at) : ''}{p.closed_by ? ` by ${p.closed_by}` : ''}:</strong> {p.office_note}
        </p>
      )}
    </article>
  );
}
