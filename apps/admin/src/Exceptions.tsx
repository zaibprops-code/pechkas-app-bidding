import { useCallback, useEffect, useState } from 'react';
import { Head } from './Duo.tsx';
import { ask, supabase } from './supabase.ts';
import { Evidence, when } from './Guarantee.tsx';

/**
 * Exceptions (the owner's decision D37 and his standing rule): the only
 * things in the first-jobs rules that need a person, as written items to
 * answer in his own time. Nothing here is routine: approval, trial jobs,
 * pauses by rule and checkers are all the app's. Every answer needs words,
 * and the technician reads them in the app.
 *
 *  - safety reports, and "not the man in the photo" at a customer's door;
 *  - appeals against a pause by rule;
 *  - a new photo after the lock (the owner alone);
 *  - a trade where somebody has earned a checked risky job and nobody can
 *    check him yet: an outside assessor, arranged by email (the owner alone).
 */

type Report = {
  id: string;
  kind: 'safety' | 'face' | 'unsafe_check';
  pro_id: string;
  pro: string;
  trade: string | null;
  trade_name: string | null;
  ref: string | null;
  job_status: string | null;
  from_side: 'customer' | 'checker';
  from: string | null;
  words: string | null;
  photo: string | null;
  at: string;
  his_side: string | null;
  his_side_at: string | null;
  his_jobs: { ref: string; trade: string; stage: string; when_date: string | null }[];
};
type Appeal = {
  id: string;
  pro: string;
  trade_name: string;
  reason: 'works_no' | 'answers';
  paused_at: string;
  words: string;
  at: string;
  first_jobs: { ref: string; status: string; why: string | null; works_no: number; on_time: boolean | null; explained: boolean | null; clean: boolean | null }[];
};
type FaceChange = { id: string; pro: string; reason: string; new_path: string; old_path: string | null; at: string };
type NeedAssessor = { pro_id: string; pro: string; trade: string; trade_name: string; sectors: string[] };
type Outside = {
  id: string;
  status: 'ready' | 'asked' | 'accepted';
  pro: string;
  trade: string;
  assessor: string;
  ref: string | null;
  job_status: string | null;
  stage: string | null;
  sector: string | null;
  when_date: string | null;
  when_from: number | null;
  answer_by: string | null;
};
type Data = { is_owner: boolean; reports: Report[]; appeals: Appeal[]; face_changes: FaceChange[]; need_assessor: NeedAssessor[]; outside: Outside[] };

const KIND: Record<Report['kind'], string> = {
  safety: 'Safety report from the customer',
  face: 'Not the man in the photo, says the customer at her door',
  unsafe_check: 'Unsafe, says the technician who checked him',
};
const REASON: Record<Appeal['reason'], string> = {
  works_no: 'Paused: two customers said the work did not work',
  answers: 'Paused: two first jobs with a "no" from the customer',
};
const ANSWER = (v: boolean | null) => (v === null ? '–' : v ? 'yes' : 'no');

export function Exceptions() {
  const [d, setD] = useState<Data | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_exceptions');
    if (error) {
      return setProblem(
        /admin_exceptions|schema cache|does not exist/i.test(error.message)
          ? 'This page needs the database change 20261113000000_first_jobs.sql. Run it in Supabase first.'
          : `Could not load: ${error.message}`,
      );
    }
    setProblem(null);
    setD(data as Data);
  }, []);
  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const count = d ? d.reports.length + d.appeals.length + d.face_changes.length + d.need_assessor.length + d.outside.length : 0;
  return (
    <>
      <Head icon="bell" title="Exceptions" />
      <p className="lead">
        The only things in technicians' first jobs that need a person. Approval, first jobs, pauses by rule and checkers are the app's. Each
        answer here needs a few words; the technician reads them in the app.
      </p>
      <nav className="tabs" aria-label="Exceptions">
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {!d && !problem ? <p className="lead">Loading…</p> : null}
      {d && count === 0 ? <p className="card">Nothing needs you.</p> : null}
      {d ? (
        <div className="stack">
          {d.reports.length ? <h2>Reports ({d.reports.length})</h2> : null}
          <div className="list">
            {d.reports.map((r) => (
              <ReportCard key={r.id} r={r} onDone={load} />
            ))}
          </div>
          {d.appeals.length ? <h2>Appeals ({d.appeals.length})</h2> : null}
          <div className="list">
            {d.appeals.map((a) => (
              <AppealCard key={a.id} a={a} onDone={load} />
            ))}
          </div>
          {d.face_changes.length ? <h2>New photos, for the owner ({d.face_changes.length})</h2> : null}
          <div className="list">
            {d.face_changes.map((c) => (
              <FaceCard key={c.id} c={c} owner={d.is_owner} onDone={load} />
            ))}
          </div>
          {d.need_assessor.length || d.outside.length ? <h2>Risky work nobody can check yet</h2> : null}
          <div className="list">
            {d.need_assessor.map((n) => (
              <NeedCard key={`${n.pro_id}:${n.trade}`} n={n} owner={d.is_owner} onDone={load} />
            ))}
            {d.outside.map((o) => (
              <OutsideCard key={o.id} o={o} owner={d.is_owner} onDone={load} />
            ))}
          </div>
        </div>
      ) : null}
    </>
  );
}

