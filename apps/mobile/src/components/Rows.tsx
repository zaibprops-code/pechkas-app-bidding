import type { ReactNode } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { DuoIcon, type DuoName } from './DuoIcon';
import { Icon } from './Icon';
import { Press } from './Press';
import { colour, font, shadow } from '../theme';

/**
 * Settings-style rows the way the menu draws them: a two-tone icon on a soft
 * yellow tile, the words, and a chevron when the row does something. The
 * one that cannot be undone is brick, tile and words alike. Settings and
 * Help use them, inside a `RowCard`.
 */
export function RowCard({ children }: { children: ReactNode }) {
  return <View style={s.card}>{children}</View>;
}

export function DuoRow({
  icon,
  label,
  value,
  onPress,
  right,
  danger = false,
  last = false,
  oneLine = false,
}: {
  icon: DuoName;
  label: string;
  value?: string;
  onPress?: () => void;
  right?: ReactNode;
  danger?: boolean;
  last?: boolean;
  /** An email address has no place to break, so it stays on one line, shortened in the middle if it must be. */
  oneLine?: boolean;
}) {
  const body = (
    <>
      <View style={[s.tile, danger && s.tileDanger]}>
        <DuoIcon name={icon} size={22} accent={danger ? '#f3b9a8' : colour.yellow} ink={danger ? colour.brick : colour.ink} />
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <Text style={[s.label, danger && { color: colour.brick }]}>{label}</Text>
        {value ? (
          <Text style={s.value} numberOfLines={oneLine ? 1 : undefined} ellipsizeMode="middle">
            {value}
          </Text>
        ) : null}
      </View>
      {right ?? (onPress ? <Icon name="chevronRight" size={18} color="#9aa1a6" strokeWidth={2.2} /> : null)}
    </>
  );
  const style = [s.row, !last && s.rule];
  return onPress ? (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={value ? `${label}, ${value}` : label} sink={0.985} style={style}>
      {body}
    </Press>
  ) : (
    <View style={style}>{body}</View>
  );
}

const s = StyleSheet.create({
  card: { paddingHorizontal: 14, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  row: { flexDirection: 'row', alignItems: 'center', gap: 14, minHeight: 68, paddingVertical: 12 },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  tile: { width: 42, height: 42, borderRadius: 14, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  tileDanger: { backgroundColor: colour.softBrick },
  label: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  value: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
});
