import { useCallback, useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { rupees } from '@pechkas/shared';
import { Button, Field, Loading, Notice, Screen } from '../../src/components/ui';
import { Panel } from '../../src/components/Panel';
import { DuoIcon } from '../../src/components/DuoIcon';
import { Icon } from '../../src/components/Icon';
import { Trouble } from '../../src/components/Trouble';
import { useSignedUrls } from '../../src/post/RemoteMedia';
import { detailOf, takePhoto, upload } from '../../src/post/media';
import { useAccount } from '../../src/account';
import { useLists } from '../../src/lists';
import { ask, supabase } from '../../src/supabase';
import { done, type Message } from '../../src/message';
import { noAnswer, type NoAnswer } from '../../src/net';
import { fill, useProWords, type ProWords } from '../../src/words';
import { colour, font } from '../../src/theme';

type Quiz = { key: string; on: boolean; passed: boolean; again_from: string | null };
type FirstJob = { ref: string; status: 'open' | 'waiting' | 'good' | 'not_counted'; why: string | null; answered: boolean };
type Trade = {
  trade: string;
  name: string;
  status: 'trial' | 'approved' | 'paused' | 'stopped' | 'legacy';
  level: 'none' | 'trial' | 'basic' | 'full';
  risky: 'locked' | 'unlocked';
  has_risky: boolean;
  opens_with: string | null;
  safety_quiz: Quiz;
  good: number;
  first_jobs: FirstJob[];
  pause_reason: 'safety' | 'face' | 'works_no' | 'answers' | null;
  appeal: { status: 'waiting' | 'lifted' | 'kept'; note: string | null } | null;
  can_appeal: boolean;
  risk_ready: boolean;
  check: { status: string; kind: string; note: string | null } | null;
};
type Report = { id: string; kind: 'safety' | 'face' | 'unsafe_check'; ref: string | null; status: 'open' | 'upheld' | 'not_upheld' | 'false'; his_side: string | null; note: string | null };
export type MyTrades = {
  status: 'applied' | 'approved' | 'rejected' | 'suspended';
  phone_checked: boolean;
  face: { path: string; locked: boolean } | null;
  face_change: { status: 'waiting' | 'approved' | 'refused'; note: string | null } | null;
  missing: 'phone' | 'face' | 'rules' | null;
  identity: { kind: 'verified' | 'staff' | 'phone' | 'none'; on?: string };
  identity_ok: boolean;
  identity_service: boolean;
  identity_pending: boolean;
  rules_quiz: Quiz;
  trial_jobs_needed: number;
  price_cap_paisa: number | null;
  trades: Trade[];
  reports: Report[];
};

const day = (d: string) =>
  new Date(d.length === 10 ? `${d}T12:00:00+05:00` : d).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });

/**
 * His first jobs (D37): what the app checks before his first job, what each
 * trade opens to him, how many of his first jobs have counted and why the
 * others did not, a pause and his appeal, and any report about him. Every
 * line is read from `my_trades()`; nothing here is a person's decision
 * except the written answers he is shown.
 */
