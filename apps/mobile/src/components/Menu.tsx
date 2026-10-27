import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Linking, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_EDITION, showMobile } from '@pechkas/shared';
import { Icon, type IconName } from './Icon';
import { Mark } from './Mark';
import { ModeSwitch } from './ModeSwitch';
import { Press } from './Press';
import { Avatar } from './ui';
import { useAccount } from '../account';
import { OFFICE_WHATSAPP } from '../office';
import { APP_VERSION } from '../version';
import { colour, font } from '../theme';

/**
 * The ☰ button and the menu it opens — the app's only navigation, like
 * inDrive's (the owner's screenshot): no tab bar along the bottom.
 *
 * Drawn as a professional app's side menu: the Pechkas mark at the top, the
 * person on a card (tap: Settings), then the places in small groups — each
 * row an icon on a soft tile, the words, and a chevron — and at the foot one
 * big yellow button for the other mode, where inDrive keeps "Driver mode",
 * with the version underneath.
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
 * way Pechkas has always answered; Help has the phone number too.
 */

type Item = { icon: IconName; label: string; note?: string; to?: Href; open?: () => void };
type Group = { title?: string; items: Item[] };

const support: Item = { icon: 'whatsapp', label: 'Support', note: 'Chat with the office on WhatsApp', open: () => void Linking.openURL(OFFICE_WHATSAPP).catch(() => {}) };

/** Only what is true about Pechkas, so a friend is promised nothing it does not do. */
const SHARE_TEXT = 'Pechkas: checked technicians for home repairs in Islamabad, and you name the price. https://pechkas.net';
const tellAFriend: Item = {
  icon: 'share',
  label: 'Tell a friend',
  open: () => void Share.share({ message: SHARE_TEXT }).catch(() => {}),
};

const HELP: Group = {
  title: 'Help and safety',
  items: [{ icon: 'shield', label: 'Safety', to: '/safety' }, { icon: 'help', label: 'Help', to: '/help' }, support],
};
const MORE: Group = { title: 'More', items: [{ icon: 'settings', label: 'Settings', to: '/me' }, tellAFriend] };

const CUSTOMER: Group[] = [
  {
    items: [
      { icon: 'home', label: 'Home', to: '/' },
      { icon: 'clipboard', label: 'My jobs', to: '/jobs' },
      { icon: 'bell', label: 'Notifications', to: '/notifications' },
    ],
  },
  HELP,
  MORE,
];

