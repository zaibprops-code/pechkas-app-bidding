import { useCallback, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Redirect, useFocusEffect } from 'expo-router';
import { rupees, whenLabel } from '@pechkas/shared';
import { Button, Chip, Field, Loading, Notice, Screen } from '../../src/components/ui';
import { Panel } from '../../src/components/Panel';
import { MediaPick } from '../../src/components/MediaPick';
import { DuoIcon } from '../../src/components/DuoIcon';
import { Trouble } from '../../src/components/Trouble';
import { useAccount } from '../../src/account';
import { ask, supabase } from '../../src/supabase';
import { done, type Message } from '../../src/message';
import { noAnswer, type NoAnswer } from '../../src/net';
import { fill, useProWords, type ProWords } from '../../src/words';
import { colour, font } from '../../src/theme';

type Check = {
  id: string;
  status: 'asked' | 'accepted' | 'passed' | 'not_yet' | 'unsafe' | 'none' | 'cancelled';
  answer_by: string | null;
  trade_name: string;
  job_id: string;
  ref: string;
  title: string;
  sector: string;
  when_date: string | null;
  when_from: number | null;
  stage: string | null;
  job_status: string;
  pro: string;
  customer: string;
  fee_paisa: number;
  street: string | null;
  house: string | null;
  landmark: string | null;
  items: { key: string; item: string }[];
  can_report: boolean;
  result: 'passed' | 'not_yet' | 'unsafe' | null;
};

const clockOf = (at: string) =>
  new Date(at).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Karachi' });

/**
 * Checks he is asked to do (D37): another technician's first risky job, the
 * app's choice of checker. Yes or no first; once he says yes, the address,
 * the list of what to check, his photos and his result. Pechkas pays him a
 * fee, credited to his account, the moment he gives it.
 */
export default function Checks() {
  const { ready, session } = useAccount();
  const { w } = useProWords();
  const [list, setList] = useState<Check[] | null>(null);
  const [trouble, setTrouble] = useState<NoAnswer | null>(null);
  const [notice, setNotice] = useState<string | Message | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('my_checks');
    if (error) return setTrouble(noAnswer());
    setTrouble(null);
    setList((data as Check[]) ?? []);
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;

  return (
    <Screen hero={{ title: w.checksTitle, sub: w.checksSub, back: true }}>
      <Notice text={notice} />
      {!list && trouble ? <Trouble kind={trouble} onRetry={load} /> : null}
      {!list && !trouble ? <Loading /> : null}
      {list && !list.length ? (
        <View style={s.empty}>
          <View style={s.tile}>
            <DuoIcon name="shield" size={28} />
          </View>
          <Text style={s.body}>{w.checksEmpty}</Text>
        </View>
      ) : null}
      {list?.map((c) => <CheckCard key={c.id} c={c} w={w} userId={session.user.id} onChanged={load} setNotice={setNotice} />)}
    </Screen>
  );
}

