import { useCallback, useEffect, useState } from 'react';
import { dayLabel, rupees, windowLabel } from '@pechkas/shared';
import { Head } from './Duo.tsx';
import { ask, supabase } from './supabase.ts';
import { shown } from './phones.ts';

/**
 * Guarantee claims and disputed jobs, from public.admin_guarantee().
 *
 * Most of this runs by itself: the technician answers a claim, comes back,
 * and the customer checks it; a job she has not checked closes after 24
 * hours. It comes to a person only when somebody disagrees — he says it is
 * not his work, she says it is still broken after his visit, he appeals a
 * charge, she said "not finished yet" twice, or nobody offers on a
 * replacement repair — then the office can raise what Pechkas pays for it
 * (admin_raise_cap). A charge is only added to what he owes after 7 days
 * without an appeal, or when the office upholds one (guarantee_followups). Every decision needs a
 * note, and both sides read it in the app. The database decides what each
 * button may do; this page only asks.
 */

type Photo = { stage: 'before' | 'after' | 'change' | 'receipt' | 'video' | 'fix'; path: string };
type Claim = {
  id: string;
  status: 'waiting' | 'coming' | 'checking' | 'refused' | 'replacing' | 'disputed' | 'fixed' | 'not_covered' | 'office_review';
  /** D35: a payment case is open on the job, so the claim is the office's. */
  payment_case?: boolean;
  job_id: string;
  ref: string;
  trade: string;
  title: string;
  sector: string;
  customer: string;
  customer_phone: string | null;
  pro: string | null;
  pro_phone: string | null;
  finished_at: string | null;
  guarantee_days: number | null;
  original_labour_paisa: number;
  description: string;
  media: string[] | null;
  created_at: string;
  answer_due: string;
  refuse_reason: string | null;
  visit_date: string | null;
  visit_from: number | null;
  fixed_photos: string[] | null;
  still_broken: string | null;
  why_replacing: 'no_answer' | 'missed_visit' | 'office' | null;
  charge_original: boolean;
  replacement_job_id: string | null;
  replacement_ref: string | null;
  block_lifted: boolean;
  blocking: boolean;
  office_note: string | null;
  decided_by_name: string | null;
  decided_at: string | null;
  charge_paisa: number | null;
  charge_due: string | null;
  /** Added to what he owes. False while it waits for its date or for an appeal. */
  charge_final: boolean;
  charged_at: string | null;
  replacement_status: string | null;
  replacement_offers: number | null;
  /** Open, announced long enough ago, and nobody has offered. */
  replacement_waiting: boolean;
  cap_paisa: number | null;
  first_cap_paisa: number | null;
  max_cap_paisa: number | null;
  can_raise_cap: boolean;
  cap_raised_at: string | null;
  cap_raised_by_name: string | null;
  cap_note: string | null;
  appeal_text: string | null;
  appeal_photos: string[] | null;
  appeal_at: string | null;
  appeal_outcome: 'upheld' | 'cancelled' | null;
  appeal_note: string | null;
  photos: Photo[] | null;
  needs_you: boolean;
};
type Check = {
  round: number;
  finished_at: string | null;
  answer: 'yes' | 'not_finished' | 'clock' | 'office' | null;
  reason: string | null;
  note: string | null;
  photo: string | null;
  pro_reply: string | null;
};
type Dispute = {
  job_id: string;
  ref: string;
  trade: string;
  title: string;
  sector: string;
  customer: string;
  customer_phone: string | null;
  pro: string | null;
  pro_phone: string | null;
  agreed_paisa: number | null;
  visit_fee_paisa: number | null;
  disputed_at: string | null;
  stage: string | null;
  status: string;
  outcome: 'done' | 'stopped' | 'return' | null;
  note: string | null;
  photos: Photo[] | null;
  checks: Check[] | null;
};
type Report = { claims: Claim[]; disputes: Dispute[]; reserve_paisa: number; charges_waiting_paisa?: number };

