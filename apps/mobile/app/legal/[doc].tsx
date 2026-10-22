import { Fragment } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { isLegalSlug, LEGAL_DOCS, legalLink, legalLinkText, type Block, type Run } from '@pechkas/shared/src/legal';
import { Icon } from '../../src/components/Icon';
import { Button, Screen } from '../../src/components/ui';
import { openLegal } from '../../src/legal';
import { colour, font, radius } from '../../src/theme';

/**
 * The privacy policy, the terms, the technician agreement and how to delete
 * an account, read inside the app.
 *
 * The words are the website's, copied by scripts/copy-legal.mjs — never
 * typed here — so this screen and the page the stores link to cannot say
 * different things. It is open to people who have not signed in: the
 * welcome screen asks them to agree to two of these.
 */
export default function LegalPage() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  if (!isLegalSlug(doc)) return <Redirect href="/help" />;
  const d = LEGAL_DOCS[doc];
  return (
    <Screen hero={{ title: d.title, sub: d.lede, back: true }}>
      <View style={s.body}>
        {d.blocks.map((b, i) => (
          <Fragment key={i}>{block(b)}</Fragment>
        ))}
        <Text style={s.source}>The same text is published at {d.web.replace('https://', '')}, where the app stores link to it.</Text>
      </View>
    </Screen>
  );
}

function follow(href: string) {
  const to = legalLink(href);
  if (to.kind === 'doc') openLegal(to.slug);
  else Linking.openURL(to.url);
}

/** A paragraph's runs: bold, a visible [GAP], an open decision, or a link. */
function Runs({ runs }: { runs: Run[] }) {
  return runs.map((r, i) => {
    const style = [r.b && s.bold, r.i && s.italic, r.mark && s.mark, r.ph && s.ph, r.href && s.link];
    if (r.href) {
      const href = r.href;
      return (
        <Text key={i} style={style} accessibilityRole="link" onPress={() => follow(href)} suppressHighlighting>
          {legalLinkText(r)}
        </Text>
      );
    }
    return (
      <Text key={i} style={style}>
        {r.t}
      </Text>
    );
  });
}

function List({ kind, items }: { kind: 'ul' | 'ol' | 'cross'; items: Run[][] }) {
  return (
    <View style={s.list}>
      {items.map((runs, i) => (
        <View key={i} style={s.item}>
          <View style={s.marker}>
            {kind === 'ol' ? (
              <Text style={s.number}>{i + 1}.</Text>
            ) : kind === 'cross' ? (
              <Icon name="cross" size={16} color={colour.brick} strokeWidth={2.4} />
            ) : (
              <View style={s.dot} />
            )}
          </View>
          <Text style={[s.p, { flex: 1 }]}>
            <Runs runs={runs} />
          </Text>
        </View>
      ))}
    </View>
  );
}

function block(b: Block) {
  switch (b.k) {
    case 'h2':
      return (
        <Text style={s.h2} accessibilityRole="header">
          {b.text}
        </Text>
      );
    case 'h3':
      return (
        <Text style={s.h3} accessibilityRole="header">
          {b.text}
        </Text>
      );
    case 'meta':
      return (
        <Text style={s.meta}>
          <Runs runs={b.c} />
        </Text>
      );
    case 'p':
      return (
        <Text style={s.p}>
          <Runs runs={b.c} />
        </Text>
      );
    case 'decide':
      return (
        <View style={s.card}>
          <Text style={s.p}>
            <Runs runs={b.c} />
          </Text>
        </View>
      );
    case 'ul':
    case 'ol':
    case 'cross':
      return <List kind={b.k} items={b.items} />;
    case 'review':
      return (
        <View style={s.review}>
          {b.paras.map((runs, i) => (
            <Text key={i} style={s.p}>
              <Runs runs={runs} />
            </Text>
          ))}
        </View>
      );
    case 'actions':
      return (
        <View style={{ gap: 10 }}>
          {b.items.map((a) => (
            <Button key={a.href} kind={a.kind === 'whatsapp' ? 'green' : 'outline'} label={a.label} onPress={() => follow(a.href)} />
          ))}
        </View>
      );
  }
}

const s = StyleSheet.create({
  body: { gap: 12 },
  h2: { fontFamily: font.display, fontSize: 21, lineHeight: 26, color: colour.ink, marginTop: 14 },
  h3: { fontFamily: font.bodySemi, fontSize: 16, lineHeight: 22, color: colour.ink, marginTop: 4 },
  p: { fontFamily: font.body, fontSize: 15, lineHeight: 23, color: colour.ink },
  meta: { fontFamily: font.body, fontSize: 14, lineHeight: 22, color: colour.steel },
  bold: { fontFamily: font.bodySemi },
  italic: { fontStyle: 'italic' },
  mark: { fontFamily: font.bodySemi, color: colour.brick },
  // A gap the owner has still to fill: shown, never hidden, as on the website.
  ph: { fontFamily: font.bodySemi, color: colour.brick, backgroundColor: 'rgba(158, 59, 34, 0.08)' },
  link: { fontFamily: font.bodySemi, color: colour.green, textDecorationLine: 'underline' },
  list: { gap: 8 },
  item: { flexDirection: 'row', gap: 10 },
  marker: { width: 18, height: 23, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colour.green },
  number: { fontFamily: font.bodySemi, fontSize: 15, color: colour.green },
  card: { padding: 14, borderRadius: radius.big, backgroundColor: colour.white },
  review: { gap: 8, padding: 14, borderRadius: radius.big, backgroundColor: '#f6e3dc', marginTop: 8 },
  source: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: colour.steel, marginTop: 16 },
});
