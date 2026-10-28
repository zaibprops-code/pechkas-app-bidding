import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, BackHandler, Easing, Linking, Pressable, ScrollView, Share, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { APP_EDITION, showMobile } from '@pechkas/shared';
import { DuoIcon, type DuoName } from './DuoIcon';
import { Icon } from './Icon';
import { Mark } from './Mark';
import { ModeSwitch } from './ModeSwitch';
import { Press } from './Press';
import { useAccount } from '../account';
import { OFFICE_WHATSAPP } from '../office';
import { APP_VERSION } from '../version';
import { colour, font } from '../theme';

/**
 * The ☰ button and the menu it opens — the app's only navigation, like
 * inDrive's (the owner's screenshot): no tab bar along the bottom.
 *
 * Drawn as a designed app's side menu, at the owner's request: the Pechkas
 * mark at the top; the person on a green card with a yellow ring round
 * their initial (tap: Settings); then one plain list, no headings — each
 * row a two-tone icon (DuoIcon.tsx), the words, a light chevron, and the
 * current screen on soft yellow; and at the foot "Tell a friend" and one
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

type Item = { icon: DuoName; label: string; to?: Href; open?: () => void };

const support: Item = { icon: 'support', label: 'Support', open: () => void Linking.openURL(OFFICE_WHATSAPP).catch(() => {}) };

/** Only what is true about Pechkas, so a friend is promised nothing it does not do. */
const SHARE_TEXT = 'Pechkas: checked technicians for home repairs in Islamabad, and you name the price. https://pechkas.net';
const tellAFriend = () => void Share.share({ message: SHARE_TEXT }).catch(() => {});

const REST: Item[] = [
  { icon: 'shield', label: 'Safety', to: '/safety' },
  { icon: 'help', label: 'Help', to: '/help' },
  support,
  { icon: 'settings', label: 'Settings', to: '/me' },
  // Every legal page in one list, as the owner's reference app has it.
  { icon: 'doc', label: 'Legal', to: '/legal' },
];

const CUSTOMER: Item[] = [
  { icon: 'home', label: 'Home', to: '/' },
  { icon: 'jobs', label: 'My jobs', to: '/jobs' },
  { icon: 'bell', label: 'Notifications', to: '/notifications' },
  ...REST,
];

const technician = (approved: boolean): Item[] => [
  { icon: 'briefcase', label: 'Jobs', to: '/pro' },
  // An unapproved technician has no account screen yet.
  ...(approved ? [{ icon: 'wallet', label: 'My account', to: '/pro/money' } as Item] : []),
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
  const { width, height } = useWindowDimensions();
  // On a short phone the rows close up a little, so as much as possible shows before anybody scrolls.
  const short = height < 720;
  const { account, session } = useAccount();
  const here = usePathname();
  const pro = account?.role === 'pro';
  const items = pro ? technician(account?.pro?.status === 'approved') : CUSTOMER;
  const panel = Math.round(Math.min(340, width * 0.86));
  const narrow = panel < 320;
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
  const name = account?.first_name ?? 'Your account';

  return (
    <View style={StyleSheet.absoluteFill}>
      <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close the menu" accessibilityRole="button" />
      <Animated.View
        accessibilityViewIsModal
        style={[s.panel, { width: panel, paddingTop: insets.top + (short ? 10 : 18), paddingBottom: insets.bottom + 14, transform: [{ translateX: x }] }]}
      >
        <View style={s.brand}>
          <View style={s.brandName} accessible accessibilityLabel="Pechkas">
            <Mark size={28} />
            <Text style={s.brandText}>Pechkas</Text>
          </View>
          <Press onPress={onClose} accessibilityRole="button" accessibilityLabel="Close the menu" sink={0.9} style={s.close}>
            <Icon name="cross" size={18} color={colour.ink} strokeWidth={2.4} />
          </Press>
        </View>

        {/* Below the name and the ×, the menu is one page: on a short phone the
            person, the rows and the buttons scroll together, so no row is ever
            hidden behind the buttons. On a tall one the buttons sit at the foot. */}
        <ScrollView style={{ flex: 1 }} contentContainerStyle={{ flexGrow: 1 }} bounces={false} showsVerticalScrollIndicator={false}>
        <Press
          onPress={() => go({ icon: 'settings', label: 'Settings', to: '/me' })}
          accessibilityRole="button"
          accessibilityLabel={`${name}${who ? `, ${who}` : ''}, ${pro ? 'technician' : 'customer'}. Open settings`}
          style={[s.profile, short && { paddingVertical: 12 }]}
          sink={0.98}
        >
          <View style={[s.initial, short && s.initialShort]} accessible={false}>
            <Text style={[s.initialText, short && { fontSize: 20 }]}>{(account?.first_name ?? '?').trim().charAt(0).toUpperCase()}</Text>
          </View>
          <View style={{ flex: 1, gap: 3 }}>
            <Text style={s.hello} numberOfLines={1}>
              Hello,
            </Text>
            <Text style={s.name} numberOfLines={1}>
              {name}
            </Text>
            {who ? (
              <Text style={s.sub} numberOfLines={1}>
                {who}
              </Text>
            ) : null}
            {/* On a narrow phone the side goes under the number, so the name keeps its room. */}
            {narrow ? <Side pro={pro} /> : null}
          </View>
          {narrow ? null : <Side pro={pro} />}
        </Press>

        <View style={{ paddingTop: short ? 4 : 8, paddingBottom: 8 }}>
          {items.map((i) => {
            const on = Boolean(i.to) && i.to === here;
            return (
              <Press
                key={i.label}
                onPress={() => go(i)}
                accessibilityRole={i.open ? 'link' : 'button'}
                accessibilityState={{ selected: on }}
                accessibilityHint={i.open ? 'Opens WhatsApp' : undefined}
                style={[s.item, short && s.itemShort, on && s.itemOn]}
                sink={0.98}
              >
                <DuoIcon name={i.icon} size={short ? 24 : 26} />
                <Text style={[s.itemText, on && s.itemTextOn]}>{i.label}</Text>
                <Icon name="chevronRight" size={18} color={on ? colour.ink : '#b4babe'} strokeWidth={2.2} />
              </Press>
            );
          })}
        </View>

        <View style={{ flexGrow: 1 }} />
        <View style={s.bottom}>
          <Press onPress={() => { onClose(); tellAFriend(); }} accessibilityRole="button" accessibilityHint="Opens your phone's share menu" sink={0.97} style={s.invite}>
            <DuoIcon name="share" size={22} />
            <Text style={s.inviteText}>Tell a friend about Pechkas</Text>
          </Press>
          <ModeSwitch pill onSwitched={onClose} />
          <Text style={s.version}>
            Version {APP_VERSION ? `${APP_VERSION} · ` : ''}edition {APP_EDITION}
          </Text>
        </View>
        </ScrollView>
      </Animated.View>
    </View>
  );
}

