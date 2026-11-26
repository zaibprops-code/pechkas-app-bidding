import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { router } from 'expo-router';
import { rupees } from '@pechkas/shared';
import { DuoIcon, type DuoName } from '../components/DuoIcon';
import { Icon } from '../components/Icon';
import { Press } from '../components/Press';
import { ScrewSpinner } from '../components/ScrewSpinner';
import { Sheet } from '../components/Sheet';
import { Button } from '../components/ui';
import { supabase } from '../supabase';
import { colour, font } from '../theme';
import { SHADOW, TradeTile } from './bits';
import { RangeCalendar, dayText, presets, rangeText, type Range } from './Calendar';

/**
 * My jobs → Past (the owner's design, 24 November 2026): her finished jobs,
 * built for somebody with a hundred of them.
 *
 *   - One box: type to search (what the job was, who came, the job number);
 *     the button at its end opens every filter. Each filter on shows as a
 *     green tag with ✕ under the box.
 *   - "Still under guarantee" on top while nothing is searched or filtered:
 *     the question people come back to Past for.
 *   - Then month by month, compact rows, twenty at a time, the next twenty
 *     loading as she nears the foot (`nearEnd`).
 *
 * The filters are rows — What happened, Kind of work, Who came (the men
 * who worked on her jobs, by a key made from him and her account), Where
 * (only when her jobs are at more than one address), When — each a
 * page of its own in the sheet, so a list of thirty or three hundred never
 * opens inside another: Kind of work has a search box once the list is long,
 * her most used first, then A to Z, each with how many of her jobs it has,
 * and only the kinds she has actually had. When is a calendar (Calendar.tsx):
 * any two days, quick choices, the months with jobs. The black button always
 * says how many jobs she will see.
 *
 * Every row, count and date comes from my_history() and my_history_facets()
 * (migration …_job_history): her own jobs only, searched and counted by the
 * database, never an address or a phone number. A tap opens the job's own
 * screen, which still has the receipt, Book again, Rate and the guarantee.
 */

type Hist = {
  id: string;
  ref: string;
  trade: string;
  title: string;
  status: 'done' | 'stopped' | 'cancelled';
  cancelled_by: string | null;
  sector: string;
  free: boolean;
  day: string;
  at: string;
  pro: string | null;
  paid_paisa: number | null;
  guarantee_until: string | null;
  covered: boolean;
};
type Facets = {
  total: number;
  since: string | null;
  trades: { trade: string; n: number }[];
  /** Who came: a key made from him and her account, his first name, how many jobs, the kinds of work. */
  pros: { key: string; name: string; n: number; trades: string[] }[];
  sectors: { sector: string; n: number }[];
  days: string[];
  months: { month: string; n: number; paid_paisa: number }[];
  what: Record<'done' | 'covered' | 'fee' | 'cancelled' | 'nobody', number>;
  covered: { id: string; title: string; trade: string; pro: string | null; until: string }[];
};
type What = 'all' | 'done' | 'covered' | 'fee' | 'cancelled' | 'nobody';
type Filters = { what: What; trade: string | null; pro: string | null; sector: string | null; range: Range };

const NONE: Filters = { what: 'all', trade: null, pro: null, sector: null, range: { from: null, to: null } };
const WHAT_LABEL: Record<What, string> = {
  all: 'Everything',
  done: 'Done',
  covered: 'Still under guarantee',
  fee: 'Visit fee only',
  cancelled: 'Cancelled',
  nobody: 'Nobody took it',
};
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const PAGE = 20;

const args = (q: string, f: Filters, extra: Record<string, unknown> = {}) => ({
  p_q: q.trim() || null,
  p_what: f.what,
  p_trade: f.trade,
  p_pro: f.pro,
  p_sector: f.sector,
  p_from: f.range.from,
  p_to: f.range.to ?? (f.range.from ? f.range.from : null),
  ...extra,
});
const filtersOn = (f: Filters) => (f.what !== 'all' ? 1 : 0) + (f.trade ? 1 : 0) + (f.pro ? 1 : 0) + (f.sector ? 1 : 0) + (f.range.from || f.range.to ? 1 : 0);
const open = (id: string) => router.push(`/job/${id}`);
const shortDay = (d: string) => {
  const [, m, day] = d.split('-').map(Number);
  return `${day} ${MONTHS[m - 1].slice(0, 3)}`;
};
/** His first name, and the kinds of work as well when she has had two men of that name. */
function proLabel(facets: Facets, key: string): string {
  const p = facets.pros.find((x) => x.key === key);
  if (!p) return 'Technician';
  const twin = facets.pros.filter((x) => x.name === p.name).length > 1;
  return twin ? `${p.name} (${p.trades.join(', ')})` : p.name;
}
const daysLeft = (until: string) => Math.max(0, Math.ceil((new Date(until).getTime() - Date.now()) / 86400000));

