import { DuoIcon } from '../components/DuoIcon';
import { switchedOff, type Message } from '../message';
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
import { clock, detailOf, LIMITS, type Media } from './media';

/**
 * Say what is wrong, in Urdu or anything else: one tile in the row of three
 * on Post a job. Tap to start, tap to stop, it stops by itself at a minute.
 * Once recorded the tile goes, and `VoicePlayback` shows the note under the
 * row to play back or throw away — so the row never holds a tile that does
 * nothing.
 */
/**
 * `wide` is Post a job's look (the owner's choice, 24 November 2026): the
 * voice note as the one big black button across the card, because speaking
 * is the easiest way for most customers to say what is wrong. Recording, it
 * says how much of the minute is left and fills from the left (transform).
 */
export function VoiceTile({ onDone, onProblem, wide = false, big = false }: { onDone: (m: Media) => void; onProblem: (m: string | Message) => void; wide?: boolean; big?: boolean }) {
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const state = useAudioRecorderState(recorder, 250);
  const [busy, setBusy] = useState(false);
  const stopping = useRef(false);
  // The tile keeps its own clock and its own idea of whether it is recording,
  // rather than waiting on the recorder's reports: on a phone those can lag,
  // and a tile that never turns to "Stop", or calls a ten-second note "too
  // short", is a voice note that does not work.
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const live = startedAt !== null || state.isRecording;
  const seconds = Math.max(Math.floor((state.durationMillis ?? 0) / 1000), startedAt ? Math.floor((now - startedAt) / 1000) : 0);

  useEffect(() => {
    if (startedAt === null) return;
    const t = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(t);
  }, [startedAt]);

  async function start() {
    if (busy || live) return;
    setBusy(true);
    try {
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        onProblem(switchedOff('microphone', 'Pechkas needs the microphone to record a voice note.'));
        return;
      }
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setNow(Date.now());
      setStartedAt(Date.now());
    } catch (e) {
      onProblem(`The voice note could not start. Try again, or write instead. (Details: ${detailOf(e)})`);
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (stopping.current) return;
    stopping.current = true;
    const length = seconds;
    try {
      await recorder.stop();
      await setAudioModeAsync({ allowsRecording: false, playsInSilentMode: true }).catch(() => {});
      if (!recorder.uri) onProblem('The voice note was not saved. Please record it again.');
      else if (length < 1) onProblem('That was too short to hear. Hold on a moment longer.');
      else onDone({ kind: 'voice', uri: recorder.uri, seconds: length });
    } catch (e) {
      onProblem(`The voice note could not be saved. Please record it again. (Details: ${detailOf(e)})`);
    } finally {
      stopping.current = false;
      setStartedAt(null);
    }
  }

  useEffect(() => {
    if (live && seconds >= LIMITS.voiceSeconds) stop();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [seconds, live]);

  // What is left, counted down, and a bar that fills as the minute runs out.
  const left = Math.max(0, LIMITS.voiceSeconds - seconds);
  const used = Math.min(1, seconds / LIMITS.voiceSeconds);
  if (big) {
    // Post a job's step 1 (the owner's design, 25 November 2026): the one big
    // thing on the screen. Ink at rest, brick while recording; the time is
    // counted up, what is left is said, and a bar fills by transform.
    return (
      <Press
        onPress={live ? stop : start}
        accessibilityRole="button"
        accessibilityLabel={live ? `Stop recording. ${left} seconds left.` : `Record a voice note, up to ${LIMITS.voiceSeconds / 60} minute`}
        sink={0.97}
        style={[bigS.box, live && bigS.boxLive]}
      >
        <View style={[bigS.dot, live && bigS.dotLive]}>{live ? <View style={bigS.stop} /> : <Icon name="mic" size={34} color={colour.ink} strokeWidth={2.2} />}</View>
        <Text style={bigS.title} accessibilityLiveRegion="polite">
          {live ? `Recording ${clock(seconds)}` : busy ? 'Starting…' : 'Tap to record'}
        </Text>
        <Text style={bigS.sub}>{live ? `Tap to stop · ${left} sec left` : `Up to ${LIMITS.voiceSeconds / 60} minute · Urdu or English`}</Text>
        {live ? (
          <View style={bigS.track} accessible={false}>
            <View style={[bigS.fill, { transform: [{ scaleX: used }] }]} />
          </View>
        ) : null}
      </Press>
    );
  }
  if (wide) {
    return (
      <Press
        onPress={live ? stop : start}
        accessibilityRole="button"
        accessibilityLabel={live ? `Stop recording. ${left} seconds left.` : `Record a voice note, up to ${LIMITS.voiceSeconds / 60} minute`}
        sink={0.97}
        style={[wideS.box, live && wideS.boxLive]}
      >
        {live ? <View style={[wideS.fill, { transform: [{ scaleX: used }] }]} accessible={false} /> : null}
        <View style={wideS.dot}>{live ? <View style={s.stopSquare} /> : <Icon name="mic" size={21} color={colour.ink} strokeWidth={2.2} />}</View>
        <View style={{ flex: 1 }}>
          <Text style={wideS.title} accessibilityLiveRegion="polite">
            {live ? `Recording · ${clock(left)} left` : busy ? 'Starting…' : 'Record a voice note'}
          </Text>
          <Text style={wideS.sub}>{live ? 'Tap to stop' : `Up to ${LIMITS.voiceSeconds / 60} min · Urdu or English`}</Text>
        </View>
      </Press>
    );
  }
  return (
    <Press
      onPress={live ? stop : start}
      accessibilityRole="button"
      accessibilityLabel={live ? `Stop recording. ${left} seconds left.` : `Record a voice note, up to ${LIMITS.voiceSeconds / 60} minute`}
      sink={0.96}
      style={[tile.box, live && tile.boxLive]}
    >
      <View style={[tile.dot, live && { backgroundColor: colour.paper }]}>
        {live ? <View style={s.stopSquare} /> : <DuoIcon name="mic" size={26} />}
      </View>
      {live ? (
        <View style={{ alignItems: 'center' }}>
          <Text style={[tile.label, { color: colour.paper }]} accessibilityLiveRegion="polite">
            {clock(left)} left
          </Text>
          <Text style={[tile.limit, { color: colour.paper }]}>Tap to stop</Text>
        </View>
      ) : (
        <View style={{ alignItems: 'center' }}>
          <Text style={tile.label}>{busy ? 'Starting…' : 'Voice'}</Text>
          <Text style={tile.limit}>Up to {LIMITS.voiceSeconds / 60} min</Text>
        </View>
      )}
      {live ? (
        <View style={tile.track} accessible={false}>
          {/* Grows from the left by transform only, as everything that moves in the app. */}
          <View style={[tile.fill, { transform: [{ scaleX: used }] }]} />
        </View>
      ) : null}
    </Press>
  );
}

const bigS = StyleSheet.create({
  box: { minHeight: 176, alignItems: 'center', justifyContent: 'center', gap: 6, paddingVertical: 18, paddingHorizontal: 16, borderRadius: 28, backgroundColor: colour.ink, overflow: 'hidden', boxShadow: '0px 10px 26px rgba(20, 23, 26, 0.2)' },
  boxLive: { backgroundColor: colour.brick },
  dot: { width: 74, height: 74, borderRadius: 37, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  dotLive: { backgroundColor: colour.white },
  stop: { width: 24, height: 24, borderRadius: 5, backgroundColor: colour.brick },
  title: { fontFamily: font.display, fontSize: 21, color: colour.white },
  sub: { fontFamily: font.bodyMedium, fontSize: 13.5, color: 'rgba(255,255,255,0.8)', textAlign: 'center' },
  track: { width: '70%', height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.22)', overflow: 'hidden', marginTop: 6 },
  fill: { width: '100%', height: '100%', backgroundColor: colour.yellow, transformOrigin: 'left' },
});

const wideS = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 62, paddingHorizontal: 14, borderRadius: 18, backgroundColor: colour.ink, overflow: 'hidden' },
  boxLive: { backgroundColor: colour.brick },
  fill: { position: 'absolute', left: 0, top: 0, bottom: 0, right: 0, backgroundColor: 'rgba(255,255,255,0.14)', transformOrigin: 'left' },
  dot: { width: 38, height: 38, borderRadius: 19, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 16, color: colour.white },
  sub: { fontFamily: font.bodyMedium, fontSize: 12.5, color: 'rgba(255,255,255,0.78)', marginTop: 1 },
});

/** The look every tile in the row shares: voice, video, photo. */
export const tile = StyleSheet.create({
  box: { flex: 1, minHeight: 104, alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 12, paddingHorizontal: 6, borderRadius: 20, backgroundColor: colour.cream, overflow: 'hidden' },
  boxLive: { backgroundColor: colour.brick },
  dot: { width: 48, height: 48, borderRadius: 999, alignItems: 'center', justifyContent: 'center', backgroundColor: colour.white, boxShadow: '0px 2px 6px rgba(20, 23, 26, 0.08)' },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink, textAlign: 'center' },
  limit: { fontFamily: font.body, fontSize: 11, color: colour.steel, textAlign: 'center' },
  // A narrow phone's three tiles are about 70 points wide: "Up to 20 sec" fits on one line at 10.
  limitNarrow: { fontSize: 10 },
  track: { position: 'absolute', left: 0, right: 0, bottom: 0, height: 5, backgroundColor: 'rgba(250,246,239,0.3)', overflow: 'hidden' },
  fill: { height: 5, backgroundColor: colour.paper, transformOrigin: 'left' },
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
        <Text style={s.title}>Voice note · {clock(media.seconds ?? 0)}</Text>
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
