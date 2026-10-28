import { StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { LEGAL_DOCS, type LegalSlug } from '@pechkas/shared/src/legal';
import { Screen } from '../../src/components/ui';
import { DuoIcon, type DuoName } from '../../src/components/DuoIcon';
import { Icon } from '../../src/components/Icon';
import { Press } from '../../src/components/Press';
import { openLegal } from '../../src/legal';
import { colour, font, shadow } from '../../src/theme';

/**
 * Legal documents, from the menu: every page the app's rules are written in,
 * one card each — its name and its own one-line summary — the way the
 * owner's reference app lists them. Tapping one opens it to read
 * (app/legal/[doc].tsx).
 *
 * The names and the summaries are the pages' own (`title` and `lede`,
 * copied from the website by scripts/copy-legal.mjs), never typed here, so
 * this list cannot describe a page differently from the page itself. Open
 * to people not signed in, like the pages.
 */

const ORDER: { slug: LegalSlug; icon: DuoName; danger?: boolean }[] = [
  { slug: 'privacy', icon: 'lock' },
  { slug: 'terms', icon: 'doc' },
  { slug: 'technician-agreement', icon: 'briefcase' },
  { slug: 'delete-account', icon: 'trash', danger: true },
];

export default function LegalList() {
  return (
    <Screen hero={{ title: 'Legal documents', sub: 'The rules Pechkas works by, in full.', back: true }}>
      {ORDER.map(({ slug, icon, danger }) => {
        const d = LEGAL_DOCS[slug];
        return (
          <Card key={slug} icon={icon} danger={danger} title={d.title} text={d.lede} onPress={() => openLegal(slug)} />
        );
      })}
      {/* Not a document, but where a question about one goes: Help has the office's hours, WhatsApp and phone. */}
      <Card icon="support" title="Contact Pechkas" text="The office’s hours, WhatsApp and phone number." onPress={() => router.push('/help')} />
    </Screen>
  );
}

function Card({ icon, title, text, danger = false, onPress }: { icon: DuoName; title: string; text: string; danger?: boolean; onPress: () => void }) {
  return (
    <Press onPress={onPress} accessibilityRole="button" accessibilityLabel={`${title}. ${text}`} sink={0.98} style={s.card}>
      <View style={[s.tile, danger && s.tileDanger]}>
        <DuoIcon name={icon} size={24} accent={danger ? colour.brickTint : colour.yellow} ink={danger ? colour.brick : colour.ink} />
      </View>
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.text}>{text}</Text>
      </View>
      <Icon name="chevronRight" size={20} color={colour.steel} strokeWidth={2.2} />
    </Press>
  );
}

const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 14, padding: 16, borderRadius: 24, backgroundColor: colour.white, boxShadow: shadow.card },
  tile: { width: 46, height: 46, borderRadius: 15, backgroundColor: colour.softYellow, alignItems: 'center', justifyContent: 'center', alignSelf: 'flex-start' },
  tileDanger: { backgroundColor: colour.softBrick },
  title: { fontFamily: font.display, fontSize: 17, lineHeight: 22, color: colour.ink },
  text: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel },
});
