import { useCallback, useState } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useFocusEffect, type Href } from 'expo-router';
import { Icon } from '../src/components/Icon';
import { Button, Loading, Screen } from '../src/components/ui';
import { DuoIcon, type DuoName } from '../src/components/DuoIcon';
import { Press } from '../src/components/Press';
import { Sheet } from '../src/components/Sheet';
import { ScrewSpinner } from '../src/components/ScrewSpinner';
import { WorkArt } from '../src/components/WorkArt';
import { useAccount } from '../src/account';
import { useNotify } from '../src/notifications';
import { ask, supabase } from '../src/supabase';
import { colour, font, shadow } from '../src/theme';

/**
 * Notifications, from the menu (the owner's design, 25 November 2026): what
 * Pechkas actually told you, as big apps show it, and whether this phone is
 * told at all.
 *
 *   - On top, one card: on for this phone, or the one button that turns it
 *     on. Never a switch: the app cannot turn a phone's notifications off.
 *   - All / Unread, and Mark all read.
 *   - The last 90 days, newest first, 30 at a time (`my_notifications()`,
 *     migration …_notifications_inbox), under Today, Yesterday and the day.
 *     Each row: the job's drawing with a small badge for what happened, the
 *     same words the lock screen showed, the time, a green dot while unread,
 *     and what became of it since — an offer she chose from, a new price
 *     approved, a new job still open or gone — so an old request never looks
 *     as if it still waits. Repeats on one job on one day are one row ("and
 *     2 more like it"). A tap marks it read and opens the job.
 *   - At the foot, "What Pechkas tells you about": the lists below in five
 *     groups, in a sheet.
 *
 * The lists say only what the database really sends (`push_words`, by
 * `who`): a line here with no notification behind it would be a promise the
 * app does not keep. Change them together.
 */

const CUSTOMER = [
  'A technician sends an offer on your job',
  'He is on his way, and when he has arrived',
  'He asks a new price — nothing changes until you answer',
  'The technician says the work is finished — check it before you pay',
  'A reminder to check, and when it counts as finished by itself',
  'Your guarantee claim: his answer, his visit, his repair, or another technician',
  'Pechkas has decided a disagreement or a guarantee claim',
  'The job is done',
  'A new message about your job',
  'The technician you asked for cannot take it',
  'Nobody has offered yet, or your job closed without an offer',
  'Nobody was free for a guarantee repair, so you choose another day',
  'The technician is waiting for your answer to a new price',
  'A visit fee is unpaid, kept or waived',
  'Your technician has not arrived 30 minutes after his time',
  'Your technician is at your door and nobody has answered, or the guard has not let him in',
  'A job closed because he could not get in, and what Pechkas decided',
  'Your technician cannot come, so your job is open to others again',
  'Your technician is running late, with the time he now expects',
  'A question about payment for a job, and what Pechkas decided',
  'Your job is open to others again because the check it needed could not be arranged',
  'A kind of job you asked about is now available in your sector',
  'The Pechkas office answers what you wrote, or writes to you first',
];

const TECHNICIAN = [
  'A new job in your areas, while you are online',
  'A job\u2019s price goes up or its day changes',
  'A customer asks for you again',
  'You are chosen — or another offer is',
  'A job is cancelled, so you do not travel',
  'The customer answers your new price',
  'A new message about a job',
  'A payment is confirmed or not, or a balance is due',
  'The customer confirms the work, or says it is not finished',
  'A guarantee claim on your work, and reminders to answer it',
  'Your new offers stop, or a guarantee charge is coming, is added, or your appeal is decided',
  'Pechkas pays you for a guarantee repair',
  'A visit fee: the job stopped, Pechkas looked at it, waived it or paid it',
  'You arrived late or have not arrived, and what the office decided',
  'The customer is coming to the door, disagrees with your nobody-home report, or the office has decided it',
  'The customer chose another technician, so you do not travel',
  'The office pauses your new offers, or lifts the pause',
  'A fee to Pechkas is due in 3 days, due today, on its last grace day, or your new offers have stopped',
  'The office gives you more time to pay',
  'A visit fee refund will be charged to you, and what the office decided on your appeal',
  'The customer answers your payment report, or Pechkas decides it',
  'You can start taking jobs, a trade is approved, or sorted by your record',
  'Your work is paused or open again, and the answers to your appeal, report or photo request',
  'Your identity check is verified or not',
  'You are asked to check a job, your checker is coming, your checked job passed or not, and your checker\u2019s fee',
  'The Pechkas office answers what you wrote, or writes to you first',
];

