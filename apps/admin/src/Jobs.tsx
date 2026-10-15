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
  status: 'open' | 'assigned' | 'done' | 'stopped' | 'cancelled';
  stage: 'chosen' | 'on_way' | 'arrived' | 'working' | null;
  live_offers: number;
  needs_you: boolean;
  why: string | null;
  collect_paisa: number | null;
  code_locked: boolean;
  problem_text: string | null;
  finished_at: string | null;
  agreed_paisa: number | null;
  assigned_by: 'customer' | 'office' | null;
  pro_name: string | null;
  pro_phone: string | null;
  cancelled_by: 'customer' | 'office' | null;
  cancel_reason: string | null;
  created_at: string;
  customer_name: string;
  customer_phone: string | null;
  media: MediaItem[];
};

type Pro = { id: string; full_name: string; phone: string | null; trades: string[]; sectors: string[]; online: boolean; notifications: boolean };

// "Needs you" is every job the database has marked, with its reason: no
// offers in time, a locked start code, one that looks stuck, a problem
// reported. This only filters.
const TABS = [
  { key: 'needs', status: null, label: 'Needs you' },
  { key: 'open', status: 'open', label: 'Open' },
  { key: 'assigned', status: 'assigned', label: 'Under way' },
  { key: 'finished', status: 'finished', label: 'Finished' },
  { key: 'cancelled', status: 'cancelled', label: 'Cancelled' },
] as const;

const STAGE = { chosen: 'Chosen, not set off yet', on_way: 'On his way', arrived: 'At the house', working: 'Working' } as const;

const WHEN = { now: 'As soon as possible', today: 'Today', tomorrow: 'Tomorrow' } as const;

