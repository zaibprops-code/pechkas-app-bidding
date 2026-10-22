import { useCallback, useEffect, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MenuButton } from '../../src/components/Menu';
import { Mark } from '../../src/components/Mark';
import { Icon } from '../../src/components/Icon';
import { Press } from '../../src/components/Press';
import { Button, Loading } from '../../src/components/ui';
import { useAccount } from '../../src/account';
import { supabase } from '../../src/supabase';
import { useProWords } from '../../src/words';
import { colour, font, radius } from '../../src/theme';
import { Work } from '../../src/pro/Work';

/**
 * The technician's home. Approved: his work — online, new jobs, the jobs he
 * was chosen for (src/pro/Work.tsx). Otherwise: where his application
 * stands. Dark, so it never looks like the customer side of the same phone.
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
    applied: { title: w.appliedTitle, text: w.appliedText, tone: colour.yellow },
    rejected: { title: w.rejectedTitle, text: w.rejectedText, tone: colour.brick },
    suspended: { title: w.suspendedTitle, text: w.suspendedText, tone: colour.brick },
  }[pro.status];

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView
        contentContainerStyle={{ paddingTop: insets.top + 14, paddingHorizontal: 18, paddingBottom: 32, gap: 16 }}
        refreshControl={<RefreshControl refreshing={false} onRefresh={refresh} tintColor={colour.green} />}
      >
        <View style={s.top}>
          <MenuButton />
          <View style={s.brand}>
            <Mark size={30} />
            <View>
              <Text style={s.brandText}>pechkas pro</Text>
              <Text style={s.who}>{pro.full_name.split(' ')[0]}</Text>
            </View>
          </View>
        </View>

        <View style={s.card}>
          <View style={[s.badge, { backgroundColor: state.tone }]}>
            <Icon name={pro.status === 'applied' ? 'jobs' : 'lock'} size={22} color={colour.ink} strokeWidth={2.2} />
          </View>
          <Text style={s.title} accessibilityRole="header">{state.title}</Text>
          <Text style={s.text}>{state.text}</Text>
          {pro.status_reason ? <Text style={s.reason}>{pro.status_reason}</Text> : null}
          {pro.status === 'applied' ? <Text style={s.steps}>{w.appliedSteps}</Text> : null}
        </View>

        {pro.status === 'applied' ? <Button kind="outline" label={w.editForm} onPress={() => router.push('/pro/apply')} /> : null}
        {pro.status === 'rejected' ? <Button label={w.applyAgain} onPress={() => router.push('/pro/apply')} /> : null}

        <View style={s.details}>
          <Text style={s.detailsTitle}>{w.yourDetails}</Text>
          <Text style={s.detail}>{pro.full_name}</Text>
          <Text style={s.detailMuted}>{pro.trades.map((t) => names[t] ?? t).join(' · ')}</Text>
          <Text style={s.detailMuted}>{pro.sectors.join(' · ')}</Text>
        </View>

      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontFamily: font.display, fontSize: 18, color: colour.ink },
  who: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  card: { gap: 10, padding: 18, borderRadius: 24, backgroundColor: colour.white },
  badge: { width: 48, height: 48, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 26, lineHeight: 30, color: colour.ink, letterSpacing: -0.5 },
  text: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colour.ink },
  reason: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 22, color: colour.green },
  steps: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: colour.steel },
  details: { gap: 4, padding: 16, borderRadius: radius.big, borderWidth: 1, borderColor: colour.rule },
  detailsTitle: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel, marginBottom: 4 },
  detail: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  detailMuted: { fontFamily: font.body, fontSize: 13, color: colour.steel },
});
