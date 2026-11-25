import { useState, type ReactNode } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { DuoIcon } from './DuoIcon';
import { DuoRow } from './Rows';
import { Icon } from './Icon';
import { Press } from './Press';
import { Glow } from './YellowTop';
import { boldParts, wordMatches, type HelpQA, type HelpTopic } from '../help';
import { OFFICE_WHATSAPP } from '../office';
import { colour, font, glow, shadow, TAP } from '../theme';

/**
 * The pieces Help's two pages share (the owner's design, 25 November 2026):
 * the side's own coloured top, a topic as a Settings-style row with how many
 * answers it holds, the questions as one card that opens one answer at a
 * time, and the office as the last row. WhatsApp only: the office answers in
 * writing, and the owner cannot take calls.
 */

/** The side's colour (yellow customer, green technician), lit, rounded at the foot, under the clock. */
export function HelpTop({ pro, title, children }: { pro: boolean; title?: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [size, setSize] = useState({ w: 0, h: 0 });
  const fg = pro ? colour.white : colour.ink;
  return (
    <View
      style={[s.top, { paddingTop: insets.top + 6, backgroundColor: pro ? colour.green : colour.yellow }]}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.w ? <Glow width={size.w} height={size.h} stops={pro ? glow.green : glow.yellow} id={pro ? 'help-green' : 'help-yellow'} /> : null}
      <View style={s.bar}>
        <Press
          onPress={() => (router.canGoBack() ? router.back() : router.replace('/'))}
          accessibilityRole="button"
          accessibilityLabel="Back"
          sink={0.9}
          style={[s.back, pro && s.backDark]}
        >
          <Icon name="arrowLeft" size={22} color={fg} strokeWidth={2.2} />
        </Press>
        {title ? <Text style={[s.barTitle, { color: fg }]}>{title}</Text> : null}
        <View style={{ width: TAP }} />
      </View>
      {children}
    </View>
  );
}

/** Words for the top: dark on yellow, light on green. */
export const topInk = (pro: boolean) => ({ title: [s.title, pro && { color: colour.white }], line: [s.line, pro && s.lineOnGreen] });

/** A topic: its icon, name, what is inside, how many answers, and the way in. `swap` replaces the page, so Back from a topic reached from a topic is Help. */
export function TopicRow({ topic, last, swap = false }: { topic: HelpTopic; last?: boolean; swap?: boolean }) {
  return (
    <DuoRow
      icon={topic.icon}
      label={topic.title}
      value={topic.about}
      last={last}
      onPress={() => (swap ? router.replace : router.push)({ pathname: '/help/[topic]', params: { topic: topic.key } })}
      right={
        <View style={s.right}>
          <View style={s.count} accessibilityLabel={`${topic.qa.length} answers`}>
            <Text style={s.countText}>{topic.qa.length}</Text>
          </View>
          <Icon name="chevronRight" size={18} color="#9aa1a6" strokeWidth={2.2} />
        </View>
      }
    />
  );
}

/** Words with the typed ones marked, as a search result shows them. */
function Marked({ text, words, style }: { text: string; words: string[]; style: object }) {
  if (!words.length) return <Text style={style}>{text}</Text>;
  // The same matching as the search: whole short words, the starts of long ones.
  const marked = (part: string) => words.some((w) => wordMatches(w, part));
  return (
    <Text style={style}>
      {text.split(/([A-Za-z0-9]+)/).map((part, i) =>
        i % 2 === 1 && marked(part) ? (
          <Text key={i} style={s.mark}>
            {part}
          </Text>
        ) : (
          part
        ),
      )}
    </Text>
  );
}

/** An answer, with the buttons it names in bold. */
function Answer({ text }: { text: string }) {
  return (
    <Text style={s.answer}>
      {boldParts(text).map((p, i) =>
        p.bold ? (
          <Text key={i} style={s.bold}>
            {p.text}
          </Text>
        ) : (
          p.text
        ),
      )}
    </Text>
  );
}

/**
 * Questions in one white card, one answer open at a time so the page never
 * grows into a wall of words. `topic` above a question says where a search
 * found it; `words` are marked in the question.
 */
