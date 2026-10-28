import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuButton } from '../../src/components/Menu';
import { DuoIcon } from '../../src/components/DuoIcon';
import { DuoRow, RowCard } from '../../src/components/Rows';
import { Button, Loading, SystemBars } from '../../src/components/ui';
import { useAccount } from '../../src/account';
import { supabase } from '../../src/supabase';
import { useProWords } from '../../src/words';
import { colour, font, shadow } from '../../src/theme';
import { Work } from '../../src/pro/Work';

/**
 * The technician's home. Approved: his work — online, new jobs, the jobs he
 * was chosen for (src/pro/Work.tsx). Otherwise: where his application
 * stands, in the same white cards as everything else.
 */
export default function ProHome() {
  const { ready, session, account, refresh } = useAccount();
  const { w } = useProWords();
  const insets = useSafeAreaInsets();
  const [names, setNames] = useState<Record<string, string>>({});

  useEffect(() => {
    supabase?.rpc('app_lists').then(({ data }) => {
      const trades = (data as { trades?: { slug: string; name: string }[] } | null)?.trades ?? [];
      setNames(Object.fromEntries(trades.map((t) => [t.slug, t.name])));
    });
  }, []);

  // Coming back to this screen asks again, so an approval made in the office
  // shows up without him having to sign out and in.
  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  // In customer mode the technician's screens are put away, whoever opens
  // this address — a tapped notification included. The menu switches back.
  if (account?.role === 'customer' && account.pro) return <Redirect href="/" />;
  if (!account?.pro) return <Redirect href="/pro/apply" />;

  const pro = account.pro;
  if (pro.status === 'approved') return <Work firstName={pro.full_name.split(' ')[0]} />;

  const state = {
    applied: { title: w.appliedTitle, text: w.appliedText, icon: 'jobs' as const, bad: false },
    rejected: { title: w.rejectedTitle, text: w.rejectedText, icon: 'lock' as const, bad: true },
    suspended: { title: w.suspendedTitle, text: w.suspendedText, icon: 'lock' as const, bad: true },
  }[pro.status];
  const first = pro.full_name.split(' ')[0];

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingHorizontal: 16, paddingBottom: insets.bottom + 32, gap: 14 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colour.green} />}
      >
        <MenuButton />
        <View style={s.greet}>
          <Text style={s.hello}>
            {greeting(w)}, {first}
          </Text>
          <Text style={s.title} accessibilityRole="header">
            {state.title}
          </Text>
        </View>

        {/* Where the application stands, on one card, with the one thing he can do about it. */}
        <View style={[s.card, state.bad && s.cardBad]}>
          <View style={[s.tile, state.bad && s.tileBad]}>
            <DuoIcon name={state.icon} size={28} accent={state.bad ? '#f3b9a8' : colour.yellow} ink={state.bad ? colour.brick : colour.ink} />
          </View>
          <Text style={s.text}>{state.text}</Text>
          {pro.status_reason ? <Text style={s.reason}>{pro.status_reason}</Text> : null}
          {pro.status === 'applied' ? (
            <View style={s.steps}>
              <DuoIcon name="shield" size={20} />
              <Text style={s.stepsText}>{w.appliedSteps}</Text>
            </View>
          ) : null}
          {pro.status === 'applied' ? <Button kind="outline" label={w.editForm} onPress={() => router.push('/pro/apply')} /> : null}
          {pro.status === 'rejected' ? <Button label={w.applyAgain} icon="arrowRight" onPress={() => router.push('/pro/apply')} /> : null}
        </View>

        <Text style={s.h2} accessibilityRole="header">
          {w.yourDetails}
        </Text>
        <RowCard>
          <DuoRow icon="doc" label={pro.full_name} />
          <DuoRow icon="briefcase" label={pro.trades.map((t) => names[t] ?? t).join(' · ')} />
          <DuoRow icon="pin" label={pro.sectors.join(' · ')} last />
        </RowCard>
      </ScrollView>
      <SystemBars bg={colour.canvas} />
    </View>
  );
}

/** A greeting by the phone's clock, the same as on his work screen. */
function greeting(w: { goodMorning: string; goodAfternoon: string; goodEvening: string }) {
  const h = new Date().getHours();
  return h < 12 ? w.goodMorning : h < 17 ? w.goodAfternoon : w.goodEvening;
}

const s = StyleSheet.create({
  greet: { gap: 2, paddingHorizontal: 4, marginTop: 4 },
  hello: { fontFamily: font.bodyMedium, fontSize: 15, color: colour.steel },
  title: { fontFamily: font.display, fontSize: 28, lineHeight: 34, color: colour.ink },
  card: { gap: 14, padding: 18, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  cardBad: { backgroundColor: '#fbeee9' },
  tile: { width: 56, height: 56, borderRadius: 18, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  tileBad: { backgroundColor: colour.white },
  text: { fontFamily: font.body, fontSize: 15.5, lineHeight: 22, color: colour.ink },
  reason: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 22, color: colour.greenDark },
  steps: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.canvas },
  stepsText: { flex: 1, fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.inkSoft },
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 4, marginTop: 4, marginBottom: -6 },
});
