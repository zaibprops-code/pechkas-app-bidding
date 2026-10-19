import { useState } from 'react';
import { Modal, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import Svg, { Path, Rect } from 'react-native-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { Press } from './Press';
import { Button } from './ui';
import { colour, font } from '../theme';

/**
 * The browser's stand-in for Map.tsx. The app is never shipped to the web:
 * this exists so the screens can be clicked through and photographed on a
 * computer, where Google's and Apple's maps cannot run. It draws a plain
 * street plan in their place and has the same names as Map.tsx.
 */

export type Point = { latitude: number; longitude: number };
export const ISLAMABAD: Point = { latitude: 33.6844, longitude: 73.0479 };

export function mapsReady(): boolean {
  return true;
}

export async function knownPosition(): Promise<Point | null> {
  return null;
}

export async function askPosition(): Promise<Point | 'refused' | null> {
  return ISLAMABAD;
}

export function Pin() {
  return (
    <View style={s.pin} pointerEvents="none">
      <View style={s.pinHead}>
        <View style={s.pinSlot} />
      </View>
      <View style={s.pinStem} />
    </View>
  );
}

function Streets() {
  return (
    <Svg width="100%" height="100%" viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice" style={StyleSheet.absoluteFill}>
      <Rect x={0} y={0} width={400} height={300} fill="#ebe8e1" />
      <Path d="M-10 70 L410 40 M-10 190 L410 165 M80 -10 L110 310 M300 -10 L280 310" stroke="#ffffff" strokeWidth={16} />
      <Path d="M-10 130 L410 105 M190 -10 L200 310 M30 -10 L50 310 M355 -10 L345 310 M-10 250 L410 230" stroke="#ffffff" strokeWidth={8} />
      <Path d="M120 210 h60 v40 h-60z M220 60 h50 v35 h-50z M40 90 h30 v25 h-30z" fill="#dcd8cf" />
      <Path d="M300 200 q30 -20 60 0 v60 h-60z" fill="#cfe3dc" />
    </Svg>
  );
}

export function MapBox({ pin, style }: { center: Point; pin?: Point | null; zoom?: number; interactive?: boolean; showsUser?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.box, style]}>
      <Streets />
      {pin ? (
        <View style={s.centre} pointerEvents="none">
          <Pin />
        </View>
      ) : null}
    </View>
  );
}

export function PinPicker({ start, onConfirm, onCancel }: { start: Point; onConfirm: (p: Point) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const [here] = useState(start);
  return (
    <Modal visible animationType="slide" onRequestClose={onCancel}>
      <View style={{ flex: 1, backgroundColor: colour.canvas }}>
        <Streets />
        <View style={s.centre} pointerEvents="none">
          <Pin />
        </View>
        <View style={[s.pickerTop, { paddingTop: insets.top + 10 }]}>
          <Press onPress={onCancel} accessibilityRole="button" accessibilityLabel="Back" sink={0.9} style={s.round}>
            <Icon name="arrowLeft" size={22} color={colour.ink} strokeWidth={2.2} />
          </Press>
          <View style={s.bubble}>
            <Text style={s.bubbleText}>Move the map until the pin is on your house</Text>
          </View>
        </View>
        <View style={[s.pickerBottom, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          <Button kind="outline" icon="pin" label="Use where I am now" onPress={() => undefined} />
          <Button label="Confirm this spot" onPress={() => onConfirm(here)} />
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: colour.tile },
  pin: { alignItems: 'center' },
  pinHead: { width: 34, height: 34, borderRadius: 17, backgroundColor: colour.yellow, borderWidth: 3, borderColor: colour.ink, alignItems: 'center', justifyContent: 'center' },
  pinSlot: { width: 16, height: 5, borderRadius: 3, backgroundColor: colour.ink, transform: [{ rotate: '-30deg' }] },
  pinStem: { width: 3, height: 12, backgroundColor: colour.ink, borderBottomLeftRadius: 2, borderBottomRightRadius: 2 },
  centre: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 46 },
  pickerTop: { position: 'absolute', left: 16, right: 16, top: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.18)' },
  bubble: { flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 16, backgroundColor: colour.white, boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.18)' },
  bubbleText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  pickerBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10, paddingHorizontal: 16, paddingTop: 16, backgroundColor: colour.white, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
});
