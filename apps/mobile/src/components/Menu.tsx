import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Linking, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showMobile } from '@pechkas/shared';
import { Icon, type IconName } from './Icon';
import { ModeSwitch } from './ModeSwitch';
import { Press } from './Press';
import { Avatar } from './ui';
import { useAccount } from '../account';
import { OFFICE_WHATSAPP } from '../office';
import { colour, font } from '../theme';

/**
 * The ☰ button and the menu it opens — the app's only navigation, like
 * inDrive's (the owner's screenshot): no tab bar along the bottom. The menu
 * slides in from the left (transform only; the words never fade) over a
 * dimmed screen, and tapping outside it or any item closes it.
 *
 * Laid out as inDrive's: the person at the top (tap: Settings), then one
 * row per place, full width, the current one shaded; at the foot, one big
 * yellow button for the other mode, where inDrive keeps "Driver mode".
 *
 * Every item goes somewhere real. The stores reject a menu item that does
 * nothing, and so should we. "Support" opens the office on WhatsApp, the
 * way Pechkas has always answered; Help has the phone number too.
 */

type Item = { icon: IconName; label: string; to?: Href; open?: () => void };

const support: Item = { icon: 'whatsapp', label: 'Support', open: () => Linking.openURL(OFFICE_WHATSAPP) };

const CUSTOMER: Item[] = [
  { icon: 'home', label: 'Home', to: '/' },
  { icon: 'clock', label: 'My jobs', to: '/jobs' },
  { icon: 'bell', label: 'Notifications', to: '/notifications' },
  { icon: 'shield', label: 'Safety', to: '/safety' },
  { icon: 'settings', label: 'Settings', to: '/me' },
  { icon: 'help', label: 'Help', to: '/help' },
  support,
];

const TECHNICIAN: Item[] = [
  { icon: 'tool', label: 'Jobs', to: '/pro' },
  { icon: 'jobs', label: 'My account', to: '/pro/money' },
  { icon: 'bell', label: 'Notifications', to: '/notifications' },
  { icon: 'shield', label: 'Safety', to: '/safety' },
  { icon: 'settings', label: 'Settings', to: '/me' },
  { icon: 'help', label: 'Help', to: '/help' },
  support,
];

export function MenuButton({ dark = false }: { dark?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Press onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel="Menu" sink={0.9} style={[s.button, dark && s.buttonDark]}>
        <Icon name="menu" size={22} color={dark ? colour.paper : colour.ink} strokeWidth={2.2} />
      </Press>
      {open ? <Drawer onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function Drawer({ onClose }: { onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { width, height } = useWindowDimensions();
  // On a short phone the rows close up a little, so the whole list fits without scrolling.
  const short = height < 700;
  const { account, session } = useAccount();
  const here = usePathname();
  const pro = account?.role === 'pro';
  // A technician who has not been approved has no work screen or account yet.
  const items = pro ? (account?.pro?.status === 'approved' ? TECHNICIAN : TECHNICIAN.filter((i) => i.to !== '/pro/money')) : CUSTOMER;
  const panel = Math.round(Math.min(340, width * 0.84));
  const x = useRef(new Animated.Value(-panel)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (still) return x.setValue(0);
        Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
  }, [x]);

  const go = (i: Item) => {
    onClose();
    if (i.open) i.open();
    else if (i.to && i.to !== here) router.push(i.to);
  };
  const number = account?.phone ?? session?.user.phone ?? '';
  const who = number ? showMobile(number) : account?.email ?? (pro ? 'Technician' : 'Customer');

  return (
    <Modal transparent visible onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close the menu" accessibilityRole="button" />
        <Animated.View style={[s.panel, { width: panel, paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16, transform: [{ translateX: x }] }]}>
          <ScrollView style={{ flex: 1 }} bounces={false}>
            <Press onPress={() => go({ icon: 'me', label: 'Settings', to: '/me' })} accessibilityRole="button" accessibilityLabel={`${account?.first_name ?? 'Your account'}, ${who}. Settings`} style={s.profile} sink={0.98}>
              <Avatar name={account?.first_name} size={60} />
              <View style={{ flex: 1, gap: 2 }}>
                <Text style={s.name} numberOfLines={1}>
                  {account?.first_name ?? 'Your account'}
                </Text>
                <Text style={s.sub} numberOfLines={1}>
                  {who}
                </Text>
                <Text style={s.side}>{pro ? 'Technician' : 'Customer'}</Text>
              </View>
              <Icon name="chevronRight" size={22} color={colour.ink} strokeWidth={2.2} />
            </Press>
            <View style={s.rule} />
            {items.map((i) => {
              const on = Boolean(i.to) && i.to === here;
              return (
                <Press key={i.label} onPress={() => go(i)} accessibilityRole={i.open ? 'link' : 'button'} accessibilityState={{ selected: on }} style={[s.item, short && { minHeight: 48 }, on && s.itemOn]} sink={0.98}>
                  <Icon name={i.icon} size={24} color={colour.ink} strokeWidth={1.8} />
                  <Text style={s.itemText}>{i.label}</Text>
                </Press>
              );
            })}
          </ScrollView>
          <View style={s.bottom}>
            <ModeSwitch pill onSwitched={onClose} />
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  button: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.14)' },
  buttonDark: { backgroundColor: '#22282d', boxShadow: 'none' },
  root: { flex: 1, flexDirection: 'row' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 23, 26, 0.45)' },
  panel: { height: '100%', backgroundColor: colour.white, justifyContent: 'space-between' },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingHorizontal: 20, paddingVertical: 12, minHeight: 84 },
  name: { fontFamily: font.display, fontSize: 22, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colour.steel },
  side: { alignSelf: 'flex-start', marginTop: 2, paddingHorizontal: 8, paddingVertical: 2, borderRadius: 999, backgroundColor: colour.greenSoft, fontFamily: font.bodySemi, fontSize: 12, color: colour.greenDark, overflow: 'hidden' },
  rule: { height: 1, backgroundColor: colour.rule, marginBottom: 6 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 18, minHeight: 58, paddingHorizontal: 22 },
  itemOn: { backgroundColor: colour.canvas },
  itemText: { fontFamily: font.bodyMedium, fontSize: 18, color: colour.ink },
  bottom: { paddingTop: 14, paddingHorizontal: 18, borderTopWidth: 1, borderTopColor: colour.rule },
});