export default function FirstJobs() {
  const { ready, session, account } = useAccount();
  const { w } = useProWords();
  const [data, setData] = useState<MyTrades | null>(null);
  const [trouble, setTrouble] = useState<NoAnswer | null>(null);
  const [notice, setNotice] = useState<string | Message | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data: d, error } = await supabase.rpc('my_trades');
    if (error) {
      setTrouble(noAnswer());
      return;
    }
    setTrouble(null);
    setData((d as MyTrades) ?? null);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  if (!account?.pro) return <Redirect href="/pro/apply" />;

  async function photo() {
    setNotice(null);
    setBusy('photo');
    try {
      const m = await takePhoto(true);
      if (!m) return;
      const path = await upload(m, session!.user.id);
      const r = await ask('set_my_face', { p_path: path });
      if (!r.ok) setNotice(r.why);
      else setNotice(done(w.photoSaved));
      await load();
    } catch (e) {
      setNotice(`That did not work. Try again. (Details: ${detailOf(e)})`);
    } finally {
      setBusy(null);
    }
  }

  async function identity() {
    setBusy('identity');
    const r = await ask('identity_start');
    setBusy(null);
    setNotice(r.ok ? done(w.idStarted) : r.why);
    await load();
  }

  return (
    <Screen hero={{ title: w.firstJobs, sub: w.firstJobsSub, back: true }}>
      <Notice text={notice} />
      {!data && trouble ? <Trouble kind={trouble} onRetry={load} /> : null}
      {!data && !trouble ? <Loading /> : null}
      {data ? (
        <>
          <Panel icon="shield" title={w.beforeTitle}>
            <Step done={data.phone_checked} label={w.stepNumber} value={data.phone_checked ? w.stepNumberDone : w.stepNumberTodo}>
              {!data.phone_checked ? <Button kind="outline" label={w.checkNumber} onPress={() => router.push('/pro/check-number')} /> : null}
            </Step>
            <FaceStep data={data} w={w} busy={busy === 'photo'} onTake={photo} userId={session.user.id} onChanged={load} setNotice={setNotice} />
            <Step
              done={!data.rules_quiz.on || data.rules_quiz.passed}
              label={w.stepRules}
              value={quizLine(data.rules_quiz, w)}
            >
              {data.rules_quiz.on && !data.rules_quiz.passed && !data.rules_quiz.again_from ? (
                <Button kind="outline" label={w.takeQuiz} onPress={() => router.push({ pathname: '/pro/quiz', params: { key: 'rules' } })} />
              ) : null}
            </Step>
            <Step done={data.identity.kind === 'verified'} label={w.stepIdentity} value={identityLine(data, w)} last>
              {data.identity_service && data.identity.kind !== 'verified' && !data.identity_pending ? (
                <Button kind="outline" label={w.idStart} onPress={identity} busy={busy === 'identity'} />
              ) : null}
            </Step>
            {data.status === 'applied' && data.missing ? <Text style={s.small}>{w.personWaiting}</Text> : null}
          </Panel>

          {data.trades.some((t) => t.status === 'trial') ? (
            <Panel icon="doc" title={w.limitsTitle}>
              <Tick text={w.limitsTrial} />
              <Tick text={data.price_cap_paisa ? `${w.limitsBasic} (${rupees(data.price_cap_paisa)})` : w.limitsBasic} />
              <Tick text={w.limitsCheck} />
              {!data.identity_ok ? <Tick text={w.limitsIdentity} /> : null}
              <Tick text={w.limitsRisky} />
            </Panel>
          ) : null}

          {data.trades.map((t) => (
            <TradeCard key={t.trade} t={t} data={data} w={w} onChanged={load} setNotice={setNotice} />
          ))}

          {data.reports.length ? (
            <Panel icon="flag" title={w.reportsTitle}>
              {data.reports.map((r, i) => (
                <ReportRow key={r.id} r={r} w={w} last={i === data.reports.length - 1} onChanged={load} setNotice={setNotice} />
              ))}
            </Panel>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function quizLine(q: Quiz, w: ProWords) {
  if (!q.on) return w.quizOff;
  if (q.passed) return w.quizPassed;
  if (q.again_from && new Date(q.again_from) > new Date()) return fill(w.quizAgain, { date: day(q.again_from) });
  return w.quizTodo;
}

function identityLine(d: MyTrades, w: ProWords) {
  if (d.identity.kind === 'verified') return fill(w.idVerified, { date: day(d.identity.on!) });
  if (d.identity.kind === 'staff') return fill(w.idStaff, { date: day(d.identity.on!) });
  if (d.identity_pending) return w.idPending;
  return d.identity.kind === 'phone' ? w.idPhone : w.idNone;
}

/** One step: a tick or an empty disc, the words, and the one button that does it. */
function Step({ done: isDone, label, value, children, last = false }: { done: boolean; label: string; value: string; children?: React.ReactNode; last?: boolean }) {
  return (
    <View style={[s.step, !last && s.stepRule]}>
      <View style={s.stepHead}>
        <View style={[s.disc, isDone && s.discDone]}>{isDone ? <Icon name="check" size={16} color={colour.white} /> : null}</View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.label}>{label}</Text>
          <Text style={s.value}>{value}</Text>
        </View>
      </View>
      {children}
    </View>
  );
}

function Tick({ text }: { text: string }) {
  return (
    <View style={s.tick}>
      <Icon name="check" size={16} color={colour.green} />
      <Text style={s.tickText}>{text}</Text>
    </View>
  );
}

function FaceStep({ data, w, busy, onTake, userId, onChanged, setNotice }: {
  data: MyTrades; w: ProWords; busy: boolean; onTake: () => void; userId: string; onChanged: () => void; setNotice: (m: string | Message | null) => void;
}) {
  const urls = useSignedUrls(data.face ? [{ kind: 'photo', path: data.face.path, seconds: null }] : []);
  const [asking, setAsking] = useState(false);
  const [broken, setBroken] = useState(false);
  const [reason, setReason] = useState('');
  const [sending, setSending] = useState(false);
  const locked = Boolean(data.face?.locked);

  async function change() {
    setNotice(null);
    setSending(true);
    try {
      const m = await takePhoto(true);
      if (!m) return;
      const path = await upload(m, userId);
      const r = await ask('pro_face_change', { p_path: path, p_reason: reason });
      if (!r.ok) setNotice(r.why);
      else {
        setNotice(done(w.changeSent));
        setAsking(false);
        setReason('');
      }
      onChanged();
    } catch (e) {
      setNotice(`That did not work. Try again. (Details: ${detailOf(e)})`);
    } finally {
      setSending(false);
    }
  }

  const waiting = data.face_change?.status === 'waiting';
  return (
    <Step done={Boolean(data.face)} label={w.stepPhoto} value={!data.face ? w.stepPhotoTodo : locked ? w.stepPhotoLocked : w.stepPhotoDone}>
      <View style={s.faceRow}>
        {data.face && urls[data.face.path] && !broken ? (
          <Image source={{ uri: urls[data.face.path] }} style={s.face} accessibilityLabel={w.stepPhoto} onError={() => setBroken(true)} />
        ) : (
          <View style={[s.face, s.faceEmpty]}>
            <DuoIcon name="camera" size={28} />
          </View>
        )}
        <Text style={[s.small, { flex: 1 }]}>{w.stepPhotoHint}</Text>
      </View>
      {!locked ? <Button kind={data.face ? 'outline' : 'yellow'} label={data.face ? w.retakePhoto : w.takePhoto} onPress={onTake} busy={busy} /> : null}
      {locked && waiting ? <Text style={s.small}>{w.changeWaiting}</Text> : null}
      {locked && !waiting && data.face_change?.note ? <Text style={s.small}>{fill(w.changeAnswered, { note: data.face_change.note })}</Text> : null}
      {locked && !waiting && !asking ? <Button kind="soft" label={w.askChange} onPress={() => setAsking(true)} /> : null}
      {locked && asking ? (
        <View style={{ gap: 10 }}>
          <Field label={w.changeReason} hint={w.changeReasonHint} value={reason} onChangeText={setReason} multiline maxLength={300} />
          <Button label={w.changeSend} onPress={change} busy={sending} />
        </View>
      ) : null}
    </Step>
  );
}

function TradeCard({ t, data, w, onChanged, setNotice }: {
  t: Trade; data: MyTrades; w: ProWords; onChanged: () => void; setNotice: (m: string | Message | null) => void;
}) {
  const lists = useLists();
  const [words, setWords] = useState('');
  const [busy, setBusy] = useState(false);
  const status = { trial: w.tradeTrial, approved: w.tradeApproved, paused: w.tradePaused, stopped: w.tradeStopped, legacy: w.tradeLegacy }[t.status];
  const level = { none: w.levelNone, trial: w.levelTrial, basic: w.levelBasic, full: w.levelFull }[t.level];
  const need = data.trial_jobs_needed;

  async function appeal() {
    setBusy(true);
    const r = await ask('pro_appeal', { p_trade: t.trade, p_words: words });
    setBusy(false);
    if (!r.ok) return setNotice(r.why);
    setNotice(done(w.appealSent));
    setWords('');
    onChanged();
  }

  return (
    <Panel icon="briefcase" title={t.name} hint={status}>
      <Text style={s.body}>{t.opens_with ? fill(w.opensWith, { trade: lists?.trades.find((x) => x.slug === t.opens_with)?.name ?? t.opens_with }) : level}</Text>

      {t.status === 'trial' && !t.opens_with ? (
        <View style={{ gap: 8 }}>
          <View style={s.dots} accessibilityLabel={fill(w.goodOf, { n: t.good, of: need })}>
            {Array.from({ length: need }, (_, i) => (
              <View key={i} style={[s.dot, i < t.good && s.dotOn]} />
            ))}
            <Text style={s.label}>{fill(w.goodOf, { n: Math.min(t.good, need), of: need })}</Text>
          </View>
          {t.good >= need && !data.identity_ok ? <Text style={s.small}>{w.goodWaitIdentity}</Text> : null}
        </View>
      ) : null}

      {t.first_jobs.length ? (
        <View style={s.box}>
          <Text style={s.boxTitle}>{w.firstJobsList}</Text>
          {t.first_jobs.map((j) => (
            <View key={j.ref} style={s.jobRow}>
              <Text style={s.ref}>{j.ref.replace('-', '‑')}</Text>
              <Text style={[s.value, { flex: 1, textAlign: 'right' }]}>
                {j.status === 'good' ? w.fjGood : j.status === 'open' ? w.fjOpen : j.status === 'waiting' ? w.fjWaiting : (w[`why_${j.why}` as keyof ProWords] ?? j.why)}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {!t.opens_with && t.safety_quiz.on ? (
        <View style={s.line}>
          <Text style={s.label}>{w.safetyQuiz}</Text>
          <Text style={s.value}>{quizLine(t.safety_quiz, w)}</Text>
          {!t.safety_quiz.passed && !(t.safety_quiz.again_from && new Date(t.safety_quiz.again_from) > new Date()) ? (
            <Button kind="outline" label={w.takeQuiz} onPress={() => router.push({ pathname: '/pro/quiz', params: { key: `safety:${t.trade}` } })} />
          ) : null}
        </View>
      ) : null}

      {t.has_risky && !t.opens_with && t.status !== 'legacy' ? (
        <View style={s.line}>
          <Text style={s.label}>{w.riskyTitle}</Text>
          <Text style={s.value}>{riskyLine(t, w)}</Text>
        </View>
      ) : null}

      {t.status === 'paused' && t.pause_reason ? (
        <View style={s.paused}>
          <Text style={s.pausedText}>{w[`pause_${t.pause_reason}` as keyof ProWords]}</Text>
          {t.appeal ? (
            <Text style={s.small}>
              {t.appeal.status === 'waiting' ? w.appealWaiting : fill(t.appeal.status === 'lifted' ? w.appealLifted : w.appealKept, { note: t.appeal.note ?? '' })}
            </Text>
          ) : null}
          {t.can_appeal ? (
            <View style={{ gap: 10 }}>
              <Field label={w.appealLabel} hint={w.appealHint} value={words} onChangeText={setWords} multiline maxLength={500} />
              <Button label={w.appealSend} onPress={appeal} busy={busy} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Panel>
  );
}

function riskyLine(t: Trade, w: ProWords) {
  if (t.risky === 'unlocked') return w.riskyOpen;
  const k = t.check;
  if (k?.status === 'asked') return w.checkAsked;
  if (k?.status === 'accepted') return w.checkAccepted;
  if (k?.status === 'not_yet') return fill(w.checkNotYet, { note: k.note ?? '' });
  if (k?.status === 'unsafe') return w.checkUnsafe;
  if (t.risk_ready || k?.status === 'ready') return w.riskyReady;
  if (k?.status === 'none') return `${w.checkNone} ${w.riskyLocked}`;
  return w.riskyLocked;
}

function ReportRow({ r, w, last, onChanged, setNotice }: {
  r: Report; w: ProWords; last: boolean; onChanged: () => void; setNotice: (m: string | Message | null) => void;
}) {
  const [side, setSide] = useState('');
  const [busy, setBusy] = useState(false);
  const outcome =
    r.status === 'open' ? w.reportOpen
      : fill({ upheld: w.reportUpheld, not_upheld: w.reportNotUpheld, false: w.reportFalse }[r.status], { note: r.note ?? '' });

  async function send() {
    setBusy(true);
    const a = await ask('pro_safety_reply', { p_report: r.id, p_words: side });
    setBusy(false);
    if (!a.ok) return setNotice(a.why);
    setNotice(done(w.sideSent));
    onChanged();
  }

  return (
    <View style={[s.step, !last && s.stepRule]}>
      <Text style={s.label}>
        {w[`report_${r.kind}` as keyof ProWords]}
        {r.ref ? ` · ${r.ref.replace('-', '‑')}` : ''}
      </Text>
      <Text style={s.value}>{outcome}</Text>
      {r.his_side ? <Text style={s.small}>{`${w.yourSide}: ${r.his_side}`}</Text> : null}
      {r.status === 'open' && !r.his_side ? (
        <View style={{ gap: 10 }}>
          <Field label={w.yourSide} hint={w.yourSideHint} value={side} onChangeText={setSide} multiline maxLength={500} />
          <Button kind="outline" label={w.sendSide} onPress={send} busy={busy} />
        </View>
      ) : null}
    </View>
  );
}


const s = StyleSheet.create({
  step: { gap: 10, paddingVertical: 12 },
  stepRule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  stepHead: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  disc: { width: 26, height: 26, borderRadius: 13, borderWidth: 2, borderColor: colour.rule, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  discDone: { backgroundColor: colour.green, borderColor: colour.green },
  label: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  value: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.steel },
  small: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.inkSoft },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink },
  tick: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  tickText: { flex: 1, fontFamily: font.body, fontSize: 14.5, lineHeight: 20, color: colour.ink },
  faceRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  face: { width: 72, height: 72, borderRadius: 18 },
  faceEmpty: { backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  dots: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  dot: { width: 14, height: 14, borderRadius: 7, backgroundColor: colour.rule },
  dotOn: { backgroundColor: colour.green },
  box: { gap: 6, padding: 12, borderRadius: 16, backgroundColor: colour.canvas },
  boxTitle: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.inkSoft },
  jobRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  ref: { fontFamily: font.mono, fontSize: 13, color: colour.ink },
  line: { gap: 6, paddingTop: 10, borderTopWidth: 1, borderTopColor: colour.rule },
  paused: { gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.softBrick },
  pausedText: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 20, color: colour.ink },
});
