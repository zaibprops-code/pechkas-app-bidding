import { Platform } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { File } from 'expo-file-system';
import { supabase } from '../supabase';

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

export const LIMITS = { voiceSeconds: 60, videoSeconds: 30, photos: 4, bytes: 30 * 1024 * 1024 };

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
async function shrink(uri: string): Promise<string> {
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
  await allowed(fromCamera);
  const opts: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.8 };
  const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  return { kind: 'photo', uri: await shrink(r.assets[0].uri) };
}

export async function takeVideo(fromCamera: boolean): Promise<Media | null> {
  await allowed(fromCamera);
  const opts: ImagePicker.ImagePickerOptions = {
    mediaTypes: ['videos'],
    videoMaxDuration: LIMITS.videoSeconds,
    videoQuality: ImagePicker.UIImagePickerControllerQualityType.Medium,
  };
  const r = fromCamera ? await ImagePicker.launchCameraAsync(opts) : await ImagePicker.launchImageLibraryAsync(opts);
  if (r.canceled || !r.assets[0]) return null;
  const a = r.assets[0];
  const seconds = a.duration ? Math.round(a.duration / 1000) : undefined;
  if (seconds && seconds > LIMITS.videoSeconds + 2) throw new Error('long');
  if (a.fileSize && a.fileSize > LIMITS.bytes) throw new Error('big');
  return { kind: 'video', uri: a.uri, seconds };
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
  if (body.byteLength > LIMITS.bytes) throw new Error('big');
  let last: unknown = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const { error } = await supabase.storage.from('job-media').upload(path, body, { contentType: TYPES[ext], upsert: false });
    if (!error) return path;
    last = error;
    await new Promise((r) => setTimeout(r, 1500 * (attempt + 1)));
  }
  throw last ?? new Error('upload');
}