export function Past({ tradeName, nearEnd, onFacets, initialWhat }: { tradeName: (slug: string) => string; nearEnd: boolean; onFacets?: (f: Facets) => void; initialWhat?: What }) {
  const [q, setQ] = useState('');
  const [typed, setTyped] = useState('');
  const [f, setF] = useState<Filters>(initialWhat ? { ...NONE, what: initialWhat } : NONE);
  const [facets, setFacets] = useState<Facets | null>(null);
  const [rows, setRows] = useState<Hist[] | null>(null);
  const [more, setMore] = useState(false);
  const [found, setFound] = useState(0);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [sheet, setSheet] = useState(false);
  const asked = useRef(0);

  // The search goes to the database a moment after the last letter, not on every one.
  useEffect(() => {
    const t = setTimeout(() => setQ(typed), 300);
    return () => clearTimeout(t);
  }, [typed]);

  useEffect(() => {
    if (!supabase) return;
    void supabase.rpc('my_history_facets').then(({ data, error }) => {
      if (!error && data) {
        setFacets(data as Facets);
        onFacets?.(data as Facets);
      }
    });
  }, [onFacets]);

  const load = useCallback(
    async (after?: Hist) => {
      if (!supabase) return;
      const n = ++asked.current;
      setBusy(true);
      const { data, error } = await supabase.rpc('my_history', args(q, f, { p_limit: PAGE, p_before: after?.at ?? null, p_before_id: after?.id ?? null }));
      // An older answer arriving after a newer question is thrown away.
      if (n !== asked.current) return;
      setBusy(false);
      if (error || !data) return setFailed(true);
      setFailed(false);
      const page = data as { jobs: Hist[]; more: boolean; found: number };
      setRows((was) => (after ? [...(was ?? []), ...page.jobs] : page.jobs));
      setMore(page.more);
      setFound(page.found);
    },
    [q, f],
  );

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (nearEnd && more && !busy && rows?.length) void load(rows[rows.length - 1]);
  }, [nearEnd, more, busy, rows, load]);

  const searching = Boolean(q.trim()) || filtersOn(f) > 0;
  const groups = useMemo(() => {
    const out: { month: string; rows: Hist[] }[] = [];
    for (const r of rows ?? []) {
      const month = r.day.slice(0, 7);
      if (out[out.length - 1]?.month !== month) out.push({ month, rows: [] });
      out[out.length - 1].rows.push(r);
    }
    return out;
  }, [rows]);
  const monthInfo = (month: string) => {
    if (searching) return null;
    const m = facets?.months.find((x) => x.month === month);
    if (!m) return null;
    return `${m.n} ${m.n === 1 ? 'job' : 'jobs'}${m.paid_paisa ? ` · paid ${rupees(m.paid_paisa)}` : ''}`;
  };
  const monthName = (month: string) => `${MONTHS[Number(month.slice(5)) - 1]} ${month.slice(0, 4)}`;
  const clearAll = () => {
    setTyped('');
    setQ('');
    setF(NONE);
  };

  if (facets && facets.total === 0) {
    return (
      <View style={s.empty}>
        <View style={s.emptyArt}>
          <DuoIcon name="jobs" size={44} />
        </View>
        <Text style={s.emptyTitle}>No finished jobs yet</Text>
        <Text style={s.emptyText}>When a job is over, it comes here: who came, what you paid, and how long it is guaranteed.</Text>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      <View style={s.box}>
        <Icon name="search" size={20} color={colour.ink} strokeWidth={2.2} />
        <TextInput
          value={typed}
          onChangeText={setTyped}
          placeholder="Search past jobs"
          placeholderTextColor={colour.steel}
          accessibilityLabel="Search past jobs: what it was, what you wrote, who came, where, or the job number"
          autoCorrect={false}
          returnKeyType="search"
          underlineColorAndroid="transparent"
          style={s.input}
        />
        {typed ? (
          <Press onPress={() => setTyped('')} accessibilityRole="button" accessibilityLabel="Clear the search" hitSlop={10} sink={0.9} style={s.clear}>
            <Icon name="cross" size={12} color={colour.white} strokeWidth={3} />
          </Press>
        ) : null}
        <View style={s.divider} />
        <Press
          onPress={() => setSheet(true)}
          accessibilityRole="button"
          accessibilityLabel={filtersOn(f) ? `Filters, ${filtersOn(f)} on` : 'Filters'}
          sink={0.92}
          style={[s.filter, filtersOn(f) > 0 && s.filterOn]}
        >
          <Icon name="filter" size={22} color={colour.ink} strokeWidth={2.2} />
          {filtersOn(f) ? (
            <View style={s.badge}>
              <Text style={s.badgeText}>{filtersOn(f)}</Text>
            </View>
          ) : null}
        </Press>
      </View>

      {filtersOn(f) ? (
        <View style={s.tags}>
          {f.what !== 'all' ? <Tag text={WHAT_LABEL[f.what]} onRemove={() => setF({ ...f, what: 'all' })} /> : null}
          {f.trade ? <Tag text={tradeName(f.trade)} onRemove={() => setF({ ...f, trade: null })} /> : null}
          {f.pro && facets ? <Tag text={proLabel(facets, f.pro)} onRemove={() => setF({ ...f, pro: null })} /> : null}
          {f.sector ? <Tag text={f.sector} onRemove={() => setF({ ...f, sector: null })} /> : null}
          {f.range.from || f.range.to ? <Tag text={rangeText(f.range)} onRemove={() => setF({ ...f, range: { from: null, to: null } })} /> : null}
        </View>
      ) : null}

      {searching && rows ? (
        <View style={s.foundRow}>
          <Text style={s.found}>
            {found} {found === 1 ? 'job' : 'jobs'} found ·{' '}
          </Text>
          <Press onPress={clearAll} accessibilityRole="button" sink={0.95} hitSlop={10}>
            <Text style={[s.found, s.link]}>Clear all</Text>
          </Press>
        </View>
      ) : null}

      {!searching && facets?.covered.length ? (
        <View style={s.covered}>
          <View style={s.coveredHead}>
            <DuoIcon name="shield" size={20} />
            <Text style={s.coveredTitle}>Still under guarantee</Text>
            <View style={s.coveredCount}>
              <Text style={s.coveredCountText}>{facets.covered.length}</Text>
            </View>
          </View>
          {facets.covered.map((c) => (
            <Press key={c.id} onPress={() => open(c.id)} accessibilityRole="button" accessibilityLabel={`${c.title}, guaranteed until ${dayText(c.until.slice(0, 10))}`} sink={0.98} style={s.coveredRow}>
              <TradeTile trade={c.trade} job={c.title} size={40} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={s.coveredJob}>{c.title}</Text>
                <Text style={s.coveredSub}>
                  {c.pro ? `${c.pro} · ` : ''}until {shortDay(c.until.slice(0, 10))}
                </Text>
              </View>
              <Text style={s.coveredLeft}>{daysLeft(c.until) === 1 ? '1 day left' : `${daysLeft(c.until)} days left`}</Text>
            </Press>
          ))}
        </View>
      ) : null}

      {rows === null && !failed ? (
        <View style={s.loading}>
          <ScrewSpinner size={28} label="Loading your past jobs" />
        </View>
      ) : null}
      {failed && !rows ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>Your past jobs could not be loaded</Text>
          <Button kind="outline" label="Try again" onPress={() => void load()} />
        </View>
      ) : null}

      {rows && !rows.length && searching ? (
        <View style={s.empty}>
          <Text style={s.emptyTitle}>No jobs match</Text>
          <Text style={s.emptyText}>Try fewer words, or take a filter off.</Text>
          <Button kind="outline" label="Clear all" onPress={clearAll} />
        </View>
      ) : null}

      {groups.map((g) => (
        <View key={g.month} style={{ gap: 8 }}>
          <View style={s.monthHead}>
            <Text style={s.month} accessibilityRole="header">
              {monthName(g.month)}
            </Text>
            {monthInfo(g.month) ? <Text style={s.monthInfo}>{monthInfo(g.month)}</Text> : null}
          </View>
          <View style={s.list}>
            {g.rows.map((r, i) => (
              <Row key={r.id} job={r} last={i === g.rows.length - 1} where={(facets?.sectors.length ?? 0) > 1} />
            ))}
          </View>
        </View>
      ))}

      {rows?.length && more ? (
        <View style={s.loading}>
          <ScrewSpinner size={24} label="Loading older jobs" />
        </View>
      ) : null}
      {rows?.length && !more && !searching && (facets?.total ?? 0) > PAGE ? (
        <Text style={s.end}>That is every job since {facets?.since ? dayText(facets.since) : 'you started'}.</Text>
      ) : null}

      {sheet && facets ? (
        <FilterSheet
          facets={facets}
          start={f}
          q={q}
          tradeName={tradeName}
          onClose={() => setSheet(false)}
          onApply={(next) => {
            setF(next);
            setSheet(false);
          }}
        />
      ) : null}
    </View>
  );
}

