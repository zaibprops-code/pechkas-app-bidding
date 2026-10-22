import { useState } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import Svg, { Circle, Path, Rect } from 'react-native-svg';
import { colour, font } from '../theme';

/**
 * The mobile number box, as inDrive draws it: the country fixed at the
 * front, the number typed after it. Pechkas only works with Pakistani
 * numbers, so the flag is a label and not a menu — there is nothing to
 * choose, and a button that does nothing is the one thing no screen may
 * have. pakistaniMobile() accepts what is typed after "+92" with or without
 * its leading 0.
 *
 * The outline is green while typing and brick when the number is wrong; it
 * snaps, like every Field.
 */
export function PhoneBox({ error, hint, ...input }: TextInputProps & { error?: string | null; hint?: string }) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ gap: 6 }}>
      <View
        style={[
          s.box,
          {
            borderColor: error ? colour.brick : focused ? colour.green : 'rgba(20,23,26,0.16)',
            borderWidth: error || focused ? 2.5 : 1.5,
          },
        ]}
      >
        <View style={s.country} accessible accessibilityLabel="Pakistan, plus 92">
          <Flag />
          <Text style={s.code}>+92</Text>
        </View>
        <View style={s.rule} />
        <TextInput
          {...input}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          accessibilityLabel="Mobile number"
          placeholder="300 1234567"
          placeholderTextColor="#7a838a"
          keyboardType="phone-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          style={s.input}
        />
      </View>
      {error ? <Text style={s.error}>{error}</Text> : hint ? <Text style={s.hint}>{hint}</Text> : null}
    </View>
  );
}

/** The flag of Pakistan: the white band at the hoist, the crescent and the star. */
function Flag() {
  // A five-pointed star, worked out rather than typed, tilted as on the flag.
  const star = Array.from({ length: 10 }, (_, i) => {
    const r = i % 2 === 0 ? 2.5 : 1;
    const a = (Math.PI / 5) * i - Math.PI / 2 + 0.6;
    return `${(21.6 + r * Math.cos(a)).toFixed(2)},${(7.4 + r * Math.sin(a)).toFixed(2)}`;
  }).join(' ');
  return (
    <View style={s.flag}>
      <Svg width={30} height={20} viewBox="0 0 30 20" accessible={false}>
        <Rect x={0} y={0} width={7.5} height={20} fill="#ffffff" />
        <Rect x={7.5} y={0} width={22.5} height={20} fill="#01411c" />
        <Circle cx={18.4} cy={10.6} r={5.6} fill="#ffffff" />
        <Circle cx={19.9} cy={9.4} r={4.9} fill="#01411c" />
        <Path d={`M${star.replace(/ /g, ' L')} Z`} fill="#ffffff" />
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', minHeight: 62, borderRadius: 18, backgroundColor: colour.white, paddingLeft: 14 },
  country: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  flag: { width: 30, height: 20, borderRadius: 3, overflow: 'hidden', borderWidth: 0.5, borderColor: 'rgba(20,23,26,0.2)' },
  code: { fontFamily: font.bodySemi, fontSize: 19, color: colour.ink },
  rule: { width: 1, height: 26, backgroundColor: colour.rule, marginHorizontal: 12 },
  // minWidth 0: a typing box has a natural width of its own, and at 320 points it pushed the row past the screen.
  input: { flex: 1, minWidth: 0, alignSelf: 'stretch', fontFamily: font.bodyMedium, fontSize: 19, color: colour.ink, paddingRight: 14, outlineWidth: 0 },
  error: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  hint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
});