export function Jobs({ trades }: { trades: Record<string, string> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['key']>('needs');
  const [rows, setRows] = useState<Job[] | null>(null);
  const [pros, setPros] = useState<Pro[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const current = TABS.find((t) => t.key === tab)!;

  const load = useCallback(async () => {
    if (!supabase) return;
    setProblem(null);
    const { data, error } = await supabase.rpc('admin_jobs', { p_status: current.status });
    if (error) {
      setProblem(`Could not load: ${error.message}`);
      setRows([]);
      return;
    }
    const all = (data as Job[]) ?? [];
    setRows(tab === 'needs' ? all.filter((j) => j.needs_you) : all);
  }, [tab, current.status]);

  useEffect(() => {
    setRows(null);
    load();
    // Every 30 seconds, so a job going quiet shows up without a click.
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    supabase?.rpc('admin_pros').then(({ data }) => setPros((data as Pro[]) ?? []));
  }, []);

  return (
    <>
      <h1>Jobs</h1>
      <nav className="tabs" aria-label="Jobs">
        {TABS.map((t) => (
          <button key={t.key} className={t.key === tab ? 'tab on' : 'tab'} aria-pressed={t.key === tab} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {rows === null ? <p className="lead">Loading…</p> : null}
      {rows?.length === 0 ? <p className="lead">{tab === 'needs' ? 'Nothing waiting on you.' : 'No jobs here.'}</p> : null}
      <div className="list">
        {rows?.map((j) => <JobCard key={j.id} j={j} trade={trades[j.trade] ?? j.trade} pros={pros} onChange={load} />)}
      </div>
    </>
  );
}

function JobCard({ j, trade, pros, onChange }: { j: Job; trade: string; pros: Pro[]; onChange: () => void }) {
  const [reason, setReason] = useState('');
  // Technicians who do this trade in this sector come first in the list.
  const fits = (p: Pro) => p.trades.includes(j.trade) && p.sectors.includes(j.sector);
  const sorted = [...pros].sort((a, b) => Number(fits(b)) - Number(fits(a)) || a.full_name.localeCompare(b.full_name));
  const [proId, setProId] = useState('');
  const [price, setPrice] = useState(String(j.offered_paisa / 100));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function assign() {
    const rupeesWhole = Number(price.replace(/[, ]/g, ''));
    if (!proId) return setMsg('Choose who you rang.');
    if (!Number.isInteger(rupeesWhole)) return setMsg('Write the price in whole rupees.');
    setBusy(true);
    const r = await ask('admin_assign', { p_job: j.id, p_pro: proId, p_price_paisa: rupeesWhole * 100 });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setMsg(null);
    onChange();
  }

  async function cancel() {
    setBusy(true);
    const r = await ask('admin_cancel_job', { p_job: j.id, p_reason: reason });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setReason('');
    setMsg(null);
    onChange();
  }

  async function unlock() {
    setBusy(true);
    const r = await ask('admin_unlock_code', { p_job: j.id });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
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
      {j.why ? <p className="why"><strong>Needs you:</strong> {j.why}</p> : null}
      {j.status === 'open' ? (
        <p className={j.needs_you ? 'reason' : 'muted'}>
          {j.live_offers > 0
            ? `${j.live_offers} live ${j.live_offers === 1 ? 'offer' : 'offers'} — the customer is choosing.`
            : j.needs_you
              ? 'Nobody has offered on this. Ring a technician and place it below.'
              : 'No offers yet.'}
        </p>
      ) : null}
      {j.status !== 'open' && j.status !== 'cancelled' && j.pro_name ? (
        <div className="card-head">
          <p>
            <strong>Technician:</strong> {j.pro_name} · agreed {j.agreed_paisa ? rupees(j.agreed_paisa) : 'no price yet'} ·{' '}
            {j.assigned_by === 'office' ? 'placed by the office' : 'chosen by the customer'}
          </p>
          {j.pro_phone ? <a className="call" href={`tel:+${j.pro_phone.replace(/^\+/, '')}`}>Call {showMobile(j.pro_phone)}</a> : null}
        </div>
      ) : null}
      {j.status === 'assigned' && j.stage ? (
        <p>
          <strong>Now:</strong> {STAGE[j.stage]}
          {j.code_locked ? ' · the start code is locked after too many wrong tries' : ''}
        </p>
      ) : null}
      {j.status === 'assigned' && j.code_locked ? (
        <div className="buttons">
          <button disabled={busy} onClick={unlock}>Unlock the start code (after ringing both)</button>
        </div>
      ) : null}
      {j.status === 'done' ? <p><strong>Done.</strong> He collects {rupees(j.collect_paisa)} in cash.</p> : null}
      {j.status === 'stopped' ? <p><strong>Stopped at the door:</strong> the customer declined a new price. He collects the visit fee, {rupees(j.collect_paisa)}.</p> : null}
      {j.problem_text ? <p className="reason"><strong>The customer says something is wrong:</strong> “{j.problem_text}”</p> : null}
      {j.status !== 'open' ? <History job={j.id} /> : null}
      {j.status === 'open' ? (
        <section className="assign">
          <h3>Place it by hand</h3>
          <div className="row">
            <label className="grow">
              Technician you rang
              <select value={proId} onChange={(e) => setProId(e.target.value)}>
                <option value="">Choose…</option>
                {sorted.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.full_name}
                    {fits(p) ? ' — does this, works here' : ''}
                    {p.online ? ' — online' : ''}
                    {p.notifications ? '' : ' — no notifications, ring him'}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Price agreed (Rs)
              <input inputMode="numeric" value={price} onChange={(e) => setPrice(e.target.value)} />
            </label>
            <button disabled={busy} onClick={assign}>Place job</button>
          </div>
        </section>
      ) : null}
      {j.status === 'done' || j.status === 'stopped' ? (
        msg ? <p className="error" role="alert">{msg}</p> : null
      ) : j.status === 'cancelled' ? (
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

type Detail = {
  events: { at: string; actor: string; what: string; detail: Record<string, unknown> | null }[];
  messages: { at: string; from: 'customer' | 'pro' | 'gone'; body: string }[];
  photos: { stage: 'before' | 'after' | 'change'; path: string }[];
  changes: { from_paisa: number; price_paisa: number; reason: string; status: string; at: string }[];
};

const WHAT: Record<string, string> = {
  posted: 'Posted',
  assigned: 'Technician chosen',
  on_way: 'On his way',
  arrived: 'Arrived',
  working: 'Started, with the code',
  code_wrong: 'Wrong start code',
  code_locked: 'Start code locked',
  code_unlocked: 'Start code unlocked',
  change_asked: 'Asked a new price',
  change_approved: 'New price approved',
  change_declined: 'New price declined',
  change_withdrawn: 'New price taken back',
  done: 'Done',
  stopped: 'Stopped at the door',
  cancelled: 'Cancelled',
  problem: 'Problem reported',
};
const WHO: Record<string, string> = { customer: 'customer', pro: 'technician', office: 'office', system: 'system' };
const time = (t: string) => new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

/**
 * Everything that happened on a job, who did it and when; the chat; the
 * technician's photos; every new price asked. Read only: nobody, the office
 * included, can change the record.
 */
function History({ job }: { job: string }) {
  const [open, setOpen] = useState(false);
  const [d, setD] = useState<Detail | null>(null);

  useEffect(() => {
    if (!open || !supabase) return;
    supabase.rpc('admin_job_detail', { p_job: job }).then(({ data }) => setD((data as Detail) ?? null));
  }, [open, job]);

  if (!open) return <button className="secondary small" onClick={() => setOpen(true)}>History, chat and photos</button>;
  if (!d) return <p className="muted">Loading the history…</p>;
  return (
    <section className="history">
      <h3>History</h3>
      <ol className="events">
        {d.events.map((e, i) => (
          <li key={i}>
            <span className="muted">{time(e.at)}</span> · {WHAT[e.what] ?? e.what} <span className="muted">by the {WHO[e.actor] ?? e.actor}</span>
            {e.detail && typeof e.detail.price_paisa === 'number' ? ` · ${rupees(e.detail.price_paisa)}` : ''}
            {e.detail && typeof e.detail.reason === 'string' && e.detail.reason ? ` · “${e.detail.reason}”` : ''}
          </li>
        ))}
      </ol>
      {d.photos.length ? (
        <>
          <h3>The technician's photos</h3>
          <MediaList items={d.photos.map((p) => ({ kind: 'photo', path: p.path, seconds: null }))} />
          <p className="muted">In order: {d.photos.map((p) => p.stage).join(', ')}.</p>
        </>
      ) : null}
      <h3>Chat</h3>
      {d.messages.length === 0 ? <p className="muted">No messages.</p> : null}
      <ol className="chat">
        {d.messages.map((m, i) => (
          <li key={i} className={m.from}>
            <span className="muted">{time(m.at)} · {m.from === 'customer' ? 'Customer' : m.from === 'pro' ? 'Technician' : 'Deleted account'}</span>
            <p>{m.body}</p>
          </li>
        ))}
      </ol>
      <button className="secondary small" onClick={() => setOpen(false)}>Hide</button>
    </section>
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
