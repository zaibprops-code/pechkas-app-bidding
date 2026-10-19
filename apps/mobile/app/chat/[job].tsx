import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { Press } from '../../src/components/Press';
import { Button, Loading } from '../../src/components/ui';
import { useAccount } from '../../src/account';
import { ask, supabase } from '../../src/supabase';
import { fill, useProWords } from '../../src/words';
import { colour, font, radius } from '../../src/theme';

/**
 * The chat on one job, between the customer and the technician she chose.
 * Text only, kept as the record — the office can read it, and the screen
 * says so. While open it asks again every five seconds; a notification
 * covers the rest. Its words never go on a lock screen.
 */

type Message = { id: number; mine: boolean; body: string; at: string };
type Chat = { ok: true; ref: string; side: 'customer' | 'pro'; can_send: boolean; other_name: string; messages: Message[] } | { ok: false; why: string };

const CUSTOMER = {
  chatWith: 'Chat with {name}',
  chatEmpty: 'No messages yet. Ask about the gate, parking, or when he will be there.',
  chatPlaceholder: 'Write a message…',
  sendMessage: 'Send',
  chatClosed: 'This chat is closed.',
  chatNote: 'The Pechkas office can read this chat, so there is a record if anything goes wrong.',
  errBody: 'The message is empty or too long.',
  back: 'Back',
};

export default function ChatScreen() {
  const { job } = useLocalSearchParams<{ job: string }>();
  const { account } = useAccount();
  const pro = account?.role === 'pro';
  const { w: proWords } = useProWords();
  const w = pro ? proWords : CUSTOMER;
  const insets = useSafeAreaInsets();
  const [chat, setChat] = useState<Chat | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const scroll = useRef<ScrollView>(null);
  const count = chat?.ok ? chat.messages.length : 0;

  const load = useCallback(async () => {
    if (!supabase || !job) return;
    const { data, error } = await supabase.rpc('job_chat', { p_job: job });
    if (!error && data) setChat(data as Chat);
  }, [job]);

  useFocusEffect(
    useCallback(() => {
      load();
      const t = setInterval(load, 5000);
      return () => clearInterval(t);
    }, [load]),
  );

  useEffect(() => {
    setTimeout(() => scroll.current?.scrollToEnd({ animated: false }), 50);
  }, [count]);

  async function send() {
    const body = text.trim();
    if (!body) return;
    setBusy(true);
    setProblem(null);
    const r = await ask('send_message', { p_job: job, p_body: body });
    setBusy(false);
    if (!r.ok) return setProblem(r.field === 'body' && pro ? w.errBody : r.why);
    setText('');
    load();
  }

  const bg = colour.canvas;
  const fg = colour.ink;
  if (!chat) return <Loading />;

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      <View style={[s.top, { paddingTop: insets.top + 12 }]}>
        <Press onPress={() => (router.canGoBack() ? router.back() : router.replace(pro ? '/pro' : '/jobs'))} accessibilityRole="button" accessibilityLabel={w.back} style={[s.back, { backgroundColor: colour.white }]}>
          <Icon name="arrowLeft" size={20} color={fg} strokeWidth={2.2} />
        </Press>
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: fg }]} accessibilityRole="header" numberOfLines={1}>
            {chat.ok ? fill(w.chatWith, { name: chat.other_name }) : w.chatClosed}
          </Text>
          {chat.ok ? <Text style={[s.sub, { color: colour.steel }]}>{chat.ref}</Text> : null}
        </View>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}>
        <Text style={[s.note, { color: colour.steel }]}>{w.chatNote}</Text>
        {chat.ok && chat.messages.length === 0 ? <Text style={[s.note, { color: colour.steel }]}>{w.chatEmpty}</Text> : null}
        {chat.ok
          ? chat.messages.map((m) => (
              <View key={m.id} style={[s.bubble, m.mine ? s.mine : s.theirs]}>
                <Text style={[s.body, { color: m.mine ? colour.ink : fg }]}>{m.body}</Text>
                <Text style={[s.time, { color: m.mine ? colour.inkSoft : colour.steel }]}>
                  {new Date(m.at).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            ))
          : null}
      </ScrollView>

      {chat.ok && chat.can_send ? (
        <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 12), borderTopColor: colour.rule }]}>
          {problem ? <Text style={s.error}>{problem}</Text> : null}
          <View style={s.row}>
            <TextInput
              value={text}
              onChangeText={setText}
              placeholder={w.chatPlaceholder}
              placeholderTextColor={colour.steel}
              maxLength={500}
              multiline
              accessibilityLabel={w.chatPlaceholder}
              style={s.input}
            />
            <View style={{ width: 96 }}>
              <Button kind="yellow" label={w.sendMessage} busy={busy} onPress={send} />
            </View>
          </View>
        </View>
      ) : (
        <View style={{ padding: 16, paddingBottom: Math.max(insets.bottom, 16) }}>
          <Text style={[s.note, { color: colour.steel }]}>{w.chatClosed}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingBottom: 8 },
  back: { width: 44, height: 44, borderRadius: 999, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: font.display, fontSize: 20 },
  sub: { fontFamily: font.body, fontSize: 12 },
  note: { fontFamily: font.body, fontSize: 13, lineHeight: 18, textAlign: 'center', marginBottom: 4 },
  bubble: { maxWidth: '82%', paddingHorizontal: 12, paddingVertical: 8, borderRadius: 16, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colour.yellow, borderBottomRightRadius: 4 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colour.white, borderBottomLeftRadius: 4, borderWidth: 1, borderColor: colour.rule },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21 },
  time: { fontFamily: font.body, fontSize: 11, alignSelf: 'flex-end' },
  bar: { paddingHorizontal: 12, paddingTop: 8, borderTopWidth: 1, gap: 6 },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 52, maxHeight: 120, borderRadius: radius.card, paddingHorizontal: 12, paddingTop: 14, backgroundColor: colour.white, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 16, borderWidth: 1.5, borderColor: colour.rule },
  error: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
});
