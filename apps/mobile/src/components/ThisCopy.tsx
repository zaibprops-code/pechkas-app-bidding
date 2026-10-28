import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { APP_EDITION } from '@pechkas/shared';
import { supabase } from '../supabase';
import { APP_VERSION, BUILT_AT, COMMIT, NEWEST_MIGRATION } from '../version';
import { colour, font, radius, shadow } from '../theme';

type Db = { state: 'checking' } | { state: 'ok' } | { state: 'behind'; newest: string | null } | { state: 'unknown' };

/**
 * "This copy": which code is installed and whether the database has every
 * change this code needs. One screenshot of it answers "why is something
 * missing on my phone?".
 */
export function ThisCopy({ dark = false }: { dark?: boolean }) {
  const [db, setDb] = useState<Db>({ state: 'checking' });

  useEffect(() => {
    if (!supabase) return setDb({ state: 'unknown' });
    supabase.rpc('db_version').then(({ data, error }) => {
      if (error) {
        // No such function: the database is older than the migration that made it.
        if (/function|does not exist|schema cache|404/i.test(error.message)) setDb({ state: 'behind', newest: null });
        else setDb({ state: 'unknown' });
        return;
      }
      const newest = (data as { newest?: string } | null)?.newest ?? null;
      setDb(newest && newest >= NEWEST_MIGRATION ? { state: 'ok' } : { state: 'behind', newest });
    });
  }, []);

  const fg = dark ? colour.paper : colour.ink;
  const muted = dark ? '#b9c2c9' : colour.steel;
  const built = BUILT_AT ? new Date(BUILT_AT).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : null;

  return (
    <View style={[s.box, dark ? { borderWidth: 1, borderColor: 'rgba(250,246,239,0.18)' } : s.light]}>
      <Text style={[s.title, { color: fg }]}>This copy of the app</Text>
      <Text style={[s.line, { color: muted }]}>
        Version {APP_VERSION} · edition {APP_EDITION}
        {COMMIT ? ` · code ${COMMIT}` : ' · local copy'}
        {built ? ` · built ${built}` : ''}
      </Text>
      {db.state === 'checking' ? <Text style={[s.line, { color: muted }]}>Checking the database…</Text> : null}
      {db.state === 'ok' ? <Text style={[s.line, { color: muted }]}>Database: up to date.</Text> : null}
      {db.state === 'unknown' ? <Text style={[s.line, { color: muted }]}>Database: could not be checked (no connection).</Text> : null}
      {db.state === 'behind' ? (
        <View style={[s.warn, { backgroundColor: dark ? '#3a2019' : '#f6e3dc' }]}>
          <Text style={[s.warnText, { color: dark ? '#ffb4a3' : colour.brick }]}>
            The database is missing changes this app needs, so some screens will not work.
            {db.newest ? ` Its newest change is ${db.newest.slice(0, 14)}.` : ''} In Supabase, SQL Editor, run every file in
            supabase/migrations after that one, in order, up to {NEWEST_MIGRATION}.
          </Text>
        </View>
      ) : null}
    </View>
  );
}

const s = StyleSheet.create({
  box: { gap: 6, padding: 16, borderRadius: radius.big },
  light: { backgroundColor: colour.white, borderRadius: 24, boxShadow: shadow.card },
  title: { fontFamily: font.bodySemi, fontSize: 14 },
  line: { fontFamily: font.body, fontSize: 13, lineHeight: 18 },
  warn: { padding: 10, borderRadius: 12 },
  warnText: { fontFamily: font.bodySemi, fontSize: 13, lineHeight: 18 },
});
