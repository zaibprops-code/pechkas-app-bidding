import { useCallback, useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Platform, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { HelpTop, helpStyles } from '../src/components/HelpParts';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Sheet } from '../src/components/Sheet';
import { TradeArt } from '../src/components/TradeArt';
import { Loading, Notice, SystemBars, useScrollEnd } from '../src/components/ui';
import { useAccount } from '../src/account';
import { openLegal } from '../src/legal';
import { ask, supabase } from '../src/supabase';
import { colour, font, shadow, TAP } from '../src/theme';

/**
 * Delete account (the owner's design, 25 November 2026). The person on the
 * side's coloured top, as Settings has them; one white strip of their own
 * numbers — what goes at once; the rest of what goes as a short list; what
 * Pechkas keeps without their name as one quiet grey note; a red button,
 * then a sheet whose red button must be HELD for two seconds, so nobody
 * deletes by a slip of the thumb (a screen reader taps it instead).
 *
 * Never in the middle of a job (the owner's yes): with a job open or under
 * way, the job's own card says "Finish or cancel this job first" and the
 * button waits. `my_delete_summary()` gives the numbers and that job, and
 * `delete_my_account()` refuses the same way, so the rule is the
 * database's. The voice notes, videos and photos are emptied from the
 * person's own storage folder first (the database cannot delete stored
 * files), then the account; then the goodbye screen. Both stores require
 * deleting inside the app; the website's page does the same without it.
 */

