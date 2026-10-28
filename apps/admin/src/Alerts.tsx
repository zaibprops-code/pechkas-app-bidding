import { useCallback, useEffect, useState } from 'react';
import { Duo } from './Duo.tsx';
import { pakistaniMobile, showMobile } from '@pechkas/shared';
import { ask, supabase } from './supabase.ts';

type State = { alert_phone: string | null; phones: number; minutes: number };

/**
 * Where "nobody has offered yet" alerts go: the mobile number this office
 * person signs in to the Pechkas app with. The database sends them; this only
 * says which number, and whether a phone there will actually hear it.
 */
export function Alerts() {
  const [state, setState] = useState<State | null>(null);
  const [typed, setTyped] = useState('');
  const [editing, setEditing] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    const { data } = (await supabase?.rpc('admin_alerts')) ?? { data: null };
    setState((data as State | null) ?? null);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: { preventDefault(): void }, phone: string | null) {
    e.preventDefault();
    setProblem(null);
    const e164 = phone === null ? null : pakistaniMobile(phone);
    if (phone !== null && !e164) {
      setProblem('Write a Pakistani mobile number, like 0300 1234567.');
      return;
    }
    setBusy(true);
    const r = await ask('admin_set_alert_phone', { p_phone: e164 });
    setBusy(false);
    if (!r.ok) return setProblem(r.why);
    setEditing(false);
    setTyped('');
    load();
  }

  if (!state) return null;
  const set = state.alert_phone && !editing;

  return (
    <section className="alerts">
      <div className="alerts-head">
        <span className="head-tile small-tile">
          <Duo name="bell" size={22} />
        </span>
        <h2>Alerts on your phone</h2>
      </div>
      {set ? (
        <>
          <p>
            When a job has had no offer for {state.minutes} minutes, the Pechkas app on{' '}
            <strong>{showMobile(state.alert_phone!)}</strong> tells you, once.
          </p>
          {state.phones === 0 ? (
            <p className="error">
              No phone signed in as that number has allowed notifications yet. Open the Pechkas app on it, sign in with that
              number, open the menu, tap <strong>Settings</strong>, then tap <strong>Notifications</strong> and allow them.
            </p>
          ) : (
            <p className="muted">
              {state.phones === 1 ? 'One phone' : `${state.phones} phones`} will hear it.
            </p>
          )}
          <div className="row">
            <button className="secondary small" onClick={() => setEditing(true)}>Change number</button>
            <button className="secondary small" disabled={busy} onClick={(e) => save(e, null)}>Stop alerts</button>
          </div>
        </>
      ) : (
        <form className="row" onSubmit={(e) => save(e, typed)}>
          <label className="grow">
            Your mobile number, the one you sign in to the Pechkas app with
            <input inputMode="tel" autoComplete="tel" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="0300 1234567" />
          </label>
          <button disabled={busy}>Send alerts here</button>
        </form>
      )}
      {problem ? <p className="error" role="alert">{problem}</p> : null}
    </section>
  );
}