/** One note, one row of buttons, the database's refusal under them. */
function useDecide(onDone: () => void) {
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  async function go(fn: string, args: Record<string, unknown>) {
    setBusy(true);
    setMsg(null);
    const r = await ask(fn, args);
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setNote('');
    onDone();
  }
  return { note, setNote, msg, busy, go };
}

function ReportCard({ r, onDone }: { r: Report; onDone: () => void }) {
  const { note, setNote, msg, busy, go } = useDecide(onDone);
  const decide = (outcome: 'upheld' | 'not_upheld' | 'false') => go('admin_safety_decide', { p_report: r.id, p_outcome: outcome, p_note: note });
  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">{KIND[r.kind]}</p>
          <h2>
            {r.pro}
            {r.ref ? ` · ${r.ref}` : ''}
          </h2>
          <p className="muted">
            {r.trade_name ? `${r.trade_name} · ` : ''}
            {when(r.at)} · {r.kind === 'face' ? 'all his work is paused' : `his ${r.trade_name ?? ''} work is paused`}
          </p>
        </div>
      </div>
      {r.words ? (
        <div className="evidence">
          <h3>{r.from_side === 'customer' ? `${r.from ?? 'The customer'} wrote` : 'The checker wrote'}</h3>
          <p className="about">“{r.words}”</p>
        </div>
      ) : null}
      {r.photo ? <Evidence title="Her photo" paths={[r.photo]} /> : null}
      <div className="evidence">
        <h3>His side</h3>
        <p>{r.his_side ? `“${r.his_side}”` : 'He has not written yet.'}</p>
      </div>
      {r.his_jobs.length ? (
        <div className="evidence">
          <h3>Jobs he has now (they go on unless you act on them)</h3>
          <ul className="extras">
            {r.his_jobs.map((j) => (
              <li key={j.ref}>
                {j.ref} · {j.trade} · {j.stage}
                {j.when_date ? ` · ${j.when_date}` : ''}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
      <section className="decide">
        <label>
          What you found (he reads it)
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="buttons">
          <button className="danger" disabled={busy} onClick={() => decide('upheld')}>
            {r.kind === 'face' ? 'Upheld: suspend him' : `Upheld: stop his ${r.trade_name ?? ''} work`}
          </button>
          <button disabled={busy} onClick={() => decide('not_upheld')}>Not upheld: lift the pause</button>
          <button className="secondary" disabled={busy} onClick={() => decide('false')}>False report: lift it, flag the customer</button>
        </div>
        {msg ? <p className="error" role="alert">{msg}</p> : null}
      </section>
    </article>
  );
}

function AppealCard({ a, onDone }: { a: Appeal; onDone: () => void }) {
  const { note, setNote, msg, busy, go } = useDecide(onDone);
  return (
    <article className="card">
      <p className="kind">{REASON[a.reason]}</p>
      <h2>
        {a.pro} · {a.trade_name}
      </h2>
      <p className="muted">Paused {when(a.paused_at)} · appealed {when(a.at)}</p>
      <div className="evidence">
        <h3>His appeal</h3>
        <p className="about">“{a.words}”</p>
      </div>
      <div className="evidence">
        <h3>His first jobs (on time · explained · clean · times she said it did not work)</h3>
        <ul className="extras">
          {a.first_jobs.map((j) => (
            <li key={j.ref}>
              {j.ref}: {ANSWER(j.on_time)} · {ANSWER(j.explained)} · {ANSWER(j.clean)} · {j.works_no} · {j.status}
              {j.why ? ` (${j.why.replace(/_/g, ' ')})` : ''}
            </li>
          ))}
        </ul>
      </div>
      <section className="decide">
        <label>
          Your answer (he reads it)
          <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
        </label>
        <div className="buttons">
          <button disabled={busy} onClick={() => go('admin_trade_appeal', { p_appeal: a.id, p_lift: true, p_note: note })}>Lift the pause</button>
          <button className="danger" disabled={busy} onClick={() => go('admin_trade_appeal', { p_appeal: a.id, p_lift: false, p_note: note })}>
            Keep it
          </button>
        </div>
        {msg ? <p className="error" role="alert">{msg}</p> : null}
      </section>
    </article>
  );
}

function FaceCard({ c, owner, onDone }: { c: FaceChange; owner: boolean; onDone: () => void }) {
  const { note, setNote, msg, busy, go } = useDecide(onDone);
  return (
    <article className="card">
      <p className="kind">A new photo after his first job</p>
      <h2>{c.pro}</h2>
      <p className="muted">Asked {when(c.at)}</p>
      <div className="evidence">
        <h3>Why</h3>
        <p className="about">“{c.reason}”</p>
      </div>
      {c.old_path ? <Evidence title="The photo customers check now" paths={[c.old_path]} /> : null}
      <Evidence title="The new photo" paths={[c.new_path]} />
      {owner ? (
        <section className="decide">
          <label>
            Your answer (he reads it)
            <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="buttons">
            <button disabled={busy} onClick={() => go('admin_face_change', { p_change: c.id, p_approve: true, p_note: note })}>Same man: use the new photo</button>
            <button className="danger" disabled={busy} onClick={() => go('admin_face_change', { p_change: c.id, p_approve: false, p_note: note })}>
              Refuse
            </button>
          </div>
          {msg ? <p className="error" role="alert">{msg}</p> : null}
        </section>
      ) : (
        <p className="muted">Only the owner decides this.</p>
      )}
    </article>
  );
}

function NeedCard({ n, owner, onDone }: { n: NeedAssessor; owner: boolean; onDone: () => void }) {
  const { note, setNote, msg, busy, go } = useDecide(onDone);
  const [who, setWho] = useState('');
  return (
    <article className="card">
      <p className="kind">An outside assessor, arranged by email</p>
      <h2>
        {n.pro} · {n.trade_name}
      </h2>
      <p>
        {n.pro} has earned a checked risky job in {n.trade_name}, but no technician on Pechkas can check him yet. Risky {n.trade_name} jobs stay
        closed to customers until somebody can. Arrange a qualified assessor by email; once you record him here, {n.pro.split(' ')[0]} may take
        one risky job in {n.sectors.join(', ')}, and you record what the assessor found.
      </p>
      {owner ? (
        <section className="decide">
          <div className="row">
            <label className="grow">
              The assessor's name and qualification
              <input value={who} maxLength={120} onChange={(e) => setWho(e.target.value)} />
            </label>
          </div>
          <label>
            Note (optional)
            <textarea rows={2} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <div className="buttons">
            <button disabled={busy} onClick={() => go('admin_outside_check', { p_pro: n.pro_id, p_trade: n.trade, p_assessor: who, p_note: note || null })}>
              Assessor arranged
            </button>
          </div>
          {msg ? <p className="error" role="alert">{msg}</p> : null}
        </section>
      ) : (
        <p className="muted">Only the owner arranges this.</p>
      )}
    </article>
  );
}

function OutsideCard({ o, owner, onDone }: { o: Outside; owner: boolean; onDone: () => void }) {
  const { note, setNote, msg, busy, go } = useDecide(onDone);
  const status =
    o.status === 'ready'
      ? 'Waiting for a customer to choose him for a risky job'
      : o.status === 'asked'
        ? `Chosen for ${o.ref}${o.sector ? ` in ${o.sector}` : ''}${o.when_date ? `, ${o.when_date}` : ''}: tell the assessor, then confirm here${o.answer_by ? ` by ${when(o.answer_by)}` : ''}`
        : `The assessor is going to ${o.ref}. Record what he found once the work has started.`;
  return (
    <article className="card">
      <p className="kind">Outside assessor: {o.assessor}</p>
      <h2>
        {o.pro} · {o.trade}
      </h2>
      <p>{status}</p>
      {owner ? (
        <section className="decide">
          {o.status === 'accepted' ? (
            <label>
              What the assessor reported (he reads it)
              <textarea rows={3} maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} />
            </label>
          ) : null}
          <div className="buttons">
            {o.status === 'asked' ? <button disabled={busy} onClick={() => go('admin_outside_confirm', { p_check: o.id })}>The assessor is going</button> : null}
            {o.status === 'accepted' ? (
              <>
                <button disabled={busy} onClick={() => go('admin_outside_result', { p_check: o.id, p_result: 'passed', p_note: note })}>Passed</button>
                <button className="secondary" disabled={busy} onClick={() => go('admin_outside_result', { p_check: o.id, p_result: 'not_yet', p_note: note })}>
                  Not yet
                </button>
                <button className="danger" disabled={busy} onClick={() => go('admin_outside_result', { p_check: o.id, p_result: 'unsafe', p_note: note })}>
                  Unsafe
                </button>
              </>
            ) : null}
            {o.status === 'ready' ? (
              <button className="secondary" disabled={busy} onClick={() => go('admin_cancel_outside', { p_check: o.id })}>Cancel the arrangement</button>
            ) : null}
          </div>
          {msg ? <p className="error" role="alert">{msg}</p> : null}
        </section>
      ) : null}
    </article>
  );
}

// --- First jobs set-up: the identity switch and the quizzes. The numbers are on Settings. ---

type Setup = {
  is_owner: boolean;
  identity: { on: boolean; service: string | null; live_since: string | null; deadline: string | null };
  quizzes: { key: string; trade: string | null; on: boolean; draw: number; questions: number; checked_by: string | null; checked_on: string | null }[];
  trades: { slug: string; name: string; opens_with: string | null; risky_types: number; trial: number; approved: number; legacy: number; checkers: number }[];
  settings: { key: string; value: number; set: boolean }[];
};

export function FirstJobsSetup() {
  const [d, setD] = useState<Setup | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [service, setService] = useState('');
  const [checker, setChecker] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_first_jobs');
    if (error) return setProblem(/admin_first_jobs|schema cache|does not exist/i.test(error.message) ? 'This page needs the database change 20261113000000_first_jobs.sql.' : error.message);
    setProblem(null);
    setD(data as Setup);
  }, []);
  useEffect(() => {
    load();
  }, [load]);

  async function run(fn: string, args: Record<string, unknown>) {
    setMsg(null);
    const r = await ask(fn, args);
    if (!r.ok) setMsg(r.why);
    load();
  }

  const unset = d?.settings.filter((s) => !s.set) ?? [];
  const name = (slug: string | null) => d?.trades.find((t) => t.slug === slug)?.name ?? slug ?? 'The rules';
  return (
    <>
      <Head icon="shield" title="First jobs" />
      <p className="lead">
        How new technicians start: the identity service, the quizzes, and who can check risky work in each trade. The numbers are under
        Settings → First jobs.
      </p>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {msg ? <p className="error" role="alert">{msg}</p> : null}
      {d ? (
        <div className="stack">
          {unset.length ? (
            <section className="card urgent">
              <h2>Numbers not set yet ({unset.length})</h2>
              <p>Whatever needs these waits until they are set: {unset.map((s) => s.key.replace(/_/g, ' ')).join(', ')}.</p>
            </section>
          ) : null}

          <section className="card">
            <h2>Identity service</h2>
            <p>
              {d.identity.on
                ? `On: ${d.identity.service}, since ${d.identity.live_since ? when(d.identity.live_since) : '—'}.`
                : 'Off. Technicians stay on first-job limits, and the app never says "identity verified".'}
              {d.identity.deadline ? ` Identity seen by staff stops counting after ${d.identity.deadline}.` : ''}
            </p>
            {d.is_owner ? (
              <div className="row">
                {!d.identity.on ? (
                  <label className="grow">
                    The service's name
                    <input value={service} maxLength={80} onChange={(e) => setService(e.target.value)} />
                  </label>
                ) : null}
                <button onClick={() => run('admin_identity_service', { p_on: !d.identity.on, p_service: service || null })}>
                  {d.identity.on ? 'Switch it off' : 'Switch it on'}
                </button>
              </div>
            ) : null}
            <p className="muted">Switch it on only once the service is connected: the button in the app starts a check with it.</p>
          </section>

          <section className="card">
            <h2>Quizzes</h2>
            <p className="muted">A quiz that is off asks nothing. A safety quiz is switched on only once a qualified person has checked its questions.</p>
            <div className="lines">
              {d.quizzes
                .filter((q) => q.key === 'rules' || d.trades.find((t) => t.slug === q.trade && !t.opens_with))
                .map((q) => (
                  <div key={q.key} className="line-item">
                    <strong>{q.key === 'rules' ? 'The rules quiz' : `Safety quiz: ${name(q.trade)}`}</strong>
                    <span className="muted">
                      {q.on ? 'On' : 'Off'} · {q.questions} questions ({q.draw} asked each time)
                      {q.checked_by ? ` · checked by ${q.checked_by} on ${q.checked_on}` : ''}
                    </span>
                    {d.is_owner ? (
                      <div className="row">
                        {!q.on && q.trade ? (
                          <label className="grow">
                            Checked by (name and qualification)
                            <input value={checker[q.key] ?? ''} maxLength={120} onChange={(e) => setChecker({ ...checker, [q.key]: e.target.value })} />
                          </label>
                        ) : null}
                        <button className={q.on ? 'secondary' : ''} onClick={() => run('admin_set_quiz', { p_quiz: q.key, p_on: !q.on, p_checked_by: checker[q.key] || null })}>
                          {q.on ? 'Switch off' : 'Switch on'}
                        </button>
                      </div>
                    ) : null}
                  </div>
                ))}
            </div>
          </section>

          <section className="card">
            <h2>Trades</h2>
            <div className="scroll">
              <table className="ledger">
                <thead>
                  <tr>
                    <th>Trade</th>
                    <th className="num">On first jobs</th>
                    <th className="num">Approved</th>
                    <th className="num">Before the rules, not sorted</th>
                    <th className="num">Can check risky work</th>
                  </tr>
                </thead>
                <tbody>
                  {d.trades.map((t) => (
                    <tr key={t.slug}>
                      <td>
                        {t.name}
                        {t.opens_with ? ` (opens with ${name(t.opens_with)})` : ''}
                      </td>
                      <td className="num">{t.trial}</td>
                      <td className="num">{t.approved}</td>
                      <td className="num">{t.legacy}</td>
                      <td className="num">{t.risky_types ? t.checkers : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}

// --- One technician's first-jobs record, on his application card. ---

type ProTrades = {
  identity: { kind: string; on?: string };
  face: { path: string; set_at: string; locked_at: string | null } | null;
  missing: 'phone' | 'face' | 'rules' | null;
  approved_how: 'rule' | 'hand' | null;
  trades: { trade: string; name: string; status: string; level: string; risky: string; note: string | null; first_jobs: { ref: string; status: string; why: string | null }[] }[];
  strikes: { cause: string; lifted_at: string | null }[];
};
const MISSING: Record<NonNullable<ProTrades['missing']>, string> = {
  phone: 'his number checked by SMS',
  face: 'his photo',
  rules: 'the rules quiz',
};

export function FirstJobsRecord({ pro }: { pro: string }) {
  const [d, setD] = useState<ProTrades | null>(null);
  useEffect(() => {
    supabase?.rpc('admin_pro_trades', { p_pro: pro }).then(({ data }) => setD((data as ProTrades) ?? null));
  }, [pro]);
  if (!d) return null;
  return (
    <section className="checks">
      <h3>First jobs</h3>
      <p>
        {d.missing ? `Still to do before his first job: ${MISSING[d.missing]}. The app approves him by itself once it is done.` : 'Every step before his first job is done.'}
        {d.approved_how === 'hand' ? ' Approved by hand, before the first-jobs rules.' : ''}
      </p>
      <p className="muted">
        Identity: {d.identity.kind === 'verified' ? `verified ${d.identity.on}` : d.identity.kind === 'staff' ? `seen by staff on ${d.identity.on}` : 'not verified'} · Photo:{' '}
        {d.face ? (d.face.locked_at ? 'locked since his first job' : 'taken') : 'not taken'}
      </p>
      {d.face ? <Evidence title="His photo" paths={[d.face.path]} bare /> : null}
      <ul>
        {d.trades.map((t) => (
          <li key={t.trade}>
            <strong>{t.name}</strong>: {t.status}, can take {t.level === 'none' ? 'nothing yet' : t.level === 'trial' ? 'first-job work' : t.level === 'basic' ? 'basic work' : 'everything'}
            {t.first_jobs.length ? ` · first jobs: ${t.first_jobs.map((j) => `${j.ref} ${j.status}${j.why ? ` (${j.why.replace(/_/g, ' ')})` : ''}`).join(', ')}` : ''}
            {t.note ? <span className="muted"> · {t.note}</span> : null}
          </li>
        ))}
      </ul>
      {d.strikes.some((s) => !s.lifted_at) ? <p className="error">A man he passed as a checker turned out bad: he is not picked to check again.</p> : null}
    </section>
  );
}
