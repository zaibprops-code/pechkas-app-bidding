import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DuoIcon, type DuoName } from './DuoIcon';
import { Press } from './Press';
import { colour, font, shadow } from '../theme';

/**
 * The two building blocks most screens are made of (docs/DESIGN.md):
 * `Panel`, a white card that says what it is with a two-tone icon on a soft
 * yellow tile, and `Action`, one square button in a row of them.
 */

export const SOFT_YELLOW = colour.softYellow;
export const SHADOW = shadow.card;

/** A white card that says what it is the way Post a job's do: a two-tone icon on a soft tile, a title, a line under it. */
export function Panel({ icon, title, hint, tone, children }: { icon?: DuoName; title?: string; hint?: string; tone?: 'money'; children?: ReactNode }) {
  return (
    <View style={[s.panel, tone === 'money' && s.panelMoney]}>
      {title ? (
        <View style={s.head}>
          {icon ? (
            <View style={[s.soft, tone === 'money' && { backgroundColor: colour.white }]}>
              <DuoIcon name={icon} size={24} />
            </View>
          ) : null}
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.title} accessibilityRole="header">
              {title}
            </Text>
            {hint ? <Text style={s.hint}>{hint}</Text> : null}
          </View>
        </View>
      ) : null}
      {children}
    </View>
  );
}

/** One square button in a row of them: a two-tone icon over a short word; the full sentence for screen readers. */
export function Action({ icon, label, full, onPress, on = false }: { icon: DuoName; label: string; full: string; onPress: () => void; on?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={full} accessibilityState={{ expanded: on }} sink={0.96} style={[s.action, on && s.actionOn]}>
      <DuoIcon name={icon} size={26} />
      <Text style={s.actionText} numberOfLines={1}>
        {label}
      </Text>
    </Press>
  );
}

const s = StyleSheet.create({
  panel: { gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  panelMoney: { backgroundColor: SOFT_YELLOW },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  soft: { width: 44, height: 44, borderRadius: 14, backgroundColor: SOFT_YELLOW, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 18, lineHeight: 23, color: colour.ink },
  hint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  action: { flex: 1, minHeight: 76, alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 4, borderRadius: 18, backgroundColor: colour.canvas },
  actionOn: { backgroundColor: SOFT_YELLOW },
  actionText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
});
