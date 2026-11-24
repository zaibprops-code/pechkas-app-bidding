import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { pkNow } from '@pechkas/shared';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { colour, font } from '../theme';

/**
 * Choosing any two days, for "When" on My jobs → Past (the owner's choice,
 * 24 November 2026): tap the first day, then the last; the days between are
 * shaded. Quick choices sit above it — This month, Last 3 months, This year,
 * Last year — and the month's name opens every month of a year at once, so
 * last year is one tap away, not twelve. Small green dots mark the days she
 * had a job (from my_history_facets(), her own jobs only).
 *
 * Days are Pakistan's (pkNow), as YYYY-MM-DD strings, never the phone's
 * clock or time zone. Nothing moves: a day's colour snaps.
 */

export type Range = { from: string | null; to: string | null };

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const SHORT = MONTHS.map((m) => m.slice(0, 3));

const iso = (y: number, m: number, d: number) => `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const parts = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return { y, m: m - 1, d };
};
const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
/** Monday is the first day of the week, as on calendars in Pakistan. */
const firstDow = (y: number, m: number) => (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;

/** "5 Jun 2026" */
export function dayText(s: string): string {
  const { y, m, d } = parts(s);
  return `${d} ${SHORT[m]} ${y}`;
}

/** "5 Jun – 20 Jun 2026", "This month" and the like, for the tag on the list. */
export function rangeText(r: Range): string {
  if (!r.from && !r.to) return 'Any time';
  if (r.from && !r.to) return `From ${dayText(r.from)}`;
  if (!r.from && r.to) return `Until ${dayText(r.to)}`;
  const a = parts(r.from as string);
  const b = parts(r.to as string);
  if (r.from === r.to) return dayText(r.from as string);
  return a.y === b.y ? `${a.d} ${SHORT[a.m]} – ${dayText(r.to as string)}` : `${dayText(r.from as string)} – ${dayText(r.to as string)}`;
}

/** The quick choices, worked out on Pakistan's clock. */
export function presets(): { label: string; range: Range }[] {
  const today = pkNow().date;
  const { y, m } = parts(today);
  const back3 = new Date(Date.UTC(y, m - 2, 1));
  return [
    { label: 'This month', range: { from: iso(y, m, 1), to: today } },
    { label: 'Last 3 months', range: { from: iso(back3.getUTCFullYear(), back3.getUTCMonth(), 1), to: today } },
    { label: 'This year', range: { from: iso(y, 0, 1), to: today } },
    { label: 'Last year', range: { from: iso(y - 1, 0, 1), to: iso(y - 1, 11, 31) } },
  ];
}

export function RangeCalendar({ value, onChange, days, since }: { value: Range; onChange: (r: Range) => void; days: Set<string>; since: string | null }) {
  const { width } = useWindowDimensions();
  const today = pkNow().date;
  const start = parts(value.to ?? value.from ?? today);
  const [shown, setShown] = useState({ y: start.y, m: start.m });
  const [months, setMonths] = useState(false);
  const first = since ? parts(since) : parts(today);
  const last = parts(today);
  const canBack = shown.y * 12 + shown.m > first.y * 12 + first.m;
  const canOn = shown.y * 12 + shown.m < last.y * 12 + last.m;
  const move = (n: number) => {
    const t = new Date(Date.UTC(shown.y, shown.m + n, 1));
    setShown({ y: t.getUTCFullYear(), m: t.getUTCMonth() });
  };
  const tap = (d: string) => {
    if (!value.from || value.to) onChange({ from: d, to: null });
    else if (d < value.from) onChange({ from: d, to: null });
    else onChange({ from: value.from, to: d });
  };
  // Seven days across whatever the phone: the sheet's sides come off first.
  const cell = Math.floor((Math.min(width, 520) - 48) / 7);

  if (months) {
    const years: number[] = [];
    for (let y = last.y; y >= first.y; y--) years.push(y);
    const hasJobs = (y: number, m: number) => [...days].some((d) => d.startsWith(`${y}-${String(m + 1).padStart(2, '0')}`));
    return (
      <View>
        <View style={s.monthsHead}>
          <Press onPress={() => setMonths(false)} accessibilityRole="button" accessibilityLabel="Back to the calendar" sink={0.9} style={s.round}>
            <Icon name="arrowLeft" size={20} color={colour.ink} strokeWidth={2.2} />
          </Press>
          <View style={{ flex: 1 }}>
            <Text style={s.monthsTitle}>Go to a month</Text>
            <Text style={s.small}>Yellow months have jobs</Text>
          </View>
        </View>
        <View style={s.years}>
          {years.map((y) => (
            <Press key={y} onPress={() => setShown({ y, m: shown.m })} accessibilityRole="radio" accessibilityState={{ selected: y === shown.y }} sink={0.95} style={[s.year, y === shown.y && s.yearOn]}>
              <Text style={[s.yearText, y === shown.y && s.yearTextOn]}>{y}</Text>
            </Press>
          ))}
        </View>
        <View style={s.monthGrid}>
          {SHORT.map((name, m) => {
            const future = shown.y * 12 + m > last.y * 12 + last.m;
            const before = shown.y * 12 + m < first.y * 12 + first.m;
            const on = m === shown.m;
            const full = hasJobs(shown.y, m);
            return (
              <Press
                key={name}
                disabled={future || before}
                onPress={() => {
                  setShown({ y: shown.y, m });
                  setMonths(false);
                }}
                accessibilityRole="button"
                accessibilityLabel={`${MONTHS[m]} ${shown.y}${full ? ', has jobs' : ''}`}
                sink={0.95}
                style={[s.monthCell, full && s.monthFull, on && s.monthOn, (future || before) && s.monthOff]}
              >
                <Text style={[s.monthText, on && s.monthTextOn, (future || before) && s.monthTextOff]}>{name}</Text>
              </Press>
            );
          })}
        </View>
      </View>
    );
  }

  const count = daysIn(shown.y, shown.m);
  const lead = firstDow(shown.y, shown.m);
  const cells: (string | null)[] = [...Array(lead).fill(null)];
  for (let d = 1; d <= count; d++) cells.push(iso(shown.y, shown.m, d));
  while (cells.length % 7) cells.push(null);

  return (
    <View>
      <View style={s.nav}>
        <Press onPress={() => move(-1)} disabled={!canBack} accessibilityRole="button" accessibilityLabel="The month before" sink={0.9} style={[s.round, !canBack && { opacity: 0.35 }]}>
          <Icon name="chevronLeft" size={20} color={colour.ink} strokeWidth={2.4} />
        </Press>
        <Press onPress={() => setMonths(true)} accessibilityRole="button" accessibilityLabel={`${MONTHS[shown.m]} ${shown.y}. Choose another month`} sink={0.96} style={s.monthName}>
          <Text style={s.monthNameText}>
            {MONTHS[shown.m]} {shown.y}
          </Text>
          <Icon name="chevronDown" size={18} color={colour.ink} strokeWidth={2.4} />
        </Press>
        <Press onPress={() => move(1)} disabled={!canOn} accessibilityRole="button" accessibilityLabel="The month after" sink={0.9} style={[s.round, !canOn && { opacity: 0.35 }]}>
          <Icon name="chevronRight" size={20} color={colour.ink} strokeWidth={2.4} />
        </Press>
      </View>
      <View style={s.week}>
        {['M', 'T', 'W', 'T', 'F', 'S', 'S'].map((d, i) => (
          <Text key={i} style={[s.weekDay, { width: cell }]}>
            {d}
          </Text>
        ))}
      </View>
      <View style={s.grid}>
        {cells.map((d, i) => {
          if (!d) return <View key={`e${i}`} style={{ width: cell, height: 44 }} />;
          const future = d > today;
          const end = d === value.from || d === value.to;
          const between = Boolean(value.from && value.to && d > value.from && d < value.to);
          const startCap = d === value.from && value.to && value.to !== value.from;
          const endCap = d === value.to && value.from && value.to !== value.from;
          return (
            <View key={d} style={[{ width: cell, height: 44, justifyContent: 'center', alignItems: 'center' }, between && s.band, startCap && s.bandStart, endCap && s.bandEnd]}>
              <Press
                onPress={() => tap(d)}
                disabled={future}
                accessibilityRole="button"
                accessibilityState={{ selected: end }}
                accessibilityLabel={`${dayText(d)}${days.has(d) ? ', you had a job' : ''}`}
                sink={0.9}
                style={[s.day, end && s.dayOn]}
              >
                <Text style={[s.dayText, end && s.dayTextOn, future && s.dayTextOff]}>{parts(d).d}</Text>
                {days.has(d) ? <View style={[s.dot, end && s.dotOn]} /> : null}
              </Press>
            </View>
          );
        })}
      </View>
      <View style={s.legend}>
        <View style={s.keyDot} />
        <Text style={s.small}>A day you had a job</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  nav: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 14, marginBottom: 8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  monthName: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 44, paddingHorizontal: 10 },
  monthNameText: { fontFamily: font.display, fontSize: 16.5, color: colour.ink },
  week: { flexDirection: 'row', marginBottom: 2 },
  weekDay: { textAlign: 'center', fontFamily: font.bodySemi, fontSize: 12, color: colour.steel },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  band: { backgroundColor: colour.softYellow },
  bandStart: { backgroundColor: colour.softYellow, borderTopLeftRadius: 22, borderBottomLeftRadius: 22 },
  bandEnd: { backgroundColor: colour.softYellow, borderTopRightRadius: 22, borderBottomRightRadius: 22 },
  day: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colour.ink },
  dayText: { fontFamily: font.bodySemi, fontSize: 14.5, color: colour.ink },
  dayTextOn: { fontFamily: font.display, color: colour.white },
  dayTextOff: { color: '#b4babe' },
  dot: { position: 'absolute', bottom: 4, width: 5, height: 5, borderRadius: 3, backgroundColor: colour.green },
  dotOn: { backgroundColor: colour.yellow },
  keyDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colour.green },
  legend: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8, paddingLeft: 10 },
  small: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel, paddingLeft: 4 },
  monthsHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 6 },
  monthsTitle: { fontFamily: font.display, fontSize: 19, color: colour.ink },
  years: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  year: { minHeight: 44, paddingHorizontal: 18, borderRadius: 22, backgroundColor: colour.canvas, justifyContent: 'center' },
  yearOn: { backgroundColor: colour.green },
  yearText: { fontFamily: font.display, fontSize: 14.5, color: colour.ink },
  yearTextOn: { color: colour.white },
  monthGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  monthCell: { width: '23%', flexGrow: 1, height: 52, borderRadius: 16, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  monthFull: { backgroundColor: colour.softYellow },
  monthOn: { backgroundColor: colour.ink },
  monthOff: { backgroundColor: colour.canvas },
  monthText: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  monthTextOn: { color: colour.white },
  monthTextOff: { color: '#b4babe' },
});
