import { Platform, Pressable, type PressableProps, type StyleProp, type ViewStyle } from 'react-native';
import * as Haptics from 'expo-haptics';

type Props = Omit<PressableProps, 'style'> & {
  style?: StyleProp<ViewStyle>;
  /** How far it sinks when pressed. 0.97 for cards, 0.94 for small chips. */
  sink?: number;
};

/**
 * Anything tappable. It presses in and gives a short buzz on the phone.
 *
 * Only `transform` changes on press — never a colour. A control whose text
 * colour differs between two states must not ease between them: halfway
 * through, the text and its background become the same grey and the words
 * vanish under the thumb. Learnt the hard way on the website.
 */
export function Press({ style, sink = 0.97, onPressIn, ...rest }: Props) {
  return (
    <Pressable
      {...rest}
      onPressIn={(e) => {
        if (Platform.OS !== 'web') Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
        onPressIn?.(e);
      }}
      style={({ pressed }) => [style, pressed && { transform: [{ scale: sink }] }]}
    />
  );
}
