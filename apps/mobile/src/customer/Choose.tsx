import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees } from '@pechkas/shared';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { Notice, SystemBars, useScrollEnd } from '../components/ui';
import { useToast } from '../components/Toast';
import { done } from '../message';
import { ask } from '../supabase';
import { colour, font, glow, shadow } from '../theme';
import { Face } from './Face';
import { ProProfile } from './ProProfile';
import { CancelSheet, useOffers } from './Waiting';
import type { Job, Offer } from './JobCard';

/**
 * Choose a technician (the owner's approved mock, sheet 2): "× Cancel job",
 * the title, "Nearest first · each offer waits a few minutes", then one card
 * per offer, nearest first: the price and his minutes big, his initial,
 * name, rating (or New) and jobs, his trade and years, and No thanks /
 * Choose Bilal side by side. The darker part of each card shrinks as the
 * offer runs out. A tap on his name opens his profile. Anything the
 * database says about one offer that she must know — parts in his price,
 * a photo she checks at the door, a checked first job, his note — sits
 * under his line, only when it is there.
 *
 * Choosing and declining are the same database calls as before.
 */

export function ChooseView({ job, trade, tick, onChanged }: { job: Job; trade: string; tick: number; onChanged: () => void }) {
  const insets = useSafeAreaInsets();
  const end = useScrollEnd(24);
  const toast = useToast();
  const { offers, far, setOffers } = useOffers(job, tick);
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [profile, setProfile] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());
  const narrow = useWindowDimensions().width < 360;
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  async function choose(o: Offer) {
    setBusy(o.id);
    setMsg(null);
    const r = await ask('choose_offer', { p_offer: o.id });
    setBusy(null);
    if (!r.ok) return setMsg(r.why);
    toast.show(done(`${o.pro_first_name} gets your address and number, and you get his.`, `${o.pro_first_name} is coming`));
    onChanged();
    router.replace({ pathname: '/job/[id]', params: { id: job.id } });
  }
  async function decline(o: Offer) {
    setBusy(o.id);
    setMsg(null);
    const r = await ask('decline_offer', { p_offer: o.id });
    setBusy(null);
    if (!r.ok) return setMsg(r.why);
    setOffers((list) => list.filter((x) => x.id !== o.id));
    toast.show(done(`${o.pro_first_name} is told, and cannot offer on this job again.`, 'Offer declined'));
    onChanged();
  }

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style="dark" />
      <ScrollView contentContainerStyle={{ paddingTop: insets.top + 10, paddingHorizontal: 14, paddingBottom: end, gap: 12 }}>
        <Press onPress={() => setCancelling(true)} accessibilityRole="button" accessibilityLabel="Cancel job" sink={0.95} style={s.cancel}>
          <Text style={s.cancelText}>×  Cancel job</Text>
        </Press>
        <View style={{ gap: 2, marginBottom: 4 }}>
          <Text style={s.title} accessibilityRole="header">
            Choose a technician
          </Text>
          <View style={s.subRow}>
            <Icon name="pin" size={14} color={colour.steel} strokeWidth={2.2} />
            <Text style={s.sub}>Nearest first · each offer waits a few minutes</Text>
          </View>
        </View>

        {offers.length === 0 ? (
          <View style={s.card}>
            <Text style={s.empty}>No offer is waiting right now. Your job is still open, and you are told the moment one comes.</Text>
            <Press onPress={() => (router.canGoBack() ? router.back() : router.replace({ pathname: '/job/[id]', params: { id: job.id } }))} accessibilityRole="button" style={s.back}>
              <Text style={s.backText}>Back to the search</Text>
            </Press>
          </View>
        ) : null}

        {offers.map((o) => {
          const f = far[o.id];
          const min = f?.eta_seconds !== null && f?.eta_seconds !== undefined ? Math.max(1, Math.round(f.eta_seconds / 60)) : null;
          const km = f ? f.route_m ?? f.distance_m : null;
          const away = min !== null ? `${min} min` : km !== null && km !== undefined ? (km < 1000 ? '< 1 km' : `${Math.round(km / 1000)} km`) : null;
          // The darker part shrinks as the offer runs out (an offer lasts about ten minutes).
          const left = Math.max(0, new Date(o.expires_at).getTime() - now);
          const share = Math.max(0, Math.min(1, left / 600000));
          return (
            <View key={o.id} style={s.card}>
              <View style={s.priceRow}>
                <Text style={s.price}>{rupees(o.price_paisa)}</Text>
                {away ? <Text style={s.away}>{away}</Text> : null}
              </View>
              <Press onPress={() => setProfile(o.id)} accessibilityRole="button" accessibilityLabel={`See ${o.pro_first_name}'s profile`} sink={0.98} style={s.who}>
                {o.photo ? (
                  <Face path={o.photo} name={o.pro_first_name} size={40} />
                ) : (
                  <View style={s.disc}>
                    <Text style={s.discText}>{o.pro_first_name.charAt(0).toUpperCase()}</Text>
                  </View>
                )}
                <View style={{ flex: 1 }}>
                  <View style={s.nameRow}>
                    <Text style={s.name}>{o.pro_first_name}</Text>
                    {o.rating !== null && o.rating !== undefined ? (
                      <Text style={s.rating}>
                        <Text style={{ color: colour.yellow }}>★</Text> {Number(o.rating).toFixed(1)}
                      </Text>
                    ) : (
                      <View style={s.newTag}>
                        <Text style={s.newText}>New</Text>
                      </View>
                    )}
                    {o.jobs_done ? <Text style={s.jobs}>{o.jobs_done} {o.jobs_done === 1 ? 'job' : 'jobs'}</Text> : null}
                  </View>
                  <Text style={s.meta}>
                    {trade} · {o.years} {o.years === 1 ? 'year' : 'years'} in the trade
                  </Text>
                </View>
              </Press>
              {o.parts_paisa ? <Text style={s.extra}>Includes {rupees(o.parts_paisa)} of parts, with a shop receipt.</Text> : null}
              {o.photo ? <Text style={s.extra}>You check it is him, from his photo, at your door.</Text> : null}
              {o.checked_visit ? <Text style={s.extra}>His first job of this kind: another Pechkas technician comes too and checks the work, at no cost to you.</Text> : null}
              {o.note ? <Text style={s.quote}>“{o.note}”</Text> : null}
              <View style={[s.buttons, narrow && { flexDirection: 'column' }]}>
                <Press onPress={busy ? undefined : () => decline(o)} accessibilityRole="button" accessibilityLabel={`No thanks to ${o.pro_first_name}`} sink={0.96} style={[s.btn, s.no]}>
                  <Text style={s.noText}>No thanks</Text>
                </Press>
                {/* The darker yellow is the time left: it shrinks as the offer runs out. Only transform moves. */}
                <Press
                  onPress={busy ? undefined : () => choose(o)}
                  accessibilityRole="button"
                  accessibilityLabel={`Choose ${o.pro_first_name}, ${Math.ceil(left / 60000)} minutes left on this offer`}
                  accessibilityState={{ busy: busy === o.id }}
                  sink={0.96}
                  style={[s.btn, s.yes]}
                >
                  <View style={[s.yesRun, { transform: [{ scaleX: share }] }]} pointerEvents="none" />
                  <Text style={s.yesText}>{busy === o.id ? 'Choosing…' : `Choose ${o.pro_first_name}`}</Text>
                </Press>
              </View>
            </View>
          );
        })}
        <Notice text={msg} />
      </ScrollView>
      <SystemBars bg={colour.canvas} />
      {cancelling ? <CancelSheet job={job} onClose={() => setCancelling(false)} onDone={() => { onChanged(); router.replace({ pathname: '/job/[id]', params: { id: job.id } }); }} /> : null}
      {profile ? (
        <ProProfile
          offerId={profile}
          price={offers.find((o) => o.id === profile)?.price_paisa ?? 0}
          onClose={() => setProfile(null)}
          onChoose={() => {
            const o = offers.find((x) => x.id === profile);
            setProfile(null);
            if (o) choose(o);
          }}
        />
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  cancel: { alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colour.softBrick, justifyContent: 'center' },
  cancelText: { fontFamily: font.display, fontSize: 14, color: colour.brick },
  title: { fontFamily: font.display, fontSize: 24, letterSpacing: -0.4, color: colour.ink },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sub: { fontFamily: font.body, fontSize: 13.5, color: colour.steel },
  card: { gap: 12, padding: 14, borderRadius: 22, backgroundColor: colour.white, boxShadow: shadow.card },
  priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 8 },
  price: { fontFamily: font.display, fontSize: 24, letterSpacing: -0.4, color: colour.ink },
  away: { fontFamily: font.display, fontSize: 20, color: colour.steel },
  disc: { width: 40, height: 40, borderRadius: 20, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  discText: { fontFamily: font.display, fontSize: 16, color: colour.white },
  who: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 44 },
  nameRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
  name: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  rating: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  jobs: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  newTag: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8, backgroundColor: colour.greenSoft },
  newText: { fontFamily: font.bodySemi, fontSize: 12, color: colour.greenDark },
  meta: { fontFamily: font.body, fontSize: 13, color: colour.steel },
  extra: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.inkSoft },
  quote: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
  buttons: { flexDirection: 'row', gap: 10 },
  btn: { minHeight: 50, borderRadius: 14, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 12, overflow: 'hidden' },
  no: { flex: 0.85, backgroundColor: colour.canvas },
  noText: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  yes: { flex: 1.25, backgroundColor: glow.yellow[1] },
  yesRun: { position: 'absolute', left: 0, top: 0, bottom: 0, width: '100%', backgroundColor: colour.yellow, transformOrigin: 'left' },
  yesText: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  empty: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.inkSoft },
  back: { alignSelf: 'flex-start', minHeight: 44, justifyContent: 'center' },
  backText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.green, textDecorationLine: 'underline' },
});
