import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { router, useLocalSearchParams } from 'expo-router';
import * as Speech from 'expo-speech';
import { Button, Loading, Notice, Screen } from '../../src/components/ui';
import { Panel } from '../../src/components/Panel';
import { Press } from '../../src/components/Press';
import { Icon } from '../../src/components/Icon';
import { useLists } from '../../src/lists';
import { ask } from '../../src/supabase';
import { fill, useProWords } from '../../src/words';
import { colour, font } from '../../src/theme';

type Question = { id: number; ur: string; en: string; options: { ur: string; en: string }[] };
type Started = { attempt: string; questions: Question[] };
type Result = { passed: boolean; correct: number; of: number; again_from: string | null };

/**
 * A quiz (D37): questions drawn at random from the pool by the database, in
 * Urdu with the English under it, one at a time. "Hear it" reads the Urdu
 * aloud with the phone's own Urdu voice, and is shown only on a phone that
 * has one. The answers never reach the phone: the database marks them.
 */
export default function Quiz() {
  const { key } = useLocalSearchParams<{ key: string }>();
  const { w } = useProWords();
  const lists = useLists();
  const [quiz, setQuiz] = useState<Started | null>(null);
  const [answers, setAnswers] = useState<(number | null)[]>([]);
  const [at, setAt] = useState(0);
  const [result, setResult] = useState<Result | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [voice, setVoice] = useState(false);

  useEffect(() => {
    ask<Started>('start_quiz', { p_quiz: key }).then((r) => {
      if (!r.ok) return setNotice(r.why);
      setQuiz({ attempt: r.attempt, questions: r.questions });
      setAnswers(r.questions.map(() => null));
    });
    Speech.getAvailableVoicesAsync()
      .then((v) => setVoice(v.some((x) => x.language?.toLowerCase().startsWith('ur'))))
      .catch(() => setVoice(false));
    return () => {
      Speech.stop();
    };
  }, [key]);

  const trade = key?.startsWith('safety:') ? lists?.trades.find((t) => t.slug === key.slice(7))?.name ?? key.slice(7) : null;
  const title = trade ? fill(w.safetyQuizFor, { trade }) : w.rulesQuiz;

  async function finish() {
    if (!quiz) return;
    setBusy(true);
    const r = await ask<Result>('finish_quiz', { p_attempt: quiz.attempt, p_answers: answers });
    setBusy(false);
    if (!r.ok) return setNotice(r.why);
    setResult({ passed: r.passed, correct: r.correct, of: r.of, again_from: r.again_from });
  }

  if (result) {
    return (
      <Screen hero={{ title, back: true }} footer={<Button label={w.backToFirstJobs} onPress={() => router.replace('/pro/first-jobs')} />}>
        <Panel icon={result.passed ? 'shield' : 'clock'} title={result.passed ? w.quizPassedTitle : w.quizFailedTitle}>
          <Text style={s.body}>{fill(w.quizScore, { n: result.correct, of: result.of })}</Text>
          {!result.passed && result.again_from ? (
            <Text style={s.body}>
              {fill(w.quizAgain, {
                date: new Date(result.again_from).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' }),
              })}
            </Text>
          ) : null}
        </Panel>
      </Screen>
    );
  }

  if (!quiz) {
    return (
      <Screen hero={{ title, back: true }}>
        {notice ? <Notice text={notice} /> : <Loading />}
      </Screen>
    );
  }

  const q = quiz.questions[at];
  const last = at === quiz.questions.length - 1;
  const chosen = answers[at];
  return (
    <Screen
      hero={{ title, sub: fill(w.quizOf, { n: at + 1, of: quiz.questions.length }), back: true }}
      footer={
        <Button
          label={last ? w.finishQuiz : w.next}
          icon={last ? undefined : 'arrowRight'}
          disabled={chosen === null}
          busy={busy}
          onPress={() => {
            Speech.stop();
            if (last) finish();
            else setAt(at + 1);
          }}
        />
      }
    >
      <Notice text={notice} />
      <Panel>
        <Text style={s.ur}>{q.ur}</Text>
        <Text style={s.en}>{q.en}</Text>
        {voice ? (
          <Press
            onPress={() => {
              Speech.stop();
              Speech.speak([q.ur, ...q.options.map((o) => o.ur)].join('۔ '), { language: 'ur-PK' });
            }}
            accessibilityRole="button"
            style={s.hear}
          >
            <Icon name="mic" size={18} color={colour.ink} />
            <Text style={s.hearText}>{w.hearIt}</Text>
          </Press>
        ) : null}
      </Panel>
      <View style={{ gap: 10 }}>
        {q.options.map((o, i) => (
          <Press
            key={i}
            onPress={() => setAnswers(answers.map((a, n) => (n === at ? i : a)))}
            accessibilityRole="radio"
            accessibilityState={{ checked: chosen === i }}
            style={[s.option, chosen === i && s.optionOn]}
          >
            <View style={[s.radio, chosen === i && s.radioOn]} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.optionUr}>{o.ur}</Text>
              <Text style={s.optionEn}>{o.en}</Text>
            </View>
          </Press>
        ))}
      </View>
    </Screen>
  );
}

const s = StyleSheet.create({
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink },
  // Urdu takes the phone's own Urdu font: the app's typeface has no Urdu letters.
  ur: { fontSize: 22, lineHeight: 40, color: colour.ink, writingDirection: 'rtl', textAlign: 'right' },
  en: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel },
  hear: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', minHeight: 44, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colour.softYellow },
  hearText: { fontFamily: font.bodySemi, fontSize: 14.5, color: colour.ink },
  option: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, padding: 14, borderRadius: 20, backgroundColor: colour.white },
  optionOn: { backgroundColor: colour.softYellow },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: colour.steel },
  radioOn: { borderColor: colour.ink, borderWidth: 7 },
  optionUr: { fontSize: 18, lineHeight: 32, color: colour.ink, writingDirection: 'rtl', textAlign: 'right' },
  optionEn: { fontFamily: font.body, fontSize: 13, color: colour.steel },
});
