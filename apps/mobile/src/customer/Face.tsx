import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useSignedUrls } from '../post/RemoteMedia';
import { colour, font } from '../theme';

/** What may truthfully be said about who he is (D37). Never "identity checked" unless a service checked it. */
export type IdentityLine = { kind: 'verified' | 'staff' | 'phone' | 'none'; on?: string };

const dayOf = (d: string) =>
  new Date(`${d}T12:00:00+05:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Karachi' });

export function identityWords(id: IdentityLine | null | undefined): string {
  if (id?.kind === 'verified') return 'Identity verified';
  if (id?.kind === 'staff' && id.on) return `Identity seen by Pechkas staff on ${dayOf(id.on)}`;
  return 'Phone number checked';
}

/**
 * His photo, the one he cannot change after his first job, so the customer
 * can check it at her door. The first letter on green until it loads, or when
 * there is none.
 */
export function Face({ path, name, size = 56 }: { path?: string | null; name: string; size?: number }) {
  const urls = useSignedUrls(path ? [{ kind: 'photo', path, seconds: null }] : []);
  const uri = path ? urls[path] : undefined;
  const [failed, setFailed] = useState(false);
  const box = { width: size, height: size, borderRadius: size / 2 };
  // A photo that cannot be loaded (bad signal) shows his initial, never an empty space.
  if (uri && !failed) return <Image source={{ uri }} style={box} accessibilityLabel={`Photo of ${name}`} onError={() => setFailed(true)} />;
  return (
    <View style={[s.avatar, box]}>
      <Text style={[s.letter, { fontSize: size * 0.42 }]}>{name.charAt(0)}</Text>
    </View>
  );
}

const s = StyleSheet.create({
  avatar: { backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  letter: { fontFamily: font.display, color: colour.white },
});
