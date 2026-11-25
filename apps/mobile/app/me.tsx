import { useToast } from '../src/components/Toast';
import { done } from '../src/message';
import { useCallback, useState } from 'react';
import { Linking, ScrollView, StyleSheet, Text, TextInput, useWindowDimensions, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { rupees, showMobile } from '@pechkas/shared';
import { Body, Button, Field, Notice, Screen, SystemBars, Title, useScrollEnd } from '../src/components/ui';
import { DuoRow } from '../src/components/Rows';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Sheet } from '../src/components/Sheet';
import { Glow } from '../src/components/YellowTop';
import { ThisCopy } from '../src/components/ThisCopy';
import { useAccount } from '../src/account';
import { useNotify } from '../src/notifications';
import { openLegal } from '../src/legal';
import { forgetPlace, loadPlaces, placeLine, type Place } from '../src/post/places';
import { APP_VERSION } from '../src/version';
import { ask, supabase } from '../src/supabase';
import { colour, font, glow, radius, shadow, TAP } from '../src/theme';

/**
 * Settings (the owner's design, 25 November 2026). The person on the app's
 * own coloured top — yellow for a customer, green for a technician — with a
 * big initial in a white ring (a pencil on it lets a customer correct her
 * first name), how long they have been with Pechkas, and which side they are
 * on; then ONE white strip of three real numbers, each a door:
 *
 *   customer    jobs done → My jobs, Past · under guarantee → Past, filtered
 *               to those · spent this year → Past
 *   technician  jobs done → My account · rating (New until enough) → what
 *               customers wrote · kept this month → My account
 *
 * Then "Your account" as one card of rows: the number (✓ Checked), email if
 * there is one, saved addresses (the phone's own list, with × to forget one)
 * or his checks, and notifications; Sign out and Delete my account side by
 * side; and one quiet version line that opens the details for a screenshot.
 * Each fact once: the mode switch and the legal pages are in the menu.
 *
 * The numbers are my_settings(), his words my_ratings(), the name
 * set_my_name() (migration …_settings_page). Deleting an account is still
 * here because both stores require it inside the app.
 */

type Summary = {
  since: string | null;
  customer: { done: number; covered: number; year: number; spent_paisa: number };
  pro: { jobs_done: number; rating: number | null; rating_count: number; month: string; kept_paisa: number; trades: string[] } | null;
};
type Ratings = { rating: number | null; count: number; jobs_done: number; needed: number; words: { stars: number; words: string; at: string; trade: string | null }[] };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const pkDate = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
const sinceLine = (iso: string | null) => (iso ? `With Pechkas since ${MONTHS[pkDate(iso).getUTCMonth()]} ${pkDate(iso).getUTCFullYear()}` : null);
const shortDay = (iso: string) => {
  const d = pkDate(iso);
  return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
};
/** "Rs 12,500" with the "Rs" small and quiet, as the strip shows money. */
function Money({ paisa, style }: { paisa: number; style: object }) {
  const [rs, figure] = rupees(paisa).split(/\s(.+)/);
  return (
    <Text style={style}>
      <Text style={s.rs}>{rs} </Text>
      {figure}
    </Text>
  );
}

