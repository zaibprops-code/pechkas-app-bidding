import { useState } from 'react';
import { Linking, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { router } from 'expo-router';
import { Button, Screen } from '../src/components/ui';
import { DuoIcon } from '../src/components/DuoIcon';
import { DuoRow, RowCard } from '../src/components/Rows';
import { Icon } from '../src/components/Icon';
import { Press } from '../src/components/Press';
import { useAccount } from '../src/account';
import { OFFICE_PHONE, OFFICE_PHONE_SHOWN, OFFICE_WHATSAPP } from '../src/office';
import { colour, font, shadow } from '../src/theme';

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
    a: 'Straight to the technician, in cash or by JazzCash or Easypaisa, once you have checked the work. Your job shows the amount. Pechkas never asks you to pay inside the app.',
  },
  {
    q: 'He says the work is finished. What now?',
    a: 'Check it before you pay. Your job shows Yes, it works and Not finished yet. If it is not finished, choose why; he is told and puts it right. If you say so twice, Pechkas looks at both sides’ photos and decides. If you do nothing for 24 hours, it counts as finished.',
  },
  {
    q: 'Can I cancel a job?',
    a: 'Yes, and it is always free. Open the job from My jobs and tap Cancel this job, or, with him at your door, I no longer need this service. Once you have given him the start code, call the office. If he is more than 30 minutes late, cancelling never counts against you.',
  },
  {
    q: 'My technician is late or cannot come.',
    a: 'If he cannot come, your job goes straight back to other checked technicians, with everything you posted, and you are told. If he is late or says he is running late, open the job and tap Find another technician: the same job goes to others and nothing is charged. You never have to post it again.',
  },
  {
    q: 'He says nobody answered the door.',
    a: 'If nobody answers, he asks Pechkas to tell you, and you can tap I am coming or cancel. If he then reports it, the job closes and nothing is charged to you. If you were home, open the job within 24 hours and tap I was home: the office looks at both sides.',
  },
  {
    q: 'What is the start code?',
    a: 'Four numbers on your job once you have chosen a technician. Give them to him at the door, once you have seen him: they prove he is the person Pechkas sent. Never read them out on the phone.',
  },
  {
    q: 'He asks for a higher price. What now?',
    a: 'He can only ask once you have given him the start code and he has looked. Nothing changes unless you approve. If you decline, the job stops there and you pay only the visit fee, which the job shows before you choose him.',
  },
  {
    q: 'When do I pay a visit fee?',
    a: 'Only when the technician came, looked, asked a new price, and you said no. Never when the repair goes ahead, never if he does not arrive, and never for a guarantee visit. If you think a fee is wrong, open the job and tap I disagree with this fee within 24 hours.',
  },
  {
    q: 'The fault has come back.',
    a: 'Open the job from My jobs. While it is guaranteed — 30 days for repairs and installations, 7 for services, and the end date is on the job — tap It has failed again, describe it and add a photo or video. He has 24 hours to answer and must come back within 48 hours. If he does not, Pechkas sends another technician and pays for the repair.',
  },
  {
    q: 'Pechkas asks me about a payment.',
    a: 'The technician has told Pechkas he was not paid in full. Open the job and answer once: That\u2019s right, if you still owe it, or I have paid, with a few words and a screenshot if you have one. If you say that is right, you cannot post a new job until it is paid. If you say you paid, or do not answer in 3 days, the Pechkas office looks at it, and you can post jobs meanwhile. Your guarantee is not affected.',
  },
];