/** The lists above in five groups each, for the sheet. Every line appears once. */
const CUSTOMER_GROUPS: [DuoName, string, number[]][] = [
  ['tag', 'Offers', [0, 9, 10, 21]],
  ['pin', 'The visit', [1, 18, 14, 15, 17, 20]],
  ['wallet', 'The price and paying', [2, 12, 13, 19]],
  ['shield', 'After the job', [3, 4, 7, 5, 11, 6, 16]],
  ['chat', 'Messages', [8, 22]],
];
const TECHNICIAN_GROUPS: [DuoName, string, number[]][] = [
  ['tag', 'New jobs and offers', [0, 1, 2, 3, 15, 4]],
  ['jobs', 'The job', [5, 8, 13, 14, 6, 25]],
  ['wallet', 'Money', [7, 17, 18, 12, 19, 20, 11]],
  ['shield', 'Guarantee', [9, 10]],
  ['person', 'Your work on Pechkas', [21, 16, 22, 23, 24]],
];

type Note = {
  id: number;
  kind: string;
  title: string;
  body: string;
  at: string;
  read: boolean;
  job_id: string | null;
  ref: string | null;
  trade: string | null;
  side: 'customer' | 'pro' | null;
  state: string | null;
  chose: string | null;
};
type Row = Note & { ids: number[]; more: number };

/** The small badge on the drawing: what happened, at a glance. */
function badgeOf(kind: string): DuoName {
  if (/^(offer|new_job|job_again|asked_again|no_offers|unclaimed|pref_passed|type_open|risky_open)/.test(kind)) return 'tag';
  if (/^(on_way|arrived|running_late|no_show|late_arrival|not_home|arrival)/.test(kind)) return 'pin';
  if (/^(change|stopped|fee_|pay|settled|over_limit|charge|refund|payment|guarantee_paid|referral|check_paid)/.test(kind)) return 'wallet';
  if (kind === 'message') return 'chat';
  if (kind === 'office_answer' || kind === 'office_wrote') return 'support';
  if (kind === 'chosen') return 'star';
  if (/^(claim|replacement)/.test(kind)) return 'shield';
  if (/^(cancelled|office_cancelled|offer_closed|not_chosen|declined|pro_withdrew|replaced_pro)/.test(kind)) return 'flag';
  if (/^(done|check|not_finished|dispute)/.test(kind)) return 'jobs';
  return 'bell';
}