function Tag({ text, onRemove }: { text: string; onRemove: () => void }) {
  return (
    <Press onPress={onRemove} accessibilityRole="button" accessibilityLabel={`${text}. Take this filter off`} sink={0.95} style={s.tag}>
      <Text style={s.tagText}>{text}</Text>
      <View style={s.tagX}>
        <Icon name="cross" size={10} color={colour.white} strokeWidth={3.2} />
      </View>
    </Press>
  );
}

function statusOf(j: Hist): { text: string; tone: 'good' | 'quiet' } {
  if (j.status === 'done') return { text: j.covered ? 'Guaranteed · Done' : 'Done', tone: 'good' };
  if (j.status === 'stopped') return { text: 'Visit fee only', tone: 'quiet' };
  if (j.cancelled_by === 'nobody') return { text: 'Nobody took it', tone: 'quiet' };
  if (j.cancelled_by === 'office') return { text: 'Cancelled by Pechkas', tone: 'quiet' };
  return { text: 'Cancelled', tone: 'quiet' };
}

/** One finished job: its drawing, what it was, when and who, what she paid, how it ended. */
function Row({ job, last, where }: { job: Hist; last: boolean; where: boolean }) {
  const st = statusOf(job);
  const price = job.free ? 'Free' : job.paid_paisa ? rupees(job.paid_paisa) : '—';
  // The sector only for somebody with more than one address: for everybody else it says nothing.
  const meta = [shortDay(job.day), job.pro, where ? job.sector : null, job.ref].filter(Boolean).join(' · ');
  return (
    <Press onPress={() => open(job.id)} accessibilityRole="button" accessibilityLabel={`${job.title}. ${meta}. ${price === '—' ? '' : `${price}. `}${st.text}`} sink={0.98} style={[s.row, !last && s.rule]}>
      <TradeTile trade={job.trade} job={job.title} size={44} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        {/* The title is never cut short, even at 320 wide: it is what she is looking for. */}
        <Text style={s.title}>
          {job.title}
        </Text>
        <Text style={s.meta} numberOfLines={2}>
          {meta}
        </Text>
        <Text style={[s.status, st.tone === 'good' ? s.statusGood : s.statusQuiet]}>{st.text}</Text>
      </View>
      <Text style={s.price}>{price}</Text>
    </Press>
  );
}

