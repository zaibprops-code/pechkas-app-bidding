import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Linking, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_EDITION, showMobile } from '@pechkas/shared';
import { DuoIcon, type DuoName } from './DuoIcon';
import { Icon } from './Icon';
import { Mark } from './Mark';
import { ModeSwitch } from './ModeSwitch';
import { Press } from './Press';
import { Glow } from './YellowTop';
import { useAccount } from '../account';
import { supabase } from '../supabase';
import { OFFICE_WHATSAPP } from '../office';
import { APP_VERSION } from '../version';
import { colour, font } from '../theme';

/**
 * The ☰ button and the menu it opens — the app's only navigation, like
 * inDrive's (the owner's screenshot): no tab bar along the bottom.
 *
 * Redesigned at the owner's request (24 November 2026), after many rounds:
 * the top is the app's own yellow top (the same lit yellow as home and the
 * sign-in pictures, `Glow`) with the Pechkas mark, the ×, and the person —
 * their initial in yellow on an ink disc, the name, the number and a white
 * chip saying Customer or Technician. Below it, a white page with ONE list in
 * one order, no cards, no groups, no headings and no lines (the owner: "they
 * don't categorise them, just keep a proper sequence"): each row a two-tone
 * icon on a small soft-yellow tile, the words, and a light chevron; the
 * current screen on soft yellow with its tile full yellow. Rows are 44 tall —
 * the tightest a finger can safely tap. At the foot one crisp yellow button,
 * "⇆ Technician mode", and the version under it.
 *
 * My jobs carries the number of the customer's jobs still happening, read
 * from my_jobs() as the menu opens — a real count, never a guess, and no
 * badge at all while it is nought or not yet known.
 *
 * It is drawn by `MenuHost` at the root of the app, over everything, not in
 * a Modal: a Modal is its own window, and on the owner's phone that window
 * stopped short of the status bar and the button bar, so the dimming did
 * not reach the edges. Here it covers the whole screen, and the phone's
 * Back button closes it. It slides in from the left (transform only; the
 * words never fade).
 *
 * Every item goes somewhere real. The stores reject a menu item that does
 * nothing, and so should we. "Support" opens the office on WhatsApp, the
 * way Pechkas has always answered, and says so; Help has the phone number too.
 */

type Item = { icon: DuoName; label: string; to?: Href; open?: () => void; note?: string; count?: boolean };

const support: Item = { icon: 'support', label: 'Support', note: 'WhatsApp', open: () => void Linking.openURL(OFFICE_WHATSAPP).catch(() => {}) };

/** Only what is true about Pechkas, so a friend is promised nothing it does not do. */
const SHARE_TEXT = 'Pechkas: checked technicians for home repairs in Islamabad, and you name the price. https://pechkas.net';
const tellAFriend = () => void Share.share({ message: SHARE_TEXT }).catch(() => {});

/** The rest, in the owner's order: your account, getting help, safety, the small print, a friend. */
const REST: Item[] = [
  { icon: 'settings', label: 'Settings', to: '/me' },
  { icon: 'help', label: 'Help', to: '/help' },
  support,
  { icon: 'shield', label: 'Safety', to: '/safety' },
  // Every legal page in one list, as the owner's reference app has it.
  { icon: 'doc', label: 'Legal', to: '/legal' },
  { icon: 'share', label: 'Tell a friend', open: tellAFriend },
];

const CUSTOMER: Item[] = [
  { icon: 'home', label: 'Home', to: '/' },
  { icon: 'jobs', label: 'My jobs', to: '/jobs', count: true },
  { icon: 'bell', label: 'Notifications', to: '/notifications' },
  ...REST,
];

const technician = (approved: boolean): Item[] => [
  { icon: 'briefcase', label: 'Jobs', to: '/pro' },
  // An unapproved technician has no account screen yet.
  ...(approved ? [{ icon: 'wallet', label: 'My account', to: '/pro/money' } as Item, { icon: 'medal', label: 'Guarantee claims', to: '/pro/claims' } as Item] : []),
  { icon: 'bell', label: 'Notifications', to: '/notifications' },
  ...REST,
];

