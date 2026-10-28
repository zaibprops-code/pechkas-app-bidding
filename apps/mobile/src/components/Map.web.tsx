import { useState } from 'react';
import { Modal, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { MapDrawing } from './MapDrawing';
import { Press } from './Press';
import { Button } from './ui';
import { colour, font } from '../theme';

/**
 * The browser's stand-in for Map.tsx. The app is never shipped to the web:
 * this exists so the screens can be clicked through and photographed on a
 * computer, where Google's and Apple's maps cannot run. It draws the same
 * street plan as an Android build without the key (MapDrawing.tsx) and has
 * the same names as Map.tsx.
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

export function MapBox({ pin, style }: { center: Point; pin?: Point | null; zoom?: number; interactive?: boolean; showsUser?: boolean; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[s.box, style]}>
      <MapDrawing />
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
        <MapDrawing />
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
