import { useEffect, useRef, useState } from 'react';
import { Modal, Platform, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import MapView, { Marker, PROVIDER_GOOGLE, type Region } from 'react-native-maps';
import Constants from 'expo-constants';
import * as Location from 'expo-location';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from './Icon';
import { MapDrawing } from './MapDrawing';
import { Press } from './Press';
import { Button } from './ui';
import { colour, font } from '../theme';

/**
 * Maps, inDrive's way: on the home screen, in the post form to pin the house,
 * and for the chosen technician to see where he is going.
 *
 * Android draws Google's map, which needs a key, and stops the app the
 * moment a map opens without one. The key is set in Expo (docs/OWNER.md,
 * "Maps") and app.config.js says whether this build has it. Without it,
 * `mapsReady()` is false, and the box is still there — the owner asked for
 * that — with a drawn street plan in it (MapDrawing.tsx) instead of Google's
 * map, so no screen changes shape when the key arrives. What cannot be done
 * on a drawing (moving the map to pin the house) is left out until then.
 * The iPhone draws Apple's map, which needs no key. (Map.web.tsx stands in
 * for both in the browser, where only the screenshots are taken.)
 */

export type Point = { latitude: number; longitude: number };

/** The middle of Islamabad, where a map starts when it knows nothing better. */
export const ISLAMABAD: Point = { latitude: 33.6844, longitude: 73.0479 };

const extra = (Constants.expoConfig?.extra ?? {}) as { maps?: { android?: boolean } };

export function mapsReady(): boolean {
  if (Platform.OS === 'ios') return true;
  if (Platform.OS === 'android') return Boolean(extra.maps?.android);
  return false;
}

const near = (p: Point, delta = 0.012): Region => ({ ...p, latitudeDelta: delta, longitudeDelta: delta });

/** A quieter Google map: no shop and restaurant labels competing with the pin. */
const QUIET = [
  { featureType: 'poi.business', stylers: [{ visibility: 'off' }] },
  { featureType: 'poi', elementType: 'labels.icon', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
];

/** The Pechkas mark as a map pin: a yellow screw head on a stem. */
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

/** Where the phone is, if the person has already allowed it. Never asks. */
export async function knownPosition(): Promise<Point | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const last = await Location.getLastKnownPositionAsync();
    const here = last ?? (await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }));
    return { latitude: here.coords.latitude, longitude: here.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * What the phone's own map service says about a spot (Android's geocoder,
 * Apple's on iPhone): its lines, most precise first, for `sectorIn()`, and
 * the street. Needs the location permission on Android — without it, or with
 * no answer, it is null and the customer taps the sector instead. Never asks.
 */
export async function readPlace(p: Point): Promise<{ texts: string[]; street: string | null } | null> {
  try {
    const perm = await Location.getForegroundPermissionsAsync();
    if (!perm.granted) return null;
    const [a] = await Location.reverseGeocodeAsync(p);
    if (!a) return null;
    const texts = [a.district, a.name, a.street, a.formattedAddress, a.subregion, a.city].filter((x): x is string => Boolean(x));
    return { texts, street: a.street ?? null };
  } catch {
    return null;
  }
}

/** Where the phone is, asking first. Only ever from a button the person pressed. */
export async function askPosition(): Promise<Point | 'refused' | null> {
  try {
    const perm = await Location.requestForegroundPermissionsAsync();
    if (!perm.granted) return 'refused';
    const here = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { latitude: here.coords.latitude, longitude: here.coords.longitude };
  } catch {
    return null;
  }
}

/**
 * A map to look at: a place with the Pechkas pin on it, or just an area.
 * Not draggable unless `interactive`, so it never steals a scroll.
 */
export function MapBox({ center, pin, zoom = 0.012, interactive = false, showsUser = false, style }: {
  center: Point;
  pin?: Point | null;
  zoom?: number;
  interactive?: boolean;
  showsUser?: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  // No key in this build: the drawing, with the pin in the middle, in the same box.
  if (!mapsReady()) {
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
  return <RealMap center={center} pin={pin} zoom={zoom} interactive={interactive} showsUser={showsUser} style={style} />;
}

function RealMap({ center, pin, zoom, interactive, showsUser, style }: {
  center: Point;
  pin?: Point | null;
  zoom: number;
  interactive: boolean;
  showsUser: boolean;
  style?: StyleProp<ViewStyle>;
}) {
  const ref = useRef<MapView>(null);
  useEffect(() => {
    ref.current?.animateToRegion(near(center, zoom), 400);
  }, [center.latitude, center.longitude, zoom]);
  return (
    <View style={[s.box, style]}>
      <MapView
        ref={ref}
        style={StyleSheet.absoluteFill}
        provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
        initialRegion={near(center, zoom)}
        customMapStyle={QUIET}
        scrollEnabled={interactive}
        zoomEnabled={interactive}
        rotateEnabled={false}
        pitchEnabled={false}
        toolbarEnabled={false}
        showsUserLocation={showsUser}
        showsMyLocationButton={false}
        showsPointsOfInterests={false}
      >
        {pin ? (
          <Marker coordinate={pin} anchor={{ x: 0.5, y: 1 }} tracksViewChanges={false}>
            <Pin />
          </Marker>
        ) : null}
      </MapView>
    </View>
  );
}

/**
 * "Move the map until the pin is on your house." The pin stays in the middle
 * and the map moves under it, the way every ride app does it. Confirming
 * hands back the spot under the pin; nothing is saved until the job is posted.
 */
export function PinPicker({ start, onConfirm, onCancel }: { start: Point; onConfirm: (p: Point) => void; onCancel: () => void }) {
  const insets = useSafeAreaInsets();
  const ref = useRef<MapView>(null);
  const [here, setHere] = useState<Point>(start);
  const [note, setNote] = useState<string | null>(null);
  const [finding, setFinding] = useState(false);

  async function findMe() {
    setNote(null);
    setFinding(true);
    const p = await askPosition();
    setFinding(false);
    if (p === 'refused') return setNote('Allow location in your phone settings, or move the map by hand.');
    if (!p) return setNote('Your location could not be found. Move the map by hand.');
    setHere(p);
    ref.current?.animateToRegion(near(p, 0.004), 500);
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onCancel} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: colour.canvas }}>
        <MapView
          ref={ref}
          style={StyleSheet.absoluteFill}
          provider={Platform.OS === 'android' ? PROVIDER_GOOGLE : undefined}
          initialRegion={near(start, 0.006)}
          customMapStyle={QUIET}
          rotateEnabled={false}
          pitchEnabled={false}
          toolbarEnabled={false}
          showsMyLocationButton={false}
          onRegionChangeComplete={(r) => setHere({ latitude: r.latitude, longitude: r.longitude })}
        />
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
          {note ? <Text style={s.note}>{note}</Text> : null}
          <Button kind="outline" icon="pin" label={finding ? 'Finding you…' : 'Use where I am now'} busy={finding} onPress={findMe} />
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
  // The pin's foot, not its middle, sits on the centre of the map.
  centre: { position: 'absolute', left: 0, right: 0, top: 0, bottom: 0, alignItems: 'center', justifyContent: 'center', paddingBottom: 46 },
  pickerTop: { position: 'absolute', left: 16, right: 16, top: 0, flexDirection: 'row', alignItems: 'center', gap: 10 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.18)' },
  bubble: { flex: 1, minHeight: 48, justifyContent: 'center', paddingHorizontal: 14, borderRadius: 16, backgroundColor: colour.white, boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.18)' },
  bubbleText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  pickerBottom: { position: 'absolute', left: 0, right: 0, bottom: 0, gap: 10, paddingHorizontal: 16, paddingTop: 16, backgroundColor: colour.white, borderTopLeftRadius: 28, borderTopRightRadius: 28 },
  note: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.brick },
});
