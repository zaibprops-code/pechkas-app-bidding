import { useCallback, useState } from 'react';
import { StyleSheet, Text } from 'react-native';
import { Redirect, router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Button, Field, Loading, Notice, Screen } from '../../src/components/ui';
import { Panel } from '../../src/components/Panel';
import { MediaPick } from '../../src/components/MediaPick';
import { useToast } from '../../src/components/Toast';
import { done } from '../../src/message';
import { useAccount } from '../../src/account';
import { supabase, ask } from '../../src/supabase';
import { colour, font } from '../../src/theme';

/**
 * "It has failed again": the guarantee claim. Words, and at least one photo
 * or a short video of the fault — the technician brings the right part,
 * and it is the record if anybody disagrees later. claim_guarantee() checks
 * it is her job, still guaranteed, and the only open claim.
 */

type Mine = {
  id: string; ref: string; title: string; pro: { first_name: string } | null; guarantee_until: string | null; guarantee_days: number | null; can_claim: boolean;
  payment?: { status: string } | null;
};

export default function ClaimScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { ready, session } = useAccount();
  const toast = useToast();
  const [job, setJob] = useState<Mine | null | undefined>(undefined);
  const [text, setText] = useState('');
  const [media, setMedia] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useFocusEffect(
    useCallback(() => {
      supabase?.rpc('my_jobs').then(({ data }) => setJob(((data as Mine[] | null) ?? []).find((j) => j.id === id) ?? null));
    }, [id]),
  );

  if (!ready || job === undefined) return <Loading />;
  if (!session) return <Redirect href="/start" />;
  const name = job?.pro?.first_name ?? 'The technician';
  // D35: while a payment question is open on the job, the office takes the claim instead of him. The guarantee is the same.
  const office = !!job?.payment && job.payment.status !== 'closed';

  async function send() {
    setErrors({});
    setMsg(null);
    setBusy(true);
    const r = await ask('claim_guarantee', { p_job: id, p_text: text, p_media: media });
    setBusy(false);
    if (!r.ok) {
      if (r.field === 'text' || r.field === 'media') return setErrors({ [r.field]: r.why });
      return setMsg(r.why);
    }
    toast.show(done(office ? 'The Pechkas office will look at it and call you. Your job shows where it has got to.' : `${name} has 24 hours to answer. Your job shows where it has got to.`, 'Claim sent'));
    router.back();
  }

  const until = job?.guarantee_until
    ? new Date(job.guarantee_until).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', timeZone: 'Asia/Karachi' })
    : null;

  return (
    <Screen
      hero={{ title: 'It has failed again', sub: job ? `${job.title} · ${job.ref}` : undefined, back: true }}
      footer={job?.can_claim ? <Button kind="yellow" icon="arrowRight" label="Send the claim" busy={busy} onPress={send} /> : undefined}
    >
      {!job || !job.can_claim ? (
        <Panel icon="shield" title="This job cannot be claimed now" hint="Its guarantee has ended, or a claim is already open. The job’s own screen says which." />
      ) : (
        <>
          <Panel icon="shield" title={until ? `Guaranteed until ${until}` : 'Guaranteed'} hint={`${job.guarantee_days ?? ''} days on this job. The same fault, or anything his work caused, is covered.`}>
            <Text style={s.line}>
              {office
                ? 'A payment question is open on this job, so the Pechkas office handles your claim. It decides what happens next and calls you; your guarantee is not affected.'
                : `${name} has 24 hours to answer and must come back within 48 hours of that. If he does not, Pechkas sends another technician and pays for the repair.`}
            </Text>
          </Panel>
          <Panel icon="help" title="What has gone wrong?">
            <Field label="Describe it in a few words" value={text} onChangeText={(t) => { setText(t); setErrors({}); }} maxLength={500} multiline error={errors.text} />
          </Panel>
          <Panel icon="camera" title="Photos or a video" hint="At least one. Show the fault itself.">
            <MediaPick paths={media} setPaths={(p) => { setMedia(p); setErrors({}); }} userId={session.user.id} video onProblem={setMsg} />
            {errors.media ? <Text style={s.error}>{errors.media}</Text> : null}
          </Panel>
          <Text style={s.small}>A part he fitted is covered by the shop’s warranty for the part itself; Pechkas covers the work to fit it again.</Text>
        </>
      )}
      <Notice text={msg} />
    </Screen>
  );
}

const s = StyleSheet.create({
  line: { fontFamily: font.body, fontSize: 14, lineHeight: 20, color: colour.inkSoft },
  small: { fontFamily: font.body, fontSize: 13, lineHeight: 18, color: colour.steel, paddingHorizontal: 4 },
  error: { fontFamily: font.bodySemi, fontSize: 13.5, color: colour.brick },
});
