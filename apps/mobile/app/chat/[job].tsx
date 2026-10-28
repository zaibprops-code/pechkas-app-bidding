import { useCallback, useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Icon } from '../../src/components/Icon';
import { Press } from '../../src/components/Press';
import { Loading } from '../../src/components/ui';
import { DuoIcon } from '../../src/components/DuoIcon';
import { ScrewSpinner } from '../../src/components/ScrewSpinner';
import { useAccount } from '../../src/account';
import { ask, supabase } from '../../src/supabase';
import { fill, useProWords } from '../../src/words';
import { colour, font } from '../../src/theme';

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

  const name = chat.ok ? chat.other_name : '';

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="dark" />
      {/* A messenger's header: back, who you are talking to, and the job. It covers the clock on its own. */}
      <View style={[s.top, { paddingTop: insets.top + 10 }]}>
        <Press onPress={() => (router.canGoBack() ? router.back() : router.replace(pro ? '/pro' : '/jobs'))} accessibilityRole="button" accessibilityLabel={w.back} sink={0.9} style={s.back}>
          <Icon name="arrowLeft" size={20} color={fg} strokeWidth={2.2} />
        </Press>
        {chat.ok ? (
          <View style={s.avatar}>
            <Text style={s.avatarText}>{name.charAt(0).toUpperCase()}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }}>
          <Text style={[s.title, { color: fg }]} accessibilityRole="header" numberOfLines={1}>
            {chat.ok ? fill(w.chatWith, { name }) : w.chatClosed}
          </Text>
          {chat.ok ? <Text style={s.sub}>{chat.ref}</Text> : null}
        </View>
      </View>

      <ScrollView ref={scroll} contentContainerStyle={{ padding: 16, gap: 8, flexGrow: 1 }}>
        <View style={s.noteCard}>
          <DuoIcon name="lock" size={18} />
          <Text style={s.noteText}>{w.chatNote}</Text>
        </View>
        {chat.ok && chat.messages.length === 0 ? (
          <View style={s.empty}>
            <View style={s.emptyTile}>
              <DuoIcon name="chat" size={30} />
            </View>
            <Text style={s.emptyText}>{w.chatEmpty}</Text>
          </View>
        ) : null}
        {chat.ok
          ? chat.messages.map((m) => (
              <View key={m.id} style={[s.bubble, m.mine ? s.mine : s.theirs]}>
                <Text style={s.body}>{m.body}</Text>
                <Text style={[s.time, { color: m.mine ? colour.inkSoft : colour.steel }]}>
                  {new Date(m.at).toLocaleTimeString('en-PK', { hour: 'numeric', minute: '2-digit' })}
                </Text>
              </View>
            ))
          : null}
      </ScrollView>

      {chat.ok && chat.can_send ? (
        <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
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
            {/* One round yellow button, as every messenger has. It says "Send" to a screen reader. */}
            <Press onPress={busy ? undefined : send} accessibilityRole="button" accessibilityLabel={w.sendMessage} accessibilityState={{ busy }} sink={0.9} style={s.send}>
              {busy ? <ScrewSpinner size={22} label={w.sendMessage} /> : <Icon name="arrowRight" size={22} color={colour.ink} strokeWidth={2.6} />}
            </Press>
          </View>
        </View>
      ) : (
        <View style={[s.bar, { paddingBottom: Math.max(insets.bottom, 16), paddingTop: 14 }]}>
          <Text style={[s.noteText, { textAlign: 'center' }]}>{w.chatClosed}</Text>
        </View>
      )}
    </KeyboardAvoidingView>
  );
}

const s = StyleSheet.create({
  top: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingBottom: 12, backgroundColor: colour.white, borderBottomWidth: 1, borderBottomColor: colour.rule },
  back: { width: 44, height: 44, borderRadius: 22, backgroundColor: colour.canvas, alignItems: 'center', justifyContent: 'center' },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: colour.green, alignItems: 'center', justifyContent: 'center' },
  avatarText: { fontFamily: font.display, fontSize: 18, color: colour.yellow },
  title: { fontFamily: font.display, fontSize: 18 },
  sub: { fontFamily: font.mono, fontSize: 12, color: colour.steel },
  noteCard: { flexDirection: 'row', alignItems: 'center', gap: 10, alignSelf: 'center', maxWidth: 360, paddingHorizontal: 14, paddingVertical: 10, borderRadius: 16, backgroundColor: colour.softYellow, marginBottom: 6 },
  noteText: { flexShrink: 1, fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.inkSoft },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 28, paddingHorizontal: 20 },
  emptyTile: { width: 72, height: 72, borderRadius: 24, backgroundColor: colour.white, alignItems: 'center', justifyContent: 'center' },
  emptyText: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.steel, textAlign: 'center', maxWidth: 280 },
  bubble: { maxWidth: '82%', paddingHorizontal: 14, paddingVertical: 9, borderRadius: 20, gap: 2 },
  mine: { alignSelf: 'flex-end', backgroundColor: colour.yellow, borderBottomRightRadius: 6 },
  theirs: { alignSelf: 'flex-start', backgroundColor: colour.white, borderBottomLeftRadius: 6, boxShadow: '0px 1px 4px rgba(20, 23, 26, 0.06)' },
  body: { fontFamily: font.body, fontSize: 15, lineHeight: 21, color: colour.ink },
  time: { fontFamily: font.body, fontSize: 11, alignSelf: 'flex-end' },
  bar: { paddingHorizontal: 12, paddingTop: 10, gap: 6, backgroundColor: colour.white, borderTopWidth: 1, borderTopColor: colour.rule },
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 8 },
  input: { flex: 1, minHeight: 48, maxHeight: 120, borderRadius: 24, paddingHorizontal: 16, paddingTop: 13, paddingBottom: 12, backgroundColor: colour.canvas, color: colour.ink, fontFamily: font.bodyMedium, fontSize: 16 },
  send: { width: 48, height: 48, borderRadius: 24, backgroundColor: colour.yellow, alignItems: 'center', justifyContent: 'center' },
  error: { fontFamily: font.bodySemi, fontSize: 13, color: colour.brick },
});