export default function Me() {
  const { session, account, signOut, connected, refresh } = useAccount();
  const insets = useSafeAreaInsets();
  const end = useScrollEnd(28);
  const narrow = useWindowDimensions().width < 360;
  const [editing, setEditing] = useState(false);
  const [newPhone, setNewPhone] = useState('');
  const toast = useToast();
  const [phoneError, setPhoneError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [sum, setSum] = useState<Summary | null>(null);
  const [places, setPlaces] = useState<Place[]>([]);
  const [sheet, setSheet] = useState<null | 'places' | 'name' | 'rating' | 'copy'>(null);
  const [name, setName] = useState('');
  const [nameError, setNameError] = useState<string | null>(null);
  const [ratings, setRatings] = useState<Ratings | null>(null);
  const { notify, ask: askNotify } = useNotify(Boolean(session && account));

  useFocusEffect(
    useCallback(() => {
      if (!session || !supabase) return;
      void supabase.rpc('my_settings').then(({ data }) => data && setSum(data as Summary));
      void loadPlaces().then(setPlaces);
    }, [session]),
  );

  const back = <Button kind="outline" label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} />;

  if (!session) {
    return (
      <Screen footer={back}>
        <Title>Your account</Title>
        <Body muted>{connected ? 'Sign in with your mobile number to post jobs and see your offers.' : 'The app is not connected to Pechkas yet.'}</Body>
        {connected ? <Button label="Sign in" onPress={() => router.replace('/start')} /> : null}
        <Button kind="outline" label="Privacy policy" onPress={() => openLegal('privacy')} />
        <Button kind="outline" label="Terms of use" onPress={() => openLegal('terms')} />
        <ThisCopy />
      </Screen>
    );
  }

  async function remove() {
    setBusy(true);
    setNotice(null);
    // Voice notes, videos and photos of somebody's home go with the account.
    // The database cannot delete stored files itself, so the phone does it
    // first, from the customer's own folder, which only they may empty.
    if (supabase && session) {
      const folder = session.user.id;
      const { data: files } = await supabase.storage.from('job-media').list(folder, { limit: 1000 });
      if (files?.length) {
        const { error } = await supabase.storage.from('job-media').remove(files.map((f) => `${folder}/${f.name}`));
        if (error) {
          setBusy(false);
          setNotice('Your photos and recordings could not be deleted. Check your signal and try again.');
          return;
        }
      }
    }
    const r = await ask('delete_my_account');
    if (!r.ok) {
      setBusy(false);
      setNotice(r.why);
      return;
    }
    await signOut();
    setBusy(false);
    router.replace('/start');
  }

  const number = account?.phone ?? session.user.phone ?? '';
  const phone = number ? `${showMobile(number)}${account?.phone_checked === false ? ' (not checked)' : ''}` : 'Not given yet';

  async function savePhone() {
    setPhoneError(null);
    setBusy(true);
    const r = await ask('set_my_phone', { p_phone: newPhone });
    setBusy(false);
    if (!r.ok) return setPhoneError(r.why);
    setEditing(false);
    setNewPhone('');
    await refresh();
    toast.show(done('Your number is saved.'));
  }

  async function saveName() {
    setNameError(null);
    setBusy(true);
    const r = await ask<{ first_name: string }>('set_my_name', { p_name: name });
    setBusy(false);
    if (!r.ok) return setNameError(r.why);
    setSheet(null);
    await refresh();
    toast.show(done('Your name is saved.'));
  }

  async function openRatings() {
    setSheet('rating');
    if (!supabase) return;
    const { data } = await supabase.rpc('my_ratings', { p_limit: 20 });
    if (data) setRatings(data as Ratings);
  }

  async function forget(p: Place) {
    setPlaces(await forgetPlace(p));
  }

  const pro = account?.role === 'pro';
  const unchecked = account?.phone_checked === false;
  const first = account?.first_name || 'Your account';
  const fullName = pro ? account?.pro?.full_name || first : first;
  const notifyWhat =
    notify === 'on'
      ? pro ? 'New jobs while you are online' : 'Offers and visits, on this phone'
      : notify === 'ask' ? 'Tap to turn them on' : notify === 'off' ? "Turned off in your phone's settings" : 'Not on this copy of the app';
  const side = pro ? (sum?.pro?.trades.length ? sum.pro.trades.join(' · ') : 'Technician') : account?.role === 'customer' ? 'Customer' : 'Account not finished';
  const named = places.filter((p) => p.label);
  const placesLine = places.length ? (named.length ? named.map((p) => p.label).join(' · ') : 'Last used') : 'None yet';
  const fg = pro ? colour.white : colour.ink;
  const month = sum?.pro ? MONTHS[Number(sum.pro.month.slice(5, 7)) - 1]?.slice(0, 3) : '';

  // The strip: three real numbers, each opening where it is counted.
  const cells: { icon: DuoName; value: React.ReactNode; label: string; go: () => void; a11y: string }[] = pro
    ? [
        { icon: 'jobs', value: String(sum?.pro?.jobs_done ?? '–'), label: 'jobs done', go: () => router.push('/pro/money'), a11y: `${sum?.pro?.jobs_done ?? 0} jobs done` },
        {
          icon: 'star',
          value: sum?.pro?.rating !== null && sum?.pro?.rating !== undefined ? Number(sum.pro.rating).toFixed(1) : 'New',
          label: sum?.pro?.rating_count ? `${sum.pro.rating_count} ${sum.pro.rating_count === 1 ? 'rating' : 'ratings'}` : 'no ratings yet',
          go: openRatings,
          a11y: sum?.pro?.rating ? `Rating ${sum.pro.rating} from ${sum.pro.rating_count} ratings` : 'New: not enough ratings yet',
        },
        { icon: 'wallet', value: sum?.pro ? <Money paisa={sum.pro.kept_paisa} style={s.figure} /> : '–', label: `kept in ${month || 'this month'}`, go: () => router.push('/pro/money'), a11y: `${rupees(sum?.pro?.kept_paisa ?? 0)} kept this month` },
      ]
    : [
        { icon: 'jobs', value: String(sum?.customer.done ?? '–'), label: 'jobs done', go: () => router.push({ pathname: '/jobs', params: { tab: 'past' } }), a11y: `${sum?.customer.done ?? 0} jobs done` },
        { icon: 'shield', value: String(sum?.customer.covered ?? '–'), label: 'under guarantee', go: () => router.push({ pathname: '/jobs', params: { tab: 'past', what: 'covered' } }), a11y: `${sum?.customer.covered ?? 0} under guarantee` },
        { icon: 'wallet', value: sum ? <Money paisa={sum.customer.spent_paisa} style={s.figure} /> : '–', label: `spent in ${sum?.customer.year ?? 'this year'}`, go: () => router.push({ pathname: '/jobs', params: { tab: 'past' } }), a11y: `${rupees(sum?.customer.spent_paisa ?? 0)} spent this year` },
      ];

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style={pro ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ paddingBottom: end }} keyboardShouldPersistTaps="handled">
        {/* The person, on their side's own colour. */}
        <Top pro={pro} insetTop={insets.top}>
          <View style={s.bar}>
            <Press onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))} accessibilityRole="button" accessibilityLabel="Back" sink={0.9} style={[s.back, pro && s.backDark]}>
              <Icon name="arrowLeft" size={22} color={fg} strokeWidth={2.2} />
            </Press>
            <Text style={[s.barTitle, { color: fg }]} accessibilityRole="header">
              Settings
            </Text>
            <View style={{ width: TAP }} />
          </View>
          <View style={s.who}>
            <View>
              <View style={[s.initial, pro && s.initialPro]}>
                <Text style={[s.initialText, pro && { color: colour.ink }]}>{first.trim().charAt(0).toUpperCase()}</Text>
              </View>
              {pro ? null : (
                <Press
                  onPress={() => {
                    setName(account?.first_name ?? '');
                    setNameError(null);
                    setSheet('name');
                  }}
                  accessibilityRole="button"
                  accessibilityLabel="Change your first name"
                  sink={0.9}
                  style={s.pencil}
                >
                  <Icon name="pencil" size={15} color={colour.ink} strokeWidth={2.2} />
                </Press>
              )}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 3 }}>
              <Text style={[s.name, narrow && s.nameNarrow, { color: fg }]} numberOfLines={2}>
                {fullName}
              </Text>
              {sinceLine(sum?.since ?? null) ? <Text style={[s.since, pro && { color: '#cfe3de' }]}>{sinceLine(sum?.since ?? null)}</Text> : null}
              <View style={[s.chip, pro && s.chipPro]}>
                <DuoIcon name={pro ? 'briefcase' : 'home'} size={16} />
                <Text style={[s.chipText, pro && { color: colour.white }]} numberOfLines={1}>
                  {side}
                </Text>
              </View>
            </View>
          </View>
        </Top>

        {/* One strip, three doors. */}
        <View style={s.strip}>
          {cells.map((c, i) => (
            <Press key={c.label} onPress={c.go} accessibilityRole="button" accessibilityLabel={c.a11y} sink={0.97} style={[s.cell, i > 0 && s.cellRule]}>
              <DuoIcon name={c.icon} size={22} />
              {typeof c.value === 'string' ? <Text style={s.figure}>{c.value}</Text> : c.value}
              <Text style={[s.cellLabel, narrow && s.cellLabelNarrow]} numberOfLines={2}>
                {c.label}
              </Text>
            </Press>
          ))}
        </View>

        <View style={s.body}>
          <Text style={s.section}>Your account</Text>
          <View style={s.card}>
            <DuoRow
              icon="phone"
              label="Mobile number"
              value={(account?.phone ?? session.user.phone) ? showMobile(account?.phone ?? session.user.phone ?? '') : 'Not given yet'}
              onPress={unchecked && !editing ? () => setEditing(true) : undefined}
              right={
                unchecked ? (
                  editing ? undefined : <Text style={s.change}>Change</Text>
                ) : (account?.phone ?? session.user.phone) ? (
                  <View style={s.tick}>
                    <Icon name="check" size={13} color={colour.greenDark} strokeWidth={3} />
                    <Text style={s.tickText}>Checked</Text>
                  </View>
                ) : undefined
              }
            />
            {editing ? (
              <View style={s.edit}>
                <Field
                  label="Your mobile number"
                  value={newPhone}
                  onChangeText={setNewPhone}
                  placeholder="0300 1234567"
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  error={phoneError ?? undefined}
                  hint="The person you are working with calls you on this."
                />
                <Button label="Save number" onPress={savePhone} busy={busy} />
                <Button kind="outline" label="Cancel" onPress={() => { setEditing(false); setPhoneError(null); }} />
              </View>
            ) : null}
            {account?.email ? <DuoRow icon="mail" label="Email" value={account.email} oneLine /> : null}
            {pro ? (
              <DuoRow icon="shield" label="Your checks" value="Number, photo, rules quiz" onPress={() => router.push('/pro/checks')} />
            ) : (
              <DuoRow icon="pin" label="Saved addresses" value={placesLine} onPress={() => setSheet('places')} />
            )}
            <DuoRow
              icon="bell"
              label="Notifications"
              value={notifyWhat}
              onPress={notify === 'ask' ? askNotify : notify === 'off' ? () => Linking.openSettings() : () => router.push('/notifications')}
              right={
                <View style={s.rightRow}>
                  {notify === 'on' || notify === 'ask' || notify === 'off' ? (
                    <View style={[s.tick, notify !== 'on' && s.tickOff]}>
                      <Text style={[s.tickText, notify !== 'on' && { color: colour.inkSoft }]}>{notify === 'on' ? 'On' : 'Off'}</Text>
                    </View>
                  ) : null}
                  <Icon name="chevronRight" size={18} color="#9aa1a6" strokeWidth={2.2} />
                </View>
              }
              last
            />
          </View>

          <View style={[s.leave, narrow && s.leaveNarrow]}>
            <Press onPress={async () => { await signOut(); router.replace('/start'); }} accessibilityRole="button" sink={0.97} style={s.leaveButton}>
              <DuoIcon name="logout" size={18} />
              <Text style={s.leaveText}>Sign out</Text>
            </Press>
            {/* Both stores require deleting an account inside the app; the delete-account page names this button. */}
            <Press onPress={() => setConfirming(true)} accessibilityRole="button" sink={0.97} style={s.leaveButton}>
              <DuoIcon name="trash" size={18} accent={colour.brickTint} ink={colour.brick} />
              <Text style={[s.leaveText, { color: colour.brick }]} numberOfLines={1}>
                Delete my account
              </Text>
            </Press>
          </View>
          {confirming ? (
            <View style={s.danger}>
              <Text style={s.dangerText}>
                This deletes your account and everything in it: your name, your number, {pro ? 'your application, ' : ''}{account?.role === 'customer' ? 'your jobs, voice notes, videos and photos, ' : ''}all of it. It cannot be undone.
              </Text>
              <Button kind="danger" label="Yes, delete it" onPress={remove} busy={busy} />
              <Button kind="outline" label="No, keep it" onPress={() => setConfirming(false)} />
            </View>
          ) : null}
          <Notice text={notice} />

          {/* One quiet line; the details are for a screenshot when something is missing. */}
          <Press onPress={() => setSheet('copy')} accessibilityRole="button" accessibilityHint="Shows which copy of the app this is" style={s.versionRow}>
            <Text style={s.version}>Version {APP_VERSION} · details</Text>
          </Press>
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />

      {sheet === 'places' ? (
        <Sheet title="Saved addresses" onClose={() => setSheet(null)}>
          <View style={s.sheetBody}>
            <Text style={s.small}>Kept on this phone only, so Post a job can fill them in. Signing out forgets them.</Text>
            {places.length ? (
              places.map((p) => (
                <View key={`${p.label}-${p.lat}-${p.lng}`} style={s.place}>
                  <View style={s.tile}>
                    <DuoIcon name="pin" size={22} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.placeTitle}>{p.label ?? 'Last used'}</Text>
                    <Text style={s.small}>{`${placeLine(p)}, ${p.sector}`}</Text>
                  </View>
                  <Press onPress={() => void forget(p)} accessibilityRole="button" accessibilityLabel={`Forget ${p.label ?? 'the last used address'}`} sink={0.9} style={s.forget}>
                    <Icon name="cross" size={16} color={colour.brick} strokeWidth={2.6} />
                  </Press>
                </View>
              ))
            ) : (
              <Text style={s.placeTitle}>No addresses saved on this phone.</Text>
            )}
            <Text style={s.small}>To save one, choose Home, Office or Other when you post a job.</Text>
          </View>
        </Sheet>
      ) : null}

      {sheet === 'name' ? (
        <Sheet title="Your first name" onClose={() => setSheet(null)}>
          <View style={s.sheetBody}>
            <TextInput
              value={name}
              onChangeText={setName}
              maxLength={40}
              autoFocus
              autoCapitalize="words"
              accessibilityLabel="Your first name"
              style={[s.nameBox, nameError ? { borderColor: colour.brick } : null]}
            />
            {nameError ? <Text style={s.error}>{nameError}</Text> : null}
            <Text style={s.small}>Technicians see only your first name, never a surname.</Text>
            <Button kind="ink" label="Save" busy={busy} onPress={saveName} />
          </View>
        </Sheet>
      ) : null}

      {sheet === 'rating' ? (
        <Sheet title="Your rating" onClose={() => setSheet(null)}>
          <View style={s.sheetBody}>
            {ratings ? (
              <>
                <View style={s.ratingHead}>
                  <Text style={s.ratingBig}>{ratings.rating !== null ? Number(ratings.rating).toFixed(1) : 'New'}</Text>
                  <View style={{ flex: 1 }}>
                    {ratings.rating !== null ? <Text style={s.stars}>{'★'.repeat(Math.round(Number(ratings.rating)))}</Text> : null}
                    <Text style={s.small}>
                      {ratings.rating !== null
                        ? `From ${ratings.count} ${ratings.count === 1 ? 'customer' : 'customers'} · ${ratings.jobs_done} jobs done`
                        : `A rating shows once ${ratings.needed} customers have rated you. You have ${ratings.count}.`}
                    </Text>
                  </View>
                </View>
                {ratings.words.map((r, i) => (
                  <View key={`${r.at}-${i}`} style={s.said}>
                    <Text style={s.saidText}>“{r.words}”</Text>
                    <Text style={s.small}>{[r.trade, shortDay(r.at)].filter(Boolean).join(' · ')}</Text>
                  </View>
                ))}
                {ratings.words.length ? null : <Text style={s.small}>No customer has written anything yet.</Text>}
                <Text style={s.small}>Customers choosing you see these words too, never who wrote them.</Text>
              </>
            ) : (
              <Text style={s.small}>Loading…</Text>
            )}
          </View>
        </Sheet>
      ) : null}

      {sheet === 'copy' ? (
        <Sheet title="This copy of the app" onClose={() => setSheet(null)}>
          <View style={s.sheetBody}>
            <ThisCopy />
          </View>
        </Sheet>
      ) : null}
    </View>
  );
}