/** What became of it since, in two or three words; null when there is nothing to say. */
function stateOf(n: Note): { text: string; wait: boolean } | null {
  switch (n.state) {
    case 'chose':
      return { text: n.chose ? `✓ You chose ${n.chose}` : '✓ You chose a technician', wait: false };
    case 'closed':
      return { text: 'Job closed', wait: false };
    case 'approved':
      return { text: '✓ Approved', wait: false };
    case 'declined':
      return { text: 'Declined', wait: false };
    case 'withdrawn':
      return { text: 'Taken back', wait: false };
    case 'pending':
      return { text: 'Waiting for your answer', wait: true };
    case 'open':
      return { text: 'Still open', wait: true };
    case 'offered':
      return { text: '✓ You sent an offer', wait: false };
    case 'yours':
      return { text: '✓ Yours', wait: false };
    case 'gone':
      return { text: 'No longer open', wait: false };
    default:
      return null;
  }
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const pk = (iso: string) => new Date(new Date(iso).getTime() + 5 * 3600 * 1000);
const dayKey = (iso: string) => pk(iso).toISOString().slice(0, 10);
const clock = (iso: string) => {
  const d = pk(iso);
  const h = d.getUTCHours();
  return `${h % 12 === 0 ? 12 : h % 12}:${String(d.getUTCMinutes()).padStart(2, '0')}${h < 12 ? 'am' : 'pm'}`;
};
function dayTitle(key: string): string {
  const today = dayKey(new Date().toISOString());
  const y = new Date(`${today}T00:00:00Z`);
  y.setUTCDate(y.getUTCDate() - 1);
  if (key === today) return 'Today';
  if (key === y.toISOString().slice(0, 10)) return 'Yesterday';
  const d = new Date(`${key}T00:00:00Z`);
  return `${DAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}

/** Repeats on one job, of one kind, on one day, next to each other, become one row. */
function merge(list: Note[]): Row[] {
  const out: Row[] = [];
  for (const n of list) {
    const last = out[out.length - 1];
    if (last && n.job_id && last.job_id === n.job_id && last.kind === n.kind && dayKey(last.at) === dayKey(n.at)) {
      last.ids.push(n.id);
      last.more += 1;
      if (!n.read) last.read = false;
      continue;
    }
    out.push({ ...n, ids: [n.id], more: 0 });
  }
  return out;
}

/** A job number never breaks at its hyphen, nor a price between "Rs" and the figure. */
const tidy = (w: string) => w.replace(/PK-(\d)/g, 'PK\u2011$1').replace(/Rs (\d)/g, 'Rs\u00a0$1');

const PAGE = 30;
const money = /^(pay|settled|over_limit|charge|refund|payment|guarantee_paid|referral|fee_refund)/;

export default function Notifications() {
  const { ready, session, account } = useAccount();
  const { notify, ask: askNotify } = useNotify(Boolean(session && account));
  const pro = account?.role === 'pro';
  const [list, setList] = useState<Note[] | null>(null);
  const [more, setMore] = useState(false);
  const [unread, setUnread] = useState(0);
  const [only, setOnly] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [about, setAbout] = useState(false);

  const load = useCallback(
    async (before: number | null = null, unreadOnly = only) => {
      if (!supabase) return;
      setBusy(true);
      const { data, error } = await supabase.rpc('my_notifications', { p_before_id: before, p_limit: PAGE, p_unread: unreadOnly });
      setBusy(false);
      if (error || !data) return setFailed(true);
      setFailed(false);
      const r = data as { items: Note[]; more: boolean; unread: number };
      setList((old) => (before && old ? [...old, ...r.items] : r.items));
      setMore(r.more);
      setUnread(r.unread);
    },
    [only],
  );

  useFocusEffect(
    useCallback(() => {
      if (session) void load(null);
    }, [session, load]),
  );

  async function markRead(ids: number[] | null) {
    const r = await ask<{ unread: number }>('mark_notifications_read', { p_ids: ids });
    if (!r.ok) return;
    setUnread(r.unread);
    setList((old) =>
      only ? (ids ? (old ?? []).filter((n) => !ids.includes(n.id)) : []) : (old ?? []).map((n) => (!ids || ids.includes(n.id) ? { ...n, read: true } : n)),
    );
  }

  function open(row: Row) {
    if (!row.read) void markRead(row.ids);
    // What the office wrote is read on Write to the office (and on the job), never in the notification.
    if (row.kind === 'office_answer' || row.kind === 'office_wrote') return router.push('/office');
    if (row.job_id && row.side === 'customer') return router.push(`/job/${row.job_id}` as Href);
    if (pro && money.test(row.kind)) return router.push('/pro/money');
    if (pro && (row.job_id || /^(new_job|job_again|asked_again)/.test(row.kind))) return router.push('/pro');
  }

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;

  const status =
    notify === 'on'
      ? { title: 'On for this phone', text: 'Pechkas tells you even when the app is closed.', tone: 'on' as const }
      : notify === 'ask'
        ? { title: 'Off for this phone', text: pro ? 'Turn it on so you hear about new jobs straight away.' : 'Turn it on so you do not miss an offer or a visit.', tone: 'off' as const }
        : notify === 'off'
          ? { title: 'Off for this phone', text: 'Notifications are switched off for Pechkas in the phone’s settings. Turn them on there.', tone: 'off' as const }
          : notify === 'unavailable'
            ? { title: 'Not on this copy of the app', text: 'This copy cannot receive notifications. The app from the store can. What Pechkas sent is still listed here.', tone: 'plain' as const }
            : null;

  const rows = merge(list ?? []);
  const days: [string, Row[]][] = [];
  for (const r of rows) {
    const k = dayKey(r.at);
    if (days.length && days[days.length - 1][0] === k) days[days.length - 1][1].push(r);
    else days.push([k, [r]]);
  }
  const shown = unread > 99 ? '99+' : String(unread);

  return (
    <Screen
      hero={{
        title: 'Notifications',
        back: true,
        right: unread ? (
          <Press onPress={() => void markRead(null)} accessibilityRole="button" style={s.markAll}>
            <Text style={s.markAllText}>Mark all read</Text>
          </Press>
        ) : undefined,
      }}
    >
      {/* Whether this phone is told: green when it is, soft yellow — something to do — when it is not. */}
      {status ? (
        <View style={[s.status, status.tone === 'on' && s.statusOn, status.tone === 'off' && s.statusOff]}>
          <View style={s.statusHead}>
            <DuoIcon name="bell" size={28} />
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={[s.statusTitle, status.tone === 'on' && { color: colour.greenDark }]}>{status.title}</Text>
              <Text style={s.statusText}>{status.text}</Text>
            </View>
            {status.tone === 'on' ? (
              <View style={s.onPill}>
                <Text style={s.onPillText}>On</Text>
              </View>
            ) : null}
          </View>
          {notify === 'ask' ? <Button kind="ink" label="Turn on notifications" onPress={askNotify} /> : null}
          {notify === 'off' ? <Button kind="outline" label="Open the phone’s settings" onPress={() => Linking.openSettings()} /> : null}
        </View>
      ) : null}

      <View style={s.chips} accessibilityRole="tablist">
        {([false, true] as const).map((u) => (
          <Press
            key={String(u)}
            onPress={() => {
              setOnly(u);
              setList(null);
              void load(null, u);
            }}
            accessibilityRole="tab"
            accessibilityState={{ selected: only === u }}
            accessibilityLabel={u ? `Unread, ${unread}` : 'All'}
            sink={0.96}
            style={[s.chip, only === u && s.chipOn]}
          >
            <Text style={[s.chipText, only === u && s.chipTextOn]}>{u ? 'Unread' : 'All'}</Text>
            {u && unread ? (
              <View style={s.count}>
                <Text style={s.countText}>{shown}</Text>
              </View>
            ) : null}
          </Press>
        ))}
      </View>

      {list === null && !failed ? (
        <View style={{ alignItems: 'center', paddingVertical: 28 }}>
          <ScrewSpinner size={32} label="Loading your notifications" />
        </View>
      ) : null}
      {failed && !list?.length ? (
        <View style={[s.card, s.empty]}>
          <Text style={s.emptyTitle}>Your notifications could not be loaded</Text>
          <Text style={s.text}>Check your signal and try again.</Text>
          <Button kind="outline" label="Try again" onPress={() => void load(null)} />
        </View>
      ) : null}
      {list && !list.length && !failed ? (
        <View style={[s.card, s.empty]}>
          <View style={s.emptyTile}>
            <DuoIcon name="bell" size={34} />
          </View>
          <Text style={s.emptyTitle}>{only ? 'Nothing unread' : 'Nothing yet'}</Text>
          <Text style={[s.text, { textAlign: 'center' }]}>
            {only
              ? 'You have read everything from the last 90 days.'
              : pro
                ? 'New jobs, being chosen and money owed appear here as well as on your lock screen, for 90 days.'
                : 'When a technician sends an offer, sets off or finishes, it appears here as well as on your lock screen, for 90 days.'}
          </Text>
        </View>
      ) : null}

      {days.map(([key, day]) => (
        <View key={key} style={{ gap: 8 }}>
          <Text style={s.day} accessibilityRole="header">
            {dayTitle(key)}
          </Text>
          <View style={s.card}>
            {day.map((n, i) => {
              const st = stateOf(n);
              return (
                <Press
                  key={n.id}
                  onPress={() => open(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${n.read ? '' : 'Unread. '}${n.title}. ${n.body}. ${clock(n.at)}${st ? `. ${st.text.replace('✓ ', '')}` : ''}`}
                  sink={0.985}
                  style={[s.row, i > 0 && s.rule, !n.read && s.unreadRow, i === 0 && s.firstRow, i === day.length - 1 && s.lastRow]}
                >
                  <View>
                    {n.trade ? (
                      <View style={s.artTile}>
                        <WorkArt art={n.trade} size={34} picture={44} />
                      </View>
                    ) : (
                      <View style={s.plainTile}>
                        <DuoIcon name="bell" size={24} />
                      </View>
                    )}
                    <View style={s.badge}>
                      <DuoIcon name={badgeOf(n.kind)} size={15} />
                    </View>
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <View style={s.titleRow}>
                      <Text style={s.title}>
                        {tidy(n.title)}
                        {n.read ? '' : '  '}
                        {n.read ? null : <Text style={s.dot}>●</Text>}
                      </Text>
                      <Text style={s.time}>{clock(n.at)}</Text>
                    </View>
                    <Text style={s.text}>{tidy(n.body)}</Text>
                    {n.more ? <Text style={s.more}>and {n.more} more like it</Text> : null}
                    {st ? (
                      <View style={[s.tag, st.wait && s.tagWait]}>
                        <Text style={s.tagText}>{st.text}</Text>
                      </View>
                    ) : null}
                  </View>
                </Press>
              );
            })}
          </View>
        </View>
      ))}

      {more ? <Button kind="soft" label="Show older notifications" busy={busy} onPress={() => void load(list?.length ? list[list.length - 1].id : null)} /> : null}

      <Press onPress={() => setAbout(true)} accessibilityRole="button" sink={0.985} style={[s.card, s.aboutRow]}>
        <View style={s.aboutTile}>
          <DuoIcon name="doc" size={22} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={s.aboutTitle}>What Pechkas tells you about</Text>
          <Text style={s.small}>And what it never puts on a lock screen</Text>
        </View>
        <Icon name="chevronRight" size={18} color="#9aa1a6" strokeWidth={2.2} />
      </Press>

      {about ? (
        <Sheet title="What Pechkas tells you about" onClose={() => setAbout(false)}>
          <View style={{ paddingHorizontal: 16, gap: 4 }}>
            {(pro ? TECHNICIAN_GROUPS : CUSTOMER_GROUPS).map(([icon, title, lines]) => (
              <View key={title} style={s.group}>
                <View style={s.aboutTile}>
                  <DuoIcon name={icon} size={22} />
                </View>
                <View style={{ flex: 1, gap: 4 }}>
                  <Text style={s.aboutTitle}>{title}</Text>
                  {lines.map((k) => (
                    <Text key={k} style={s.text}>
                      {(pro ? TECHNICIAN : CUSTOMER)[k]}
                    </Text>
                  ))}
                </View>
              </View>
            ))}
            <View style={s.privacy}>
              <DuoIcon name="lock" size={22} />
              <Text style={[s.small, { flex: 1 }]}>
                A notification never shows your address or phone number: it sits on a lock screen, where anybody near the phone can read it.
                Pechkas keeps a copy of each one, and shows you the last 90 days here.
              </Text>
            </View>
          </View>
        </Sheet>
      ) : null}
    </Screen>
  );
}

