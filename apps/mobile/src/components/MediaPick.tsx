import { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { DuoIcon } from './DuoIcon';
import { Press } from './Press';
import { useSignedUrls } from '../post/RemoteMedia';
import { detailOf, takePhoto, takeVideo, upload } from '../post/media';
import { colour, font, radius } from '../theme';

/**
 * Photos (and, where asked, a short video) for a claim, a "not finished
 * yet" or an appeal: each one is uploaded the moment it is taken, so a send
 * that fails on bad signal never loses it. Thumbnails show what is already
 * there; a tile goes once the limit is reached, so no button does nothing.
 */
export function MediaPick({
  paths,
  setPaths,
  userId,
  max = 4,
  video = false,
  onProblem,
}: {
  paths: string[];
  setPaths: (p: string[]) => void;
  userId: string;
  max?: number;
  video?: boolean;
  onProblem: (m: string | null) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const urls = useSignedUrls(paths.filter((p) => !isVideo(p)).map((path) => ({ kind: 'photo', path, seconds: null })));

  async function add(kind: 'camera' | 'gallery' | 'video') {
    onProblem(null);
    setBusy(kind);
    try {
      const m = kind === 'video' ? await takeVideo(true) : await takePhoto(kind === 'camera');
      if (m) setPaths([...paths, await upload(m, userId)]);
    } catch (e) {
      onProblem(`That did not work. Try again. (Details: ${detailOf(e)})`);
    } finally {
      setBusy(null);
    }
  }

  const room = paths.length < max;
  return (
    <View style={{ gap: 10 }}>
      {paths.length ? (
        <View style={s.thumbs}>
          {paths.map((p) =>
            isVideo(p) ? (
              <View key={p} style={[s.thumb, s.videoThumb]} accessibilityLabel="A video">
                <DuoIcon name="video" size={26} />
                <Text style={s.videoText}>Video</Text>
              </View>
            ) : urls[p] ? (
              <Image key={p} source={{ uri: urls[p] }} style={s.thumb} accessibilityLabel="A photo" />
            ) : (
              <View key={p} style={[s.thumb, { backgroundColor: colour.paper2 }]} />
            ),
          )}
        </View>
      ) : null}
      {room ? (
        <View style={s.tiles}>
          <Tile icon="camera" label={busy === 'camera' ? 'Uploading…' : 'Take a photo'} onPress={() => add('camera')} disabled={!!busy} />
          <Tile icon="doc" label={busy === 'gallery' ? 'Uploading…' : 'From gallery'} onPress={() => add('gallery')} disabled={!!busy} />
          {video ? <Tile icon="video" label={busy === 'video' ? 'Uploading…' : 'Video'} sub="Up to 20 sec" onPress={() => add('video')} disabled={!!busy} /> : null}
        </View>
      ) : (
        <Text style={s.note}>That is the most you can add.</Text>
      )}
    </View>
  );
}

function Tile({ icon, label, sub, onPress, disabled }: { icon: 'camera' | 'doc' | 'video'; label: string; sub?: string; onPress: () => void; disabled: boolean }) {
  return (
    <Press onPress={onPress} disabled={disabled} accessibilityRole="button" accessibilityLabel={label} sink={0.96} style={s.tile}>
      <View style={s.disc}>
        <DuoIcon name={icon} size={22} />
      </View>
      <Text style={s.tileText} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
        {label}
      </Text>
      {sub ? <Text style={s.tileSub}>{sub}</Text> : null}
    </Press>
  );
}

export const isVideo = (p: string) => /\.(mp4|mov|m4v|webm)$/i.test(p);

const s = StyleSheet.create({
  thumbs: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  thumb: { width: 76, height: 76, borderRadius: 14 },
  videoThumb: { backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center', gap: 2 },
  videoText: { fontFamily: font.bodySemi, fontSize: 12, color: colour.ink },
  tiles: { flexDirection: 'row', gap: 8 },
  tile: { flex: 1, minHeight: 84, padding: 10, borderRadius: radius.card, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center', gap: 6 },
  disc: { width: 40, height: 40, borderRadius: 20, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  tileText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  tileSub: { fontFamily: font.body, fontSize: 11.5, color: colour.steel },
  note: { fontFamily: font.body, fontSize: 13, color: colour.steel },
});