const MenuContext = createContext<{ open: () => void }>({ open: () => {} });

/** Wraps the app once, in app/_layout.tsx, so the menu can cover the whole screen. */
export function MenuHost({ children }: { children: ReactNode }) {
  const [shown, setShown] = useState(false);
  const open = useCallback(() => setShown(true), []);
  const close = useCallback(() => setShown(false), []);
  const value = useMemo(() => ({ open }), [open]);
  return (
    <MenuContext.Provider value={value}>
      {children}
      {shown ? <Drawer onClose={close} /> : null}
    </MenuContext.Provider>
  );
}

export function MenuButton({ dark = false }: { dark?: boolean }) {
  const { open } = useContext(MenuContext);
  return (
    <Press onPress={open} accessibilityRole="button" accessibilityLabel="Menu" sink={0.9} style={[s.button, dark && s.buttonDark]}>
      <Icon name="menu" size={22} color={dark ? colour.paper : colour.ink} strokeWidth={2.2} />
    </Press>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { account, session } = useAccount();
  const here = usePathname();
  const pro = account?.role === 'pro';
  const items = pro ? technician(account?.pro?.status === 'approved') : CUSTOMER;
  const panel = Math.round(Math.min(330, width * (width < 360 ? 0.88 : 0.84)));
  const x = useRef(new Animated.Value(-panel)).current;
  const [top, setTop] = useState({ w: 0, h: 0 });
  const [happening, setHappening] = useState(0);

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (still) return x.setValue(0);
        Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
  }, [x]);

  // How many of her jobs are still happening: the number beside My jobs.
  useEffect(() => {
    if (pro || !supabase) return;
    let alive = true;
    void supabase.rpc('my_jobs').then(({ data }) => {
      if (alive && Array.isArray(data)) setHappening((data as { status: string }[]).filter((j) => j.status === 'open' || j.status === 'assigned').length);
    });
    return () => {
      alive = false;
    };
  }, [pro]);

  // The phone's Back button closes the menu, as in every app, rather than leaving the screen under it.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  // Moving to another screen any other way closes it too.
  const opened = useRef(here);
  useEffect(() => {
    if (here !== opened.current) onClose();
  }, [here, onClose]);

  const go = (i: Item) => {
    onClose();
    if (i.open) i.open();
    else if (i.to && i.to !== here) router.push(i.to);
  };
  const number = account?.phone ?? session?.user.phone ?? '';
  const who = number ? showMobile(number) : account?.email ?? '';
  const name = account?.first_name ?? 'Your account';

  return (
    <View style={StyleSheet.absoluteFill}>
      {/* The clock sits on the yellow top: dark, whatever the screen under it uses. */}
      <StatusBar style="dark" />
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close the menu" accessibilityRole="button" />
      <Animated.View accessibilityViewIsModal style={[s.panel, { width: panel, transform: [{ translateX: x }] }]}>
        {/* Below the yellow top the menu is one page: on a short phone the rows
            and the button scroll together, so no row is ever hidden behind it. */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1, paddingBottom: insets.bottom + 16 }} bounces={false} showsVerticalScrollIndicator={false}>
          <View style={[s.top, { paddingTop: insets.top + 6 }]} onLayout={(e) => setTop({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}>
            {top.w > 0 ? <Glow width={top.w} height={top.h} id="menu-top" /> : null}
            <View style={s.brand}>
              <View style={s.brandName} accessible accessibilityLabel="Pechkas">
                <Mark size={28} />
                <Text style={s.brandText}>Pechkas</Text>
              </View>
              <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the menu" sink={0.9} style={s.close}>
                <Icon name="cross" size={18} color={colour.ink} strokeWidth={2.4} />
              </Press>
            </View>
            <View style={s.person} accessible accessibilityLabel={`${name}${who ? `, ${who}` : ''}, ${pro ? 'technician' : 'customer'}`}>
              <View style={s.initial}>
                <Text style={s.initialText}>{(account?.first_name ?? '?').trim().charAt(0).toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.name} numberOfLines={1}>
                  {name}
                </Text>
                {who ? (
                  <Text style={s.sub} numberOfLines={1} ellipsizeMode="middle">
                    {who}
                  </Text>
                ) : null}
                <View style={s.side}>
                  <View style={s.sideDot} />
                  <Text style={s.sideText}>{pro ? 'Technician' : 'Customer'}</Text>
                </View>
              </View>
            </View>
          </View>

          <View style={s.list}>
            {items.map((i) => {
              const on = Boolean(i.to) && i.to === here;
              const n = i.count ? happening : 0;
              return (
                <Press
                  key={i.label}
                  onPress={() => go(i)}
                  accessibilityRole={i.open ? 'link' : 'button'}
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={n ? `${i.label}, ${n} happening now` : i.label}
                  accessibilityHint={i.note ? `Opens ${i.note}` : i.label === 'Tell a friend' ? "Opens your phone's share menu" : undefined}
                  style={[s.item, on && s.itemOn]}
                  sink={0.98}
                >
                  <View style={[s.tile, on && s.tileOn]}>
                    <DuoIcon name={i.icon} size={22} accent={on ? colour.softYellow : colour.yellow} />
                  </View>
                  <Text style={[s.itemText, on && s.itemTextOn]} numberOfLines={1}>
                    {i.label}
                  </Text>
                  {n ? (
                    <View style={s.count}>
                      <Text style={s.countText}>{n}</Text>
                    </View>
                  ) : null}
                  {i.note && panel >= 300 ? <Text style={s.note}>{i.note}</Text> : null}
                  {on ? null : <Icon name="chevronRight" size={16} color="#9aa1a6" strokeWidth={2.2} />}
                </Press>
              );
            })}
          </View>

          <View style={{ flexGrow: 1 }} />
          <View style={s.bottom}>
            <ModeSwitch menu onSwitched={onClose} />
            <Text style={s.version}>{APP_VERSION ? `Version ${APP_VERSION}` : `Edition ${APP_EDITION}`}</Text>
          </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.14)' },
  buttonDark: { backgroundColor: '#22282d', boxShadow: 'none' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 23, 26, 0.55)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    overflow: 'hidden',
    backgroundColor: colour.white,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    boxShadow: '8px 0px 30px rgba(20, 23, 26, 0.2)',
  },
  top: { paddingHorizontal: 16, paddingBottom: 18, borderBottomLeftRadius: 30, borderBottomRightRadius: 30, overflow: 'hidden', backgroundColor: colour.yellow },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandText: { fontFamily: font.brand, fontSize: 21, letterSpacing: -0.4, color: colour.ink },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' },
  person: { flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 8 },
  initial: { width: 54, height: 54, borderRadius: 27, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  initialText: { fontFamily: font.display, fontSize: 22, color: colour.yellow },
  name: { fontFamily: font.display, fontSize: 20, letterSpacing: -0.3, color: colour.ink },
  sub: { fontFamily: font.bodySemi, fontSize: 14, color: colour.onYellow, marginTop: 1 },
  side: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginTop: 6, height: 26, paddingHorizontal: 11, borderRadius: 13, backgroundColor: 'rgba(255,255,255,0.65)' },
  sideDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colour.green },
  sideText: { fontFamily: font.displayBold, fontSize: 12.5, color: colour.ink },
  list: { paddingTop: 12, paddingHorizontal: 12 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 44, paddingVertical: 3, paddingHorizontal: 10, borderRadius: 12 },
  itemOn: { backgroundColor: colour.softYellow },
  tile: { width: 36, height: 36, borderRadius: 11, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  tileOn: { backgroundColor: colour.yellow },
  itemText: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  itemTextOn: { fontFamily: font.display },
  note: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel },
  count: { minWidth: 24, height: 24, paddingHorizontal: 7, borderRadius: 12, backgroundColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: font.display, fontSize: 12.5, color: colour.yellow },
  bottom: { gap: 10, paddingTop: 16, paddingHorizontal: 12 },
  version: { fontFamily: font.bodyMedium, fontSize: 11.5, color: colour.steel, textAlign: 'center' },
});
