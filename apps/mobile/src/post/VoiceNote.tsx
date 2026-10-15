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
 * Say what is wrong, in Urdu or anything else. Tap to start, tap to stop, it
 * stops by itself at a minute. Play it back before posting, or throw it away.
 */
export function VoiceNote({ value, onChange, onProblem }: { value: Media | null; onChange: (m: Media | null) => void; onProblem: (text: string) => void }) {
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
      if (recorder.uri && seconds >= 1) onChange({ kind: 'voice', uri: recorder.uri, seconds });
      else onProblem('That was too short to hear. Hold on a moment longer.');
    } finally {
      stopping.current = false;
    }
  }

  // A minute is plenty to describe a fault; stop there by itself.
  useEffect(() => {
    if (state.isRecording && seconds >= LIMITS.voiceSeconds) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, state.isRecording]);

  if (value) return <Recorded media={value} onRemove={() => onChange(null)} />;

  return (
    <Press
      onPress={state.isRecording ? stop : start}
      accessibilityRole="button"
      accessibilityLabel={state.isRecording ? 'Stop recording' : 'Record a voice note'}
      style={[s.box, state.isRecording && s.boxLive]}
    >
      <View style={[s.dot, { backgroundColor: state.isRecording ? colour.brick : colour.yellow }]}>
        {state.isRecording ? <View style={s.stopSquare} /> : <Icon name="mic" size={22} color={colour.ink} strokeWidth={2} />}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[s.title, state.isRecording && { color: colour.paper }]}>
          {state.isRecording ? `Recording… 0:${String(seconds).padStart(2, '0')}` : 'Record a voice note'}
        </Text>
        <Text style={[s.sub, state.isRecording && { color: '#f6e3dc' }]}>
          {state.isRecording ? 'Tap to stop. Up to a minute.' : 'Say what is wrong. Urdu is fine.'}
        </Text>
      </View>
    </Press>
  );
}

function Recorded({ media, onRemove }: { media: Media; onRemove: () => void }) {
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
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    minHeight: 68,
    borderRadius: radius.big,
    backgroundColor: colour.white,
    borderWidth: 1,
    borderColor: 'rgba(20,23,26,0.12)',
  },
  boxLive: { backgroundColor: colour.ink, borderColor: colour.ink },
  dot: { width: 46, height: 46, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  stopSquare: { width: 16, height: 16, borderRadius: 3, backgroundColor: colour.paper },
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