const CLOSED = new Set<Claim['status']>(['fixed', 'not_covered']);
const WHY_REPLACING = {
  no_answer: 'he did not answer the claim within 24 hours',
  missed_visit: 'he did not come in the window he chose',
  office: 'the office decided the claim is covered',
} as const;
const OUTCOME = {
  done: 'Decided: finished. The customer pays the agreed price.',
  stopped: 'Decided: not finished, with no commission. Whether a visit fee is owed is in Visit fees.',
  return: 'Decided: he goes back to fix it.',
} as const;
/** A charge recorded and not yet added: waiting for its date, or for the office's decision on his appeal. */
const pending = (c: Claim) => Boolean(c.charge_paisa) && !c.charge_final && c.appeal_outcome !== 'cancelled';
const ANSWER = { yes: 'She said yes, it works.', clock: 'Nobody answered; it closed by itself after 24 hours.', office: 'Decided by the office.' } as const;

/** "Sat 2 Nov, 3:40pm", always on Pakistan's clock whatever the computer's clock says. */
export function when(t: string): string {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Karachi',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    })
      .formatToParts(new Date(t))
      .map((p) => [p.type, p.value]),
  );
  return `${parts.weekday} ${parts.day} ${parts.month}, ${parts.hour}:${parts.minute}${(parts.dayPeriod ?? '').toLowerCase()}`;
}
const visit = (c: Pick<Claim, 'visit_date' | 'visit_from'>) =>
  c.visit_date ? `${dayLabel(c.visit_date)}${c.visit_from !== null ? `, ${windowLabel(c.visit_from)}` : ''}` : 'a day not yet set';
const first = (name: string | null) => (name ? name.split(' ')[0] : 'The technician');
const tel = (p: string) => `tel:+${p.replace(/^\+/, '')}`;
const money = (p: number | null | undefined) => rupees(p === null || p === undefined ? p : Number(p));

export function Guarantee() {
  const [r, setR] = useState<Report | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('admin_guarantee');
    if (error) {
      return setProblem(
        /admin_guarantee|schema cache|does not exist/i.test(error.message)
          ? 'This page needs the database changes 20261106000000_checks_and_guarantee.sql and 20261107000000_guarantee_followups.sql. Run them in Supabase first.'
          : `Could not load: ${error.message}`,
      );
    }
    setProblem(null);
    setR((data as Report | null) ?? { claims: [], disputes: [], reserve_paisa: 0 });
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 30000);
    return () => clearInterval(t);
  }, [load]);

  const claims = r?.claims ?? [];
  const disputes = r?.disputes ?? [];
  const waitingDisputes = disputes.filter((d) => d.status === 'assigned' && d.stage === 'disputed');
  const needClaims = claims.filter((c) => c.needs_you && !(c.replacement_waiting && c.status === 'replacing'));
  const waitingRepairs = claims.filter((c) => c.needs_you && c.replacement_waiting && c.status === 'replacing');
  const openClaims = claims.filter((c) => !c.needs_you && (!CLOSED.has(c.status) || pending(c)));
  const closedClaims = claims.filter((c) => !c.needs_you && CLOSED.has(c.status) && !pending(c));
  const decidedDisputes = disputes.filter((d) => !(d.status === 'assigned' && d.stage === 'disputed'));
  const needCount = needClaims.length + waitingDisputes.length + waitingRepairs.length;

  return (
    <>
      <Head icon="shield" title="Guarantee and disputes" />
      <p className="lead">
        When a job has gone wrong and the two sides disagree, it comes here. Read both sides, ring them if you need to, and decide.
        Every decision needs a note: both of them read it in the app.
      </p>
      <nav className="tabs" aria-label="Guarantee and disputes">
        <button className="tab" onClick={load}>Refresh</button>
      </nav>
      {problem ? <p className="error" role="alert">{problem}</p> : null}
      {r === null && !problem ? <p className="lead">Loading…</p> : null}

      {r ? (
        <div className="stack">
          <Reserve paisa={Number(r.reserve_paisa)} waiting={Number(r.charges_waiting_paisa ?? 0)} />

          <section className="stack" aria-labelledby="needs-you">
            <h2 id="needs-you">Needs you{needCount ? ` (${needCount})` : ''}</h2>
            {needCount === 0 ? <p className="card">Nothing needs you.</p> : null}
            <div className="list">
              {waitingDisputes.map((d) => (
                <DisputeCard key={d.job_id} d={d} onChanged={load} />
              ))}
              {needClaims.map((c) => (
                <ClaimCard key={c.id} c={c} onChanged={load} />
              ))}
              {waitingRepairs.map((c) => (
                <WaitingRepair key={c.id} c={c} onChanged={load} />
              ))}
            </div>
          </section>

          <section className="card" aria-labelledby="open-claims">
            <h2 id="open-claims">Open claims{openClaims.length ? ` (${openClaims.length})` : ''}</h2>
            <p className="muted">These are moving by themselves. Nothing here needs a decision.</p>
            {openClaims.length === 0 ? <p>No claims open.</p> : null}
            <div className="lines">
              {openClaims.map((c) => (
                <OpenClaim key={c.id} c={c} onChanged={load} />
              ))}
            </div>
          </section>

          <section className="card">
            <details>
              <summary>Recently closed ({closedClaims.length + decidedDisputes.length})</summary>
              {closedClaims.length + decidedDisputes.length === 0 ? <p>Nothing closed in the last 60 days.</p> : null}
              <div className="lines">
                {decidedDisputes.map((d) => (
                  <ClosedDispute key={d.job_id} d={d} />
                ))}
                {closedClaims.map((c) => (
                  <ClosedClaim key={c.id} c={c} />
                ))}
              </div>
            </details>
          </section>
        </div>
      ) : null}
    </>
  );
}

