import { View } from 'react-native';
import { Icon } from './Icon';
import { Press } from './Press';
import { colour } from '../theme';

/**
 * One to five stars. With `onPick` they are five buttons, each 44 wide;
 * without, they only show a rating somebody actually gave.
 */
export function Stars({ value, onPick, size = 32, dark = false, label = 'stars' }: { value: number; onPick?: (n: number) => void; size?: number; dark?: boolean; label?: string }) {
  // Yellow on paper is too faint to see a star's shape, so the light side
  // uses green; the dark side, yellow.
  const on = dark ? colour.yellow : colour.green;
  const off = dark ? '#6b757d' : colour.steel;
  return (
    <View style={{ flexDirection: 'row', gap: onPick ? 0 : 2 }} accessibilityRole={onPick ? 'radiogroup' : 'image'} accessibilityLabel={onPick ? label : `${value} of 5 ${label}`}>
      {[1, 2, 3, 4, 5].map((n) =>
        onPick ? (
          <Press
            key={n}
            onPress={() => onPick(n)}
            sink={0.9}
            accessibilityRole="radio"
            accessibilityLabel={`${n}`}
            accessibilityState={{ selected: value === n }}
            style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}
          >
            <Icon name="star" size={size} color={n <= value ? on : off} filled={n <= value} strokeWidth={1.6} />
          </Press>
        ) : (
          <Icon key={n} name="star" size={size} color={n <= value ? on : off} filled={n <= value} strokeWidth={1.6} />
        ),
      )}
    </View>
  );
}
