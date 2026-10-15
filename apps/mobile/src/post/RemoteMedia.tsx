import { useEffect, useState } from 'react';
import { Image, Linking, StyleSheet, Text, View } from 'react-native';
import { useAudioPlayer, useAudioPlayerStatus } from 'expo-audio';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { supabase } from '../supabase';
import { colour, font, radius } from '../theme';

export type StoredMedia = { kind: 'voice' | 'video' | 'photo'; path: string; seconds: number | null };

/**
 * Hour-long links to files in the private bucket. Storage hands them out only
 * to somebody its rules let read the file — the customer, the office, or a
 * technician who may see that job — so asking is safe; being refused means
 * the job has moved on.
 */
export function useSignedUrls(items: StoredMedia[]): Record<string, string> {
  const [urls, setUrls] = useState<Record<string, string>>({});
  const key = items.map((m) => m.path).join('|');
  useEffect(() => {
    if (!supabase || !items.length) return;
    let alive = true;
    supabase.storage
      .from('job-media')
      .createSignedUrls(items.map((m) => m.path), 3600)
      .then(({ data }) => {
        if (!alive || !data) return;
        const next: Record<string, string> = {};
        data.forEach((d) => {
          if (d.signedUrl && d.path) next[d.path] = d.signedUrl;
        });
        setUrls(next);
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return urls;
}

/** The customer's voice note, the video and photos, for whoever may see them. */
export function RemoteMedia({ items, dark = false, voiceLabel, videoLabel }: { items: StoredMedia[]; dark?: boolean; voiceLabel: string; videoLabel: string }) {
  const urls = useSignedUrls(items);
  if (!items.length) return null;
  const voice = items.find((m) => m.kind === 'voice');
  const video = items.find((m) => m.kind === 'video');
  const photos = items.filter((m) => m.kind === 'photo');
  return (
    <View style={{ gap: 8 }}>
      {voice && urls[voice.path] ? <Voice url={urls[voice.path]} seconds={voice.seconds} label={voiceLabel} dark={dark} /> : null}
      {video && urls[video.path] ? (
        <Press onPress={() => Linking.openURL(urls[video.path])} accessibilityRole="button" style={[s.row, dark ? s.rowDark : s.rowLight]}>
          <View style={[s.dot, { backgroundColor: colour.yellow }]}>
            <Icon name="video" size={18} color={colour.ink} strokeWidth={2} />
          </View>
          <Text style={[s.text, dark && { color: colour.paper }]}>
            {videoLabel}
            {video.seconds ? ` · 0:${String(video.seconds).padStart(2, '0')}` : ''}
          </Text>
        </Press>
      ) : null}
      {photos.length ? (
        <View style={s.photos}>
          {photos.map((p, i) =>
            urls[p.path] ? (
              <Press key={p.path} onPress={() => Linking.openURL(urls[p.path])} accessibilityRole="imagebutton" accessibilityLabel={`Photo ${i + 1}`}>
                <Image source={{ uri: urls[p.path] }} style={s.photo} />
              </Press>
            ) : (
              <View key={p.path} style={[s.photo, { backgroundColor: dark ? '#2a3036' : colour.paper2 }]} />
            ),
          )}
        </View>
      ) : null}
    </View>
  );
}

function Voice({ url, seconds, label, dark }: { url: string; seconds: number | null; label: string; dark: boolean }) {
  const player = useAudioPlayer({ uri: url });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  return (
    <Press
      onPress={() => {
        if (playing) player.pause();
        else {
          if (status.didJustFinish || (status.duration && status.currentTime >= status.duration)) player.seekTo(0);
          player.play();
        }
      }}
      accessibilityRole="button"
      accessibilityLabel={playing ? 'Pause' : label}
      style={[s.row, dark ? s.rowDark : s.rowLight]}
    >
      <View style={[s.dot, { backgroundColor: colour.yellow }]}>
        {playing ? <View style={s.pause} /> : <View style={s.play} />}
      </View>
      <Text style={[s.text, dark && { color: colour.paper }]}>
        {label}
        {seconds ? ` · 0:${String(seconds).padStart(2, '0')}` : ''}
      </Text>
    </Press>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingHorizontal: 10, borderRadius: 14 },
  rowDark: { backgroundColor: colour.ink },
  rowLight: { backgroundColor: colour.paper2 },
  dot: { width: 32, height: 32, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  play: {
    width: 0,
    height: 0,
    marginLeft: 3,
    borderTopWidth: 7,
    borderBottomWidth: 7,
    borderLeftWidth: 11,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colour.ink,
  },
  pause: { width: 11, height: 12, borderLeftWidth: 4, borderRightWidth: 4, borderColor: colour.ink },
  text: { flex: 1, fontFamily: font.bodyMedium, fontSize: 13, color: colour.ink },
  photos: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  photo: { width: 64, height: 64, borderRadius: radius.card - 6 },
});
