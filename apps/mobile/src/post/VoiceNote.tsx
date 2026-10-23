import { useEffect, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import {
  RecordingPresets,
  requestRecordingPermissionsAsync,
  setAudioModeAsync,
  useAudioPlayer,
  useAudioPlayerStatus,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { colour, font, radius } from '../theme';
import { LIMITS, type Media } from './media';

/**
 * Say what is wrong, in Urdu or anything else: one tile in the row of three
 * on Post a job. Tap to start, tap to stop, it stops by itself at a minute.
 * Once recorded the tile goes, and `VoicePlayback` shows the note under the
 * row to play back or throw away — so the row never holds a tile that does
 * nothing.
 */
export function VoiceTile({ onDone, onProblem }: { onDone: (m: Media) => void; onProblem: (text: string) => void }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);
  const stopping = useRef(false);

  const seconds = Math.floor((state.durationMillis ?? 0) / 1000);

  async function start() {
    if (busy) return;
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onProblem('Pechkas needs the microphone to record a voice note. Allow it in your phone settings, or write instead.');
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
    } catch {
      onProblem('The voice note could not start. Try again, or write instead.');
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (stopping.current) return;
    stopping.current = true;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true });
      if (recorder.uri && seconds >= 1) onDone({ kind: 'voice', uri: recorder.uri, seconds });
      else onProblem('That was too short to hear. Hold on a moment longer.');
    } finally {
      stopping.current = false;
    }
  }

  useEffect(() => {
    if (state.isRecording && seconds >= LIMITS.voiceSeconds) stop();
  }, [seconds, state.isRecording]);

  const live = state.isRecording;
  return (
    <Press
      onPress={live ? stop : start}
      accessibilityRole="button"
      accessibilityLabel={live ? 'Stop recording' : 'Record a voice note'}
      sink={0.96}
      style={[tile.box, live && tile.boxLive]}
    >
      <View style={[tile.dot, live && { backgroundColor: colour.paper }]}>
        {live ? <View style={s.stopSquare} /> : <Icon name="mic" size={22} color={colour.ink} strokeWidth={2} />}
      </View>
      <Text style={[tile.label, live && { color: colour.paper }]}>{live ? `0:${String(seconds).padStart(2, '0')} Stop` : 'Voice'}</Text>
    </Press>
  );
}

/** The look every tile in the row shares: voice, video, photo. */
export const tile = StyleSheet.create({
  box: { flex: 1, minHeight: 92, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 6, borderRadius: radius.big, backgroundColor: colour.canvas },
  boxLive: { backgroundColor: colour.brick },
  dot: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colour.yellow },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink, textAlign: 'center' },
});

/** A recorded note under the row: play it back, or delete it. */
export function VoicePlayback({ media, onRemove }: { media: Media; onRemove: () => void }) {
  const player = useAudioPlayer({ uri: media.uri });
  const status = useAudioPlayerStatus(player);
  const playing = status.playing;
  return (
    <View style={s.box}>
      <Press
        onPress={() => {
          if (playing) player.pause();
          else {
            if (status.didJustFinish || status.currentTime >= (status.duration || 0)) player.seekTo(0);
            player.play();
          }
        }}
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play your voice note'}
        style={[s.dot, { backgroundColor: colour.green }]}
      >
        {playing ? <View style={s.pause} /> : <View style={s.play} />}
      </Press>
      <View style={{ flex: 1 }}>
        <Text style={s.title}>Voice note · 0:{String(media.seconds ?? 0).padStart(2, '0')}</Text>
        <Text style={s.sub}>{media.path ? 'Uploaded' : 'Ready to send'}</Text>
      </View>
      <Press onPress={onRemove} sink={0.94} accessibilityRole="button" accessibilityLabel="Delete the voice note" style={s.remove}>
        <Text style={s.removeText}>Delete</Text>
      </Press>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 10, minHeight: 64, borderRadius: radius.big, backgroundColor: colour.canvas },
  dot: { width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 16, height: 16, borderRadius: 3, backgroundColor: colour.brick },
  play: {
    width: 0,
    height: 0,
    marginLeft: 4,
    borderTopWidth: 9,
    borderBottomWidth: 9,
    borderLeftWidth: 15,
    borderTopColor: 'transparent',
    borderBottomColor: 'transparent',
    borderLeftColor: colour.paper,
  },
  pause: { width: 14, height: 16, borderLeftWidth: 5, borderRightWidth: 5, borderColor: colour.paper },
  title: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 12, color: colour.steel },
  remove: { minHeight: 44, minWidth: 44, paddingHorizontal: 10, alignItems: 'center', justifyContent: 'center' },
  removeText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
});