type Page = 'main' | 'what' | 'kind' | 'who' | 'where' | 'when';

/**
 * Every filter in one sheet: three rows, each opening a page of its own.
 * The button at the foot always says how many jobs she will see — asked of
 * the database with the search she has typed — so nothing is a guess.
 */
function FilterSheet({ facets, start, q, tradeName, onClose, onApply }: { facets: Facets; start: Filters; q: string; tradeName: (slug: string) => string; onClose: () => void; onApply: (f: Filters) => void }) {
  const [d, setD] = useState<Filters>(start);
  const [page, setPage] = useState<Page>('main');
  const [count, setCount] = useState<number | null>(null);
  const [kindQ, setKindQ] = useState('');
  const days = useMemo(() => new Set(facets.days), [facets.days]);

  useEffect(() => {
    if (!supabase) return;
    let alive = true;
    setCount(null);
    const t = setTimeout(() => {
      void supabase?.rpc('my_history', args(q, d, { p_limit: 1 })).then(({ data }) => {
        if (alive && data) setCount((data as { found: number }).found);
      });
    }, 250);
    return () => {
      alive = false;
      clearTimeout(t);
    };
  }, [q, d]);

  const show =
    count === null ? 'Show jobs' : count === 0 ? 'No jobs match' : count === 1 ? 'Show 1 job' : `Show ${count} jobs`;
  const foot = <Button kind="ink" label={show} disabled={count === 0} onPress={() => onApply(d)} />;
  const back = (title: string, sub?: string) => (
    <View style={s.pageHead}>
      <Press onPress={() => setPage('main')} accessibilityRole="button" accessibilityLabel="Back to the filters" sink={0.9} style={s.round}>
        <Icon name="arrowLeft" size={20} color={colour.ink} strokeWidth={2.2} />
      </Press>
      <View style={{ flex: 1 }}>
        <Text style={s.pageTitle}>{title}</Text>
        {sub ? <Text style={s.pageSub}>{sub}</Text> : null}
      </View>
    </View>
  );

  if (page === 'what') {
    const options = (['all', 'done', 'covered', 'fee', 'cancelled', 'nobody'] as What[]).filter((w) => w === 'all' || w === d.what || facets.what[w as Exclude<What, 'all'>] > 0);
    return (
      <Sheet onClose={onClose} closeLabel="Close the filters">
        {back('What happened')}
        {options.map((w, i) => (
          <Choice
            key={w}
            label={w === 'all' ? 'Everything' : WHAT_LABEL[w]}
            n={w === 'all' ? facets.total : facets.what[w as Exclude<What, 'all'>]}
            on={d.what === w}
            last={i === options.length - 1}
            onPress={() => {
              setD({ ...d, what: w });
              setPage('main');
            }}
          />
        ))}
        <View style={{ marginTop: 18 }}>{foot}</View>
      </Sheet>
    );
  }

  if (page === 'kind') {
    const all = facets.trades;
    const long = all.length > 8;
    const typedQ = kindQ.trim().toLowerCase();
    const matching = typedQ ? all.filter((t) => tradeName(t.trade).toLowerCase().split(/\s+/).some((w) => w.startsWith(typedQ)) || tradeName(t.trade).toLowerCase().includes(typedQ)) : all;
    const top = !typedQ && all.length > 5 ? all.slice(0, 3) : [];
    const rest = matching.filter((t) => !top.includes(t)).sort((a, b) => tradeName(a.trade).localeCompare(tradeName(b.trade)));
    const pick = (trade: string | null) => {
      setD({ ...d, trade });
      setKindQ('');
      setPage('main');
    };
    return (
      <Sheet onClose={onClose} closeLabel="Close the filters">
        {back('Kind of work', 'Only the kinds in your own jobs')}
        {long ? (
          <View style={s.kindBox}>
            <Icon name="search" size={18} color={colour.ink} strokeWidth={2.2} />
            <TextInput value={kindQ} onChangeText={setKindQ} placeholder="Search kinds of work" placeholderTextColor={colour.steel} accessibilityLabel="Search kinds of work" autoCorrect={false} underlineColorAndroid="transparent" style={s.input} />
          </View>
        ) : null}
        {!typedQ ? <Choice label="All kinds of work" n={facets.total} on={!d.trade} onPress={() => pick(null)} /> : null}
        {top.length ? <Text style={s.label}>You use most</Text> : null}
        {top.map((t, i) => (
          <Choice key={t.trade} label={tradeName(t.trade)} n={t.n} on={d.trade === t.trade} last={i === top.length - 1} onPress={() => pick(t.trade)} />
        ))}
        {top.length && rest.length ? <Text style={s.label}>All, A to Z</Text> : null}
        {rest.map((t, i) => (
          <Choice key={t.trade} label={tradeName(t.trade)} n={t.n} on={d.trade === t.trade} last={i === rest.length - 1} onPress={() => pick(t.trade)} />
        ))}
        {typedQ && !matching.length ? <Text style={s.pageSub}>Nothing called that in your jobs.</Text> : null}
        <View style={{ marginTop: 18 }}>{foot}</View>
      </Sheet>
    );
  }

  if (page === 'who') {
    const typedQ = kindQ.trim().toLowerCase();
    const list = typedQ ? facets.pros.filter((p) => p.name.toLowerCase().startsWith(typedQ)) : facets.pros;
    const pick = (pro: string | null) => {
      setD({ ...d, pro });
      setKindQ('');
      setPage('main');
    };
    return (
      <Sheet onClose={onClose} closeLabel="Close the filters">
        {back('Who came', 'The technicians who worked on your jobs')}
        {facets.pros.length > 8 ? (
          <View style={s.kindBox}>
            <Icon name="search" size={18} color={colour.ink} strokeWidth={2.2} />
            <TextInput value={kindQ} onChangeText={setKindQ} placeholder="Search by first name" placeholderTextColor={colour.steel} accessibilityLabel="Search technicians by first name" autoCorrect={false} underlineColorAndroid="transparent" style={s.input} />
          </View>
        ) : null}
        {!typedQ ? <Choice label="Anyone" n={facets.total} on={!d.pro} onPress={() => pick(null)} /> : null}
        {list.map((p, i) => (
          <Choice key={p.key} label={p.name} sub={p.trades.join(', ')} n={p.n} on={d.pro === p.key} last={i === list.length - 1} onPress={() => pick(p.key)} />
        ))}
        {typedQ && !list.length ? <Text style={s.pageSub}>Nobody of that name came to your jobs.</Text> : null}
        <View style={{ marginTop: 18 }}>{foot}</View>
      </Sheet>
    );
  }

  if (page === 'where') {
    const pick = (sector: string | null) => {
      setD({ ...d, sector });
      setPage('main');
    };
    return (
      <Sheet onClose={onClose} closeLabel="Close the filters">
        {back('Where', 'The sectors of your own jobs')}
        <Choice label="Every address" n={facets.total} on={!d.sector} onPress={() => pick(null)} />
        {facets.sectors.map((x, i) => (
          <Choice key={x.sector} label={`Sector ${x.sector}`} n={x.n} on={d.sector === x.sector} last={i === facets.sectors.length - 1} onPress={() => pick(x.sector)} />
        ))}
        <View style={{ marginTop: 18 }}>{foot}</View>
      </Sheet>
    );
  }

  if (page === 'when') {
    return (
      <Sheet onClose={onClose} closeLabel="Close the filters">
        {back('When', 'Tap the first day, then the last')}
        <View style={s.presets}>
          {presets().map((p) => {
            const on = p.range.from === d.range.from && p.range.to === d.range.to;
            return (
              <Press key={p.label} onPress={() => setD({ ...d, range: p.range })} accessibilityRole="radio" accessibilityState={{ selected: on }} sink={0.95} style={[s.preset, on && s.presetOn]}>
                <Text style={[s.presetText, on && s.presetTextOn]}>{p.label}</Text>
              </Press>
            );
          })}
        </View>
        <View style={s.fromTo}>
          {(['from', 'to'] as const).map((k) => (
            <View key={k} style={[s.fromToBox, d.range[k] && s.fromToOn]}>
              <Text style={s.fromToLabel}>{k === 'from' ? 'From' : 'To'}</Text>
              <Text style={s.fromToDay}>{d.range[k] ? dayText(d.range[k] as string) : k === 'to' && d.range.from ? 'Tap the last day' : 'Choose a day'}</Text>
            </View>
          ))}
        </View>
        <RangeCalendar value={d.range} onChange={(range) => setD({ ...d, range })} days={days} since={facets.since} />
        {d.range.from ? (
          <Press onPress={() => setD({ ...d, range: { from: null, to: null } })} accessibilityRole="button" sink={0.95} style={s.anyTime}>
            <Text style={[s.found, s.link]}>Any time</Text>
          </Press>
        ) : null}
        <View style={{ marginTop: 14 }}>{foot}</View>
      </Sheet>
    );
  }

  return (
    <Sheet onClose={onClose} closeLabel="Close the filters" title="Filter past jobs">
      <FilterRow icon="jobs" label="What happened" value={d.what === 'all' ? 'Everything' : WHAT_LABEL[d.what]} on={d.what !== 'all'} onPress={() => setPage('what')} />
      <FilterRow icon="briefcase" label="Kind of work" value={d.trade ? tradeName(d.trade) : 'All'} on={Boolean(d.trade)} onPress={() => setPage('kind')} />
      {facets.pros.length ? <FilterRow icon="person" label="Who came" value={d.pro ? proLabel(facets, d.pro) : 'Anyone'} on={Boolean(d.pro)} onPress={() => setPage('who')} /> : null}
      {/* Only for somebody with jobs at more than one address: for everybody else it would be a filter with one answer. */}
      {facets.sectors.length > 1 || d.sector ? <FilterRow icon="pin" label="Where" value={d.sector ? `Sector ${d.sector}` : 'Every address'} on={Boolean(d.sector)} onPress={() => setPage('where')} /> : null}
      <FilterRow icon="calendar" label="When" value={rangeText(d.range)} on={Boolean(d.range.from || d.range.to)} onPress={() => setPage('when')} last />
      {filtersOn(d) ? (
        <Press onPress={() => setD(NONE)} accessibilityRole="button" sink={0.95} style={s.anyTime}>
          <Text style={[s.found, s.link]}>Clear all</Text>
        </Press>
      ) : null}
      <View style={{ marginTop: 14 }}>{foot}</View>
    </Sheet>
  );
}