/** Customer or technician, as a small label on the profile card. */
function Side({ pro }: { pro: boolean }) {
  return (
    <View style={[s.side, pro && s.sidePro]}>
      <Text style={[s.sideText, pro && s.sideTextPro]}>{pro ? 'Technician' : 'Customer'}</Text>
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
    backgroundColor: colour.white,
    borderTopRightRadius: 28,
    borderBottomRightRadius: 28,
    boxShadow: '8px 0px 30px rgba(20, 23, 26, 0.2)',
  },
  brand: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingLeft: 22, paddingRight: 14 },
  brandName: { flexDirection: 'row', alignItems: 'center', gap: 9 },
  brandText: { fontFamily: font.brand, fontSize: 21, letterSpacing: -0.4, color: colour.ink },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  profile: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginTop: 12,
    marginHorizontal: 14,
    paddingHorizontal: 14,
    paddingVertical: 16,
    borderRadius: 22,
    backgroundColor: colour.green,
  },
  initial: { width: 54, height: 54, borderRadius: 27, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  initialShort: { width: 48, height: 48, borderRadius: 24 },
  initialText: { fontFamily: font.display, fontSize: 22, color: colour.ink },
  hello: { fontFamily: font.bodyMedium, fontSize: 13, color: '#b9d3cf' },
  name: { fontFamily: font.display, fontSize: 20, color: colour.white, marginTop: -2 },
  sub: { fontFamily: font.bodyMedium, fontSize: 13, color: '#d7e6e3' },
  side: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: 'rgba(255,255,255,0.14)' },
  sidePro: { backgroundColor: colour.yellow },
  sideText: { fontFamily: font.bodySemi, fontSize: 11.5, color: colour.white },
  sideTextPro: { color: colour.ink },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 56, marginHorizontal: 10, paddingHorizontal: 14, borderRadius: 16 },
  itemShort: { minHeight: 46 },
  itemOn: { backgroundColor: colour.softYellow },
  itemText: { flex: 1, fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  itemTextOn: { fontFamily: font.displayBold },
  bottom: { gap: 10, paddingTop: 12, paddingHorizontal: 14 },
  invite: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    minHeight: 52,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: colour.rule,
  },
  inviteText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  version: { fontFamily: font.bodyMedium, fontSize: 11.5, color: colour.steel, textAlign: 'center' },
});
