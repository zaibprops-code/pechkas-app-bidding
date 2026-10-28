import { Fragment } from 'react';
import { Linking, StyleSheet, Text, View } from 'react-native';
import { Redirect, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { isLegalSlug, LEGAL_DOCS, legalLink, legalLinkText, type Block, type Run } from '@pechkas/shared/src/legal';
import { Icon } from '../../src/components/Icon';
import { DuoIcon } from '../../src/components/DuoIcon';
import { Press } from '../../src/components/Press';
import { Button, Screen } from '../../src/components/ui';
import { openLegal } from '../../src/legal';
import { colour, font, radius, shadow } from '../../src/theme';

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
  const nav = useNavigation();
  if (!isLegalSlug(doc)) return <Redirect href="/legal" />;
  const d = LEGAL_DOCS[doc];

  // "Last updated" is the page's first line on the website; here it stays in
  // sight at the foot, the way the owner's reference app shows it.
  const isUpdated = (b: Block) => b.k === 'meta' && /^Last updated/i.test(b.c[0]?.t ?? '');
  const updated = d.blocks.find(isUpdated);
  const blocks = d.blocks.filter((b) => !isUpdated(b));

  // How many legal pages are open on top of one another (the list, this
  // page, a page it linked to). Two or more: × closes them all at once.
  const routes = nav.getState()?.routes ?? [];
  let deep = 0;
  for (let i = routes.length - 1; i >= 0 && routes[i].name.startsWith('legal'); i--) deep++;
  const closeAll = () => (deep < routes.length ? router.dismiss(deep) : router.replace('/'));

  return (
    <Screen
      hero={{
        title: d.title,
        sub: d.lede,
        back: true,
        right:
          deep >= 2 ? (
            <Press onPress={closeAll} accessibilityRole="button" accessibilityLabel="Close the legal pages" sink={0.9} style={s.close}>
              <Icon name="cross" size={20} color={colour.ink} strokeWidth={2.4} />
            </Press>
          ) : undefined,
      }}
      footer={
        updated && updated.k === 'meta' ? (
          <View style={s.updated}>
            <DuoIcon name="clock" size={18} />
            <Text style={s.updatedText}>
              <Runs runs={updated.c} />
            </Text>
          </View>
        ) : undefined
      }
    >
      <View style={s.body}>
        {blocks.map((b, i) => (
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
  // Section headings in the trust colour, as the reference app colours its own.
  h2: { fontFamily: font.display, fontSize: 20, lineHeight: 26, color: colour.green, marginTop: 14 },
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
  card: { padding: 16, borderRadius: 20, backgroundColor: colour.white, boxShadow: shadow.card },
  review: { gap: 8, padding: 14, borderRadius: radius.big, backgroundColor: colour.softBrick, marginTop: 8 },
  close: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center', boxShadow: shadow.card },
  updated: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, minHeight: 48, paddingHorizontal: 16, borderRadius: 999, backgroundColor: colour.white, boxShadow: shadow.card },
  updatedText: { fontFamily: font.bodySemi, fontSize: 14, color: colour.ink, flexShrink: 1 },
  source: { fontFamily: font.body, fontSize: 13, lineHeight: 19, color: colour.steel, marginTop: 16 },
});