function FilterRow({ icon, label, value, on, onPress, last = false }: { icon: DuoName; label: string; value: string; on: boolean; onPress: () => void; last?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${label}: ${value}`} sink={0.98} style={[s.frow, !last && s.rule]}>
      <View style={s.ftile}>
        <DuoIcon name={icon} size={22} />
      </View>
      <Text style={s.flabel}>{label}</Text>
      <Text style={[s.fvalue, on && s.fvalueOn]} numberOfLines={2}>
        {value}
      </Text>
      <Icon name="chevronRight" size={18} color={colour.steel} strokeWidth={2.4} />
    </Press>
  );
}

function Choice({ label, sub, n, on, onPress, last = false }: { label: string; sub?: string; n: number; on: boolean; onPress: () => void; last?: boolean }) {
  return (
    <Press onPress={onPress} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${label}${sub ? `, ${sub}` : ''}, ${n} ${n === 1 ? 'job' : 'jobs'}`} sink={0.98} style={[s.choice, !last && s.rule]}>
      <View style={{ flex: 1, paddingVertical: sub ? 6 : 0 }}>
        <Text style={[s.choiceText, on && s.choiceTextOn]}>{label}</Text>
        {sub ? <Text style={s.choiceSub}>{sub}</Text> : null}
      </View>
      <Text style={s.choiceN}>{n}</Text>
      <View style={[s.radio, on && s.radioOn]}>{on ? <Icon name="check" size={13} color={colour.white} strokeWidth={3.4} /> : null}</View>
    </Press>
  );
}

