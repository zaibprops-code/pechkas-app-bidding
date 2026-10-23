import { useEffect, useRef, type ReactNode } from 'react';
import { AccessibilityInfo, Animated, Easing, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Press } from './Press';
import { colour, font } from '../theme';

/**
 * A sheet that rises from the bottom over a dimmed screen: the technician's
 * job, and every drop-down on Post a job. Tap outside it, the cross or the
 * phone's Back to close. Only the sheet moves, by transform.
 */
export function Sheet({ children, onClose, closeLabel = 'Close', title }: { children: ReactNode; onClose: () => void; closeLabel?: string; title?: string }) {
  const insets = useSafeAreaInsets();
  const y = useRef(new Animated.Value(600)).current;
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .catch(() => false)
      .then((still) => {
        if (still) return y.setValue(0);
        Animated.timing(y, { toValue: 0, duration: 240, easing: Easing.out(Easing.cubic), useNativeDriver: true }).start();
      });
  }, [y]);
  return (
    <Modal transparent visible onRequestClose={onClose} statusBarTranslucent animationType="none">
      <View style={s.root}>
        <Pressable style={s.backdrop} onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} />
        <Animated.View style={[s.sheet, { paddingBottom: Math.max(insets.bottom, 12), transform: [{ translateY: y }] }]}>
          <View style={s.head}>
            <View style={s.grab} />
            {title ? (
              <Text style={s.title} accessibilityRole="header">
                {title}
              </Text>
            ) : null}
            <Press onPress={onClose} accessibilityRole="button" accessibilityLabel={closeLabel} sink={0.9} style={s.close}>
              <Icon name="cross" size={20} color={colour.ink} strokeWidth={2.4} />
            </Press>
          </View>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 4, paddingBottom: 8 }} keyboardShouldPersistTaps="handled">
            {children}
          </ScrollView>
        </Animated.View>
      </View>
    </Modal>
  );
}

/** One choice in a sheet: a line of words, something on the right, a tick when it is the one chosen. */
export function SheetOption({ label, right, on = false, onPress, icon }: { label: string; right?: string; on?: boolean; onPress: () => void; icon?: ReactNode }) {
  return (
    <Press onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} sink={0.98} style={[s.option, on && s.optionOn]}>
      {icon ?? null}
      <Text style={[s.optionText, on && { fontFamily: font.bodySemi }]}>{label}</Text>
      {right ? <Text style={s.optionRight}>{right}</Text> : null}
      {on ? <Icon name="check" size={20} color={colour.green} strokeWidth={2.6} /> : null}
    </Press>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, justifyContent: 'flex-end' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(20, 23, 26, 0.45)' },
  sheet: { maxHeight: '92%', backgroundColor: colour.white, borderTopLeftRadius: 28, borderTopRightRadius: 28, paddingHorizontal: 10 },
  head: { alignItems: 'center', justifyContent: 'center', minHeight: 52, paddingHorizontal: 52 },
  grab: { width: 40, height: 5, borderRadius: 3, backgroundColor: 'rgba(20, 23, 26, 0.18)' },
  title: { fontFamily: font.displayBold, fontSize: 18, color: colour.ink, textAlign: 'center', marginTop: 10, marginBottom: 6 },
  close: { position: 'absolute', right: 4, top: 4, width: 44, height: 44, borderRadius: 22, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 56, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16 },
  optionOn: { backgroundColor: colour.greenSoft },
  optionText: { flex: 1, fontFamily: font.bodyMedium, fontSize: 16, lineHeight: 21, color: colour.ink },
  optionRight: { fontFamily: font.bodySemi, fontSize: 14, color: colour.green },
});
