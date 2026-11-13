import { useState } from 'react';
import { Redirect, router } from 'expo-router';
import { authErrorDetails, explainAuthError, pakistaniMobile } from '@pechkas/shared';
import { PhoneBox } from '../../src/components/PhoneBox';
import { Button, Loading, Notice, Screen } from '../../src/components/ui';
import { useAccount } from '../../src/account';
import { supabase, url } from '../../src/supabase';
import { useProWords } from '../../src/words';

/**
 * An account made with an email address has no number checked by SMS, and
 * D37 asks for one before a technician's first job. Supabase sends a code to
 * the number typed here; the code screen (`/verify`, with `change`) checks it
 * and the number becomes the account's own.
 */
export default function CheckNumber() {
  const { ready, session, account } = useAccount();
  const { w } = useProWords();
  const [typed, setTyped] = useState(account?.phone ? account.phone.replace(/^92/, '') : '');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!ready) return <Loading />;
  if (!session) return <Redirect href="/start" />;

  async function send() {
    setError(null);
    setNotice(null);
    const phone = pakistaniMobile(typed);
    if (!phone) {
      setError('Write your mobile number after +92, like 300 1234567.');
      return;
    }
    if (!supabase) return;
    setBusy(true);
    const { error: e } = await supabase.auth.updateUser({ phone });
    setBusy(false);
    if (e) {
      setNotice(`${explainAuthError(e.message, e.status)}\n\n${authErrorDetails(e.message, e.status, url)}`);
      return;
    }
    router.push({ pathname: '/verify', params: { phone, change: '1' } });
  }

  return (
    <Screen hero={{ title: w.numberTitle, sub: w.numberSub, back: true }} footer={<Button label={w.numberSend} onPress={send} busy={busy} />}>
      <PhoneBox value={typed} onChangeText={setTyped} error={error} autoFocus />
      <Notice text={notice} />
    </Screen>
  );
}
