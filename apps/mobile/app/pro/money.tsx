import { DuoIcon, type DuoName } from '../../src/components/DuoIcon';
import { useCallback, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees } from '@pechkas/shared';
import { Hero, Loading, Notice, SystemBars } from '../../src/components/ui';
import { MenuButton } from '../../src/components/Menu';
import { Stars } from '../../src/components/Stars';
import { supabase } from '../../src/supabase';
import { fill, useProWords } from '../../src/words';
import { colour, font, radius } from '../../src/theme';

/**
 * The technician's account with Pechkas: what he owes, whether that stops
 * him offering, how to pay, this month's work, his stars and every line.
 * All of it is read from pro_money(); every figure is a sum of real rows,
 * and nothing here can change any of it.
 */

type Money = {
  ok: true;
  owed_paisa: number;
  credit_limit_paisa: number;
  blocked: boolean;
  commission_bps?: number;
  repeat_commission_bps?: number;
  pay_to: string | null;
  month: { jobs: number; collected_paisa: number; parts_paisa: number; commission_paisa: number };
  rating: { count: number; avg: number | null; jobs_done: number };
  comments: { stars: number; words: string | null; at: string; ref: string }[];
  lines: { kind: 'commission' | 'settlement' | 'reversal'; ref: string | null; amount_paisa: number; method: string | null; reference: string | null; at: string }[];
};

const METHOD: Record<string, string> = { jazzcash: 'JazzCash', easypaisa: 'Easypaisa', bank: 'Bank', cash: 'Cash' };

