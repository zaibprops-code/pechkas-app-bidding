import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase.ts';

/**
 * Where Pechkas is short of people, and where it is wanted but not yet
 * working. Read from public.admin_demand(); every number is a count of real
 * jobs and real requests, and nothing here changes anything.
 */

type Served = {
  sector: string;
  trade: string;
  trade_name: string;
  posted: number;
  nobody_offered: number;
  by_hand: number;
  done: number;
  cancelled: number;
  pros: number;
};
type Asked = { sector: string; people: number; last_at: string; trades: Record<string, number> | null; pros: number };
type Report = { days: number; served: Served[]; uncovered: { sector: string; trade: string; trade_name: string }[]; asked: Asked[] };

const WINDOWS = [7, 30, 90] as const;
const day = (t: string) => new Date(t).toLocaleDateString('en-GB', { dateStyle: 'medium' });

export function Demand() {
  const [days, setDays] = useState<(typeof WINDOWS)[number]>(30);
  const [r, setR] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_demand', { p_days: days });
    if (error) return setProblem(`Could not load: ${error.message}`);
    setProblem(null);
    setR(data as Report);
  }, [days]);

  useEffect(() => {
    setR(null);
    load();
  }, [load]);

  // Grouped by sector, so a short list reads at a glance.
  const uncovered = r
    ? Object.entries(
        r.uncovered.reduce<Record<string, string[]>>((acc, u) => {
          (acc[u.sector] ??= []).push(u.trade_name);
          return acc;
        }, {}),
      )
    : [];

  return (
    <>
      <h1>Demand</h1>
      <nav className="tabs" aria-label="How far back">
        {WINDOWS.map((d) => (
          <button key={d} className={days === d ? 'tab on' : 'tab'} aria-pressed={days === d} onClick={() => setDays(d)}>
            Last {d} days
          </button>
        ))}
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {r === null && !problem ? <p className="lead">Loading…</p> : null}

      {r ? (
        <div className="stack">
          <section className="card">
            <h2>Jobs, by sector and trade</h2>
            <p className="muted">
              “No offer” means nobody offered at all, and either it waited long enough to come to you as “No offers”, or the office had
              to place it by hand. A job cancelled a minute after posting is not counted there.
            </p>
            {r.served.length === 0 ? (
              <p className="lead">No jobs posted in the last {r.days} days.</p>
            ) : (
              <div className="scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Sector</th>
                      <th>Trade</th>
                      <th className="num">Posted</th>
                      <th className="num">No offer</th>
                      <th className="num">Placed by hand</th>
                      <th className="num">Done</th>
                      <th className="num">Cancelled</th>
                      <th className="num">Technicians</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.served.map((x) => (
                      <tr key={`${x.sector}-${x.trade}`} className={x.nobody_offered > 0 ? 'short' : undefined}>
                        <td>{x.sector}</td>
                        <td>{x.trade_name}</td>
                        <td className="num">{x.posted}</td>
                        <td className="num">{x.nobody_offered}</td>
                        <td className="num">{x.by_hand}</td>
                        <td className="num">{x.done}</td>
                        <td className="num">{x.cancelled}</td>
                        <td className="num">{x.pros === 0 ? <strong>none</strong> : x.pros}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="card">
            <h2>Nobody to send</h2>
            <p className="muted">Trades in the sectors Pechkas works in with no approved technician at all. A customer can post these and nobody will see them.</p>
            {uncovered.length === 0 ? (
              <p className="lead">Every trade has somebody in every live sector.</p>
            ) : (
              <ul className="extras">
                {uncovered.map(([sector, names]) => (
                  <li key={sector}>
                    <strong>{sector}:</strong> {names.join(', ')}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="card">
            <h2>Asked for, not served yet</h2>
            <p className="muted">
              Customers who tapped “My sector is not listed” and chose their sector. One person counts once per sector however many times
              they ask.
            </p>
            {r.asked.length === 0 ? (
              <p className="lead">Nobody has asked in the last {r.days} days.</p>
            ) : (
              <div className="scroll">
                <table className="ledger">
                  <thead>
                    <tr>
                      <th>Sector</th>
                      <th className="num">People</th>
                      <th>For</th>
                      <th className="num">Technicians who work there</th>
                      <th>Last asked</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.asked.map((x) => (
                      <tr key={x.sector}>
                        <td>{x.sector}</td>
                        <td className="num">{x.people}</td>
                        <td>
                          {Object.entries(x.trades ?? {})
                            .sort((a, b) => b[1] - a[1])
                            .map(([name, n]) => `${name} ${n}`)
                            .join(' · ')}
                        </td>
                        <td className="num">{x.pros}</td>
                        <td>{day(x.last_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      ) : null}
    </>
  );
}
