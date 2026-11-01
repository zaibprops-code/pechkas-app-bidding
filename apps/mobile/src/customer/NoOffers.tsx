import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { addDays, dayLabel, DAYS_AHEAD, openWindows, pkNow, rupees } from '@pechkas/shared';
import { Button, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { DuoRow, RowCard } from '../components/Rows';
import { Press } from '../components/Press';
import { Sheet, SheetOption } from '../components/Sheet';
import { ask } from '../supabase';
import { colour, font, radius, shadow } from '../theme';

/**
 * Nobody has offered yet (migration when_nobody_offers). Shown once the
 * database has told her — 20 minutes after a job for today, 3 hours for a
 * later day — and only while nobody has offered. Three choices, all hers:
 * raise the price by one of the steps technicians use, choose another day,
 * or keep waiting. The app never says what the "right" price is; it says
 * the usual Pechkas price only when hers is below it, because that is a
 * real figure. It names no sector or area: who can take the job is the
 * database's business, and naming a place only makes people anxious.
 *
 * On a guarantee repair Pechkas is paying for, the raise card is replaced
 * by one line: the office has been told and can raise what Pechkas pays
 * (guarantee_followups). She still chooses the day or keeps waiting.
 */

const STEPS = [20000, 50000, 100000] as const;

export type NoOffersJob = {
  id: string;
  offered_paisa: number;
  when_date?: string | null;
  list_paisa?: number | null;
  raises_left?: number;
  can_raise?: boolean;
  can_move?: boolean;
  /** A guarantee repair: Pechkas pays, so there is no price of hers to raise; only the office can raise its limit. */
  paid_by_pechkas?: boolean;
};

export function NoOffers({ job, onChanged }: { job: NoOffersJob; onChanged: () => void }) {
  const [step, setStep] = useState<number | null>(null);
  const [days, setDays] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const narrow = useWindowDimensions().width < 360;
  if (waiting) return null;

  const now = pkNow();
  const choices = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(now.date, i)).filter(
    (d) => d !== job.when_date && openWindows(d, now).length > 0,
  );
  const below = job.list_paisa && job.offered_paisa < job.list_paisa;
  const left = job.raises_left ?? 0;

  async function raise() {
    if (!step) return;
    setBusy(true);
    setMsg(null);
    const r = await ask('raise_price', { p_job: job.id, p_add_paisa: step });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setStep(null);
    onChanged();
  }

  async function move(day: string) {
    setBusy(true);
    setMsg(null);
    const r = await ask('change_day', { p_job: job.id, p_date: day });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setDays(false);
    onChanged();
  }

  return (
    <View style={{ gap: 14 }}>
      {job.can_raise ? (
        // The one money card on the screen: soft yellow, the price large, as on Post a job.
        <View style={s.money}>
          <View style={s.head}>
            <View style={s.tile}>
              <DuoIcon name="wallet" size={24} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={s.title} accessibilityRole="header">
                Raise your price
              </Text>
              <Text style={s.leftText}>{left === 1 ? '1 raise left' : `${left} raises left`}</Text>
            </View>
          </View>

          <View style={s.prices}>
            <View>
              <Text style={s.priceLabel}>Your price now</Text>
              <Text style={[s.price, step ? s.priceOld : null]}>{rupees(job.offered_paisa)}</Text>
            </View>
            {step ? (
              <View style={{ alignItems: 'flex-end' }}>
                <Text style={s.priceLabel}>New price</Text>
                <Text style={s.price}>{rupees(job.offered_paisa + step)}</Text>
              </View>
            ) : null}
          </View>

          {/* Three equal steps, the ones technicians use: never a price we suggest. */}
          <View style={[s.steps, narrow && { gap: 6 }]}>
            {STEPS.map((d) => {
              const on = step === d;
              return (
                <Press
                  key={d}
                  onPress={() => setStep(on ? null : d)}
                  sink={0.95}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Add ${rupees(d)}`}
                  style={[s.step, narrow && s.stepNarrow, on && s.stepOn]}
                >
                  <Text style={[s.stepText, narrow && { fontSize: 13.5 }, on && s.stepTextOn]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.85}>
                    +{rupees(d)}
                  </Text>
                </Press>
              );
            })}
          </View>
          {below ? <Text style={s.usual}>The usual Pechkas price for this job is {rupees(job.list_paisa!)}.</Text> : null}
          <Button
            icon="arrowRight"
            label={step ? `${narrow ? 'Raise to' : 'Raise my price to'} ${rupees(job.offered_paisa + step)}` : 'Choose an amount above'}
            disabled={!step}
            busy={busy}
            onPress={raise}
          />
          <Text style={s.note}>You choose the amount, and it can only go up. Technicians are told at once.</Text>
        </View>
      ) : null}

      {job.paid_by_pechkas ? (
        <View style={s.paid}>
          <View style={[s.tile, { backgroundColor: colour.softYellow }]}>
            <DuoIcon name="shield" size={24} />
          </View>
          <View style={{ flex: 1, gap: 4 }}>
            <Text style={s.title} accessibilityRole="header">
              Pechkas has been told
            </Text>
            <Text style={s.note}>Pechkas can raise what it pays for this repair so more technicians can take it. You pay nothing either way.</Text>
          </View>
        </View>
      ) : null}

      <RowCard>
        {job.can_move ? (
          <DuoRow icon="clock" label="Choose another day" value={job.when_date ? `Now: ${dayLabel(job.when_date, now.date)}` : undefined} onPress={() => setDays(true)} />
        ) : null}
        <DuoRow icon="bell" label="Keep waiting" value="Your phone tells you when an offer comes." onPress={() => setWaiting(true)} last />
      </RowCard>
      <Text style={s.foot}>
        {job.paid_by_pechkas
          ? 'If nobody takes it, it closes by itself at 8pm on its day, and you choose another day on your guarantee claim.'
          : 'If nobody takes it, it closes by itself at 8pm on its day. You can post it again in one tap.'}
      </Text>
      <Notice text={msg} />

      {days ? (
        <Sheet title="Which day instead?" onClose={() => setDays(false)}>
          {choices.map((d) => (
            <SheetOption key={d} label={dayLabel(d, now.date)} onPress={() => (busy ? undefined : move(d))} />
          ))}
          <Notice text={msg} inline />
        </Sheet>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  money: { gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.softYellow },
  paid: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 18, color: colour.ink },
  leftText: { fontFamily: font.bodyMedium, fontSize: 13, color: colour.steel },
  prices: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', gap: 12 },
  priceLabel: { fontFamily: font.bodyMedium, fontSize: 13, color: colour.steel },
  price: { fontFamily: font.display, fontSize: 28, color: colour.ink },
  priceOld: { fontSize: 20, color: colour.steel, textDecorationLine: 'line-through' },
  steps: { flexDirection: 'row', gap: 8 },
  step: { flex: 1, minHeight: 48, borderRadius: radius.pill, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 6, boxShadow: shadow.card },
  stepNarrow: { paddingHorizontal: 2 },
  stepOn: { backgroundColor: colour.green },
  stepText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  stepTextOn: { color: colour.white },
  usual: { fontFamily: font.bodySemi, fontSize: 14, lineHeight: 20, color: colour.ink },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  foot: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel, paddingHorizontal: 4 },
});