type Summary = {
  name: string | null;
  since: string | null;
  pro: boolean;
  customer: { jobs: number; media: number; voice: number };
  technician: { jobs: number; photos: number; messages: number; money_record: boolean };
  blocker: { id: string; ref: string; title: string; status: string; stage: string | null; trade: string; trade_name: string; side: 'customer' | 'pro'; pro_name: string | null } | null;
  staff: boolean;
};

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const sinceLine = (iso: string | null) => {
  if (!iso) return null;
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  return `With Pechkas since ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
};
const HOLD_MS = 2000;

export default function DeleteAccount() {
  const { ready, session, account, signOut } = useAccount();
  const end = useScrollEnd(28);
  const [sum, setSum] = useState<Summary | null>(null);
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const pro = account?.role === 'pro';

  useFocusEffect(
    useCallback(() => {
      if (!supabase || !session) return;
      void supabase.rpc('my_delete_summary').then(({ data }) => data && setSum(data as Summary));
    }, [session]),
  );

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;

  const name = (sum?.name ?? account?.first_name ?? '').trim();
  const blocker = sum?.blocker ?? null;
  const fg = pro ? colour.white : colour.ink;

  async function remove() {
    setBusy(true);
    setNotice(null);
    // Voice notes, videos and photos of somebody's home go with the account.
    // The database cannot delete stored files itself, so the phone does it
    // first, from the person's own folder, which only they may empty.
    if (supabase && session) {
      const folder = session.user.id;
      const { data: files } = await supabase.storage.from('job-media').list(folder, { limit: 1000 });
      if (files?.length) {
        const { error } = await supabase.storage.from('job-media').remove(files.map((f) => `${folder}/${f.name}`));
        if (error) {
          setBusy(false);
          setAsking(false);
          setNotice('Your photos and recordings could not be deleted. Check your signal and try again.');
          return;
        }
      }
    }
    const r = await ask('delete_my_account');
    if (!r.ok) {
      setBusy(false);
      setAsking(false);
      setNotice(r.why);
      return;
    }
    // To the goodbye screen first, then sign out: signed out on this page, the
    // gate would send the phone to the welcome pages before the goodbye.
    router.replace({ pathname: '/goodbye', params: name ? { name } : {} });
    await signOut();
  }

  const cells: { icon: DuoName; n: number | undefined; label: string }[] = pro
    ? [
        { icon: 'jobs', n: sum?.technician.jobs, label: 'jobs' },
        { icon: 'camera', n: sum?.technician.photos, label: 'photos' },
        { icon: 'chat', n: sum?.technician.messages, label: 'messages' },
      ]
    : [
        { icon: 'jobs', n: sum?.customer.jobs, label: 'jobs' },
        { icon: 'camera', n: sum?.customer.media, label: 'photos and videos' },
        { icon: 'mic', n: sum?.customer.voice, label: 'voice notes' },
      ];
  const also = pro
    ? ['Your name, number and sign\u2011in', 'Your application, your photo and your checks', 'Your record of first jobs, quizzes and arrivals', 'Messages, ratings and reports']
    : ['Your name, number and sign\u2011in', 'The addresses on your jobs', 'Messages, ratings and reports', 'Addresses saved on this phone'];
  const kept = pro
    ? `${sum?.technician.money_record ? 'What you owed Pechkas and what you paid, with your name and the job numbers: Pechkas must keep its accounts. ' : ''}What finished jobs cost (the kind, the sector, the price), never who did them.`
    : 'What finished jobs cost (the kind, the sector, the price), and a safety report you made about a technician. Never who you are.';
  const counted = cells.filter((c) => (c.n ?? 0) > 0);
  const summaryLine = counted.map((c) => `${c.n} ${c.label}`).join(', ').replace(/, ([^,]*)$/, ' and $1');
  const sheetLine = counted.length ? `${summaryLine.charAt(0).toUpperCase()}${summaryLine.slice(1)} go now, with everything listed. You cannot get them back.` : 'Your account and everything listed go now. You cannot get them back.';

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style={pro ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ paddingBottom: end }}>
        <HelpTop pro={pro} title="Delete account">
          <View style={s.who}>
            <View style={[s.initial, pro && s.initialPro]}>
              <Text style={[s.initialText, pro && { color: colour.ink }]}>{(name || '?').charAt(0).toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, gap: 4 }}>
              <Text style={[s.name, { color: fg }]} numberOfLines={1}>
                {name || 'Your account'}
              </Text>
              {sinceLine(sum?.since ?? null) ? <Text style={[s.since, pro && { color: '#cfe3de' }]}>{sinceLine(sum?.since ?? null)}</Text> : null}
            </View>
          </View>
          <View style={{ height: 40 }} />
        </HelpTop>

        <View style={s.overlap}>
          {blocker ? (
            <Blocker b={blocker} />
          ) : (
            <View style={s.strip} accessible accessibilityLabel={`Deleted at once: ${cells.map((c) => `${c.n ?? 0} ${c.label}`).join(', ')}`}>
              {cells.map((c, i) => (
                <View key={c.label} style={[s.cell, i > 0 && s.cellRule]}>
                  <DuoIcon name={c.icon} size={22} />
                  <Text style={s.figure}>{c.n ?? '–'}</Text>
                  <Text style={s.cellLabel}>{c.label}</Text>
                </View>
              ))}
            </View>
          )}
        </View>

        <View style={helpStyles.body}>
          {blocker ? (
            <Text style={s.small}>
              {blocker.side === 'pro'
                ? 'Finish it, or tap I can’t come on the job before you arrive. Then you can delete your account.'
                : blocker.status === 'open'
                  ? 'Cancel it first: cancelling is free. Then you can delete your account.'
                  : `Deleting now would leave ${blocker.pro_name ?? 'your technician'} with nobody to answer. Cancelling is free until you give him the start code.`}
            </Text>
          ) : null}
          <Text style={s.section}>Also deleted, at once</Text>
          <View style={s.card}>
            {also.map((t, i) => (
              <View key={t} style={[s.line, i > 0 && s.rule]}>
                <View style={s.cross}>
                  <Icon name="cross" size={12} color={colour.brick} strokeWidth={3} />
                </View>
                <Text style={s.lineText}>{t}</Text>
              </View>
            ))}
          </View>
          <View style={s.kept}>
            <View style={s.keptTile}>
              <DuoIcon name="lock" size={22} />
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.keptTitle}>Kept without your name</Text>
              <Text style={s.small}>{kept}</Text>
            </View>
          </View>
          <Press onPress={() => openLegal('delete-account')} accessibilityRole="link" style={s.fullList}>
            <Text style={s.small}>
              The full list is in <Text style={s.strong}>Legal → Deleting your account</Text>.
            </Text>
          </Press>

          <Notice text={notice} />
          <Press
            onPress={blocker || sum?.staff ? undefined : () => setAsking(true)}
            accessibilityRole="button"
            accessibilityState={{ disabled: Boolean(blocker || sum?.staff) }}
            sink={0.97}
            style={[s.red, (blocker || sum?.staff) && s.redOff]}
          >
            <DuoIcon name="trash" size={20} accent={colour.brickTint} ink={colour.white} />
            <Text style={s.redText}>Delete my account</Text>
          </Press>
          {blocker ? <Text style={[s.small, { textAlign: 'center' }]}>You can delete once {blocker.ref} is finished or cancelled.</Text> : null}
          {sum?.staff ? <Text style={[s.small, { textAlign: 'center' }]}>Office accounts are removed by the owner.</Text> : null}
          <Press onPress={() => (router.canGoBack() ? router.back() : router.replace('/me'))} accessibilityRole="button" style={s.keepLink}>
            <Text style={s.keepLinkText}>Keep my account</Text>
          </Press>
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />

      {asking ? (
        <Sheet title={`Delete ${name ? `${name}’s` : 'your'} account?`} onClose={() => (busy ? undefined : setAsking(false))}>
          <View style={s.sheet}>
            <Text style={s.sheetText}>{sheetLine}</Text>
            <HoldToDelete busy={busy} onDone={() => void remove()} />
            <Press onPress={() => setAsking(false)} accessibilityRole="button" sink={0.97} style={s.keepButton}>
              <Text style={s.keepButtonText}>No, keep it</Text>
            </Press>
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

/** The job that has to be finished or cancelled first: its own card, as on home, with a yellow bar. */
function Blocker({ b }: { b: NonNullable<Summary['blocker']> }) {
  const head =
    b.side === 'pro' ? 'You are on this job' : b.status === 'open' ? 'Still open for offers' : `${b.pro_name ?? 'Your technician'} is on this job`;
  return (
    <View style={s.blocker}>
      <View style={s.blockerIn}>
        <View style={s.art}>
          <TradeArt trade={b.trade} size={44} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.small}>
            {b.trade_name} · {b.ref.replace('-', '‑')}
          </Text>
          <Text style={s.blockerHead}>{head}</Text>
        </View>
      </View>
      <Press
        onPress={() => router.push(b.side === 'pro' ? '/pro' : { pathname: '/job/[id]', params: { id: b.id } })}
        accessibilityRole="button"
        sink={0.98}
        style={s.yellowBar}
      >
        <Text style={s.yellowBarText}>Finish or cancel this job first</Text>
        <Icon name="chevronRight" size={18} color={colour.ink} strokeWidth={2.4} />
      </Press>
    </View>
  );
}

/**
 * The red button that must be held for two seconds. The darker fill grows
 * across it by transform only; letting go early snaps it back. With a
 * screen reader on, holding is not possible, so a double tap deletes.
 */
function HoldToDelete({ busy, onDone }: { busy: boolean; onDone: () => void }) {
  const [width, setWidth] = useState(0);
  const [reader, setReader] = useState(false);
  const [holding, setHolding] = useState(false);
  const p = useRef(new Animated.Value(0)).current;
  const fired = useRef(false);
  useEffect(() => {
    // A browser cannot say whether a screen reader is on (it answers yes), so the web copy always holds.
    if (Platform.OS !== 'web') void AccessibilityInfo.isScreenReaderEnabled().then(setReader).catch(() => {});
  }, []);

  function start() {
    if (busy || reader) return;
    fired.current = false;
    setHolding(true);
    Animated.timing(p, { toValue: 1, duration: HOLD_MS, easing: Easing.linear, useNativeDriver: true }).start(({ finished }) => {
      if (finished && !fired.current) {
        fired.current = true;
        onDone();
      }
    });
  }
  function stop() {
    if (fired.current) return;
    setHolding(false);
    p.stopAnimation();
    p.setValue(0);
  }

  const x = p.interpolate({ inputRange: [0, 1], outputRange: [-Math.max(width, 1), 0] });
  return (
    <View>
      <Press
        onPressIn={start}
        onPressOut={stop}
        onPress={reader && !busy ? onDone : undefined}
        accessibilityRole="button"
        accessibilityLabel="Delete my account now"
        accessibilityHint={reader ? 'Double tap to delete your account. It cannot be undone.' : 'Hold for two seconds to delete your account.'}
        sink={1}
        style={s.hold}
        onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
      >
        <Animated.View style={[s.holdFill, { transform: [{ translateX: busy ? 0 : x }] }]} />
        <Text style={s.holdText}>{busy ? 'Deleting…' : reader ? 'Delete it now' : holding ? 'Keep holding…' : 'Hold to delete'}</Text>
      </Press>
      <Text style={[s.small, { textAlign: 'center', marginTop: 6 }]}>{reader ? 'It cannot be undone.' : 'Keep your finger on it for 2 seconds.'}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  who: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 12 },
  initial: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colour.white, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  initialPro: { backgroundColor: colour.yellow },
  initialText: { fontFamily: font.displayBold, fontSize: 30, color: colour.yellow },
  name: { fontFamily: font.displayBold, fontSize: 26, lineHeight: 30 },
  since: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.onYellow },
  overlap: { marginTop: -44, marginHorizontal: 14 },
  strip: { flexDirection: 'row', borderRadius: 22, backgroundColor: colour.white, boxShadow: '0px 6px 18px rgba(20, 23, 26, 0.10)' },
  cell: { flex: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 4 },
  cellRule: { borderLeftWidth: 1, borderLeftColor: colour.rule },
  figure: { fontFamily: font.displayBold, fontSize: 22, color: colour.ink, fontVariant: ['tabular-nums'] },
  cellLabel: { fontFamily: font.bodyMedium, fontSize: 12.5, color: colour.steel, textAlign: 'center' },
  blocker: { borderRadius: 22, overflow: 'hidden', backgroundColor: colour.white, boxShadow: '0px 6px 18px rgba(20, 23, 26, 0.10)' },
  blockerIn: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14 },
  art: { width: 56, height: 56, borderRadius: 16, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  blockerHead: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  yellowBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TAP + 4, paddingHorizontal: 14, backgroundColor: colour.yellow },
  yellowBarText: { fontFamily: font.display, fontSize: 14.5, color: colour.ink },
  section: { fontFamily: font.display, fontSize: 13, color: colour.steel, marginTop: 6, marginHorizontal: 6 },
  card: { paddingHorizontal: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  line: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingVertical: 8 },
  rule: { borderTopWidth: 1, borderTopColor: colour.rule },
  cross: { width: 28, height: 28, borderRadius: 14, backgroundColor: colour.softBrick, alignItems: 'center', justifyContent: 'center' },
  lineText: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  kept: { flexDirection: 'row', gap: 12, alignItems: 'flex-start', padding: 14, borderRadius: 20, backgroundColor: colour.tile },
  keptTile: { width: 40, height: 40, borderRadius: 13, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  keptTitle: { fontFamily: font.display, fontSize: 14.5, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13.5, lineHeight: 20, color: colour.steel },
  strong: { fontFamily: font.displayBold, color: colour.ink },
  fullList: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: 6 },
  red: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 56, borderRadius: 18, backgroundColor: colour.brick },
  redOff: { opacity: 0.35 },
  redText: { fontFamily: font.display, fontSize: 16, color: colour.white },
  keepLink: { minHeight: TAP + 4, alignItems: 'center', justifyContent: 'center' },
  keepLinkText: { fontFamily: font.displayBold, fontSize: 15, color: colour.ink, textDecorationLine: 'underline' },
  sheet: { gap: 12, paddingBottom: 8 },
  sheetText: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colour.inkSoft },
  hold: { minHeight: 60, borderRadius: 18, overflow: 'hidden', backgroundColor: colour.brick, alignItems: 'center', justifyContent: 'center' },
  holdFill: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, backgroundColor: colour.ink },
  holdText: { fontFamily: font.display, fontSize: 16, color: colour.white },
  keepButton: { minHeight: 56, borderRadius: 18, borderWidth: 1.5, borderColor: colour.rule, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  keepButtonText: { fontFamily: font.displayBold, fontSize: 16, color: colour.ink },
});