export function Questions({ items, words = [], openFirst = false }: { items: { qa: HelpQA; topic?: string }[]; words?: string[]; openFirst?: boolean }) {
  const [open, setOpen] = useState<string | null>(openFirst && items.length ? items[0].qa.q : null);
  return (
    <View style={s.card}>
      {items.map(({ qa, topic }, i) => {
        const shown = open === qa.q;
        return (
          <View key={qa.q} style={[s.qa, i > 0 && s.rule, shown && s.qaOpen]}>
            <Press
              onPress={() => setOpen(shown ? null : qa.q)}
              accessibilityRole="button"
              accessibilityState={{ expanded: shown }}
              sink={0.985}
              style={s.question}
            >
              <View style={{ flex: 1, gap: 2 }}>
                {topic ? <Text style={s.from}>{topic}</Text> : null}
                <Marked text={qa.q} words={words} style={s.questionText} />
              </View>
              {/* Turned, not eased: only transform may change, and this one snaps. */}
              <View style={[s.chevron, shown && s.chevronOpen]}>
                <Icon name="chevronDown" size={18} color={colour.steel} strokeWidth={2.4} />
              </View>
            </Press>
            {shown ? <Answer text={qa.a} /> : null}
          </View>
        );
      })}
    </View>
  );
}

/** "Still need help?" — the office, on WhatsApp. */
export function OfficeRow() {
  return (
    <>
      <Text style={s.section} accessibilityRole="header">
        Still need help?
      </Text>
      <View style={s.rowCard}>
        <DuoRow icon="support" label="Message the office" value="On WhatsApp, 7am to 10pm" onPress={() => void Linking.openURL(OFFICE_WHATSAPP)} last />
      </View>
    </>
  );
}

export function Section({ children }: { children: ReactNode }) {
  return (
    <Text style={s.section} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** The topic's own icon, big, on the top. */
export function BigTile({ topic, pro }: { topic: HelpTopic; pro: boolean }) {
  return (
    <View style={[s.bigTile, pro && s.bigTileDark]}>
      <DuoIcon name={topic.icon} size={30} ink={pro ? colour.white : colour.ink} />
    </View>
  );
}

export const helpStyles = StyleSheet.create({
  body: { paddingHorizontal: 14, paddingTop: 16, gap: 10 },
  rowCard: { paddingHorizontal: 14, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  quiet: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.steel, textAlign: 'center', marginTop: 4 },
});

const s = StyleSheet.create({
  top: { paddingHorizontal: 16, paddingBottom: 22, borderBottomLeftRadius: 32, borderBottomRightRadius: 32, overflow: 'hidden' },
  bar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: TAP },
  back: { width: TAP, height: TAP, borderRadius: TAP / 2, backgroundColor: 'rgba(255,255,255,0.65)', alignItems: 'center', justifyContent: 'center' },
  backDark: { backgroundColor: 'rgba(255,255,255,0.16)' },
  barTitle: { fontFamily: font.display, fontSize: 17 },
  title: { fontFamily: font.display, fontSize: 30, lineHeight: 34, letterSpacing: -0.6, color: colour.ink },
  line: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 19, color: colour.onYellow, marginTop: 2 },
  lineOnGreen: { color: '#cfe3de' },
  right: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  count: { minWidth: 26, height: 26, paddingHorizontal: 8, borderRadius: 13, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: font.display, fontSize: 12, color: colour.steel, fontVariant: ['tabular-nums'] },
  section: { fontFamily: font.display, fontSize: 13, color: colour.steel, marginTop: 6, marginHorizontal: 6 },
  card: { borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card, overflow: 'hidden' },
  rowCard: { paddingHorizontal: 14, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  qa: { paddingHorizontal: 16 },
  qaOpen: { backgroundColor: '#fffbf0' },
  rule: { borderTopWidth: 1, borderTopColor: colour.rule },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 58, paddingVertical: 13 },
  from: { fontFamily: font.bodySemi, fontSize: 12, color: colour.steel },
  questionText: { fontFamily: font.displayBold, fontSize: 15.5, lineHeight: 21, color: colour.ink },
  mark: { backgroundColor: colour.softYellow },
  chevron: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  answer: { fontFamily: font.body, fontSize: 14.5, lineHeight: 22, color: colour.inkSoft, paddingBottom: 16, paddingRight: 6 },
  bold: { fontFamily: font.displayBold, color: colour.ink },
  bigTile: { width: 58, height: 58, borderRadius: 18, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0px 3px 10px rgba(20, 23, 26, 0.08)' },
  bigTileDark: { backgroundColor: 'rgba(255,255,255,0.16)', boxShadow: 'none' },
});
