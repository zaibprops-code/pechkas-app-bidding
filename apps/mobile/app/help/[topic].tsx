import { ScrollView, Text, View } from 'react-native';
import { Redirect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { BigTile, HelpTop, OfficeRow, Questions, Section, TopicRow, helpStyles, topInk } from '../../src/components/HelpParts';
import { SystemBars, useScrollEnd } from '../../src/components/ui';
import { useAccount } from '../../src/account';
import { CUSTOMER_HELP, TECHNICIAN_HELP } from '../../src/help';
import { colour } from '../../src/theme';

/**
 * One Help topic on its own page, not a pop-up: the topic on the side's
 * coloured top, every question in one card with the first answer open (one
 * at a time), then the two topics after it and Write to the office.
 */
export default function HelpTopicPage() {
  const { account } = useAccount();
  const pro = account?.role === 'pro';
  const topics = pro ? TECHNICIAN_HELP : CUSTOMER_HELP;
  const { topic: key } = useLocalSearchParams<{ topic: string }>();
  const at = topics.findIndex((t) => t.key === key);
  const end = useScrollEnd(28);
  // A topic of the other side (the mode changed) or a stale link: back to the list.
  if (at < 0) return <Redirect href="/help" />;
  const topic = topics[at];
  const next = [topics[(at + 1) % topics.length], topics[(at + 2) % topics.length]];
  const ink = topInk(pro);

  return (
    <View style={{ flex: 1, backgroundColor: colour.canvas }}>
      <StatusBar style={pro ? 'light' : 'dark'} />
      <ScrollView contentContainerStyle={{ paddingBottom: end }}>
        <HelpTop pro={pro} title="Help">
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginTop: 12 }}>
            <BigTile topic={topic} pro={pro} />
            <View style={{ flex: 1 }}>
              <Text style={ink.title} accessibilityRole="header">
                {topic.title}
              </Text>
              <Text style={ink.line}>{topic.qa.length} questions</Text>
            </View>
          </View>
        </HelpTop>
        <View style={helpStyles.body}>
          <Questions key={topic.key} items={topic.qa.map((qa) => ({ qa }))} openFirst />
          <Section>Other topics</Section>
          <View style={helpStyles.rowCard}>
            {next.map((t, i) => (
              <TopicRow key={t.key} topic={t} last={i === next.length - 1} swap />
            ))}
          </View>
          <OfficeRow />
        </View>
      </ScrollView>
      <SystemBars bg={colour.canvas} top={false} />
    </View>
  );
}
