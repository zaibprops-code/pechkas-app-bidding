import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router, usePathname, type Href } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { showMobile } from '@pechkas/shared';
import { Icon, type IconName } from './Icon';
import { Mark } from './Mark';
import { Press } from './Press';
import { Avatar } from './ui';
import { useAccount } from '../account';
import { colour, font, radius, TAP } from '../theme';

/**
 * The ☰ button and the menu it opens — the app's only navigation, like
 * inDrive's: no tab bar along the bottom. The menu slides in from the left
 * (transform only; the words never fade) over a dimmed screen, and tapping
 * outside it or any item closes it.
 *
 * Every item goes somewhere real. The stores reject a menu item that does
 * nothing, and so should we.
 */

type Item = { icon: IconName; label: string; to: Href };

const CUSTOMER: Item[] = [
  { icon: 'home', label: 'Home', to: '/' },
  { icon: 'jobs', label: 'My jobs', to: '/jobs' },
  { icon: 'shield', label: 'Safety', to: '/safety' },
  { icon: 'help', label: 'Help', to: '/help' },
  { icon: 'settings', label: 'Settings', to: '/me' },
  { icon: 'tool', label: 'Work with Pechkas', to: '/pro/apply' },
];

const TECHNICIAN: Item[] = [
  { icon: 'home', label: 'Jobs', to: '/pro' },
  { icon: 'jobs', label: 'My account', to: '/pro/money' },
  { icon: 'shield', label: 'Safety', to: '/safety' },
  { icon: 'help', label: 'Help', to: '/help' },
  { icon: 'settings', label: 'Settings', to: '/me' },
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
  const { width } = useWindowDimensions();
  const { account, session } = useAccount();
  const here = usePathname();
  const pro = account?.role === 'pro';
  // A technician who has not been approved has no work screen or account yet.
  const items = pro ? (account?.pro?.status === 'approved' ? TECHNICIAN : TECHNICIAN.filter((i) => i.to !== '/pro/money')) : CUSTOMER;
  const panel = Math.min(320, width * 0.84);
  const x = useRef(new Animated.Value(-panel)).current;

  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (still) return x.setValue(0);
        Animated.timing(x, { toValue: 0, duration: 220, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
  }, [x]);

  const go = (to: Href) => {
    onClose();
    if (to !== here) router.push(to);
  };
  const number = account?.phone ?? session?.user.phone ?? '';

  return (
    <Modal transparent visible onRequestClose={onClose} statusBarTranslucent>
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityLabel="Close the menu" accessibilityRole="button" />
        <Animated.View style={[s.panel, { width: panel, paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 16), transform: [{ translateX: x }] }]}>
          <ScrollView contentContainerStyle={{ gap: 4 }} bounces={false}>
            <Press onPress={() => go('/me')} accessibilityRole="button" style={s.profile} sink={0.98}>
              <Avatar name={account?.first_name} size={52} />
              <View style={{ flex: 1 }}>
                <Text style={s.name} numberOfLines={1}>
                  {account?.first_name ?? 'Your account'}
                </Text>
                <Text style={s.sub} numberOfLines={1}>
                  {number ? showMobile(number) : pro ? 'Technician' : 'Customer'}
                </Text>
              </View>
              <Icon name="chevronRight" size={20} color={colour.ink} strokeWidth={2.2} />
            </Press>
            <View style={s.rule} />
            {items.map((i) => {
              const on = i.to === here;
              return (
                <Press key={i.label} onPress={() => go(i.to)} accessibilityRole="button" accessibilityState={{ selected: on }} style={[s.item, on && s.itemOn]} sink={0.98}>
                  <Icon name={i.icon} size={22} color={colour.ink} strokeWidth={1.8} />
                  <Text style={s.itemText}>{i.label}</Text>
                </Press>
              );
            })}
          </ScrollView>
          <View style={s.foot}>
            <Mark size={22} />
            <Text style={s.footText}>pechkas</Text>
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
  panel: { height: '100%', backgroundColor: colour.white, paddingHorizontal: 12, justifyContent: 'space-between', borderTopRightRadius: 24, borderBottomRightRadius: 24 },
  profile: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 8, minHeight: 68 },
  name: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 14, color: colour.steel },
  rule: { height: 1, backgroundColor: colour.rule, marginVertical: 8 },
  item: { flexDirection: 'row', alignItems: 'center', gap: 16, minHeight: 52, paddingHorizontal: 12, borderRadius: radius.card },
  itemOn: { backgroundColor: colour.canvas },
  itemText: { fontFamily: font.bodyMedium, fontSize: 17, color: colour.ink },
  foot: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, minHeight: TAP },
  footText: { fontFamily: font.display, fontSize: 16, color: colour.ink },
});
