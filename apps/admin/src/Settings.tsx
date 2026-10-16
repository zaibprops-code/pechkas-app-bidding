import { useCallback, useEffect, useState } from 'react';
import { rupees } from '@pechkas/shared';
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
