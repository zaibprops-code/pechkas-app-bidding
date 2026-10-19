import { useCallback, useEffect, useState, type FormEvent } from 'react';
import type { Session } from '@supabase/supabase-js';

import { MARK_PATHS } from '@pechkas/shared/src/mark-paths.ts';
import { ask, supabase } from './supabase.ts';
import { loadUnchecked, shown } from './phones.ts';
import { Alerts } from './Alerts.tsx';
import { Demand } from './Demand.tsx';
import { Flags } from './Flags.tsx';
import { Settings } from './Settings.tsx';
import { Jobs } from './Jobs.tsx';
import { Money } from './Money.tsx';
import { Problems } from './Problems.tsx';

/**
 * The owner's admin panel. Phase 1: sign in, and decide on technicians.
 *
 * It never reads a table. It asks public.admin_applications(),
 * admin_record_check() and admin_decide(), and each of those asks the
 * database again whether this login is on the staff list and switched on.
 * Hiding a button here is a courtesy; the database is the lock.
 */

type Check = { step: string; method: string; checked_on: string; checked_by: string; notes: string | null };
type Application = {
  id: string;
  full_name: string;
  first_name: string;
  phone: string | null;
  trades: string[];
  years: number;
  sectors: string[];
  about: string | null;
  status: 'applied' | 'approved' | 'rejected' | 'suspended';
  status_reason: string | null;
  applied_at: string;
  decided_at: string | null;
  checks: Check[];
};

const TABS = [
  { status: 'applied', label: 'Waiting' },
  { status: 'approved', label: 'Approved' },
  { status: 'rejected', label: 'Turned down' },
  { status: 'suspended', label: 'Suspended' },
] as const;

const STEP = { identity: 'Identity seen', trial_job: 'Trial job watched', rules: 'Rules explained' } as const;
const METHOD = { in_person: 'in person', video_call: 'by video call' } as const;

function Logo() {
  return (
    <header className="brand">
      <svg width="36" height="36" viewBox="0 0 64 64" role="img" aria-label="Pechkas logo">
        {MARK_PATHS.machined.map((p, i) =>
          'stroke' in p ? (
            <path key={i} d={p.d} fill="none" stroke={p.stroke} strokeWidth={p.width} strokeLinecap="round" />
          ) : (
            <path key={i} d={p.d} fill={p.fill} />
          ),
        )}
      </svg>
      <span>pechkas admin</span>
    </header>
  );
}

export function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!supabase);
  const [staffName, setStaffName] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      setStaffName(null);
      return;
    }
    supabase.rpc('my_account').then(({ data }) => {
      const a = data as { is_staff?: boolean; staff_name?: string } | null;
      setStaffName(a?.is_staff ? (a.staff_name ?? 'Staff') : '');
    });
  }, [session]);

  if (!supabase) {
    return (
      <main className="shell">
        <Logo />
        <h1>Not connected</h1>
        <p className="lead">This panel has no database address yet. docs/OWNER.md says where to put it.</p>
      </main>
    );
  }
  if (!ready) return null;
  if (!session) return <SignIn />;
  if (staffName === null) return null;
  if (staffName === '') {
    return (
      <main className="shell">
        <Logo />
        <h1>Not on the staff list</h1>
        <p className="lead">This login exists but has not been given access to the office. Ask the owner.</p>
        <button className="secondary" onClick={() => supabase?.auth.signOut()}>Sign out</button>
      </main>
    );
  }
  return <Office name={staffName} />;
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!supabase) return;
    setBusy(true);
    setError(null);
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (err) setError('That email and password do not match a login.');
  }

  return (
    <main className="shell narrow">
      <Logo />
      <h1>Sign in</h1>
      <form onSubmit={submit} className="stack">
        <label>
          Email
          <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        <button type="submit" disabled={busy}>{busy ? 'Signing in…' : 'Sign in'}</button>
      </form>
    </main>
  );
}

