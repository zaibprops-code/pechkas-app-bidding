import { useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import { File } from 'expo-file-system';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { Button, Notice } from '../src/components/ui';
import { clock, detailOf, LIMITS } from '../src/post/media';
import { recorded } from '../src/post/recorded';
import { colour, font } from '../src/theme';

/**
 * Recording a video of the fault, inside Pechkas — the owner asked to see how
 * much time is left while recording, and the phone's own camera app cannot
 * be drawn on. So: the camera fills the screen, a big clock counts down from
 * 0:20, a bar fills across the top, and the recording stops by itself when
 * the time is up (`maxDuration`, and the clock as a second guard).
 *
 * 720p, not the phone's best: a fault is as clear at 720p, and twenty
 * seconds of it is a fraction of LIMITS.bytes instead of most of it.
 *
 * Only `transform` moves (the bar). The colours snap. Nothing here is
 * stored anywhere but the phone until Post a job sends it.
 */
export default function Record() {
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraView>(null);
  const [cam, askCam] = useCameraPermissions();
  const [mic, askMic] = useMicrophonePermissions();
  const [ready, setReady] = useState(false);
  const [facing, setFacing] = useState<'back' | 'front'>('back');
  const [torch, setTorch] = useState(false);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [problem, setProblem] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // Set when the screen is being left, so a recording cut short by leaving is thrown away.
  const leaving = useRef(false);

  const recording = startedAt !== null;
  const seconds = startedAt ? Math.min(LIMITS.videoSeconds, Math.floor((now - startedAt) / 1000)) : 0;
  const left = LIMITS.videoSeconds - seconds;
  const used = startedAt ? Math.min(1, (now - startedAt) / 1000 / LIMITS.videoSeconds) : 0;

  // Asked for when the screen opens: opening it was the deliberate act.
  useEffect(() => {
    if (cam && !cam.granted && cam.canAskAgain) askCam();
    if (mic && !mic.granted && mic.canAskAgain) askMic();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cam?.status, mic?.status]);

  // The clock, a few times a second while recording; and the second guard at the limit.
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setNow(Date.now()), 200);
    return () => clearInterval(t);
  }, [recording]);
  useEffect(() => {
    if (recording && seconds >= LIMITS.videoSeconds) camera.current?.stopRecording();
  }, [recording, seconds]);

  // Leaving while recording stops it, and what was recorded is thrown away.
  useEffect(
    () => () => {
      leaving.current = true;
      camera.current?.stopRecording();
    },
    [],
  );

  async function start() {
    if (!camera.current || recording || saving) return;
    if (Platform.OS === 'web') {
      setProblem('Recording a video works in the Pechkas app on a phone.');
      return;
    }
    setProblem(null);
    const t = Date.now();
    setNow(t);
    setStartedAt(t);
    try {
      const r = await camera.current.recordAsync({ maxDuration: LIMITS.videoSeconds, maxFileSize: LIMITS.bytes });
      const length = Math.min(LIMITS.videoSeconds, Math.round((Date.now() - t) / 1000));
      setStartedAt(null);
      if (leaving.current) return;
      if (!r?.uri) {
        setProblem('The video was not saved. Please record it again.');
        return;
      }
      if (length < 1) {
        setProblem('That was too short to see anything. Record a moment longer.');
        return;
      }
      setSaving(true);
      let size = 0;
      try {
        size = new File(r.uri).size ?? 0;
      } catch {
        // Not knowing the size is not a reason to refuse it: the upload checks again.
      }
      if (size > LIMITS.bytes) {
        setSaving(false);
        setProblem(`That video is ${Math.ceil(size / 1048576)} MB, and Pechkas can send up to ${Math.round(LIMITS.bytes / 1048576)} MB. Record a shorter one.`);
        return;
      }
      recorded({ kind: 'video', uri: r.uri, seconds: length });
      router.back();
    } catch (e) {
      setStartedAt(null);
      setSaving(false);
      if (!leaving.current) setProblem(`The video could not be recorded. Please try again. (Details: ${detailOf(e)})`);
    }
  }

  function stop() {
    camera.current?.stopRecording();
  }

  const close = () => (router.canGoBack() ? router.back() : router.replace('/post'));

  // No camera, or no microphone: say so, and how to put it right.
  const refused = (cam && !cam.granted && !cam.canAskAgain) || (mic && !mic.granted && !mic.canAskAgain);
  if (refused) {
    return (
      <View style={[s.screen, s.centre, { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 }]}>
        <StatusBar style="light" />
        <View style={s.askCard}>
          <Text style={s.askTitle}>Pechkas needs the camera and the microphone</Text>
          <Text style={s.askText}>To record a video of the fault, allow both for Pechkas in your phone's settings. Or go back and choose a video from the gallery instead.</Text>
          <Button label="Open the phone's settings" onPress={() => Linking.openSettings()} />
          <Button kind="outline" dark label="Go back" onPress={close} />
        </View>
      </View>
    );
  }

  const granted = cam?.granted && mic?.granted;

  return (
    <View style={s.screen}>
      <StatusBar style="light" />
      {granted ? (
        <CameraView
          ref={camera}
          style={StyleSheet.absoluteFill}
          mode="video"
          videoQuality="720p"
          facing={facing}
          enableTorch={torch}
          onCameraReady={() => setReady(true)}
          onMountError={(e) => setProblem(`The camera could not start. (Details: ${e.message})`)}
        />
      ) : null}

      {/* The top: close, the clock, the light. Shaded so white words read over any picture. */}
      <View style={[s.top, { paddingTop: insets.top + 8 }]}>
        <View style={s.topRow}>
          {recording ? (
            <View style={s.side} />
          ) : (
            <Press onPress={close} accessibilityRole="button" accessibilityLabel="Close the camera" sink={0.9} style={s.round}>
              <Icon name="cross" size={22} color={colour.white} strokeWidth={2.4} />
            </Press>
          )}
          <View style={s.clockBox} accessibilityLiveRegion="polite" accessibilityLabel={recording ? `${left} seconds left` : `Up to ${LIMITS.videoSeconds} seconds`}>
            {recording ? (
              <View style={s.rec}>
                <View style={s.recDot} />
                <Text style={s.recText}>Recording</Text>
              </View>
            ) : null}
            <Text style={[s.clock, recording && left <= 5 && { color: colour.yellow }]}>{clock(recording ? left : LIMITS.videoSeconds)}</Text>
            <Text style={s.clockSub}>{recording ? 'left' : 'Up to 20 seconds'}</Text>
          </View>
          {facing === 'back' ? (
            <Press
              onPress={() => setTorch((t) => !t)}
              accessibilityRole="switch"
              accessibilityState={{ checked: torch }}
              accessibilityLabel="Light"
              sink={0.9}
              style={[s.round, torch && s.roundOn]}
            >
              <Icon name="bolt" size={22} color={torch ? colour.ink : colour.white} strokeWidth={2.2} />
            </Press>
          ) : (
            <View style={s.side} />
          )}
        </View>
        <View style={s.track} accessible={false}>
          <View style={[s.fill, { transform: [{ scaleX: used }] }]} />
        </View>
      </View>

      {/* The foot: what to do, the button, and turning the camera round. */}
      <View style={[s.bottom, { paddingBottom: insets.bottom + 24 }]}>
        {/* Here, not as the banner at the top: that would cover the close button and the clock. */}
        <Notice text={problem} inline />
        <Text style={s.hint}>
          {saving ? 'Saving…' : recording ? 'Tap to stop' : granted ? 'Show the fault, and say what is wrong. It stops by itself at 0:20.' : 'Waiting for the camera…'}
        </Text>
        <View style={s.controls}>
          <View style={s.side} />
          <Press
            onPress={recording ? stop : start}
            accessibilityRole="button"
            accessibilityLabel={recording ? 'Stop recording' : 'Start recording'}
            accessibilityState={{ disabled: !ready || saving }}
            sink={0.92}
            style={[s.shutter, (!ready || saving) && { opacity: 0.5 }]}
          >
            <View style={recording ? s.stopSquare : s.recCircle} />
          </Press>
          {recording ? (
            <View style={s.side} />
          ) : (
            <Press
              onPress={() => {
                setTorch(false);
                setFacing((f) => (f === 'back' ? 'front' : 'back'));
              }}
              accessibilityRole="button"
              accessibilityLabel={facing === 'back' ? 'Use the front camera' : 'Use the back camera'}
              sink={0.9}
              style={s.round}
            >
              <Icon name="camera" size={22} color={colour.white} strokeWidth={2.2} />
            </Press>
          )}
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#000000' },
  centre: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: 20 },
  top: { position: 'absolute', left: 0, right: 0, top: 0, paddingHorizontal: 16, paddingBottom: 12, gap: 12, backgroundColor: 'rgba(0,0,0,0.45)' },
  topRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  side: { width: 48, height: 48 },
  round: { width: 48, height: 48, borderRadius: 24, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center' },
  roundOn: { backgroundColor: colour.yellow },
  clockBox: { alignItems: 'center', minWidth: 140 },
  rec: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 2 },
  recDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#ff4d3a' },
  recText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.white },
  clock: { fontFamily: font.display, fontSize: 52, lineHeight: 58, color: colour.white, letterSpacing: -1, fontVariant: ['tabular-nums'] },
  clockSub: { fontFamily: font.bodySemi, fontSize: 14, color: colour.white },
  track: { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.3)', overflow: 'hidden' },
  fill: { height: 6, backgroundColor: colour.yellow, transformOrigin: 'left' },
  bottom: { position: 'absolute', left: 0, right: 0, bottom: 0, paddingTop: 16, paddingHorizontal: 24, gap: 16, backgroundColor: 'rgba(0,0,0,0.45)' },
  hint: { fontFamily: font.bodySemi, fontSize: 15, lineHeight: 21, color: colour.white, textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  shutter: { width: 84, height: 84, borderRadius: 42, borderWidth: 5, borderColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  recCircle: { width: 60, height: 60, borderRadius: 30, backgroundColor: '#e5372b' },
  stopSquare: { width: 32, height: 32, borderRadius: 6, backgroundColor: '#e5372b' },
  askCard: { gap: 12, padding: 20, borderRadius: 22, backgroundColor: '#1c2126', alignSelf: 'stretch' },
  askTitle: { fontFamily: font.display, fontSize: 22, lineHeight: 27, color: colour.white },
  askText: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: '#d8dde1' },
});