const s = StyleSheet.create({
  box: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 56, paddingLeft: 14, paddingRight: 6, borderRadius: 18, backgroundColor: colour.white, boxShadow: SHADOW },
  input: { flex: 1, minWidth: 0, alignSelf: 'stretch', fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink, outlineWidth: 0 },
  clear: { width: 24, height: 24, borderRadius: 12, backgroundColor: colour.steel, alignItems: 'center', justifyContent: 'center' },
  divider: { width: 1, height: 26, backgroundColor: colour.rule },
  filter: { width: 44, height: 44, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  filterOn: { backgroundColor: colour.softYellow },
  badge: { position: 'absolute', top: 3, right: 2, minWidth: 18, height: 18, paddingHorizontal: 4, borderRadius: 9, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  badgeText: { fontFamily: font.display, fontSize: 11, color: colour.white },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  tag: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingLeft: 13, paddingRight: 8, borderRadius: 18, backgroundColor: colour.greenSoft },
  tagText: { fontFamily: font.displayBold, fontSize: 13, color: colour.green },
  tagX: { width: 20, height: 20, borderRadius: 10, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  foundRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 6 },
  found: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.steel },
  link: { color: colour.ink, textDecorationLine: 'underline' },
  covered: { gap: 8, padding: 14, borderRadius: 24, backgroundColor: colour.green },
  coveredHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  coveredTitle: { flex: 1, fontFamily: font.display, fontSize: 15.5, color: colour.white },
  coveredCount: { minWidth: 24, height: 24, paddingHorizontal: 6, borderRadius: 12, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  coveredCountText: { fontFamily: font.display, fontSize: 12.5, color: colour.ink },
  coveredRow: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.1)' },
  coveredJob: { fontFamily: font.displayBold, fontSize: 14, lineHeight: 18, color: colour.white },
  coveredSub: { fontFamily: font.bodySemi, fontSize: 12, color: '#cfe4df', marginTop: 1 },
  coveredLeft: { fontFamily: font.displayBold, fontSize: 12, color: colour.white },
  loading: { alignItems: 'center', paddingVertical: 24 },
  monthHead: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginTop: 6, paddingHorizontal: 6 },
  month: { fontFamily: font.display, fontSize: 15, color: colour.ink },
  monthInfo: { flexShrink: 1, fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel, textAlign: 'right' },
  list: { paddingHorizontal: 12, paddingVertical: 2, borderRadius: 22, backgroundColor: colour.white, boxShadow: SHADOW },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 66, paddingVertical: 10 },
  rule: { borderBottomWidth: 1, borderBottomColor: colour.rule },
  title: { fontFamily: font.displayBold, fontSize: 14.5, lineHeight: 19, color: colour.ink },
  meta: { fontFamily: font.bodySemi, fontSize: 12, color: colour.steel },
  price: { flexShrink: 0, alignSelf: 'flex-start', marginTop: 2, fontFamily: font.display, fontSize: 14.5, color: colour.ink },
  status: { fontFamily: font.displayBold, fontSize: 12, marginTop: 1 },
  statusGood: { color: colour.green },
  statusQuiet: { color: colour.steel },
  end: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel, textAlign: 'center', paddingVertical: 12 },
  empty: { alignItems: 'center', gap: 10, padding: 22, borderRadius: 24, backgroundColor: colour.white, boxShadow: SHADOW },
  emptyArt: { width: 84, height: 84, borderRadius: 26, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontFamily: font.display, fontSize: 18, color: colour.ink, textAlign: 'center' },
  emptyText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel, textAlign: 'center' },
  pageHead: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 8 },
  round: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  pageTitle: { fontFamily: font.display, fontSize: 19, color: colour.ink },
  pageSub: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel },
  frow: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingHorizontal: 6 },
  ftile: { width: 38, height: 38, borderRadius: 12, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center' },
  flabel: { flex: 1, fontFamily: font.displayBold, fontSize: 15.5, color: colour.ink },
  fvalue: { flexShrink: 1, maxWidth: '45%', fontFamily: font.bodySemi, fontSize: 14, color: colour.steel, textAlign: 'right' },
  fvalueOn: { fontFamily: font.displayBold, color: colour.green },
  choice: { flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 52, paddingHorizontal: 6 },
  choiceText: { fontFamily: font.bodySemi, fontSize: 15.5, color: colour.ink },
  choiceTextOn: { fontFamily: font.display },
  choiceSub: { fontFamily: font.bodySemi, fontSize: 12.5, color: colour.steel, marginTop: 1 },
  choiceN: { fontFamily: font.bodySemi, fontSize: 13, color: colour.steel },
  radio: { width: 24, height: 24, borderRadius: 12, borderWidth: 2, borderColor: '#c9cdd1', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderWidth: 0, backgroundColor: colour.green },
  label: { fontFamily: font.display, fontSize: 12.5, letterSpacing: 0.7, textTransform: 'uppercase', color: colour.steel, marginTop: 14, marginBottom: 2, paddingHorizontal: 6 },
  kindBox: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 50, paddingHorizontal: 14, borderRadius: 15, backgroundColor: colour.canvas, marginBottom: 6 },
  presets: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  preset: { minHeight: 40, paddingHorizontal: 14, borderRadius: 20, backgroundColor: colour.canvas, justifyContent: 'center' },
  presetOn: { backgroundColor: colour.green },
  presetText: { fontFamily: font.displayBold, fontSize: 13.5, color: colour.ink },
  presetTextOn: { color: colour.white },
  fromTo: { flexDirection: 'row', gap: 8, marginTop: 12 },
  fromToBox: { flex: 1, paddingHorizontal: 12, paddingVertical: 8, borderRadius: 14, backgroundColor: colour.canvas },
  fromToOn: { backgroundColor: colour.white, borderWidth: 2, borderColor: colour.ink, paddingHorizontal: 10, paddingVertical: 6 },
  fromToLabel: { fontFamily: font.bodySemi, fontSize: 12, color: colour.steel },
  fromToDay: { fontFamily: font.display, fontSize: 14.5, color: colour.ink },
  anyTime: { alignSelf: 'center', minHeight: 44, justifyContent: 'center', paddingHorizontal: 12 },
});
