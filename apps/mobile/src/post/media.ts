import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { supabase } from '../supabase';
import { capture } from './recorded';

/**
 * A file the customer added to a job. `path` is set once it is safely in the
 * private bucket, so a post that fails on bad signal does not upload twice.
 */
export type Media = {
  kind: 'voice' | 'video' | 'photo';
  uri: string;
  seconds?: number;
  path?: string;
};

/**
 * `bytes` must equal the job-media bucket's `file_size_limit` (migration
 * …_bigger_videos, 50 MB — the most Supabase's plan accepts for one file).
 * A phone records about 2 MB a second, so 30 MB refused almost every real
 * video; 20 seconds now fits with room to spare, and says enough.
 */
export const LIMITS = { voiceSeconds: 60, videoSeconds: 20, photos: 4, bytes: 50 * 1024 * 1024 };

/**
 * Wait for a sheet to finish closing before the camera or the gallery opens.
 * Opening them while the sheet is still on its way out can leave the phone
 * with nothing on screen (the iPhone refuses outright), so every option in
 * a sheet that opens one goes through here.
 */
export function afterSheet(open: () => void) {
  setTimeout(open, 350);
}

/** Seconds as a clock reads them: 48 → "0:48", 60 → "1:00". */
export function clock(seconds: number): string {
  const s = Math.max(0, Math.round(seconds));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

/** The words of any error, for the "Details" line people can screenshot. */
export function detailOf(e: unknown): string {
  const m = e instanceof Error ? e.message : typeof e === 'string' ? e : '';
  return m ? m.slice(0, 160) : 'no details given';
}

/**
 * A file larger than LIMITS.bytes: an ordinary Error whose message is 'big',
 * carrying its size so the person can be told by how much. (Not a subclass:
 * `instanceof` on a subclass of Error is not dependable once compiled.)
 */
function tooBig(bytes: number): Error & { bytes: number } {
  return Object.assign(new Error('big'), { bytes });
}

/** "That video is 58 MB, and …": the words for a 'big' error, sizes in whole megabytes. */
export function tooBigWords(e: unknown): string | null {
  if (!(e instanceof Error) || e.message !== 'big') return null;
  const mb = (n: number) => Math.ceil(n / (1024 * 1024));
  const bytes = (e as Error & { bytes?: number }).bytes;
  return bytes
    ? `That video is ${mb(bytes)} MB, and Pechkas can send up to ${mb(LIMITS.bytes)} MB. Record a shorter one, or send photos and a voice note instead.`
    : `That video is too big to send: Pechkas can send up to ${mb(LIMITS.bytes)} MB. Record a shorter one, or send photos and a voice note instead.`;
}

const TYPES = {
  m4a: 'audio/mp4',
  aac: 'audio/aac',
  mp3: 'audio/mpeg',
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  '3gp': 'video/3gpp',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
} as const;

function extension(m: Media): keyof typeof TYPES {
  const ext = m.uri.split('?')[0].split('.').pop()?.toLowerCase() ?? '';
  if (ext in TYPES) return ext as keyof typeof TYPES;
  return m.kind === 'voice' ? 'm4a' : m.kind === 'video' ? 'mp4' : 'jpg';
}

/**
 * Photos are shrunk on the phone before they leave it: a 12-megapixel photo
 * on 3G is a minute of waiting for something 1600 pixels shows just as well.
 */
export async function shrink(uri: string): Promise<string> {
  try {
    const ref = await ImageManipulator.manipulate(uri).resize({ width: 1600 }).renderAsync();
    const saved = await ref.saveAsync({ compress: 0.7, format: SaveFormat.JPEG });
    return saved.uri;
  } catch {
    return uri;
  }
}

/**
 * Only the camera needs permission. Choosing from the gallery uses the
 * phone's own photo picker, which hands over just the one picture chosen and
 * needs no access to the rest — which is why app.json blocks the storage and
 * media permissions, and Google Play's photo policy has nothing to ask.
 */
async function allowed(fromCamera: boolean) {
  if (!fromCamera) return;
  const perm = await ImagePicker.requestCameraPermissionsAsync();
  if (!perm.granted) throw new Error('camera');
}

export async function takePhoto(fromCamera: boolean): Promise<Media | null> {
  // On a phone the camera is Pechkas' own (see recorded.ts for why). It asks
  // for the camera itself, and shrinks the photo before handing it back.
  if (fromCamera && Platform.OS !== 'web') return capture('photo');
  await allowed(fromCamera);
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
  const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  return { kind: 'photo', uri: await shrink(r.assets[0].uri) };
}

/** A video the phone handed back, checked against the limits. */
function asVideo(a: ImagePicker.ImagePickerAsset): Media {
  const seconds = a.duration ? Math.round(a.duration / 1000) : undefined;
  if (seconds && seconds > LIMITS.videoSeconds + 2) throw new Error('long');
  if (a.fileSize && a.fileSize > LIMITS.bytes) throw tooBig(a.fileSize);
  return { kind: 'video', uri: a.uri, seconds };
}

/**
 * Android may close Pechkas while the camera is open, to free memory on a
 * busy phone. The photo or video is not lost: the phone keeps it, and this
 * collects it when the screen opens again. Without it the picture simply
 * never appeared — exactly what "the photo button does not work" looks like.
 */
export async function recoverLostPick(): Promise<Media | null> {
  if (Platform.OS !== 'android') return null;
  const r = await ImagePicker.getPendingResultAsync();
  if (!r || !('assets' in r) || r.canceled || !r.assets?.[0]) return null;
  const a = r.assets[0];
  if (a.type === 'video') return asVideo(a);
  return { kind: 'photo', uri: await shrink(a.uri) };
}

export async function takeVideo(fromCamera: boolean): Promise<Media | null> {
  if (fromCamera && Platform.OS !== 'web') return capture('video');
  await allowed(fromCamera);
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    videoMaxDuration: LIMITS.videoSeconds,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  };
  const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  return asVideo(r.assets[0]);
}

async function bytesOf(uri: string): Promise<ArrayBuffer> {
  if (Platform.OS === 'web') return (await fetch(uri)).arrayBuffer();
  return new File(uri).arrayBuffer();
}

/**
 * Puts one file in the customer's own folder of the private bucket and
 * returns its path. Tries three times: a dropped signal is normal here.
 */
export async function upload(m: Media, userId: string): Promise<string> {
  if (m.path) return m.path;
  if (!supabase) throw new Error('offline');
  const ext = extension(m);
  const path = `${userId}/${m.kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const body = await bytesOf(m.uri);
  if (body.byteLength > LIMITS.bytes) throw tooBig(body.byteLength);
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.storage.from('job-media').upload(path, body, { contentType: TYPES[ext], upsert: false });
    if (!error) return path;
    last = error;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw last ?? new Error('upload');
}
