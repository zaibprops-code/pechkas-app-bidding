import { useRef, useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { DuoIcon } from './DuoIcon';
import { Icon } from './Icon';
import { Press } from './Press';
import { ScrewSpinner } from './ScrewSpinner';
import { Button } from './ui';
import { useAccount } from '../account';
import { LEAVING_PRO, MODE_LABEL, useSwitchMode } from '../mode';
import { colour, font, radius } from '../theme';

/**
 * The button that moves between customer and technician mode — inDrive's
 * "Driver mode" at the foot of its menu. It sits at the foot of the side
 * menu and on the Me screen, and both are this one component.
 *
 * Going from technician to customer asks first, because it does more than
 * change the screen: he goes offline and his waiting offers are taken back.
 * The other way needs no question; without an application it opens one.
 * A refusal (a job still on) is shown right here, in the database's words.
 *
 * The colours never ease: the button is green with light words and stays so.
 *
 * The switch itself plays as one movement from the button (SwitchCover.tsx):
 * the button's centre is measured as it is tapped and handed to `go()`. A
 * customer with no application is not covered — that tap opens the form.
 *
 * `menu` is the menu's foot: one crisp line, "⇆ Technician mode", the
 * owner's choice over a button carrying a second line and an arrow.
 */
export function ModeSwitch({ onSwitched, pill = false, menu = false }: { onSwitched?: () => void; pill?: boolean; menu?: boolean }) {
  const { account } = useAccount();
  const m = useSwitchMode();
  const narrow = useWindowDimensions().width < 360;
  const [asking, setAsking] = useState(false);
  const hasApplied = Boolean(account?.pro);
  // Where the tapped button's centre is on the screen: the colour grows from there.
  const box = useRef<View>(null);
  const from = useRef<{ x: number; y: number } | undefined>(undefined);
  const covered = m.other === 'customer' || hasApplied;
  const measure = () =>
    new Promise<void>((done) => {
      if (!box.current || !covered) return done();
      box.current.measureInWindow((x, y, w, h) => {
        if (w > 0) from.current = { x: x + w / 2, y: y + h / 2 };
        done();
      });
    });
  const tap = () =>
    void measure().then(() => (m.other === 'customer' ? setAsking(true) : m.go(onSwitched, from.current)));
  const sub =
    m.other === 'pro'
      ? hasApplied
        ? 'Take jobs as a Pechkas technician'
        : 'Apply to work with Pechkas'
      : 'Book a repair for yourself';

  if (asking) {
    return (
      <View style={s.ask} accessibilityRole="alert">
        <Text style={s.askTitle}>Switch to {MODE_LABEL.customer.toLowerCase()}?</Text>
        <Text style={s.askText}>{LEAVING_PRO}</Text>
        {m.why ? <Text style={s.why}>{m.why}</Text> : null}
        <Button kind="green" label="Switch" busy={m.busy} onPress={() => m.go(onSwitched, from.current)} />
        <Button kind="outline" label="Stay a technician" onPress={() => { m.clear(); setAsking(false); }} />
      </View>
    );
  }

  // The foot of the menu: one crisp yellow button, as inDrive's "Driver mode".
  if (menu) {
    return (
      <View style={{ gap: 8 }}>
        <View ref={box} collapsable={false}>
          <Press
            onPress={tap}
            accessibilityRole="button"
            accessibilityLabel={`${m.label}. ${sub}`}
            accessibilityState={{ busy: m.busy }}
            sink={0.97}
            style={s.menu}
          >
            <DuoIcon name="swap" size={22} />
            <Text style={s.menuText} numberOfLines={1}>
              {m.label}
            </Text>
          </Press>
        </View>
        {m.why ? <Text style={s.why}>{m.why}</Text> : null}
      </View>
    );
  }

  // Settings: the yellow button with a line saying what the other side is for.
  if (pill) {
    return (
      <View style={{ gap: 8 }}>
        <View ref={box} collapsable={false}>
        <Press
          onPress={tap}
          accessibilityRole="button"
          accessibilityLabel={`${m.label}. ${sub}`}
          accessibilityState={{ busy: m.busy }}
          sink={0.97}
          style={s.pill}
        >
          {m.busy ? (
            <ScrewSpinner size={24} />
          ) : (
            <View style={s.pillRow}>
              <View style={[s.pillIcon, narrow && s.pillIconNarrow]}>
                <Icon name="swap" size={narrow ? 18 : 20} color={colour.ink} strokeWidth={2.2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[s.pillText, narrow && { fontSize: 17 }]} numberOfLines={1}>
                  {m.label}
                </Text>
                <Text style={s.pillSub}>{sub}</Text>
              </View>
              {/* On a narrow phone the words need the room more than the arrow does. */}
              {narrow ? null : <Icon name="arrowRight" size={20} color={colour.ink} strokeWidth={2.2} />}
            </View>
          )}
        </Press>
        </View>
        {m.why ? <Text style={s.why}>{m.why}</Text> : null}
      </View>
    );
  }

  return (
    <View style={{ gap: 8 }}>
      <View ref={box} collapsable={false}>
      <Press
        onPress={tap}
        accessibilityRole="button"
        accessibilityLabel={`${m.label}. ${sub}`}
        accessibilityState={{ busy: m.busy }}
        sink={0.97}
        style={s.button}
      >
        <View style={s.icon}>
          {m.busy ? <ScrewSpinner size={24} /> : <Icon name={m.other === 'pro' ? 'tool' : 'home'} size={20} color={colour.green} strokeWidth={2} />}
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.label}>{m.label}</Text>
          <Text style={s.sub}>{sub}</Text>
        </View>
        <Icon name="arrowRight" size={20} color={colour.paper} strokeWidth={2.2} />
      </Press>
      </View>
      {m.why ? <Text style={s.why}>{m.why}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  menu: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10, minHeight: 54, paddingHorizontal: 16, borderRadius: 16, backgroundColor: colour.yellow },
  menuText: { flexShrink: 1, fontFamily: font.display, fontSize: 16, color: colour.ink },
  pill: { minHeight: 64, borderRadius: 18, backgroundColor: colour.yellow, justifyContent: 'center', paddingHorizontal: 14, paddingVertical: 10 },
  pillRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  pillIconNarrow: { width: 34, height: 34, borderRadius: 10 },
  pillIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: 'rgba(20, 23, 26, 0.08)', alignItems: 'center', justifyContent: 'center' },
  pillText: { fontFamily: font.displayBold, fontSize: 18, color: colour.ink },
  pillSub: { fontFamily: font.body, fontSize: 13, color: colour.inkSoft },
  button: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 10, paddingHorizontal: 12, borderRadius: radius.big, backgroundColor: colour.green },
  icon: { width: 40, height: 40, borderRadius: 20, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  label: { fontFamily: font.bodySemi, fontSize: 17, color: colour.paper },
  sub: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.paper },
  ask: { gap: 10, padding: 14, borderRadius: radius.big, backgroundColor: colour.canvas },
  askTitle: { fontFamily: font.display, fontSize: 18, color: colour.ink },
  askText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.ink },
  why: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.brick },
});
