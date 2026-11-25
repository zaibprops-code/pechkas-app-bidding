import { useState } from 'react';
import { ask } from './supabase.ts';

/**
 * The office writes to somebody, in the app (the owner's rule, 25 November
 * 2026: everything with the office happens inside the app — no call, no
 * WhatsApp, either way). Where this panel used to offer "Call", it offers
 * this: a box, and what is typed is exactly what they read under Write to
 * the office (and on the job, when it is about one). They are told that the
 * office wrote, never the words. `admin_write_to()` decides who it reaches:
 * a job's customer or technician (`job` + `side`), or one person (`user`).
 */
export function WriteTo({ name, job, side, user }: { name: string | null; job?: string; side?: 'customer' | 'pro'; user?: string }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const first = (name ?? '').split(' ')[0] || (side === 'pro' ? 'the technician' : 'the customer');

  async function send() {
    setBusy(true);
    const r = await ask('admin_write_to', { p_job: job ?? null, p_side: side ?? null, p_user: user ?? null, p_text: text });
    setBusy(false);
    if (!r.ok) return setMsg(r.why);
    setMsg(null);
    setText('');
    setOpen(false);
    setSent(true);
  }

  if (!open) {
    return (
      <>
        <button className="call" onClick={() => { setOpen(true); setSent(false); }}>Write to {first} in the app</button>
        {sent ? <span className="muted">Sent to {first}. They read it in the app.</span> : null}
      </>
    );
  }
  return (
    <section className="decide">
      <label>
        To {first}, in the app (they read exactly this)
        <textarea value={text} maxLength={500} rows={3} onChange={(e) => setText(e.target.value)} />
      </label>
      <p className="muted">They are told the office wrote; the words stay in the app. No CNIC numbers.</p>
      <div className="buttons">
        <button disabled={busy || text.trim().length < 3} onClick={send}>Send</button>
        <button className="secondary" onClick={() => setOpen(false)}>Cancel</button>
      </div>
      {msg ? <p className="error" role="alert">{msg}</p> : null}
    </section>
  );
}
