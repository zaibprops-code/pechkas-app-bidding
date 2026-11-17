import { Share, StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import { Button } from '../components/ui';
import { Panel } from '../components/Panel';
import { fill, type ProWords } from '../words';
import { colour, font, radius } from '../theme';

/**
 * Launch offers, on My account (the owner's decision D38, A99–A101).
 *
 * The launch rate: 5% of the labour instead of 10% (or 7%), from his 3rd
 * good first job in a trade, until 90 days after that trade is approved,
 * never more than 12 months after the 3rd good job; only for technicians
 * who applied by the cut-off day. Every figure here is read from
 * my_launch(): nothing is worked out on the phone.
 *
 * His code, and "Tell a technician": a WhatsApp message in Urdu and English
 * that says plainly he gets a small credit. The button is drawn only once
 * the office has typed the app's store link, so it never sends a broken
 * link, and the 5% lines go only while the offer is open.
 */

export type LaunchTrade = {
  trade: string;
  name: string;
  good: number;
  third_good_at: string | null;
  approved_at: string | null;
  until: string | null;
  on: boolean;
};
export type BroughtIn = { name: string; status: 'pending' | 'earned' | 'over_cap'; earn_at: string | null; earned_at: string | null; good: number | null };
export type Launch = {
  ok: boolean;
  cutoff: string | null;
  eligible: boolean;
  bps: number;
  days: number;
  trades: LaunchTrade[];
  code: string | null;
  referred_by_code: string | null;
  can_change_code: boolean;
  credit_paisa: number;
  cap: number;
  earned: number;
  promo_free_paisa: number;
  brought_in: BroughtIn[];
  app_link: string | null;
};

/** "12 Mar" for the last day of something that ends at midnight after it. */
const lastDay = (iso: string) => new Date(new Date(iso).getTime() - 1).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });
const day = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Asia/Karachi' });

/** The cut-off day in both languages, from "2027-05-31". Urdu month names are part of the draft the native speaker checks. */
const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_UR = ['جنوری', 'فروری', 'مارچ', 'اپریل', 'مئی', 'جون', 'جولائی', 'اگست', 'ستمبر', 'اکتوبر', 'نومبر', 'دسمبر'];
const cutoffParts = (d: string) => {
  const [, m, dd] = d.slice(0, 10).split('-').map(Number);
  return { en: `${dd} ${MONTHS_EN[m - 1]}`, ur: `${dd} ${MONTHS_UR[m - 1]}` };
};
/** Is the offer still open to somebody applying today (Pakistan's calendar)? */
const stillOpen = (cutoff: string | null) =>
  Boolean(cutoff) && new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Karachi' }) <= (cutoff as string).slice(0, 10);

/** The WhatsApp message: Urdu first, then English, one message. */
export function shareMessage(l: Launch, w: ProWords): string {
  const code = l.code ?? '';
  const link = l.app_link ?? '';
  const credit = l.earned < l.cap; // Once he has had all his credits, the message stops promising one.
  const open = stillOpen(l.cutoff);
  const date = l.cutoff ? cutoffParts(l.cutoff) : null;
  const pct = Math.round(l.bps / 100);
  const ur = [
    w.shareUrIntro,
    [fill(w.shareUrCode, { code }), credit ? w.shareUrCredit : ''].filter(Boolean).join(' '),
    open && date ? fill(w.shareUrLaunch, { date: date.ur, pct }) : '',
    fill(w.shareUrLink, { link }),
  ];
  const en = [
    w.shareEnIntro,
    [fill(w.shareEnCode, { code }), credit ? w.shareEnCredit : ''].filter(Boolean).join(' '),
    open && date ? fill(w.shareEnLaunch, { date: date.en, pct }) : '',
    fill(w.shareEnLink, { link }),
  ];
  return [...ur.filter(Boolean), '', ...en.filter(Boolean)].join('\n');
}

/** His launch rate, trade by trade. Drawn only for a technician the offer covers. */
export function LaunchCard({ l, w }: { l: Launch; w: ProWords }) {
  if (!l.eligible || l.trades.length === 0) return null;
  const pct = Math.round(l.bps / 100);
  return (
    <Panel icon="tag" title={w.launchTitle}>
      <Text style={s.body}>{fill(w.launchRule, { pct, days: l.days })}</Text>
      {l.trades.map((t) => {
        const ended = t.until && !t.on && t.good >= 3 && new Date(t.until).getTime() <= Date.now();
        const line = t.on && t.until
          ? fill(w.launchOn, { pct, date: lastDay(t.until) })
          : ended && t.until
            ? fill(w.launchEnded, { date: lastDay(t.until) })
            : t.third_good_at && t.good < 3
              ? fill(w.launchPaused, { n: t.good })
              : fill(w.launchWaiting, { n: Math.min(t.good, 3) });
        return (
          <View key={t.trade} style={s.row}>
            <Text style={s.label}>{t.name}</Text>
            <Text style={[s.value, t.on && { color: colour.green }]}>{line}</Text>
          </View>
        );
      })}
    </Panel>
  );
}

/** His code, who he brought in, and the "Tell a technician" button. */
export function ReferralCard({ l, w }: { l: Launch; w: ProWords }) {
  if (!l.code) return null;
  const tell = () => void Share.share({ message: shareMessage(l, w) }).catch(() => {});
  return (
    <Panel icon="share" title={w.referTitle}>
      <Text style={s.body}>{fill(w.referRule, { amount: rupees(l.credit_paisa), cap: l.cap })}</Text>
      <View style={s.codeBox}>
        <Text style={s.codeLabel}>{w.referYourCode}</Text>
        <Text selectable style={s.code} accessibilityLabel={fill(w.referCodeA11y, { code: l.code.split('').join(' ') })}>
          {l.code}
        </Text>
      </View>
      {l.app_link ? <Button icon="share" label={w.referTell} onPress={tell} /> : <Text style={s.small}>{w.referNoLink}</Text>}
      {l.earned >= l.cap ? <Text style={s.small}>{fill(w.referCapReached, { cap: l.cap })}</Text> : null}
      {l.brought_in.length ? (
        <View style={s.list}>
          {l.brought_in.map((b, i) => (
            <View key={`${b.name}-${i}`} style={s.row}>
              <Text style={s.label}>{b.name}</Text>
              <Text style={[s.value, b.status === 'earned' && { color: colour.green }]}>
                {b.status === 'earned' && b.earned_at
                  ? fill(w.referEarned, { amount: rupees(l.credit_paisa), date: day(b.earned_at) })
                  : b.status === 'over_cap'
                    ? w.referOverCap
                    : b.earn_at
                      ? fill(w.referPendingDate, { date: day(b.earn_at) })
                      : fill(w.referPending, { n: Math.min(b.good ?? 0, 3) })}
              </Text>
            </View>
          ))}
        </View>
      ) : null}
    </Panel>
  );
}

const s = StyleSheet.create({
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 22, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  list: { gap: 8 },
  row: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', gap: 8, paddingVertical: 6, borderTopWidth: 1, borderTopColor: colour.rule },
  label: { fontFamily: font.bodySemi, fontSize: 14.5, color: colour.ink },
  value: { flexShrink: 1, fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.ink, textAlign: 'right' },
  codeBox: { gap: 2, padding: 14, borderRadius: radius.card, backgroundColor: colour.softYellow, alignItems: 'center' },
  codeLabel: { fontFamily: font.bodySemi, fontSize: 13, color: colour.ink },
  code: { fontFamily: font.mono, fontSize: 26, letterSpacing: 2, color: colour.ink },
});
