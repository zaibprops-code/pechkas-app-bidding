import { Linking } from 'react-native';

/**
 * One message on the screen, the way big apps do it: what kind it is, a
 * short title, a sentence, at most one button that puts it right, and the
 * phone's own words kept out of the way behind "Show details".
 *
 *   error    something did not happen          (brick)  stays until closed
 *   warning  it cannot happen until you act    (yellow) stays until closed
 *   success  it happened                       (green)  goes after a few seconds
 *   info     worth knowing                     (green)  goes after a few seconds
 *
 * Screens may still pass a plain sentence: it becomes an error, and a
 * trailing "(Details: …)" is lifted out of the sentence into the details,
 * so nobody reads a developer's words unless they ask to.
 */
export type Tone = 'error' | 'warning' | 'success' | 'info';

export type MessageAction = { label: string; run: () => void };

export type Message = {
  tone?: Tone;
  title?: string;
  text: string;
  action?: MessageAction;
  /** The phone's own words, for a screenshot. Hidden until asked for. */
  detail?: string | null;
};

const DETAILS = /\s*\(Details:\s*([\s\S]*?)\)\s*$/;

/** A plain sentence or a message, made into a message. */
export function asMessage(m: string | Message): Message {
  const msg = typeof m === 'string' ? { text: m } : m;
  const found = DETAILS.exec(msg.text);
  if (!found) return { tone: 'error', ...msg };
  return { tone: 'error', ...msg, text: msg.text.replace(DETAILS, '').trim(), detail: msg.detail ?? found[1] };
}

/** The same message, for knowing whether a screen has cleared or changed it. */
export const messageKey = (m: Message) => `${m.tone}|${m.title ?? ''}|${m.text}|${m.detail ?? ''}`;

export const openSettings: MessageAction = { label: 'Open settings', run: () => void Linking.openSettings().catch(() => {}) };

/**
 * Something the phone has been told not to let Pechkas use. "Try again" is
 * the wrong advice — it will be refused again — so the message says which
 * switch to turn on and its button opens the phone's settings at Pechkas.
 */
export function switchedOff(what: 'camera' | 'microphone' | 'location' | 'notifications', why: string): Message {
  const name = { camera: 'The camera', microphone: 'The microphone', location: 'Location', notifications: 'Notifications' }[what];
  return {
    tone: 'warning',
    title: `${name} is off for Pechkas`,
    text: `${why} Turn it on for Pechkas in your phone's settings, then come back.`,
    action: openSettings,
  };
}

/** Something that worked, said briefly. */
export const done = (text: string, title?: string): Message => ({ tone: 'success', text, title });
