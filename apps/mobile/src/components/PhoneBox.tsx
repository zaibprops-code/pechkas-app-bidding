import { useState } from 'react';
import { StyleSheet, Text, TextInput, useWindowDimensions, View, type TextInputProps } from 'react-native';
import { pakistaniMobile, typedMobile } from '@pechkas/shared';
import { authBox } from './AuthScreen';
import { Icon } from './Icon';
import { Press } from './Press';
import { Pop } from './SignInArt';
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
 *
 * What is typed is shown grouped 3-3-4 (typedMobile(): digits only, a
 * leading 0 or a pasted +92 dropped), and the keypad is the plain digits one
 * — the dialler's + * # have nothing to do here, since +92 is fixed.
 *
 * `big` is the sign-in screens' look (AuthScreen): big type in the soft grey
 * box, white with an ink outline while typing, and a green tick that pops in
 * (Pop) in place of the clear button once the number is a whole Pakistani
 * mobile number.
 */
export function PhoneBox({ error, hint, big = false, ...input }: TextInputProps & { error?: string | null; hint?: string; big?: boolean }) {
  const [focused, setFocused] = useState(false);
  const value = typeof input.value === 'string' ? input.value : '';
  const whole = Boolean(pakistaniMobile(value));
  const change = (t: string) => input.onChangeText?.(typedMobile(t));
  // Under 360 points the whole "300 111 2222" must still fit beside +92 and the tick.
  const narrow = useWindowDimensions().width < 360;
  if (big) {
    return (
      <View style={[s.box, s.bigBox, authBox.box, error ? authBox.bad : focused ? authBox.focused : value ? authBox.filled : null]}>
        <View style={s.country} accessible accessibilityLabel="Pakistan, plus 92">
          <Flag />
          <Text style={s.code}>+92</Text>
        </View>
        <View style={s.rule} />
        <TextInput
          {...input}
          onChangeText={change}
          onFocus={(e) => {
            setFocused(true);
            input.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            input.onBlur?.(e);
          }}
          accessibilityLabel="Mobile number"
          placeholder="3XX XXX XXXX"
          placeholderTextColor="#a59d88"
          keyboardType="number-pad"
          textContentType="telephoneNumber"
          autoComplete="tel"
          maxLength={20}
          underlineColorAndroid="transparent"
          style={[s.input, s.bigInput, narrow && s.bigNarrow]}
        />
        {whole ? (
          <Pop style={s.tick}>
            <View accessible accessibilityLabel="A whole mobile number">
              <Icon name="check" size={15} color={colour.white} strokeWidth={3} />
            </View>
          </Pop>
        ) : value ? (
          <Press onPress={() => input.onChangeText?.('')} accessibilityRole="button" accessibilityLabel="Clear the number" hitSlop={10} sink={0.9} style={s.clear}>
            <Icon name="cross" size={14} color={colour.white} strokeWidth={3} />
          </Press>
        ) : null}
      </View>
    );
  }
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
          onChangeText={change}
          accessibilityLabel="Mobile number"
          placeholder="300 1234567"
          placeholderTextColor="#7a838a"
          keyboardType="number-pad"
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
  bigBox: { minHeight: 66, paddingRight: 12 },
  bigInput: { fontFamily: font.bodySemi, fontSize: 22, letterSpacing: 0.6, fontVariant: ['tabular-nums'] },
  bigNarrow: { fontSize: 19, letterSpacing: 0, paddingRight: 6 },
  tick: { width: 28, height: 28, borderRadius: 14, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  clear: { width: 24, height: 24, borderRadius: 12, backgroundColor: '#c9cdd1', alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
  hint: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
});