function Office({ name }: { name: string }) {
  // Which numbers were typed rather than checked; re-drawn once they are known.
  const [, setPhonesKnown] = useState(0);
  useEffect(() => {
    const load = () => loadUnchecked().then(() => setPhonesKnown((n) => n + 1));
    load();
    const t = setInterval(load, 60000);
    return () => clearInterval(t);
  }, []);
  const [section, setSection] = useState<'jobs' | 'problems' | 'money' | 'technicians' | 'demand' | 'flags' | 'settings'>('jobs');
  const [trades, setTrades] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase?.rpc('app_lists').then(({ data }) => {
      const list = (data as { trades?: { slug: string; name: string }[] } | null)?.trades ?? [];
      setTrades(Object.fromEntries(list.map((t) => [t.slug, t.name])));
    });
  }, []);

  return (
    <main className="shell">
      <div className="topbar">
        <Logo />
        <div className="who">
          <span>{name}</span>
          <button className="secondary small" onClick={() => supabase?.auth.signOut()}>Sign out</button>
        </div>
      </div>
      <nav className="sections" aria-label="Sections">
        <button className={section === 'jobs' ? 'section on' : 'section'} aria-pressed={section === 'jobs'} onClick={() => setSection('jobs')}>Jobs</button>
        <button className={section === 'problems' ? 'section on' : 'section'} aria-pressed={section === 'problems'} onClick={() => setSection('problems')}>Problems</button>
        <button className={section === 'money' ? 'section on' : 'section'} aria-pressed={section === 'money'} onClick={() => setSection('money')}>Money</button>
        <button className={section === 'technicians' ? 'section on' : 'section'} aria-pressed={section === 'technicians'} onClick={() => setSection('technicians')}>Technicians</button>
        <button className={section === 'demand' ? 'section on' : 'section'} aria-pressed={section === 'demand'} onClick={() => setSection('demand')}>Demand</button>
        <button className={section === 'flags' ? 'section on' : 'section'} aria-pressed={section === 'flags'} onClick={() => setSection('flags')}>Flags</button>
        <button className={section === 'settings' ? 'section on' : 'section'} aria-pressed={section === 'settings'} onClick={() => setSection('settings')}>Settings</button>
      </nav>
      {section === 'jobs' ? (
        <>
          <Alerts />
          <Jobs trades={trades} />
        </>
      ) : section === 'problems' ? (
        <Problems />
      ) : section === 'money' ? (
        <Money />
      ) : section === 'demand' ? (
        <Demand />
      ) : section === 'flags' ? (
        <Flags />
      ) : section === 'settings' ? (
        <Settings />
      ) : (
        <Technicians trades={trades} />
      )}
    </main>
  );
}

function Technicians({ trades }: { trades: Record<string, string> }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['status']>('applied');
  const [rows, setRows] = useState<Application[] | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    setProblem(null);
    const { data, error } = await supabase.rpc('admin_applications', { p_status: tab });
    if (error) {
      setProblem(`Could not load: ${error.message}`);
      setRows([]);
      return;
    }
    setRows((data as Application[]) ?? []);
  }, [tab]);

  useEffect(() => {
    setRows(null);
    load();
  }, [load]);

  return (
    <>
      <h1>Technicians</h1>
      <nav className="tabs" aria-label="Applications">
        {TABS.map((t) => (
          <button key={t.status} className={t.status === tab ? 'tab on' : 'tab'} aria-pressed={t.status === tab} onClick={() => setTab(t.status)}>
            {t.label}
          </button>
        ))}
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {rows === null ? <p className="lead">Loading…</p> : null}
      {rows?.length === 0 ? <p className="lead">Nobody here.</p> : null}
      <div className="list">
        {rows?.map((a) => <Card key={a.id} a={a} trades={trades} onChange={load} />)}
      </div>
    </>
  );
}

