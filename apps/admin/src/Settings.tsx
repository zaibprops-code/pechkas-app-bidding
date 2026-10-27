import { useCallback, useEffect, useState } from 'react';
import { APP_EDITION, rupees } from '@pechkas/shared';
import { ask, supabase } from './supabase.ts';

/**
 * The numbers the app runs on, from public.admin_settings(). Each one can be
 * changed only within the range written in the migration, and every change
 * is recorded with who made it. Money — commission, the repeat fee, the
 * credit limit, the guarantee reserve — and the 30-day guarantee are shown
 * but locked: they change only by migration, on purpose.
 */

type Setting = {
  key: string;
  value: number;
  unit: 'paisa' | 'basis_points' | 'minutes' | 'days' | 'count';
  meaning: string;
  editable: boolean;
  lo: number | null;
  hi: number | null;
  changed_at: string | null;
  changed_by: string | null;
};
type Sector = { name: string; live: boolean; pros: number; open_jobs: number };
type Change = { key: string; old: number | null; new: number; by: string | null; at: string };
type Report = { settings: Setting[]; sectors: Sector[]; changes: Change[] };

/** Plain names, in the order they appear. Anything not listed falls into "Other". */
const GROUPS: { title: string; keys: Record<string, string> }[] = [
  {
    title: 'Jobs and offers',
    keys: {
      offer_minutes: 'An offer stays open for',
      escalate_minutes: 'A job with no offer comes to you after',
      prefer_minutes: 'A job asked for by name is his alone for',
      min_offer_paisa: 'Lowest price a customer may offer',
      max_counter_bps: 'Highest counter-offer, as a share of her price',
      max_open_jobs: 'Open jobs one customer may have',
      max_posts_per_day: 'Jobs one customer may post in a day',
    },
  },
  {
    title: 'At the door',
    keys: {
      visit_fee_min_paisa: 'Smallest visit fee',
      visit_fee_max_paisa: 'Largest visit fee',
      code_tries: 'Wrong start codes before it locks',
    },
  },
  {
    title: 'Ratings',
    keys: {
      rating_min_count: 'Ratings before stars are shown',
      rating_days: 'Days after a job either side may rate it',
    },
  },
  {
    title: 'Flags',
    keys: {
      flag_days: 'Flags look back',
      flag_min_jobs: 'Finished jobs before a share can flag him',
      flag_stopped_bps: 'Share of his jobs refused at the door',
      flag_raised_bps: 'Share of his jobs with a new price asked',
      flag_parts_bps: 'A job is parts-heavy when parts are at least',
      flag_parts_jobs: 'Parts-heavy jobs',
      flag_code_wrong: 'Wrong start codes on his jobs',
      flag_cancelled: 'Jobs cancelled after he was chosen',
      flag_problems: 'Problems or claims about somebody',
      flag_low_stars: 'Ratings of one or two stars',
      flag_same_pair: 'Jobs for one customer',
      flag_customer_cancels: "A customer's cancellations",
      flag_blocked: 'Customers who blocked him',
    },
  },
  {
    title: 'Money and promises — changed only by Claude, in a migration',
    keys: {
      commission_bps: 'Commission, of the labour',
      repeat_commission_bps: 'Commission for a returning customer',
      credit_limit_paisa: 'Credit limit',
      reserve_bps: 'Guarantee reserve, of each commission',
      guarantee_days: 'Guarantee',
    },
  },
];

const UNIT: Record<Setting['unit'], string> = { paisa: 'Rs', basis_points: '%', minutes: 'minutes', days: 'days', count: '' };
/** What the office types: rupees, not paisa; per cent, not basis points. */
const toShown = (s: Pick<Setting, 'unit'>, v: number) => (s.unit === 'paisa' ? v / 100 : s.unit === 'basis_points' ? v / 100 : v);
const toStored = (s: Pick<Setting, 'unit'>, v: number) => Math.round(s.unit === 'paisa' || s.unit === 'basis_points' ? v * 100 : v);
const show = (s: Pick<Setting, 'unit'>, v: number) =>
  s.unit === 'paisa' ? rupees(v) : s.unit === 'basis_points' ? `${v / 100}%` : `${v}${UNIT[s.unit] ? ` ${UNIT[s.unit]}` : ''}`;
const time = (t: string) => new Date(t).toLocaleString('en-GB', { dateStyle: 'short', timeStyle: 'short' });