/** The side's own colour, lit like home's yellow top, rounded at the foot, running up under the clock. */
function Top({ pro, insetTop, children }: { pro: boolean; insetTop: number; children: React.ReactNode }) {
  const [size, setSize] = useState({ w: 0, h: 0 });
  return (
    <View style={[s.top, { paddingTop: insetTop + 6, backgroundColor: pro ? colour.green : colour.yellow }]} onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
      {size.w ? <Glow width={size.w} height={size.h} stops={pro ? glow.green : glow.yellow} id={pro ? 'settings-green' : 'settings-yellow'} /> : null}
      {children}
    </View>
  );
}

const SHADOW = shadow.card;

const s = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingBottom: 62, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TAP },
  back: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' },
  backDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  barTitle: { fontFamily: font.display, fontSize: 17 },
  who: { flexDirection: 'row', alignItems: 'center', gap: 16, marginTop: 14 },
  initial: { width: 76, height: 76, borderRadius: 38, borderWidth: 4, borderColor: colour.white, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  initialPro: { backgroundColor: colour.yellow },
  initialText: { fontFamily: font.displayBold, fontSize: 30, color: colour.yellow },
  pencil: { position: 'absolute', right: -6, bottom: -6, width: 32, height: 32, borderRadius: 16, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 2px 6px rgba(20, 23, 26, 0.18)' },
  name: { fontFamily: font.displayBold, fontSize: 26, lineHeight: 30 },
  nameNarrow: { fontSize: 22, lineHeight: 26 },
  since: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.onYellow },
  chip: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4, height: 30, paddingHorizontal: 11, borderRadius: radius.pill, backgroundColor: colour.white, maxWidth: '100%' },
  chipPro: { backgroundColor: 'rgba(255,255,255,0.16)' },
  chipText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink, flexShrink: 1 },
  strip: { flexDirection: 'row', marginTop: -44, marginHorizontal: 14, borderRadius: 22, backgroundColor: colour.white, boxShadow: '0px 6px 18px rgba(20, 23, 26, 0.10)' },
  cell: { flex: 1, minHeight: 96, alignItems: 'center', justifyContent: 'center', gap: 4, paddingVertical: 12, paddingHorizontal: 4 },
  cellRule: { borderLeftWidth: 1, borderLeftColor: colour.rule },
  figure: { fontFamily: font.displayBold, fontSize: 22, color: colour.ink, fontVariant: ['tabular-nums'] },
  rs: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel },
  cellLabel: { fontFamily: font.bodyMedium, fontSize: 12.5, color: colour.steel, textAlign: 'center' },
  cellLabelNarrow: { fontSize: 11.5 },
  body: { paddingHorizontal: 14, paddingTop: 16, gap: 12 },
  section: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel, marginLeft: 6 },
  card: { paddingHorizontal: 14, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  change: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green, textDecorationLine: 'underline' },
  tick: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, backgroundColor: colour.greenSoft },
  tickOff: { backgroundColor: colour.canvas },
  tickText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.greenDark },
  rightRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  edit: { gap: 8, paddingTop: 14, paddingBottom: 14 },
  leave: { flexDirection: 'row', gap: 10 },
  leaveNarrow: { flexDirection: 'column' },
  leaveButton: { flex: 1, minHeight: 56, borderRadius: 18, backgroundColor: colour.white, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 6, boxShadow: SHADOW },
  leaveText: { fontFamily: font.bodySemi, fontSize: 14.5, color: colour.ink },
  danger: { gap: 10, padding: 14, borderRadius: 18, backgroundColor: colour.softBrick },
  dangerText: { fontFamily: font.bodyMedium, fontSize: 14, lineHeight: 20, color: colour.ink },
  versionRow: { alignSelf: 'center', minHeight: TAP, justifyContent: 'center', paddingHorizontal: 12 },
  version: { fontFamily: font.bodyMedium, fontSize: 12.5, color: colour.steel },
  sheetBody: { paddingHorizontal: 16, gap: 12, paddingBottom: 8 },
  small: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.inkSoft },
  place: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, borderBottomWidth: 1, borderBottomColor: colour.rule },
  tile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  placeTitle: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  forget: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: colour.softBrick, alignItems: 'center', justifyContent: 'center' },
  nameBox: { height: 56, borderRadius: 16, borderWidth: 2, borderColor: colour.ink, paddingHorizontal: 16, fontFamily: font.bodySemi, fontSize: 18, color: colour.ink, backgroundColor: colour.white },
  error: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.brick },
  ratingHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  ratingBig: { fontFamily: font.displayBold, fontSize: 44, color: colour.ink },
  stars: { fontSize: 20, letterSpacing: 2, color: colour.green },
  said: { gap: 2, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colour.rule },
  saidText: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.ink },
});
