import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { rupees } from '@pechkas/shared';
import { Sheet } from '../components/Sheet';
import { Button, Notice } from '../components/ui';
import { DuoIcon } from '../components/DuoIcon';
import { Icon } from '../components/Icon';
import { ScrewSpinner } from '../components/ScrewSpinner';
import { Stars } from '../components/Stars';
import { supabase } from '../supabase';
import { colour, font } from '../theme';

/**
 * One technician, opened from his offer before the customer chooses: what
 * public.offer_profile() gives and nothing more — first name, years, trades,
 * the checks Pechkas did and since when, jobs done, his rating ("New" until
 * there are enough) and the last things customers wrote, without their
 * names. Never his surname or number: those come only once he is chosen.
 */

type Profile = {
  first_name: string;
  years: number;
  trades: string[];
  checked_since: string | null;
  checks: ('identity' | 'trial_job' | 'rules')[];
  rating: number | null;
  rating_count: number;
  jobs_done: number;
  done_for_you: number;
  words: { stars: number; words: string; at: string; trade: string | null }[];
};

const CHECKS: { step: Profile['checks'][number]; label: string }[] = [
  { step: 'identity', label: 'Who he is, checked in person or on a video call' },
  { step: 'trial_job', label: 'A trial job, watched by Pechkas' },
  { step: 'rules', label: 'Pechkas’ rules, gone through with him' },
];

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const monthOf = (iso: string) => {
  const d = new Date(iso);
  return `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
};

export function ProProfile({ offerId, price, onChoose, onClose }: { offerId: string; price: number; onChoose: () => void; onClose: () => void }) {
  const [p, setP] = useState<Profile | null>(null);
  const [trouble, setTrouble] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    // It answers with the profile itself, or nothing for anybody it is not for.
    supabase?.rpc('offer_profile', { p_offer: offerId }).then(({ data, error }) => {
      if (!alive) return;
      if (data) setP(data as Profile);
      else setTrouble(error ? 'No connection. Check your signal and try again.' : 'This offer is no longer open.');
    });
    return () => {
      alive = false;
    };
  }, [offerId]);

  return (
    <Sheet title={p ? p.first_name : 'Technician'} onClose={onClose}>
      {!p ? (
        trouble ? (
          <Notice text={trouble} inline />
        ) : (
          <View style={s.loading}>
            <ScrewSpinner size={36} />
          </View>
        )
      ) : (
        <View style={{ gap: 16, paddingHorizontal: 8 }}>
          <View style={s.head}>
            <View style={s.avatar}>
              <Text style={s.avatarText}>{p.first_name.charAt(0)}</Text>
            </View>
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={s.name}>{p.first_name}</Text>
              <Text style={s.sub}>
                {p.years} {p.years === 1 ? 'year' : 'years'} in the trade
                {p.checked_since ? ` · checked by Pechkas since ${monthOf(p.checked_since)}` : ''}
              </Text>
            </View>
          </View>

          {/* The three figures, from the database's own counts — "New" until there are enough ratings. */}
          <View style={s.stats}>
            <View style={s.stat}>
              {p.rating !== null ? (
                <>
                  <Text style={s.statBig}>{Number(p.rating).toFixed(1)}</Text>
                  <Stars value={Math.round(Number(p.rating))} size={13} />
                </>
              ) : (
                <Text style={s.statBig}>New</Text>
              )}
              <Text style={s.statLabel}>Rating</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statBig}>{p.jobs_done}</Text>
              <Text style={s.statLabel}>{p.jobs_done === 1 ? 'Job done' : 'Jobs done'}</Text>
            </View>
            <View style={s.stat}>
              <Text style={s.statBig}>{p.years}</Text>
              <Text style={s.statLabel}>{p.years === 1 ? 'Year' : 'Years'}</Text>
            </View>
          </View>
          {p.done_for_you > 0 ? (
            <View style={s.before}>
              <DuoIcon name="star" size={20} />
              <Text style={s.beforeText}>
                He has done {p.done_for_you} {p.done_for_you === 1 ? 'job' : 'jobs'} for you before.
              </Text>
            </View>
          ) : null}

          <View style={{ gap: 6 }}>
            <Text style={s.h3}>His trades</Text>
            <Text style={s.line}>{p.trades.join(', ')}</Text>
          </View>

          <View style={{ gap: 8 }}>
            <Text style={s.h3}>What Pechkas checked</Text>
            {CHECKS.filter((c) => p.checks.includes(c.step)).map((c) => (
              <View key={c.step} style={s.check}>
                <View style={s.tick}>
                  <Icon name="check" size={14} color={colour.white} strokeWidth={3} />
                </View>
                <Text style={s.line}>{c.label}</Text>
              </View>
            ))}
          </View>

          <View style={{ gap: 8 }}>
            <Text style={s.h3}>What customers wrote</Text>
            {p.words.length ? (
              p.words.map((w, i) => (
                <View key={i} style={s.quote}>
                  <Stars value={w.stars} size={13} />
                  <Text style={s.quoteText}>“{w.words}”</Text>
                  <Text style={s.quoteMeta}>
                    {[w.trade, monthOf(w.at)].filter(Boolean).join(' · ')}
                  </Text>
                </View>
              ))
            ) : (
              <Text style={s.sub}>Nobody has written about him yet.</Text>
            )}
          </View>

          <View style={{ gap: 8, paddingTop: 4 }}>
            <Button icon="arrowRight" label={`Choose ${p.first_name} · ${rupees(price)}`} onPress={onChoose} />
            <Button kind="outline" label="Back to the offers" onPress={onClose} />
          </View>
        </View>
      )}
    </Sheet>
  );
}

const s = StyleSheet.create({
  loading: { minHeight: 160, alignItems: 'center', justifyContent: 'center' },
  head: { flexDirection: 'row', alignItems: 'center', gap: 14 },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 24, color: colour.white },
  name: { fontFamily: font.display, fontSize: 21, color: colour.ink },
  sub: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.steel },
  stats: { flexDirection: 'row', gap: 8 },
  stat: { flex: 1, minHeight: 78, alignItems: 'center', justifyContent: 'center', gap: 2, padding: 10, borderRadius: 16, backgroundColor: colour.canvas },
  statBig: { fontFamily: font.display, fontSize: 20, color: colour.ink },
  statLabel: { fontFamily: font.bodyMedium, fontSize: 12.5, color: colour.steel },
  before: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colour.softYellow },
  beforeText: { flex: 1, fontFamily: font.bodySemi, fontSize: 14, color: colour.ink },
  h3: { fontFamily: font.display, fontSize: 16, color: colour.ink },
  line: { flex: 1, fontFamily: font.body, fontSize: 14.5, lineHeight: 20, color: colour.inkSoft },
  check: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  tick: { width: 22, height: 22, borderRadius: 11, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  quote: { gap: 6, padding: 12, borderRadius: 16, backgroundColor: colour.canvas },
  quoteText: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: colour.ink },
  quoteMeta: { fontFamily: font.bodyMedium, fontSize: 12.5, color: colour.steel },
});