const SHADOW = shadow.card;

const s = StyleSheet.create({
  markAll: { minHeight: 44, justifyContent: 'center', paddingHorizontal: 4 },
  markAllText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.greenDark },
  status: { gap: 12, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  statusOn: { backgroundColor: colour.greenSoft, boxShadow: 'none' },
  statusOff: { backgroundColor: colour.softYellow, boxShadow: 'none' },
  statusHead: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  statusTitle: { fontFamily: font.display, fontSize: 16.5, color: colour.ink },
  statusText: { fontFamily: font.body, fontSize: 13.5, lineHeight: 19, color: colour.inkSoft },
  onPill: { paddingHorizontal: 12, height: 30, borderRadius: 15, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  onPillText: { fontFamily: font.bodySemi, fontSize: 13, color: colour.white },
  chips: { flexDirection: 'row', gap: 8 },
  chip: { minHeight: 44, paddingHorizontal: 16, borderRadius: 22, backgroundColor: colour.white, flexDirection: 'row', alignItems: 'center', gap: 8, boxShadow: SHADOW },
  chipOn: { backgroundColor: colour.ink },
  chipText: { fontFamily: font.bodySemi, fontSize: 15, color: colour.ink },
  chipTextOn: { color: colour.white },
  count: { minWidth: 22, height: 22, paddingHorizontal: 6, borderRadius: 11, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  countText: { fontFamily: font.display, fontSize: 12, color: colour.ink },
  day: { fontFamily: font.bodySemi, fontSize: 14, color: colour.steel, paddingHorizontal: 4, marginTop: 2 },
  card: { borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, padding: 14, minHeight: 72 },
  firstRow: { borderTopLeftRadius: 24, borderTopRightRadius: 24 },
  lastRow: { borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  rule: { borderTopWidth: 1, borderTopColor: colour.rule },
  unreadRow: { backgroundColor: colour.cream },
  artTile: { width: 48, height: 48, borderRadius: 15, backgroundColor: colour.cream, alignItems: 'center', justifyContent: 'center' },
  plainTile: { width: 48, height: 48, borderRadius: 15, backgroundColor: colour.greenSoft, alignItems: 'center', justifyContent: 'center' },
  badge: { position: 'absolute', right: -5, bottom: -5, width: 24, height: 24, borderRadius: 12, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: '0 1px 4px rgba(20,23,26,0.15)' },
  titleRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  title: { flex: 1, fontFamily: font.bodySemi, fontSize: 15, lineHeight: 20, color: colour.ink },
  dot: { color: colour.green, fontSize: 11 },
  time: { fontFamily: font.bodyMedium, fontSize: 12.5, color: colour.steel, paddingTop: 1 },
  text: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  more: { fontFamily: font.bodySemi, fontSize: 13, color: colour.greenDark, marginTop: 4 },
  tag: { alignSelf: 'flex-start', marginTop: 8, paddingHorizontal: 10, paddingVertical: 4, borderRadius: 12, backgroundColor: colour.canvas },
  tagWait: { backgroundColor: colour.yellow },
  tagText: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.ink },
  empty: { alignItems: 'center', gap: 10, padding: 24 },
  emptyTile: { width: 64, height: 64, borderRadius: 20, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: font.display, fontSize: 17, color: colour.ink, textAlign: 'center' },
  aboutRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, minHeight: 64 },
  aboutTile: { width: 40, height: 40, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  aboutTitle: { fontFamily: font.bodySemi, fontSize: 16, color: colour.ink },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel },
  group: { flexDirection: 'row', gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: colour.rule },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, marginTop: 10, borderRadius: 18, backgroundColor: colour.canvas },
});