export function Settings() {
  const [r, setR] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_settings');
    if (error) return setProblem(`Could not load: ${error.message}`);
    setProblem(null);
    setR(data as Report);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const byKey = new Map(r?.settings.map((s) => [s.key, s]) ?? []);
  const named = new Set(GROUPS.flatMap((g) => Object.keys(g.keys)));
  const other = r?.settings.filter((s) => !named.has(s.key)) ?? [];
  const label = (key: string) => GROUPS.find((g) => key in g.keys)?.keys[key] ?? key;

  return (
    <>
      <h1>Settings</h1>
      <p className="lead">
        Each number can be set only within a safe range, and every change is kept with your name. Money and the 30-day guarantee are
        locked here: ask Claude to change those.
      </p>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {r === null && !problem ? <p className="lead">Loading…</p> : null}
      {r ? (
        <div className="stack">
          <AppSwitches onChanged={load} />
          <Sectors sectors={r.sectors} onChanged={load} />
          {GROUPS.map((g) => (
            <section key={g.title} className="card">
              <h2>{g.title}</h2>
              {Object.keys(g.keys).map((k) => {
                const s = byKey.get(k);
                return s ? <Row key={k} s={s} label={g.keys[k]} onChanged={load} /> : null;
              })}
            </section>
          ))}
          {other.length ? (
            <section className="card">
              <h2>Other</h2>
              {other.map((s) => (
                <Row key={s.key} s={s} label={s.key} onChanged={load} />
              ))}
            </section>
          ) : null}
          <section className="card">
            <h2>Recent changes</h2>
            {r.changes.length === 0 ? <p className="lead">Nothing changed from here yet.</p> : null}
            <ul className="events">
              {r.changes.map((c, i) => {
                const sector = c.key.startsWith('sector:') ? c.key.slice(7) : null;
                const s = byKey.get(c.key);
                if (c.key === 'app:paused' || c.key === 'app:min_edition') {
                  return (
                    <li key={i}>
                      {time(c.at)} · {c.by ?? 'unknown'}:{' '}
                      {c.key === 'app:paused'
                        ? c.new ? 'paused the app' : 'let the app carry on'
                        : c.new ? `asked copies older than edition ${c.new} to update` : 'stopped asking anybody to update'}
                    </li>
                  );
                }
                return (
                  <li key={i}>
                    {time(c.at)} · {c.by ?? 'unknown'}:{' '}
                    {sector
                      ? `${sector} ${c.new ? 'opened' : 'closed'} for new jobs`
                      : `${label(c.key)} ${c.old !== null && s ? show(s, c.old) : '—'} → ${s ? show(s, c.new) : c.new}`}
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Row({ s, label, onChanged }: { s: Setting; label: string; onChanged: () => void }) {
  const [typed, setTyped] = useState(String(toShown(s, s.value)));
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => setTyped(String(toShown(s, s.value))), [s.value, s.unit]);

  async function save() {
    const v = Number(typed);
    if (!Number.isFinite(v)) return setMsg('Write a number.');
    setBusy(true);
    setMsg(null);
    const r = await ask('admin_set_setting', { p_key: s.key, p_value: toStored(s, v) });
    setBusy(false);
    if (!r.ok) {
      // The database speaks in paisa and basis points; say the range as typed.
      return setMsg(r.field === 'value' && s.lo !== null && s.hi !== null && /^Choose a value/.test(r.why) ? `Choose from ${show(s, s.lo)} to ${show(s, s.hi)}.` : r.why);
    }
    onChanged();
  }

  const changed = typed !== String(toShown(s, s.value));
  return (
    <div className="setting">
      <div className="setting-text">
        <strong>{label}</strong>
        <span className="muted">{s.meaning}</span>
        {s.changed_at ? <span className="muted">Last changed {time(s.changed_at)}{s.changed_by ? ` by ${s.changed_by}` : ''}.</span> : null}
      </div>
      {s.editable ? (
        <div className="setting-edit">
          <label>
            <span className="sr">{label}</span>
            <span className="unit-field">
              {s.unit === 'paisa' ? <span>Rs</span> : null}
              <input inputMode="decimal" value={typed} onChange={(e) => setTyped(e.target.value)} aria-describedby={`${s.key}-range`} />
              {s.unit !== 'paisa' && UNIT[s.unit] ? <span>{UNIT[s.unit]}</span> : null}
            </span>
          </label>
          <span id={`${s.key}-range`} className="muted small">
            {s.lo !== null && s.hi !== null ? `${show(s, s.lo)} to ${show(s, s.hi)}` : ''}
          </span>
          <button className="small" disabled={busy || !changed} onClick={save}>Save</button>
          {msg ? <p className="error" role="alert">{msg}</p> : null}
        </div>
      ) : (
        <div className="setting-edit">
          <strong>{show(s, s.value)}</strong>
          <span className="muted small">Locked</span>
        </div>
      )}
    </div>
  );
}

function Sectors({ sectors, onChanged }: { sectors: Sector[]; onChanged: () => void }) {
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const live = sectors.filter((s) => s.live);
  const rest = sectors.filter((s) => !s.live);

  async function flip(s: Sector) {
    const question = s.live
      ? `Close ${s.name}? Nobody will be able to post a new job there.`
      : `Open ${s.name} for new jobs? ${s.pros} approved ${s.pros === 1 ? 'technician works' : 'technicians work'} there.`;
    if (!window.confirm(question)) return;
    setBusy(s.name);
    setMsg(null);
    const r = await ask('admin_set_sector', { p_name: s.name, p_live: !s.live });
    setBusy(null);
    if (!r.ok) return setMsg(r.why);
    onChanged();
  }

  return (
    <section className="card">
      <h2>Sectors taking jobs</h2>
      <p className="muted">
        A sector can open only once an approved technician works there. Closing one stops new jobs; jobs already posted there carry on.
        The website and the store pages name the live sectors too — when you open or close one, tell Claude so they say the same.
      </p>
      <div className="chips">
        {live.map((s) => (
          <button key={s.name} className="chip on" aria-pressed="true" disabled={busy !== null} onClick={() => flip(s)}>
            {s.name} · {s.pros} {s.pros === 1 ? 'technician' : 'technicians'}
            {s.open_jobs ? ` · ${s.open_jobs} jobs on` : ''} · Close
          </button>
        ))}
      </div>
      <details>
        <summary>Open another sector</summary>
        <div className="chips">
          {rest.map((s) => (
            <button key={s.name} className="chip" aria-pressed="false" disabled={busy !== null} onClick={() => flip(s)}>
              {s.name} · {s.pros} {s.pros === 1 ? 'technician' : 'technicians'}
            </button>
          ))}
        </div>
      </details>
      {msg ? <p className="error" role="alert">{msg}</p> : null}
    </section>
  );
}

type Control = { min_edition: number; paused: boolean; pause_note: string; changed_at: string; changed_by: string | null };

/**
 * The two switches every phone obeys (public.app_control): pause the app
 * while something is worked on, and ask old copies to update. Both are
 * read by every copy of the app when it opens and when it comes back to
 * the front; while one is on, phones ask again every half minute.
 */
function AppSwitches({ onChanged }: { onChanged: () => void }) {
  const [c, setC] = useState<Control | null>(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_app_control');
    if (error) {
      setC(null);
      return setMsg(/function|does not exist|schema cache/i.test(error.message)
        ? 'These switches need the database change 20261031000000_update_and_pause.sql. Run it in Supabase first.'
        : `Could not load: ${error.message}`);
    }
    setMsg(null);
    setC(data as Control);
    setNote((data as Control | null)?.pause_note ?? '');
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const r = await ask(fn, args);
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    await load();
    onChanged();
  }

  const pause = () => {
    if (!window.confirm('Pause the app for everybody? Every phone will show "Pechkas is paused" with your note, including anybody in the middle of a job. The emergency numbers stay on their screen. Office logins still see the app.')) return;
    run('admin_set_pause', { p_paused: true, p_note: note });
  };
  const carryOn = () => run('admin_set_pause', { p_paused: false, p_note: note });
  const askUpdate = () => {
    if (!window.confirm(`Only do this once edition ${APP_EDITION} is live on Google Play and the App Store. Every phone with an older copy will be stopped until it updates. Carry on?`)) return;
    run('admin_set_min_edition', { p_edition: APP_EDITION });
  };
  const stopAsking = () => run('admin_set_min_edition', { p_edition: 0 });

  return (
    <section className="card">
      <h2>App switches</h2>
      {msg ? <p className="error" role="alert">{msg}</p> : null}
      {c ? (
        <>
          <div className="setting">
            <div className="setting-text">
              <strong>Pause the app</strong>
              <span className="muted">
                For when something is being worked on, such as running a database change. Every phone shows one screen saying Pechkas is
                paused, with your note, and opens again by itself within half a minute of you pressing Carry on. It does not switch the
                database off. Office logins still see the app.
              </span>
              <span className="muted">
                {c.paused ? 'Paused now' : 'Running'}
                {c.changed_by ? ` · last changed ${time(c.changed_at)} by ${c.changed_by}` : ''}
              </span>
            </div>
            <div className="setting-edit">
              <label>
                <span className="muted small">Note everybody will read (optional, no phone numbers)</span>
                <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} placeholder="Back by 3 pm." />
              </label>
              {c.paused ? (
                <>
                  <button className="small" disabled={busy || note === c.pause_note} onClick={() => run('admin_set_pause', { p_paused: true, p_note: note })}>
                    Change the note
                  </button>
                  <button className="small" disabled={busy} onClick={carryOn}>Carry on</button>
                </>
              ) : (
                <button className="small" disabled={busy} onClick={pause}>Pause the app</button>
              )}
            </div>
          </div>
          <div className="setting">
            <div className="setting-text">
              <strong>Ask old copies to update</strong>
              <span className="muted">
                This admin panel is edition {APP_EDITION}. Phones show their edition under Settings, This copy of the app. Asking makes
                every older copy stop and show "Please update Pechkas" with a button to the store. Do it only after this edition is live
                in the stores, or nobody will be able to get the update. Stop asking puts it right at once.
              </span>
              <span className="muted">
                {c.min_edition ? `Asking every copy older than edition ${c.min_edition} to update.` : 'Not asking anybody to update.'}
              </span>
            </div>
            <div className="setting-edit">
              {APP_EDITION <= 1 ? (
                <span className="muted small">Nothing to ask yet: edition 1 is the first copy that can be asked.</span>
              ) : null}
              {APP_EDITION > 1 && c.min_edition < APP_EDITION ? (
                <button className="small" disabled={busy} onClick={askUpdate}>Ask copies older than {APP_EDITION} to update</button>
              ) : null}
              {c.min_edition > 0 ? <button className="small" disabled={busy} onClick={stopAsking}>Stop asking</button> : null}
            </div>
          </div>
        </>
      ) : null}
    </section>
  );
}