const technician = (approved: boolean): Group[] => [
  {
    items: [
      { icon: 'briefcase', label: 'Jobs', to: '/pro' },
      // An unapproved technician has no account screen yet.
      ...(approved ? [{ icon: 'wallet', label: 'My account', to: '/pro/money' } as Item] : []),
      { icon: 'bell', label: 'Notifications', to: '/notifications' },
    ],
  },
  HELP,
  MORE,
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
  const { width, height } = useWindowDimensions();
  // On a short phone the rows close up a little, so the whole list fits without scrolling.
  const short = height < 720;
  const { account, session } = useAccount();
  const here = usePathname();
  const pro = account?.role === 'pro';
  const groups = pro ? technician(account?.pro?.status === 'approved') : CUSTOMER;
  const panel = Math.round(Math.min(340, width * 0.86));
  const x = useRef(new Animated.Value(-panel)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (still) return x.setValue(0);
        Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
  }, [x]);

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

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close the menu" accessibilityRole="button" />
      <Animated.View
        accessibilityViewIsModal
        style={[s.panel, { width: panel, paddingTop: insets.top + (short ? 8 : 14), paddingBottom: insets.bottom + 14, transform: [{ translateX: x }] }]}
      >
        <View style={s.brand}>
          <View style={s.brandName} accessible accessibilityLabel="Pechkas">
            <Mark size={30} />
            <Text style={s.brandText}>Pechkas</Text>
          </View>
          <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the menu" sink={0.9} style={s.close}>
            <Icon name="cross" size={20} color={colour.ink} strokeWidth={2.4} />
          </Press>
        </View>

        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 8 }} bounces={false} showsVerticalScrollIndicator={false}>
          <Press
            onPress={() => go({ icon: 'me', label: 'Settings', to: '/me' })}
            accessibilityRole="button"
            accessibilityLabel={`${account?.first_name ?? 'Your account'}${who ? `, ${who}` : ''}, ${pro ? 'technician' : 'customer'}. Open settings`}
            style={[s.profile, short && { paddingVertical: 10 }]}
            sink={0.98}
          >
            <Avatar name={account?.first_name} size={short ? 46 : 52} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name} numberOfLines={1}>
                {account?.first_name ?? 'Your account'}
              </Text>
              {who ? (
                <Text style={s.sub} numberOfLines={1}>
                  {who}
                </Text>
              ) : null}
              <View style={s.sideRow}>
                <View style={[s.dot, { backgroundColor: pro ? colour.yellow : colour.green }]} />
                <Text style={s.side}>{pro ? 'Technician' : 'Customer'}</Text>
              </View>
            </View>
            <Icon name="chevronRight" size={20} color={colour.steel} strokeWidth={2.2} />
          </Press>

          {groups.map((g, gi) => (
            <View key={g.title ?? gi} style={{ marginTop: gi === 0 ? (short ? 8 : 10) : short ? 4 : 8 }}>
              {g.title ? (
                <Text style={s.group} accessibilityRole="header">
                  {g.title}
                </Text>
              ) : null}
              {g.items.map((i) => {
                const on = Boolean(i.to) && i.to === here;
                return (
                  <Press
                    key={i.label}
                    onPress={() => go(i)}
                    accessibilityRole={i.open ? 'link' : 'button'}
                    accessibilityState={{ selected: on }}
                    accessibilityHint={i.note}
                    style={[s.item, short && { minHeight: 48 }, on && s.itemOn]}
                    sink={0.98}
                  >
                    <View style={[s.tile, short && s.tileShort, on && s.tileOn]}>
                      <Icon name={i.icon} size={short ? 19 : 20} color={colour.ink} strokeWidth={2} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.itemText, on && s.itemTextOn]}>{i.label}</Text>
                      {i.note && !short ? <Text style={s.note}>{i.note}</Text> : null}
                    </View>
                    <Icon name="chevronRight" size={18} color={on ? colour.ink : '#a3a9ae'} strokeWidth={2.2} />
                  </Press>
                );
              })}
            </View>
          ))}
        </ScrollView>

        <View style={s.bottom}>
          <ModeSwitch pill onSwitched={onClose} />
          <Text style={s.version}>
            Pechkas {APP_VERSION ? `${APP_VERSION} · ` : ''}edition {APP_EDITION}
          </Text>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.14)' },
  buttonDark: { backgroundColor: '#22282d', boxShadow: 'none' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 23, 26, 0.5)' },
  panel: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    backgroundColor: colour.white,
    borderTopRightRadius: 24,
    borderBottomRightRadius: 24,
    boxShadow: '6px 0px 24px rgba(20, 23, 26, 0.18)',
  },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 20, paddingRight: 12, marginBottom: 8 },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  brandText: { fontFamily: font.display, fontSize: 22, letterSpacing: -0.4, color: colour.ink },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 20,
    backgroundColor: colour.canvas,
  },
  name: { fontFamily: font.display, fontSize: 20, letterSpacing: -0.3, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colour.steel },
  sideRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  side: { fontFamily: font.bodySemi, fontSize: 13, color: colour.inkSoft },
  group: { fontFamily: font.bodySemi, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase', color: colour.steel, paddingHorizontal: 22, paddingTop: 4, paddingBottom: 2 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 52, marginHorizontal: 8, paddingHorizontal: 12, borderRadius: 16 },
  itemOn: { backgroundColor: colour.canvas },
  tile: { width: 38, height: 38, borderRadius: 12, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  tileShort: { width: 36, height: 36, borderRadius: 11 },
  tileOn: { backgroundColor: colour.yellow },
  itemText: { fontFamily: font.bodyMedium, fontSize: 16, color: colour.ink },
  itemTextOn: { fontFamily: font.bodySemi },
  note: { fontFamily: font.body, fontSize: 12.5, lineHeight: 16, color: colour.steel },
  bottom: { gap: 10, paddingTop: 12, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: colour.rule },
  version: { fontFamily: font.body, fontSize: 12, color: colour.steel, textAlign: 'center' },
});