function Reserve({ paisa, waiting }: { paisa: number; waiting: number }) {
  return (
    <section className="card">
      <div className="card-head">
        <h2>Guarantee reserve</h2>
        <div className="price">
          <strong>{money(paisa)}</strong>
        </div>
      </div>
      <p className="muted">
        20% of every commission is set aside here. It pays for guarantee repairs done by another technician, and it is filled again when
        the technician whose work failed is charged.
      </p>
      {waiting > 0 ? (
        <p className="muted">
          {money(waiting)} more is recorded against technicians and comes back to the reserve once their 7 days to appeal have passed.
        </p>
      ) : null}
      {paisa <= 0 ? (
        <p className="why">
          The reserve is empty. Guarantee repairs are still Pechkas's promise and are still paid: the money comes from Pechkas until the
          reserve fills again.
        </p>
      ) : null}
    </section>
  );
}

/** The two names and a button to ring each. */
export function People({ customer, customerPhone, pro, proPhone }: { customer: string; customerPhone: string | null; pro: string | null; proPhone: string | null }) {
  return (
    <>
      <p>
        <strong>Customer:</strong> {customer} · <strong>Technician:</strong> {pro ?? 'no longer on Pechkas'}
      </p>
      <div className="buttons">
        {customerPhone ? <a className="call" href={tel(customerPhone)}>Call {customer} · {shown(customerPhone)}</a> : <span className="muted">No number for {customer}.</span>}
        {proPhone ? <a className="call" href={tel(proPhone)}>Call {first(pro)} · {shown(proPhone)}</a> : pro ? <span className="muted">No number for {first(pro)}.</span> : null}
      </div>
    </>
  );
}

const VIDEO = /\.(mp4|mov|m4v|webm)$/i;
const AUDIO = /\.(m4a|aac|mp3|wav|ogg|3gp)$/i;

