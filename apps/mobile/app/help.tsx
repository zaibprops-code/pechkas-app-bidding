import { useState } from 'react';
import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen } from '../src/components/ui';
import { DuoIcon } from '../src/components/DuoIcon';
import { DuoRow, RowCard } from '../src/components/Rows';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { useAccount } from '../src/account';
import { openLegal } from '../src/legal';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN, OFFICE_WHATSAPP } from '../src/office';
import { colour, font } from '../src/theme';

/**
 * Help, from the menu, laid out as Settings and the menu are: the Pechkas
 * office on a green card with WhatsApp and Call as two big buttons, a few
 * common questions that open one at a time, and the written rules as rows.
 *
 * Every answer is a rule the app already keeps, in the words its own
 * screens use — nothing here promises more than the database does. A
 * number that can vary or is still undecided (the credit limit and visit
 * fee the office may set, how long the guarantee lasts) is never written
 * here: each answer points to the screen that shows the real figure.
 */

type QA = { q: string; a: string };

const CUSTOMER: QA[] = [
  {
    q: 'How do I pay?',
    a: 'In cash, to the technician, once the job is done. Your job shows the amount. Pechkas never asks you to pay inside the app.',
  },
  {
    q: 'Can I cancel a job?',
    a: 'Yes, until the technician arrives: open the job from My jobs and tap Cancel this job. Once he has arrived, call the office.',
  },
  {
    q: 'What is the start code?',
    a: 'Four numbers on your job once you have chosen a technician. Give them to him at the door, once you have seen him: they prove he is the person Pechkas sent. Never read them out on the phone.',
  },
  {
    q: 'He asks for a higher price. What now?',
    a: 'Nothing changes unless you approve. If you decline, the job stops there and you pay only the visit fee for his trip.',
  },
  {
    q: 'The fault has come back.',
    a: 'Open the job from My jobs. While it is guaranteed, tap The fault has come back, and the office arranges the repair. The date the guarantee ends is on the job.',
  },
];

const TECHNICIAN: QA[] = [
  {
    q: 'How am I paid?',
    a: 'The customer pays you in cash when the job is done. Pechkas’s fee is 10% of the labour — the price less any parts bought with a shop receipt — or 7% when you have finished a job for the same customer before.',
  },
  {
    q: 'How do I pay what I owe Pechkas?',
    a: 'My account shows what you owe and how to pay it. Only the office records a payment; what you owe goes down once they have.',
  },
  {
    q: 'Why can I not make offers?',
    a: 'While what you owe is over your limit, new offers stop until you pay. My account then says so, with both figures.',
  },
  {
    q: 'The job needs more than the agreed price.',
    a: 'On the job, tap Request a new price and send the reason and a photo. The price changes only if the customer approves. If they decline, the job stops there and they pay the visit fee.',
  },
  {
    q: 'Can I change my trades or sectors?',
    a: 'Only before you are approved. After that, ask the office.',
  },
];

export default function Help() {
  const { account } = useAccount();
  const pro = account?.role === 'pro';
  const narrow = useWindowDimensions().width < 360;
  // One answer open at a time, so the page never grows into a wall of words.
  const [open, setOpen] = useState<number | null>(null);
  const list = pro ? TECHNICIAN : CUSTOMER;

  return (
    <Screen hero={{ title: 'Help', back: true }}>
      {/* The office first: a person is the help most people want. */}
      <View style={s.office}>
        <View style={s.officeHead}>
          <View style={s.officeIcon}>
            <DuoIcon name="support" size={28} ink={colour.ink} />
          </View>
          <View style={{ flex: 1, gap: 2 }}>
            <Text style={s.officeTitle} accessibilityRole="header">
              Talk to the Pechkas office
            </Text>
            <Text style={s.officeText}>7am to 10pm, every day · {OFFICE_PHONE_SHOWN.replace(' ', ' ')}</Text>
          </View>
        </View>
        <View style={[s.buttons, narrow && s.buttonsNarrow]}>
          <View style={narrow ? null : { flex: 1 }}>
            <Button icon="whatsapp" label="WhatsApp" onPress={() => Linking.openURL(OFFICE_WHATSAPP)} />
          </View>
          <View style={narrow ? null : { flex: 1 }}>
            <Button kind="soft" icon="phone" label="Call" onPress={() => Linking.openURL(`tel:${OFFICE_PHONE}`)} />
          </View>
        </View>
      </View>

      <Text style={s.h2} accessibilityRole="header">
        Common questions
      </Text>
      <View style={s.card}>
        {list.map((item, i) => {
          const shown = open === i;
          return (
            <View key={item.q} style={i < list.length - 1 && s.rule}>
              <Press
                onPress={() => setOpen(shown ? null : i)}
                accessibilityRole="button"
                accessibilityState={{ expanded: shown }}
                sink={0.985}
                style={s.question}
              >
                <Text style={s.questionText}>{item.q}</Text>
                {/* Turned, not eased: only transform may change, and this one snaps. */}
                <View style={[s.chevron, shown && s.chevronOpen]}>
                  <Icon name="chevronDown" size={18} color={colour.ink} strokeWidth={2.4} />
                </View>
              </Press>
              {shown ? <Text style={s.answer}>{item.a}</Text> : null}
            </View>
          );
        })}
      </View>

      <RowCard>
        {pro ? (
          <DuoRow icon="doc" label="Technician agreement" onPress={() => openLegal('technician-agreement')} />
        ) : (
          <DuoRow icon="doc" label="Terms of use" onPress={() => openLegal('terms')} />
        )}
        <DuoRow icon="lock" label="Privacy policy" onPress={() => openLegal('privacy')} />
        <DuoRow icon="shield" label="Safety" value="What to do if something goes wrong" onPress={() => router.push('/safety')} last />
      </RowCard>
    </Screen>
  );
}

const s = StyleSheet.create({
  office: { gap: 16, padding: 18, borderRadius: 24, backgroundColor: colour.green },
  officeHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  officeIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: '#fff6dc', alignItems: 'center', justifyContent: 'center' },
  officeTitle: { fontFamily: font.display, fontSize: 19, lineHeight: 24, color: colour.white },
  officeText: { fontFamily: font.bodyMedium, fontSize: 13.5, lineHeight: 19, color: '#d7e6e3' },
  buttons: { flexDirection: 'row', gap: 10 },
  buttonsNarrow: { flexDirection: 'column' },
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 4, marginTop: 4, marginBottom: -6 },
  card: { paddingHorizontal: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: '0px 2px 10px rgba(20, 23, 26, 0.05)' },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 14 },
  questionText: { flex: 1, fontFamily: font.bodySemi, fontSize: 15.5, lineHeight: 21, color: colour.ink },
  chevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  answer: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: colour.inkSoft, paddingBottom: 16, paddingRight: 8 },
});