const TECHNICIAN: QA[] = [
  {
    q: 'How am I paid?',
    a: 'The customer pays you directly once they have checked the work: tap Work finished, and they confirm it. Pechkas’s fee is 10% of the labour — the price less any parts bought with a shop receipt — or 7% when you have finished a job for the same customer before.',
  },
  {
    q: 'How do I pay what I owe Pechkas?',
    a: 'My account shows what you owe, each fee\u2019s due date and where to send the money. Each fee is due 14 days after the job, with 3 days of grace; after that your new offers stop until it is paid, with no fee or interest. After paying, tap I have paid there and add the transaction ID and a screenshot: while the office checks it, that amount counts as paid. What you owe goes down once the office confirms the money arrived.',
  },
  {
    q: 'Why can I not make offers?',
    a: 'While what you owe is over your limit, or a fee is past its grace days, new offers stop until you pay; My account then says so. They also stop while a guarantee claim on your work is left unanswered: answer it under Guarantee claims. The office can also pause your new offers for a few days, with its reason; jobs you already have go on, and the pause ends by itself.',
  },
  {
    q: 'The job needs more than the agreed price.',
    a: 'Once the customer has given you the start code and you have looked, tap Request a new price and send the reason and a photo. The price changes only if the customer approves. If they decline, the job stops there and they pay you the visit fee, all of it yours. Collect it before you leave, then tap I was paid or Not paid. On a guarantee repair the Pechkas office answers instead.',
  },
  {
    q: 'The customer says it is not finished.',
    a: 'Your job shows their reason and any photo. Put it right, take a new photo and tap Work finished again; you can answer them in one line. If they say it twice, Pechkas looks at both sides’ photos and decides. A short video of it working at the finish protects you.',
  },
  {
    q: 'A guarantee claim on my work.',
    a: 'Open Guarantee claims from the menu. Answer within 24 hours: I’ll come, with a time within 48 hours, or This isn’t my work, with a reason for Pechkas to decide. If you do not answer or miss the visit, your new offers stop and another technician is sent; the cost may be charged to you, never more than your labour on the job. You are told the amount first and have 7 days to appeal before it is added to what you owe.',
  },
  {
    q: 'Nobody answers at the door.',
    a: 'Call the customer first. 15 minutes after you tapped I have arrived (and once your time has begun), tap Nobody is answering, or straight away The guard will not let me in: Pechkas tells her, and she has 10 minutes, or 10 more if she says she is coming. Then you can report it. Your location is checked again; if it cannot be verified, add a photo of the gate or door. The job closes, and the office checks every report. Nothing is charged or paid.',
  },
  {
    q: 'Why does Pechkas check my location?',
    a: 'Only twice, and only when you tap: I have arrived, and a nobody-home report. Pechkas compares where your phone is with the customer\'s pin, so a real arrival is shown to the customer as verified. It never follows you in the background. If the check fails (a weak signal, a wrong pin), tap Check my location again at the door; the start code also confirms you were there, and nothing happens to you automatically.',
  },
  {
    q: 'What if I am late?',
    a: 'Arriving more than 30 minutes after your time begins is recorded as late, and not arriving at all is checked by the office. If you are held up, tap I\u2019m running late on the job and say when you will be there; if you cannot come at all, tap I can\u2019t come before you arrive, and the job goes back to others. Doing it within 2 hours of your time is a late withdrawal. You can see every record under My account and tell the office if one is wrong. Nothing happens on its own.',
  },
  {
    q: 'The customer did not pay me in full.',
    a: 'Up to 7 days after the job counts as finished, open My account and tap Report a payment problem: Not paid at all, or Paid less with what you received. Pechkas asks the customer, and your commission on that job is held, so it counts towards nothing you owe. You can change the amount until they answer. When you are paid the rest, tap I have now been paid in full. Commission is only ever charged on the work you were actually paid for.',
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
        <DuoRow icon="doc" label="Legal documents" value="Privacy policy, terms and the technician agreement" onPress={() => router.push('/legal')} />
        <DuoRow icon="shield" label="Safety" value="What to do if something goes wrong" onPress={() => router.push('/safety')} last />
      </RowCard>
    </Screen>
  );
}

const s = StyleSheet.create({
  office: { gap: 16, padding: 18, borderRadius: 24, backgroundColor: colour.green },
  officeHead: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  officeIcon: { width: 52, height: 52, borderRadius: 18, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  officeTitle: { fontFamily: font.display, fontSize: 19, lineHeight: 24, color: colour.white },
  officeText: { fontFamily: font.bodyMedium, fontSize: 13.5, lineHeight: 19, color: '#d7e6e3' },
  buttons: { flexDirection: 'row', gap: 10 },
  buttonsNarrow: { flexDirection: 'column' },
  h2: { fontFamily: font.display, fontSize: 19, color: colour.ink, paddingHorizontal: 4, marginTop: 4, marginBottom: -6 },
  card: { paddingHorizontal: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  question: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 60, paddingVertical: 14 },
  questionText: { flex: 1, fontFamily: font.bodySemi, fontSize: 15.5, lineHeight: 21, color: colour.ink },
  chevron: { width: 32, height: 32, borderRadius: 16, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  chevronOpen: { transform: [{ rotate: '180deg' }] },
  answer: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: colour.inkSoft, paddingBottom: 16, paddingRight: 8 },
});
