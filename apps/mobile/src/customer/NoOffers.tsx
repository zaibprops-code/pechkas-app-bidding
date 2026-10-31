import { useState } from 'react';
import { StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { addDays, dayLabel, DAYS_AHEAD, openWindows, pkNow, rupees } from '@pechkas/shared';
import { Button, Chip, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { ask } from '../supabase';
import { colour, font } from '../theme';

/**
 * Nobody has offered yet (migration when_nobody_offers). Shown once the
 * database has told her — 20 minutes after a job for today, 3 hours for a
 * later day — and only while nobody has offered. Three choices, all hers:
 * raise the price by one of the steps technicians use, choose another day,
 * or keep waiting. The app never says what the "right" price is; it says
 * the usual Pechkas price only when hers is below it, because that is a
 * real figure. The office is not involved.
 */

const STEPS = [20000, 50000, 100000] as const;

export type NoOffersJob = {
  id: string;
  sector: string;
  offered_paisa: number;
  when_date?: string | null;
  list_paisa?: number | null;
  raises_left?: number;
  can_raise?: boolean;
  can_move?: boolean;
};

export function NoOffers({ job, onChanged }: { job: NoOffersJob; onChanged: () => void }) {
  const [step, setStep] = useState<number | null>(null);
  const [moving, setMoving] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  // Under 360 wide the long label broke the amount over two lines.
  const narrow = useWindowDimensions().width < 360;
  if (waiting) return null;

  const now = pkNow();
  const days = Array.from({ length: DAYS_AHEAD + 1 }, (_, i) => addDays(now.date, i)).filter(
    (d) => d !== job.when_date && openWindows(d, now).length > 0,
  );
  const below = job.list_paisa && job.offered_paisa < job.list_paisa;

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
    setMoving(false);
    onChanged();
  }

  return (
    <View style={s.card}>
      <View style={s.head}>
        <View style={s.tile}>
          <DuoIcon name="clock" size={24} />
        </View>
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={s.title} accessibilityRole="header">
            No offers yet
          </Text>
          <Text style={s.line}>
            Technicians in {job.sector.replace(/-/g, '‑')} have not taken this job at {rupees(job.offered_paisa)} yet.
          </Text>
        </View>
      </View>
      {below ? <Text style={s.usual}>The usual Pechkas price for this job is {rupees(job.list_paisa!)}.</Text> : null}

      {job.can_raise ? (
        <View style={{ gap: 8 }}>
          <Text style={s.label}>Raise your price</Text>
          <View style={s.chips}>
            {STEPS.map((d) => (
              <Chip key={d} label={`+${rupees(d)}`} on={step === d} onPress={() => setStep(step === d ? null : d)} />
            ))}
          </View>
          {step ? <Button icon="arrowRight" label={`${narrow ? 'Raise to' : 'Raise my price to'} ${rupees(job.offered_paisa + step)}`} busy={busy} onPress={raise} /> : null}
          <Text style={s.note}>
            You choose the amount. You can raise it {job.raises_left === 1 ? 'once more' : `${job.raises_left ?? 0} more times`}, and it can only go up.
          </Text>
        </View>
      ) : null}

      {job.can_move ? (
        moving ? (
          <View style={{ gap: 8 }}>
            <Text style={s.label}>Which day instead?</Text>
            <View style={s.chips}>
              {days.map((d) => (
                <Chip key={d} label={dayLabel(d, now.date)} on={false} onPress={() => (busy ? undefined : move(d))} />
              ))}
            </View>
          </View>
        ) : (
          <Button kind="outline" label="Choose another day" onPress={() => setMoving(true)} />
        )
      ) : null}

      <Button kind="outline" label="Keep waiting" onPress={() => setWaiting(true)} />
      <Text style={s.note}>If nobody takes it, it closes by itself at 8pm on its day, and you can post it again in one tap.</Text>
      <Notice text={msg} />
    </View>
  );
}

const s = StyleSheet.create({
  card: { gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.softYellow },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: 12 },
  tile: { width: 44, height: 44, borderRadius: 14, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 18, color: colour.ink },
  line: { fontFamily: font.body, fontSize: 14.5, lineHeight: 20, color: colour.inkSoft },
  usual: { fontFamily: font.bodySemi, fontSize: 14.5, lineHeight: 20, color: colour.ink },
  label: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
});