function CheckCard({ c, w, userId, onChanged, setNotice }: {
  c: Check; w: ProWords; userId: string; onChanged: () => void; setNotice: (m: string | Message | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [items, setItems] = useState<Record<string, boolean | undefined>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [note, setNote] = useState('');
  const [result, setResult] = useState<'passed' | 'not_yet' | 'unsafe' | null>(null);
  const ref = c.ref.replace('-', '‑');
  const when = whenLabel({ when_kind: 'later', when_date: c.when_date, when_from: c.when_from, when_part: null });

  async function answer(yes: boolean) {
    setBusy(yes ? 'yes' : 'no');
    const r = await ask('checker_answer', { p_check: c.id, p_yes: yes });
    setBusy(null);
    if (!r.ok) setNotice(r.why);
    onChanged();
  }

  async function report() {
    setBusy('report');
    const r = await ask('checker_report', { p_check: c.id, p_result: result, p_items: items, p_photos: photos, p_note: note || null });
    setBusy(null);
    if (!r.ok) return setNotice(r.why);
    setNotice(done(fill(w.checkSent, { fee: rupees(c.fee_paisa) })));
    onChanged();
  }

  if (c.status === 'asked') {
    return (
      <Panel icon="shield" title={fill(w.checkAskTitle, { ref })}>
        <Text style={s.body}>
          {fill(w.checkAskText, {
            pro: c.pro, trade: c.trade_name, when, sector: c.sector.replace('-', '‑'),
            fee: rupees(c.fee_paisa), by: c.answer_by ? clockOf(c.answer_by) : '',
          })}
        </Text>
        <Button label={w.checkYes} onPress={() => answer(true)} busy={busy === 'yes'} />
        <Button kind="outline" label={w.checkNo} onPress={() => answer(false)} busy={busy === 'no'} />
      </Panel>
    );
  }

  if (c.status === 'accepted') {
    const all = c.items.every((i) => items[i.key] !== undefined);
    return (
      <Panel icon="shield" title={fill(w.checkComing, { ref })} hint={`${c.title} · ${when}`}>
        {c.street ? (
          <View style={s.box}>
            <Text style={s.label}>{[c.house, c.street, c.sector.replace('-', '‑')].filter(Boolean).join(', ')}</Text>
            {c.landmark ? <Text style={s.value}>{c.landmark}</Text> : null}
            <Text style={s.value}>{`${c.pro} · ${c.customer}`}</Text>
          </View>
        ) : null}
        <Text style={s.body}>{w.checkGo}</Text>
        {c.can_report ? (
          <>
            <Text style={s.h}>{w.checkItems}</Text>
            {c.items.map((i) => (
              <View key={i.key} style={s.item}>
                <Text style={[s.body, { flex: 1 }]}>{i.item}</Text>
                <View style={s.chips}>
                  <Chip label="Yes" on={items[i.key] === true} onPress={() => setItems({ ...items, [i.key]: true })} />
                  <Chip label="No" on={items[i.key] === false} onPress={() => setItems({ ...items, [i.key]: false })} />
                </View>
              </View>
            ))}
            <Text style={s.h}>{w.checkPhotos}</Text>
            <MediaPick paths={photos} setPaths={setPhotos} userId={userId} onProblem={setNotice} />
            <View style={s.chips}>
              <Chip label={w.checkPass} on={result === 'passed'} onPress={() => setResult('passed')} />
              <Chip label={w.checkNotYetBtn} on={result === 'not_yet'} onPress={() => setResult('not_yet')} />
              <Chip label={w.checkUnsafeBtn} on={result === 'unsafe'} onPress={() => setResult('unsafe')} />
            </View>
            {result && result !== 'passed' ? <Field label={w.checkNote} value={note} onChangeText={setNote} multiline maxLength={500} /> : null}
            <Button label={w.checkSendResult} onPress={report} busy={busy === 'report'} disabled={!result || !all || !photos.length} />
          </>
        ) : (
          <Text style={s.value}>{w.checkWaitStart}</Text>
        )}
      </Panel>
    );
  }

  const words = { passed: w.checkPass, not_yet: w.checkNotYetBtn, unsafe: w.checkUnsafeBtn };
  return (
    <Panel icon="shield" title={ref} hint={c.result ? fill(w.checkDone, { result: words[c.result] }) : undefined}>
      <Text style={s.value}>{`${c.title} · ${c.pro}`}</Text>
    </Panel>
  );
}

const s = StyleSheet.create({
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink },
  label: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  value: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.steel },
  h: { fontFamily: font.display, fontSize: 16, color: colour.ink, marginTop: 4 },
  box: { gap: 4, padding: 12, borderRadius: 16, backgroundColor: colour.canvas },
  item: { gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: colour.rule },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  empty: { alignItems: 'center', gap: 12, padding: 24, borderRadius: 24, backgroundColor: colour.white },
  tile: { width: 56, height: 56, borderRadius: 18, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
});
