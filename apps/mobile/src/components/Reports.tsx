import { useCallback, useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { DuoIcon } from './DuoIcon';
import { supabase } from '../supabase';
import { colour, font, shadow } from '../theme';

/**
 * What somebody told the Pechkas office, and the office's answer, in the
 * app (migration …_office_answers): the owner takes no calls, so the office
 * answers in writing here. `my_reports()` gives the asker's own reports
 * only, never the office's internal note. The notification that an answer
 * came says only the job number; the answer itself is read here, on the job
 * and in Help.
 */

export type Report = {
  id: string;
  job_id: string;
  ref: string;
  trade: string | null;
  kind: 'problem' | 'guarantee' | 'emergency';
  body: string | null;
  at: string;
  open: boolean;
  answer: string | null;
  answered_at: string | null;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
/** "Wed 25 Nov, 3:40pm", on Pakistan's clock. */
export function when(iso: string): string {
  const d = new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
  const h = d.getUTCHours();
  const m = d.getUTCMinutes();
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getUTCDay()];
  return `${day} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}, ${h % 12 || 12}${m ? `:${String(m).padStart(2, '0')}` : ''}${h < 12 ? 'am' : 'pm'}`;
}

/** The asker's reports: one job's, or (no job) the last 90 days' and any still open. Asked again whenever the screen comes back. */
export function useReports(job?: string | null, again: unknown = 0): Report[] {
  const [list, setList] = useState<Report[]>([]);
  const load = useCallback(() => {
    if (!supabase) return;
    void supabase.rpc('my_reports', { p_job: job ?? null }).then(({ data }) => {
      if (Array.isArray(data)) setList(data as Report[]);
    });
  }, [job]);
  useFocusEffect(load);
  useEffect(load, [load, again]);
  return list;
}

/** One report and what became of it. `withJob` names the job, for a list of several jobs; `white` is a card of its own on the grey canvas (Help), not a block inside a white card (the job). */
export function ReportItem({ r, withJob = false, white = false }: { r: Report; withJob?: boolean; white?: boolean }) {
  const said = r.kind === 'emergency' ? 'You pressed Emergency.' : r.kind === 'guarantee' ? `Guarantee: “${r.body ?? ''}”` : `“${r.body ?? ''}”`;
  return (
    <View style={[s.item, white && s.white]}>
      <Text style={s.meta}>
        {withJob ? `${[r.trade, r.ref].filter(Boolean).join(' · ')} · ` : ''}You told the office, {when(r.at)}
      </Text>
      <Text style={s.said}>{said}</Text>
      {r.answer ? (
        <View style={s.answer}>
          <View style={s.answerHead}>
            <DuoIcon name="support" size={18} />
            <Text style={s.answerTitle}>The Pechkas office answered</Text>
          </View>
          <Text style={s.answerText}>{r.answer}</Text>
          {r.answered_at ? <Text style={s.meta}>{when(r.answered_at)}</Text> : null}
        </View>
      ) : (
        <View style={s.waiting}>
          <Text style={s.waitingText}>{r.open ? 'Waiting for the office’s answer. You are told when it comes.' : 'The office has closed this without a written answer.'}</Text>
        </View>
      )}
    </View>
  );
}

/** A job's own reports, under its Report box. Nothing at all when there are none. */
export function JobReports({ job, again }: { job: string; again?: unknown }) {
  const list = useReports(job, again);
  if (!list.length) return null;
  return (
    <View style={{ gap: 8 }}>
      {list.map((r) => (
        <ReportItem key={r.id} r={r} />
      ))}
    </View>
  );
}

const s = StyleSheet.create({
  item: { gap: 6, padding: 14, borderRadius: 18, backgroundColor: colour.canvas },
  white: { padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  meta: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel },
  said: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: colour.ink },
  answer: { gap: 4, padding: 12, borderRadius: 14, backgroundColor: colour.greenSoft },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  answerTitle: { fontFamily: font.display, fontSize: 14, color: colour.green },
  answerText: { fontFamily: font.body, fontSize: 14.5, lineHeight: 21, color: colour.ink },
  waiting: { alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, backgroundColor: colour.softYellow },
  waitingText: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18, color: colour.inkSoft },
});