/** Photos, videos and voice notes from the private job-media folder, through links that work for an hour. */
export function Evidence({ title, paths, bare = false }: { title: string; paths: string[] | null | undefined; bare?: boolean }) {
  const list = (paths ?? []).filter(Boolean);
  const keyed = list.join('|');
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!supabase || !keyed) return;
    supabase.storage
      .from('job-media')
      .createSignedUrls(keyed.split('|'), 3600)
      .then(({ data, error }) => {
        if (error || !data) return setFailed(true);
        const next: Record<string, string> = {};
        data.forEach((d) => {
          if (d.signedUrl && d.path) next[d.path] = d.signedUrl;
        });
        setUrls(next);
      });
  }, [keyed]);

  if (!list.length) return null;
  return (
    <div className={bare ? undefined : 'evidence'}>
      {bare ? null : <h3>{title}</h3>}
      {failed ? (
        <p className="error">The files could not be opened. Refresh and try again.</p>
      ) : (
        <div className="media">
          {list.map((p) => {
            const url = urls[p];
            if (!url) return <p key={p} className="muted">Opening…</p>;
            if (VIDEO.test(p)) return <video key={p} controls preload="metadata" src={url} />;
            if (AUDIO.test(p)) return <audio key={p} controls preload="none" src={url} />;
            return (
              <a key={p} href={url} target="_blank" rel="noreferrer">
                <img src={url} alt={title} />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}

const stagePaths = (photos: Photo[] | null, stages: Photo['stage'][]) => (photos ?? []).filter((p) => stages.includes(p.stage)).map((p) => p.path);

/** A note box and a row of buttons. The database checks the note and says why it refused, beside the form. */
export function Decide({
  label,
  choices,
  onDone,
}: {
  label: string;
  choices: { text: string; secondary?: boolean; run: (note: string) => Promise<{ ok: boolean; why?: string }> }[];
  onDone: () => void;
}) {
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function go(run: (note: string) => Promise<{ ok: boolean; why?: string }>) {
    if (note.trim().length < 5) return setMsg('Write what you found, in a sentence, before deciding.');
    setBusy(true);
    setMsg(null);
    const r = await run(note.trim());
    setBusy(false);
    if (!r.ok) return setMsg(r.why ?? 'The database refused.');
    setNote('');
    onDone();
  }

  return (
    <section className="decide">
      <label>
        {label}
        <textarea rows={3} value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
      </label>
      <div className="buttons">
        {choices.map((c) => (
          <button key={c.text} className={c.secondary ? 'secondary' : undefined} disabled={busy} onClick={() => go(c.run)}>
            {c.text}
          </button>
        ))}
      </div>
      {msg ? <p className="error" role="alert">{msg}</p> : null}
    </section>
  );
}

function DisputeCard({ d, onChanged }: { d: Dispute; onChanged: () => void }) {
  const decide = (outcome: 'done' | 'stopped' | 'stopped_no_fee' | 'return') => (note: string) =>
    ask('admin_decide_dispute', { p_job: d.job_id, p_outcome: outcome, p_note: note }) as Promise<{ ok: boolean; why?: string }>;

  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">Disputed job · she said “not finished yet” twice</p>
          <h2>
            {d.ref} · {d.title}
          </h2>
          <p className="muted">
            {d.trade} · {d.sector}
            {d.disputed_at ? ` · came to you ${when(d.disputed_at)}` : ''}
          </p>
        </div>
        <div className="price">
          <strong>{money(d.agreed_paisa)}</strong>
          <span className="muted">agreed</span>
        </div>
      </div>
      <People customer={d.customer} customerPhone={d.customer_phone} pro={d.pro} proPhone={d.pro_phone} />

      {(d.checks ?? []).map((k) => (
        <div key={k.round} className="evidence">
          <h3>
            Round {k.round}
            {k.finished_at ? ` · ${first(d.pro)} said finished ${when(k.finished_at)}` : ''}
          </h3>
          {k.answer === 'not_finished' ? (
            <p>
              <strong>{d.customer} said not finished yet:</strong> {k.reason ?? 'no reason given'}
            </p>
          ) : k.answer ? (
            <p>{ANSWER[k.answer]}</p>
          ) : (
            <p className="muted">She has not answered this round.</p>
          )}
          {k.note ? <p className="about">“{k.note}”</p> : null}
          {k.photo ? <Evidence bare title={`${d.customer}'s photo`} paths={[k.photo]} /> : null}
          {k.pro_reply ? (
            <p>
              <strong>{first(d.pro)} replied:</strong> “{k.pro_reply}”
            </p>
          ) : null}
        </div>
      ))}
      <Evidence title={`${first(d.pro)}'s photos when he finished`} paths={stagePaths(d.photos, ['after', 'video'])} />
      <Evidence title="Before he started" paths={stagePaths(d.photos, ['before'])} />

      <Decide
        label="What you found (both of them read this in the app)"
        choices={[
          { text: `Finished: customer pays ${money(d.agreed_paisa)}`, run: decide('done') },
          { text: `Not finished, not his fault: visit fee ${money(d.visit_fee_paisa)}`, run: decide('stopped') },
          { text: 'Not finished, his fault: no fee', run: decide('stopped_no_fee') },
          { text: 'He goes back to fix it', secondary: true, run: decide('return') },
        ]}
        onDone={onChanged}
      />
      <p className="muted small">
        Finished closes the job as done, with the usual commission. Not finished ends it with no commission: the customer pays the
        visit fee only when the failure was not his (a part could not be had, say), and nothing when it was his work.
        Going back puts the job back to “Working”: he fixes it, taps Work finished, and she checks again.
      </p>
    </article>
  );
}

function ClaimCard({ c, onChanged }: { c: Claim; onChanged: () => void }) {
  const appeal = c.appeal_at !== null && c.appeal_outcome === null;
  const name = first(c.pro);
  const review = c.status === 'office_review';
  const kind = appeal
    ? `${name} appeals against a guarantee charge`
    : review
      ? `Guarantee claim · held by the office: a payment dispute is open on this job`
      : c.status === 'refused'
      ? `Guarantee claim · ${name} says this isn't his work`
      : `Guarantee claim · ${c.customer} says it is still broken after his visit`;

  const claim = (covered: boolean) => (note: string) =>
    ask('admin_decide_claim', { p_claim: c.id, p_covered: covered, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
  const reviewClaim = (action: 'replace' | 'replace_charge' | 'not_covered' | 'to_pro') => (note: string) =>
    ask('admin_review_claim', { p_claim: c.id, p_action: action, p_note: note }) as Promise<{ ok: boolean; why?: string }>;
  const decideAppeal = (cancel: boolean) => (note: string) =>
    ask('admin_decide_appeal', { p_claim: c.id, p_cancel: cancel, p_note: note }) as Promise<{ ok: boolean; why?: string }>;

  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">{kind}</p>
          <h2>
            {c.ref} · {c.title}
          </h2>
          <p className="muted">
            {c.trade} · {c.sector}
            {c.finished_at ? ` · finished ${when(c.finished_at)}` : ''}
            {c.guarantee_days ? ` · ${c.guarantee_days}-day guarantee` : ''} · claimed {when(c.created_at)}
          </p>
        </div>
        <div className="price">
          <strong>{money(appeal ? c.charge_paisa : c.original_labour_paisa)}</strong>
          <span className="muted">{appeal ? (c.charge_final ? 'he was charged' : 'not yet charged') : 'his labour on the job'}</span>
        </div>
      </div>
      <People customer={c.customer} customerPhone={c.customer_phone} pro={c.pro} proPhone={c.pro_phone} />

      <div className="evidence">
        <h3>What {c.customer} says is wrong</h3>
        <p className="about">“{c.description}”</p>
      </div>
      <Evidence title={`${c.customer}'s photos and videos of the fault`} paths={c.media} />
      <Evidence title={`${name}'s photos when he finished the job`} paths={stagePaths(c.photos, ['after', 'video'])} />

      {c.refuse_reason ? (
        <div className="evidence">
          <h3>{name}'s reason</h3>
          <p className="about">“{c.refuse_reason}”</p>
        </div>
      ) : null}
      {c.fixed_photos?.length || c.still_broken ? (
        <div className="evidence">
          <h3>His guarantee visit{c.visit_date ? `, ${visit(c)}` : ''}</h3>
          {c.still_broken ? (
            <p>
              <strong>{c.customer} says afterwards:</strong> “{c.still_broken}”
            </p>
          ) : null}
        </div>
      ) : null}
      <Evidence title={`${name}'s photos from his visit`} paths={c.fixed_photos} />

      {appeal ? (
        <>
          <div className="evidence">
            <h3>
              {name}'s appeal{c.appeal_at ? `, ${when(c.appeal_at)}` : ''}
            </h3>
            <p>
              {c.charge_final
                ? `He was charged ${money(c.charge_paisa)}${c.charged_at ? ` on ${when(c.charged_at)}` : ''}`
                : `He is to be charged ${money(c.charge_paisa)} — nothing is added to what he owes until you decide —`}{' '}
              because {c.why_replacing ? WHY_REPLACING[c.why_replacing] : 'another technician had to do the repair'}.
            </p>
            {c.office_note ? <p className="muted">The office's earlier note: “{c.office_note}”</p> : null}
            <p className="about">“{c.appeal_text}”</p>
          </div>
          <Evidence title="Photos with his appeal" paths={c.appeal_photos} />
          <Decide
            label="Why (he reads this in the app). This is decided once."
            choices={[
              { text: c.charge_final ? 'Keep the charge' : `Keep the charge: add ${money(c.charge_paisa)} now`, run: decideAppeal(false) },
              { text: `Cancel the charge (${money(c.charge_paisa)})`, secondary: true, run: decideAppeal(true) },
            ]}
            onDone={onChanged}
          />
          <p className="muted small">
            {c.charge_final
              ? 'Cancelling takes the charge off what he owes, in the record, with your note beside it.'
              : 'Cancelling means it is never added. Keeping it adds it to what he owes today; past the credit limit his new offers stop until he pays.'}
          </p>
        </>
      ) : review ? (
        <>
          <div className="evidence">
            <h3>Why this is with you</h3>
            <p>
              {name} has said {c.customer} did not pay him in full (see Payment disputes). Her guarantee is the same as on any job, but
              while that is open the office decides the claim, not him. {name} has not been asked, and no clock is running against him.
            </p>
          </div>
          <Decide
            label="What you found (she reads this in the app)"
            choices={[
              { text: 'Send another technician: Pechkas pays, no charge to him', run: reviewClaim('replace') },
              { text: `Let ${name} handle it: he gets 24 hours to answer`, secondary: true, run: reviewClaim('to_pro') },
              { text: 'Not covered: close it', secondary: true, run: reviewClaim('not_covered') },
              { text: 'His work was at fault, on your own evidence: send another and charge him', secondary: true, run: reviewClaim('replace_charge') },
            ]}
            onDone={onChanged}
          />
          <p className="muted small">
            The payment dispute alone is never evidence about his work and never a reason to charge him. Charge him only when you have
            found yourself that his work failed; it is then the usual charge, never more than {money(c.original_labour_paisa)}, added
            to what he owes 7 days after the repair if he does not appeal.
          </p>
        </>
      ) : (
        <>
          <Decide
            label="What you found (both of them read this in the app)"
            choices={[
              { text: 'Covered: send another technician (he is charged)', run: claim(true) },
              { text: 'Not covered: close it', secondary: true, run: claim(false) },
            ]}
            onDone={onChanged}
          />
          <p className="muted small">
            Covered: {c.customer} chooses a day, the job goes to the other technicians, and Pechkas pays from the reserve. When it is
            done, {name} is charged never more than {money(c.original_labour_paisa)}; it is added to what he owes after 7 days, and he
            may appeal once before then. Not covered: the claim closes and {c.customer} reads your note.
          </p>
        </>
      )}
    </article>
  );
}

/** What an open claim is waiting for, in a line. */
function claimNow(c: Claim): string {
  const name = first(c.pro);
  switch (c.status) {
    case 'waiting':
      return new Date(c.answer_due).getTime() > Date.now()
        ? `Waiting for ${name} to answer — answer due ${when(c.answer_due)}.`
        : `${name}'s answer was due ${when(c.answer_due)}. Another technician will be arranged within the minute.`;
    case 'coming':
      return `${name} is coming back ${visit(c)}.`;
    case 'checking':
      return `${name} has been back. Waiting for ${c.customer} to check it; it closes by itself after 24 hours.`;
    case 'replacing':
      return `Another technician is being arranged, paid by Pechkas, because ${c.why_replacing ? WHY_REPLACING[c.why_replacing] : 'the claim is covered'}. ${
        c.replacement_ref ? `Booked as ${c.replacement_ref}.` : `Not booked yet: ${c.customer} chooses the day in the app.`
      }`;
    default:
      return pending(c)
        ? c.appeal_at
          ? `Fixed by another technician. ${name} has appealed his ${money(c.charge_paisa)} charge; nothing is added until you decide.`
          : `Fixed by another technician. ${name} will be charged ${money(c.charge_paisa)} on ${c.charge_due ? when(c.charge_due) : 'the due date'} unless he appeals before then.`
        : '';
  }
}

function OpenClaim({ c, onChanged }: { c: Claim; onChanged: () => void }) {
  const [lifting, setLifting] = useState(false);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function lift() {
    if (note.trim().length < 5) return setMsg('Write why, in a sentence.');
    setBusy(true);
    setMsg(null);
    const r = await ask('admin_lift_block', { p_claim: c.id, p_note: note.trim() });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setLifting(false);
    setNote('');
    onChanged();
  }

  return (
    <div className="line-item">
      <p>
        <strong>
          {c.ref} · {c.title}
        </strong>{' '}
        <span className="muted">
          · {c.sector} · {c.customer} · {c.pro ?? 'technician gone'} · claimed {when(c.created_at)}
        </span>
      </p>
      <p>{claimNow(c)}</p>
      {c.status === 'replacing' ? (
        <p className="muted small">
          {c.charge_original
            ? `${first(c.pro)} will be charged when the repair is done, never more than ${money(c.original_labour_paisa)}, with 7 days to appeal.`
            : `${first(c.pro)} is not charged for this one.`}
        </p>
      ) : null}
      {c.can_raise_cap ? <RaiseCap c={c} onChanged={onChanged} /> : null}
      {c.blocking ? (
        <>
          <p className="error">{first(c.pro)}'s new offers are stopped because of this claim.</p>
          {lifting ? (
            <div className="row">
              <label className="grow">
                Why he may offer again (kept in the record)
                <input value={note} maxLength={500} onChange={(e) => setNote(e.target.value)} />
              </label>
              <button className="small" disabled={busy} onClick={lift}>Give his offers back</button>
              <button className="secondary small" disabled={busy} onClick={() => setLifting(false)}>Back</button>
            </div>
          ) : (
            <div className="buttons">
              <button className="secondary small" onClick={() => setLifting(true)}>Give his offers back</button>
            </div>
          )}
          {msg ? <p className="error" role="alert">{msg}</p> : null}
        </>
      ) : c.block_lifted ? (
        <p className="muted small">The office gave his offers back while this is open.</p>
      ) : null}
    </div>
  );
}

function ClosedClaim({ c }: { c: Claim }) {
  return (
    <div className="line-item">
      <p>
        <strong>
          {c.ref} · {c.title}
        </strong>{' '}
        <span className="muted">
          · guarantee claim · {c.customer} · {c.pro ?? 'technician gone'} · claimed {when(c.created_at)}
        </span>
      </p>
      <p>{c.status === 'fixed' ? 'Fixed.' : 'Not covered.'}</p>
      {c.office_note ? (
        <p className="muted">
          The office{c.decided_by_name ? ` (${c.decided_by_name})` : ''}
          {c.decided_at ? `, ${when(c.decided_at)}` : ''}: “{c.office_note}”
        </p>
      ) : null}
      {c.charge_paisa ? (
        <p className="muted">
          {c.charge_final || c.appeal_outcome === 'cancelled' ? (c.charge_final ? `${first(c.pro)} was charged ${money(c.charge_paisa)}` : `${first(c.pro)}'s ${money(c.charge_paisa)} charge was never added`) : `${first(c.pro)} is to be charged ${money(c.charge_paisa)}`}
          {c.charge_final && c.charged_at ? ` on ${when(c.charged_at)}` : ''}.
          {c.appeal_outcome === 'cancelled' ? ' He appealed, and the charge was cancelled.' : c.appeal_outcome === 'upheld' ? ' He appealed, and the charge was kept.' : ''}
          {c.appeal_note ? ` “${c.appeal_note}”` : ''}
        </p>
      ) : null}
    </div>
  );
}

function ClosedDispute({ d }: { d: Dispute }) {
  return (
    <div className="line-item">
      <p>
        <strong>
          {d.ref} · {d.title}
        </strong>{' '}
        <span className="muted">
          · disputed job · {d.customer} · {d.pro ?? 'technician gone'}
          {d.disputed_at ? ` · ${when(d.disputed_at)}` : ''}
        </span>
      </p>
      <p>{d.outcome ? OUTCOME[d.outcome] : 'Settled without the office.'}</p>
      {d.note ? <p className="muted">“{d.note}”</p> : null}
    </div>
  );
}

/** A replacement repair nobody has offered on: the office's to know about, and its limit the office's to raise. */
function WaitingRepair({ c, onChanged }: { c: Claim; onChanged: () => void }) {
  return (
    <article className="card urgent">
      <div className="card-head">
        <div>
          <p className="kind">Guarantee repair · nobody has offered</p>
          <h2>
            {c.replacement_ref ?? c.ref} · {c.title}
          </h2>
          <p className="muted">
            {c.trade} · {c.sector} · for {c.customer}'s claim on {c.ref} · {first(c.pro)}'s work
          </p>
        </div>
        <div className="price">
          <strong>{money(c.cap_paisa)}</strong>
          <span className="muted">what Pechkas pays now</span>
        </div>
      </div>
      <p>
        No technician has offered at {money(c.cap_paisa)}. You can raise what Pechkas pays so more of them can take it, or ring{' '}
        {c.customer} to agree another day.
      </p>
      <People customer={c.customer} customerPhone={c.customer_phone} pro={c.pro} proPhone={c.pro_phone} />
      <RaiseCap c={c} onChanged={onChanged} open />
    </article>
  );
}

/**
 * "Raise the limit": upwards only, whole rupees, at most three times the
 * first limit, with a reason kept on record. The job is announced to the
 * technicians again at once. The extra is Pechkas' cost: the technician
 * whose work failed is never charged more than his own labour, and the
 * customer pays nothing.
 */
function RaiseCap({ c, onChanged, open = false }: { c: Claim; onChanged: () => void; open?: boolean }) {
  const [editing, setEditing] = useState(open);
  const [rs, setRs] = useState('');
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function raise() {
    const n = Number(rs.replace(/[,\s]/g, ''));
    if (!Number.isInteger(n) || n <= 0) return setMsg('Write the new limit in whole rupees, for example 5000.');
    if (note.trim().length < 5) return setMsg('Write why, in a sentence. It stays on the record.');
    setBusy(true);
    setMsg(null);
    const r = await ask('admin_raise_cap', { p_claim: c.id, p_cap_paisa: n * 100, p_note: note.trim() });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setRs('');
    setNote('');
    setEditing(open);
    onChanged();
  }

  const raised = c.cap_raised_at ? (
    <p className="muted small">
      Raised from {money(c.first_cap_paisa)} to {money(c.cap_paisa)} by {c.cap_raised_by_name ?? 'the office'}, {when(c.cap_raised_at)}: “{c.cap_note}”
    </p>
  ) : null;

  if (!editing) {
    return (
      <>
        {raised}
        <p className="muted small">
          Pechkas pays up to {money(c.cap_paisa)} for {c.replacement_ref ?? 'the repair'}
          {c.replacement_offers ? ` · ${c.replacement_offers} ${c.replacement_offers === 1 ? 'offer' : 'offers'} so far` : ' · no offers yet'}.
        </p>
        <div className="buttons">
          <button className="secondary small" onClick={() => setEditing(true)}>Raise the limit</button>
        </div>
      </>
    );
  }
  return (
    <div className="evidence">
      <h3>Raise the limit</h3>
      {raised}
      <p className="muted small">
        Now {money(c.cap_paisa)}. At most {money(c.max_cap_paisa)}, three times the first limit, to catch a typing slip. Whatever is above{' '}
        {money(c.original_labour_paisa)} is Pechkas' own cost: {first(c.pro)} is never charged more than his labour on the job, and{' '}
        {c.customer} pays nothing.
      </p>
      <div className="row">
        <label>
          New limit, in rupees
          <input inputMode="numeric" value={rs} maxLength={9} onChange={(e) => setRs(e.target.value)} placeholder={String(Math.round(Number(c.cap_paisa ?? 0) / 100) + 500)} />
        </label>
        <label className="grow">
          Why (kept in the record)
          <input value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
        </label>
      </div>
      <div className="buttons">
        <button className="small" disabled={busy} onClick={raise}>
          Raise the limit
        </button>
        {open ? null : (
          <button className="secondary small" disabled={busy} onClick={() => setEditing(false)}>
            Back
          </button>
        )}
      </div>
      {msg ? <p className="error" role="alert">{msg}</p> : null}
    </div>
  );
}
