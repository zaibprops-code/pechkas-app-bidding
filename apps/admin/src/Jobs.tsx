import { useCallback, useEffect, useState } from 'react';
import { rupees, showMobile } from '@pechkas/shared';
import { ask, supabase } from './supabase.ts';

/**
 * Every job customers have posted, with what the office needs to act on it
 * by phone until bidding exists: the customer's number, the full address, a
 * map link, and the voice note, video and photos.
 *
 * The files are in a private bucket. Each one is opened through a signed link
 * that works for an hour, which the database only issues to the office.
 */
type MediaItem = { kind: 'voice' | 'video' | 'photo'; path: string; seconds: number | null };
type Job = {
  id: string;
  ref: string;
  trade: string;
  title: string;
  description: string | null;
  offered_paisa: number;
  list_paisa: number | null;
  when_kind: 'now' | 'today' | 'tomorrow';
  when_part: string | null;
  sector: string;
  street: string;
  house: string;
  landmark: string | null;
  lat: number | null;
  lng: number | null;
  power: 'on' | 'off' | null;
  parts: 'pro_buys' | 'customer_has' | null;
  gate_note: string | null;
  status: 'open' | 'cancelled';
  cancelled_by: 'customer' | 'office' | null;
  cancel_reason: string | null;
  created_at: string;
  customer_name: string;
  customer_phone: string | null;
  media: MediaItem[];
};

const TABS = [
  { status: 'open', label: 'Open' },
  { status: 'cancelled', label: 'Cancelled' },
] as const;

const WHEN = { now: 'As soon as possible', today: 'Today', tomorrow: 'Tomorrow' } as const;

export function Jobs({ trades }: { trades: Record<string, string> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['status']>('open');
  const [rows, setRows] = useState<Job[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setProblem(null);
    const { data, error } = await supabase.rpc('admin_jobs', { p_status: tab });
    if (error) {
      setProblem(`Could not load: ${error.message}`);
      setRows([]);
      return;
    }
    setRows((data as Job[]) ?? []);
  }, [tab]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  return (
    <>
      <h1>Jobs</h1>
      <nav className="tabs" aria-label="Jobs">
        {TABS.map((t) => (
          <button key={t.status} className={t.status === tab ? 'tab on' : 'tab'} aria-pressed={t.status === tab} onClick={() => setTab(t.status)}>
            {t.label}
          </button>
        ))}
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {rows === null ? <p className="lead">Loading…</p> : null}
      {rows?.length === 0 ? <p className="lead">No jobs here.</p> : null}
      <div className="list">
        {rows?.map((j) => <JobCard key={j.id} j={j} trade={trades[j.trade] ?? j.trade} onChange={load} />)}
      </div>
    </>
  );
}

function JobCard({ j, trade, onChange }: { j: Job; trade: string; onChange: () => void }) {
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function cancel() {
    setBusy(true);
    const r = await ask('admin_cancel_job', { p_job: j.id, p_reason: reason });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setReason('');
    setMsg(null);
    onChange();
  }

  const extras = [
    j.power === 'on' ? 'Electricity is on' : j.power === 'off' ? 'Load-shedding at the time of posting' : null,
    j.parts === 'pro_buys' ? 'Technician brings parts; customer pays the shop receipt' : j.parts === 'customer_has' ? 'Customer already has the part' : null,
    j.gate_note ? `Gate: ${j.gate_note}` : null,
  ].filter(Boolean);

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <p className="muted">{trade} · {j.ref} · posted {new Date(j.created_at).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' })}</p>
          <h2>{j.title}</h2>
        </div>
        <div className="price">
          <strong>{rupees(j.offered_paisa)}</strong>
          <span className="muted">{j.list_paisa ? `website ${rupees(j.list_paisa)}` : 'no website price'}</span>
        </div>
      </div>
      {j.description ? <p className="about">“{j.description}”</p> : null}
      <p>
        <strong>When:</strong> {WHEN[j.when_kind]}
        {j.when_part ? `, ${j.when_part}` : ''}
      </p>
      <p>
        <strong>Where:</strong> {j.house}, {j.street}, {j.sector}
        {j.landmark ? ` · ${j.landmark}` : ''}
        {j.lat !== null && j.lng !== null ? (
          <>
            {' · '}
            <a href={`https://www.google.com/maps/search/?api=1&query=${j.lat},${j.lng}`} target="_blank" rel="noreferrer">Open the pin in Google Maps</a>
          </>
        ) : null}
      </p>
      {extras.length ? <ul className="extras">{extras.map((e) => <li key={e}>{e}</li>)}</ul> : null}
      <div className="card-head">
        <p><strong>Customer:</strong> {j.customer_name}</p>
        {j.customer_phone ? <a className="call" href={`tel:+${j.customer_phone.replace(/^\+/, '')}`}>Call {showMobile(j.customer_phone)}</a> : null}
      </div>
      {j.media.length ? <MediaList items={j.media} /> : null}
      {j.status === 'cancelled' ? (
        <p className="reason">
          <strong>{j.cancelled_by === 'office' ? 'Cancelled by the office' : 'Cancelled by the customer'}</strong>
          {j.cancel_reason ? `: ${j.cancel_reason}` : ''}
        </p>
      ) : (
        <section className="decide">
          <label>
            Reason, if cancelling. The customer will see it.
            <input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} />
          </label>
          <div className="buttons">
            <button className="danger" disabled={busy} onClick={cancel}>Cancel this job</button>
          </div>
          {msg ? <p className="error" role="alert">{msg}</p> : null}
        </section>
      )}
    </article>
  );
}

/** Opens each file through a signed link that lasts an hour. */
function MediaList({ items }: { items: MediaItem[] }) {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supabase) return;
    supabase.storage
      .from('job-media')
      .createSignedUrls(items.map((m) => m.path), 3600)
      .then(({ data, error }) => {
        if (error || !data) return setFailed(true);
        const next: Record<string, string> = {};
        data.forEach((d) => {
          if (d.signedUrl && d.path) next[d.path] = d.signedUrl;
        });
        setUrls(next);
      });
  }, [items]);

  if (failed) return <p className="error">The files could not be opened. Refresh and try again.</p>;

  return (
    <div className="media">
      {items.map((m) => {
        const url = urls[m.path];
        if (!url) return <p key={m.path} className="muted">Opening {m.kind}…</p>;
        if (m.kind === 'voice')
          return (
            <label key={m.path}>
              Voice note{m.seconds ? ` · ${m.seconds}s` : ''}
              <audio controls preload="none" src={url} />
            </label>
          );
        if (m.kind === 'video')
          return (
            <label key={m.path}>
              Video{m.seconds ? ` · ${m.seconds}s` : ''}
              <video controls preload="metadata" src={url} />
            </label>
          );
        return (
          <a key={m.path} href={url} target="_blank" rel="noreferrer">
            <img src={url} alt="A photo from the customer" />
          </a>
        );
      })}
    </div>
  );
}
