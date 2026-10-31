import { useCallback, useEffect, useState } from 'react';
import { rupees } from '@pechkas/shared';
import { Head } from './Duo.tsx';
import { supabase } from './supabase.ts';

/**
 * What each kind of job really went for, from public.admin_prices(): the
 * anonymous price record of finished jobs, in the same window customers'
 * ranges use. Every figure is the price for the WORK — parts taken out —
 * and every one is a count or a price of real finished jobs. Nothing here
 * changes anything; the usual prices themselves change by migration.
 */

type Range = { n: number; low_paisa: number; high_paisa: number; days: number };
type Kind = {
  trade: string;
  trade_name: string;
  job_type_id: number | null;
  name: string;
  list_paisa: number | null;
  n: number;
  median_paisa: number;
  cheapest_paisa: number;
  dearest_paisa: number;
  asked_paisa: number;
  with_parts: number;
  range: Range | null;
};
type Report = { days: number; min_jobs: number; to_pros: boolean; all_time: number; kinds: Kind[] };

/** How far the middle price is from the usual price, in words — only once there is a range to trust. */
function against(k: Kind): string | null {
  if (!k.range || !k.list_paisa) return null;
  const off = Math.round(((k.median_paisa - k.list_paisa) / k.list_paisa) * 100);
  if (Math.abs(off) < 10) return 'Close to the usual price';
  return off > 0 ? `${off}% above the usual price` : `${-off}% below the usual price`;
}

export function Prices() {
  const [r, setR] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_prices');
    if (error) return setProblem(`Could not load: ${error.message}`);
    setProblem(null);
    setR(data as Report);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const trades = r ? [...new Set(r.kinds.map((k) => k.trade_name))] : [];

  return (
    <>
      <Head icon="tag" title="Prices" />
      <nav className="tabs" aria-label="Prices">
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {r === null && !problem ? <p className="lead">Loading…</p> : null}

      {r ? (
        <div className="stack">
          <section className="card">
            <h2>What jobs really go for</h2>
            <p className="muted">
              Finished jobs in the last {r.days} days, the price for the work only (parts taken out). Customers see the middle half as a range
              on Post a job once a kind of job has {r.min_jobs} finished jobs; technicians {r.to_pros ? 'see it too, in the offer sheet' : 'do not see it at the moment'}.
              The record keeps no names, numbers or addresses, so it stays when an account is deleted. {r.all_time} jobs recorded so far.
            </p>
            <p className="muted">
              When a kind of job keeps going for well above or below the usual price, that usual price may be out of date. The usual prices
              are changed by a migration, so ask for one.
            </p>
          </section>

          {r.kinds.length === 0 ? (
            <section className="card">
              <p className="lead">No finished jobs in the last {r.days} days yet.</p>
            </section>
          ) : (
            trades.map((t) => (
              <section className="card" key={t}>
                <h2>{t}</h2>
                <div className="scroll">
                  <table className="ledger">
                    <thead>
                      <tr>
                        <th style={{ minWidth: 190 }}>Job</th>
                        <th className="num">Jobs</th>
                        <th className="num">Usual price</th>
                        <th className="num">Middle price</th>
                        <th className="num">Cheapest – dearest</th>
                        <th className="num">Customers first asked</th>
                        <th>Range shown</th>
                      </tr>
                    </thead>
                    <tbody>
                      {r.kinds
                        .filter((k) => k.trade_name === t)
                        .map((k) => (
                          <tr key={`${k.trade}-${k.job_type_id ?? 'other'}`}>
                            <td>
                              {k.name}
                              {against(k) ? <div className="muted">{against(k)}</div> : null}
                              {k.with_parts ? <div className="muted">{k.with_parts} with parts</div> : null}
                            </td>
                            <td className="num">{k.n}</td>
                            <td className="num">{k.list_paisa ? rupees(k.list_paisa) : 'Price after a look'}</td>
                            <td className="num">{rupees(k.median_paisa)}</td>
                            <td className="num" style={{ whiteSpace: 'nowrap' }}>
                              {rupees(k.cheapest_paisa)} – {rupees(k.dearest_paisa)}
                            </td>
                            <td className="num">{rupees(k.asked_paisa)}</td>
                            <td>
                              {k.range ? (
                                <strong style={{ whiteSpace: 'nowrap' }}>
                                  {rupees(k.range.low_paisa)} – {rupees(k.range.high_paisa)}
                                </strong>
                              ) : k.job_type_id === null ? (
                                'Never: too many different jobs'
                              ) : (
                                `Not yet: ${k.n} of ${r.min_jobs} jobs`
                              )}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))
          )}
        </div>
      ) : null}
    </>
  );
}