function Card({ a, trades, onChange }: { a: Application; trades: Record<string, string>; onChange: () => void }) {
  const today = new Date().toISOString().slice(0, 10);
  const [step, setStep] = useState<keyof typeof STEP>('identity');
  const [method, setMethod] = useState<keyof typeof METHOD>('in_person');
  const [on, setOn] = useState(today);
  const [notes, setNotes] = useState('');
  const [reason, setReason] = useState('');
  const [msg, setMsg] = useState<{ text: string; field?: string | null } | null>(null);
  const [busy, setBusy] = useState(false);

  const done = new Set(a.checks.map((c) => c.step));
  const missing = (Object.keys(STEP) as (keyof typeof STEP)[]).filter((s) => !done.has(s));

  async function record(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const r = await ask('admin_record_check', { p_pro: a.id, p_step: step, p_method: method, p_checked_on: on, p_notes: notes });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.why, field: r.field });
    setNotes('');
    setMsg(null);
    onChange();
  }

  async function decide(decision: 'approve' | 'reject' | 'suspend' | 'reinstate') {
    setBusy(true);
    const r = await ask('admin_decide', { p_pro: a.id, p_decision: decision, p_reason: reason });
    setBusy(false);
    if (!r.ok) return setMsg({ text: r.why, field: r.field });
    setReason('');
    setMsg(null);
    onChange();
  }

  return (
    <article className="card">
      <div className="card-head">
        <div>
          <h2>{a.full_name}</h2>
          <p className="muted">
            {a.years} years · applied {new Date(a.applied_at).toLocaleDateString('en-GB')}
          </p>
        </div>
        {a.phone ? (
          <a className="call" href={`tel:+${a.phone.replace(/^\+/, '')}`}>Call {shown(a.phone)}</a>
        ) : null}
      </div>
      <p><strong>Work:</strong> {a.trades.map((t) => trades[t] ?? t).join(', ')}</p>
      <p><strong>Areas:</strong> {a.sectors.join(', ')}</p>
      {a.about ? <p className="about">“{a.about}”</p> : null}
      {a.status_reason ? <p className="reason"><strong>Reason given:</strong> {a.status_reason}</p> : null}

      <section className="checks">
        <h3>Checks</h3>
        {a.checks.length === 0 ? <p className="muted">None recorded yet.</p> : null}
        <ul>
          {a.checks.map((c, i) => (
            <li key={i}>
              <strong>{STEP[c.step as keyof typeof STEP] ?? c.step}</strong> {METHOD[c.method as keyof typeof METHOD] ?? c.method}, {new Date(c.checked_on).toLocaleDateString('en-GB')}, by {c.checked_by}
              {c.notes ? <span className="muted"> · {c.notes}</span> : null}
            </li>
          ))}
        </ul>
        {a.status === 'applied' ? (
          <form className="row" onSubmit={record}>
            <label>
              Check
              <select value={step} onChange={(e) => setStep(e.target.value as keyof typeof STEP)}>
                {Object.entries(STEP).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              How
              <select value={method} onChange={(e) => setMethod(e.target.value as keyof typeof METHOD)}>
                {Object.entries(METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label>
              On
              <input type="date" max={today} value={on} onChange={(e) => setOn(e.target.value)} required />
            </label>
            <label className="grow">
              Note (never a CNIC number)
              <input value={notes} maxLength={500} onChange={(e) => setNotes(e.target.value)} />
            </label>
            <button type="submit" disabled={busy}>Record</button>
          </form>
        ) : null}
      </section>

      <section className="decide">
        {a.status === 'applied' || a.status === 'approved' ? (
          <label>
            Reason, if turning down or suspending. He will be shown it.
            <textarea value={reason} maxLength={300} onChange={(e) => setReason(e.target.value)} rows={2} />
          </label>
        ) : null}
        <div className="buttons">
          {a.status === 'applied' ? (
            <>
              <button disabled={busy || missing.length > 0} onClick={() => decide('approve')}>
                {missing.length ? `Approve (needs: ${missing.map((m) => STEP[m].toLowerCase()).join(', ')})` : 'Approve'}
              </button>
              <button className="danger" disabled={busy} onClick={() => decide('reject')}>Turn down</button>
            </>
          ) : null}
          {a.status === 'approved' ? <button className="danger" disabled={busy} onClick={() => decide('suspend')}>Suspend</button> : null}
          {a.status === 'suspended' ? <button disabled={busy} onClick={() => decide('reinstate')}>Reinstate</button> : null}
        </div>
        {msg ? <p className="error" role="alert">{msg.text}</p> : null}
      </section>
    </article>
  );
}