export default function MoneyScreen() {
  const { w } = useProWords();
  const insets = useSafeAreaInsets();
  const [m, setM] = useState<Money | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!supabase) return;
    const { data, error } = await supabase.rpc('pro_money');
    if (error || !data?.ok) setProblem(error ? 'No connection. Pull down to try again.' : (data?.why ?? null));
    else {
      setProblem(null);
      setM(data as Money);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  if (!m && !problem) return <Loading />;

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={load} tintColor={colour.green} />}
      >
        <Hero title={w.moneyTitle} left={<MenuButton />} />
        <View style={{ paddingTop: 18, paddingHorizontal: 16, gap: 14 }}>
        <Notice text={problem} />

        {m ? (
          <>
            <View style={[s.owed, m.blocked && s.owedBlocked]}>
              <View style={s.owedTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.owedLabel, m.blocked && { color: colour.white }]}>{w.owe}</Text>
                  <Text style={[s.owedBig, m.blocked && { color: colour.white }]}>{rupees(m.owed_paisa)}</Text>
                </View>
                <View style={s.owedIcon}>
                  <DuoIcon name="wallet" size={28} accent={colour.white} />
                </View>
              </View>
              {m.blocked ? (
                <Text style={s.blockedText}>{fill(w.blockedText, { owed: rupees(m.owed_paisa), limit: rupees(m.credit_limit_paisa) })}</Text>
              ) : null}
            </View>

            {m.owed_paisa > 0 ? (
              <View style={s.card}>
                <CardHead icon="wallet" title={w.howToPay} />
                <Text style={s.payTo}>{m.pay_to ?? w.payAsk}</Text>
                <Text style={s.note}>{w.payNote}</Text>
              </View>
            ) : null}

            <View style={s.card}>
              <CardHead icon="jobs" title={w.thisMonth} />
              <Text style={s.big}>{m.month.jobs === 1 ? w.jobDone : fill(w.jobsDone, { n: m.month.jobs })}</Text>
              <Row k={w.collected} v={rupees(m.month.collected_paisa)} />
              <Row k={w.partsSpent} v={rupees(m.month.parts_paisa)} />
              <Row k={w.feeTotal} v={rupees(m.month.commission_paisa)} />
              {m.commission_bps !== undefined ? <Text style={s.note}>{fill(w.feeLine, { pct: Math.round(m.commission_bps / 100) })}</Text> : null}
              {m.repeat_commission_bps !== undefined && m.repeat_commission_bps !== m.commission_bps ? (
                <Text style={s.note}>{fill(w.feeRepeatRule, { pct: Math.round(m.repeat_commission_bps / 100) })}</Text>
              ) : null}
            </View>

            <View style={s.card}>
              <CardHead icon="star" title={w.myRating} />
              {m.rating.avg !== null ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <Stars value={Math.round(m.rating.avg)} size={22} />
                  <Text style={s.big}>{Number(m.rating.avg).toFixed(1)}</Text>
                  <Text style={s.note}>{fill(w.ratingFrom, { n: m.rating.count })}</Text>
                </View>
              ) : (
                <Text style={s.note}>{w.ratingNew}</Text>
              )}
              {m.comments.length ? <Text style={[s.cardTitle, { marginTop: 6 }]}>{w.comments}</Text> : null}
              {m.comments.map((c, i) => (
                <View key={i} style={s.comment}>
                  <Stars value={c.stars} size={14} />
                  {c.words ? <Text style={s.commentText}>“{c.words}”</Text> : null}
                  <Text style={s.note}>{c.ref}</Text>
                </View>
              ))}
            </View>

            <View style={s.card}>
              <CardHead icon="briefcase" title={w.lines} />
              {m.lines.length === 0 ? <Text style={s.note}>{w.nothingYet}</Text> : null}
              {m.lines.map((l, i) => (
                <View key={i} style={s.line}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.lineText}>
                      {l.kind === 'commission'
                        ? fill(w.lineCommission, { ref: l.ref ?? '' })
                        : l.kind === 'settlement'
                          ? fill(w.lineSettlement, { method: METHOD[l.method ?? ''] ?? '' })
                          : w.lineReversal}
                    </Text>
                    <Text style={s.note}>
                      {new Date(l.at).toLocaleDateString('en-PK', { day: 'numeric', month: 'short' })}
                      {l.reference ? ` · ${l.reference}` : ''}
                    </Text>
                  </View>
                  {/* + is what he came to owe, − what he paid off. */}
                  <Text style={[s.lineAmount, { color: l.amount_paisa > 0 ? colour.ink : colour.green }]}>
                    {l.amount_paisa > 0 ? '+' : '−'} {rupees(Math.abs(l.amount_paisa))}
                  </Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

/** A card's heading: a two-tone icon on a soft tile and the title, as on home and in the menu. */
function CardHead({ icon, title }: { icon: DuoName; title: string }) {
  return (
    <View style={s.head}>
      <View style={s.soft}>
        <DuoIcon name={icon} size={22} />
      </View>
      <Text style={s.headText} accessibilityRole="header">
        {title}
      </Text>
    </View>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={s.row}>
      <Text style={s.k}>{k}</Text>
      <Text style={s.v}>{v}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  owed: { gap: 6, padding: 18, borderRadius: 24, backgroundColor: colour.yellow },
  owedTop: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  owedIcon: { width: 54, height: 54, borderRadius: 18, backgroundColor: 'rgba(20, 23, 26, 0.08)', alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 4 },
  soft: { width: 38, height: 38, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  headText: { flex: 1, fontFamily: font.display, fontSize: 17, color: colour.ink },
  owedBlocked: { backgroundColor: colour.brick },
  owedLabel: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  owedBig: { fontFamily: font.display, fontSize: 34, color: colour.ink },
  blockedText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.white },
  card: { gap: 8, padding: 16, borderRadius: 22, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.04)' },
  cardTitle: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel },
  payTo: { fontFamily: font.bodySemi, fontSize: 17, lineHeight: 24, color: colour.ink },
  big: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  row: { flexDirection: 'row', justifyContent: 'space-between' },
  k: { fontFamily: font.body, fontSize: 14, color: colour.steel },
  v: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  comment: { gap: 2, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colour.rule },
  commentText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.ink },
  line: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colour.rule },
  lineText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  lineAmount: { fontFamily: font.display, fontSize: 15 },
});
