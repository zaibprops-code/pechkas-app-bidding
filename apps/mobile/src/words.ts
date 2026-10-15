import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * The technician side speaks Roman Urdu, the way technicians write on
 * WhatsApp, with a switch to English. The customer side is English.
 *
 * EVERY Roman Urdu line here must be read by the owner on his phone before
 * it reaches a real technician. Fix wording here, in one place; both
 * languages must say the same thing.
 */
export type Lang = 'ur' | 'en';

const PRO = {
  ur: {
    switchTo: 'English',
    applyTitle: 'Pechkas ke saath kaam karein',
    applyIntro: 'Yeh form bharein. Hum aap ko call kar ke milne ka waqt tay karenge. Apply karne ki koi fees nahi.',
    fullName: 'Poora naam, jaisa ID card par hai',
    noCnic: 'CNIC number yahan na likhein. Hum milte waqt card dekhenge.',
    trades: 'Aap kya kaam karte hain?',
    tradesHint: 'Jo kaam sab se acha karte hain, woh chunein. Zyada se zyada 6.',
    years: 'Kitne saal ka tajurba?',
    yearsUnit: 'saal',
    sectors: 'Kin ilaqon mein ja sakte hain?',
    about: 'Apne baare mein (zaroori nahi)',
    aboutHint: 'Maslan: kahan kaam seekha, kis cheez ke mahir hain.',
    send: 'Form bhejein',
    sending: 'Bhej rahe hain…',
    fixAbove: 'Upar wali ghalti theek karein.',
    errFull_name: 'Apna poora naam likhein, jaisa ID card par hai.',
    errTrades: 'Kam az kam ek kaam chunein, zyada se zyada 6.',
    errYears: 'Tajurbe ke saal likhein.',
    errSectors: 'Kam az kam ek ilaqa chunein, zyada se zyada 20.',
    errAbout: '300 harfon se kam likhein, aur CNIC number na likhein.',

    appliedTitle: 'Aap ka form mil gaya',
    appliedText: 'Pechkas aap ko jald call karega aur milne ka waqt tay karega. Milne par apna asal CNIC card saath layein.',
    appliedSteps: 'Approve hone se pehle: shanakht, ek trial kaam, aur Pechkas ke usool.',
    editForm: 'Form badlein',
    rejectedTitle: 'Abhi approve nahi hua',
    rejectedText: 'Pechkas ki wajah:',
    applyAgain: 'Dobara apply karein',
    suspendedTitle: 'Aap ka account roka gaya hai',
    suspendedText: 'Pechkas office se rabta karein. Wajah:',
    yourDetails: 'Aap ki maloomat',
    account: 'Account',
    online: 'Online',
    offline: 'Offline',
    offlineTitle: 'Aap offline hain',
    offlineText: 'Kaam dekhne ke liye Online karein. Online rehne tak naye kaam yahan khud aate rahenge.',
    noJobs: 'Abhi aap ke ilaqon mein koi naya kaam nahi. Yeh screen khud update hoti rehti hai.',
    newJob: 'Naya kaam',
    now: 'Abhi',
    today: 'Aaj',
    tomorrow: 'Kal',
    morning: 'subah',
    afternoon: 'dopahar',
    evening: 'shaam',
    customerOffers: 'Customer ki offer',
    yourPrice: 'Aap ki price',
    youKeep: 'Aap ko milenge',
    feeLine: 'Pechkas fee {pct}%. Is ke ilawa koi katoti nahi.',
    accept: 'Qubool',
    sendOffer: 'Bhejein',
    howSoon: 'Kitni der mein pohanch sakte hain?',
    minutes: 'min',
    noteLabel: 'Customer ke liye ek line (zaroori nahi)',
    notePlaceholder: 'Maslan: gas check karne ka gauge saath laaonga',
    yourOffer: 'Aap ki offer',
    waiting: 'Customer ke jawab ka intezar',
    minutesLeft: '{n} min baqi',
    expired: 'Aap ki offer ka waqt khatam ho gaya',
    change: 'Badlein',
    withdraw: 'Wapas lein',
    sendAgain: 'Dobara bhejein',
    myJobs: 'Mere kaam',
    agreed: 'Tay shuda',
    callCustomer: 'Call karein',
    openMap: 'Naqsha kholein',
    powerOn: 'Bijli: hai',
    powerOff: 'Bijli: load-shedding thi',
    partsPro: 'Parts: aap layenge, dukaan ki raseed ke saath',
    partsCustomer: 'Parts: customer ke paas hain',
    gate: 'Gate',
    landmark: 'Nishani',
    playVoice: 'Customer ka voice note',
    watchVideo: 'Video dekhein',
    errPrice: 'Price {min} se kam aur {max} se zyada nahi ho sakti.',
    errEta: 'Batayein kitni der mein pohanch sakte hain.',
    errNote: 'Note mein apna number ya CNIC na likhein.',
    gone: 'Yeh kaam ab khula nahi.',
  },
  en: {
    switchTo: 'Roman Urdu',
    applyTitle: 'Work with Pechkas',
    applyIntro: 'Fill in this form. We will call you to arrange a time to meet. Applying is free.',
    fullName: 'Full name, as on your ID card',
    noCnic: 'Do not write your CNIC number here. We see the card when we meet.',
    trades: 'What work do you do?',
    tradesHint: 'Choose what you are best at. Up to 6.',
    years: 'How many years of experience?',
    yearsUnit: 'years',
    sectors: 'Which areas can you reach?',
    about: 'About you (optional)',
    aboutHint: 'For example: where you learnt the trade, what you are expert in.',
    send: 'Send the form',
    sending: 'Sending…',
    fixAbove: 'Please fix the mistake above.',
    errFull_name: 'Write your full name, as on your ID card.',
    errTrades: 'Choose at least one kind of work, and no more than 6.',
    errYears: 'Write how many years you have done this work.',
    errSectors: 'Choose at least one area, and no more than 20.',
    errAbout: 'Keep it under 300 letters, and do not write your CNIC number.',

    appliedTitle: 'We have your form',
    appliedText: 'Pechkas will call you soon to arrange a meeting. Bring your original CNIC card when we meet.',
    appliedSteps: 'Before approval: identity, one trial job, and the Pechkas rules.',
    editForm: 'Change the form',
    rejectedTitle: 'Not approved yet',
    rejectedText: 'Pechkas says:',
    applyAgain: 'Apply again',
    suspendedTitle: 'Your account is paused',
    suspendedText: 'Please contact the Pechkas office. The reason:',
    yourDetails: 'Your details',
    account: 'Account',
    online: 'Online',
    offline: 'Offline',
    offlineTitle: 'You are offline',
    offlineText: 'Go online to see jobs. While you are online, new jobs appear here by themselves.',
    noJobs: 'No new jobs in your areas right now. This screen updates by itself.',
    newJob: 'New job',
    now: 'Now',
    today: 'Today',
    tomorrow: 'Tomorrow',
    morning: 'morning',
    afternoon: 'afternoon',
    evening: 'evening',
    customerOffers: "Customer's offer",
    yourPrice: 'Your price',
    youKeep: 'You keep',
    feeLine: 'Pechkas fee {pct}%. No other deductions.',
    accept: 'Accept',
    sendOffer: 'Send',
    howSoon: 'How soon can you get there?',
    minutes: 'min',
    noteLabel: 'One line for the customer (optional)',
    notePlaceholder: 'For example: I will bring the gas gauge',
    yourOffer: 'Your offer',
    waiting: 'Waiting for the customer',
    minutesLeft: '{n} min left',
    expired: 'Your offer ran out',
    change: 'Change',
    withdraw: 'Take back',
    sendAgain: 'Send again',
    myJobs: 'My jobs',
    agreed: 'Agreed',
    callCustomer: 'Call',
    openMap: 'Open the map',
    powerOn: 'Electricity: on',
    powerOff: 'Electricity: load-shedding when posted',
    partsPro: 'Parts: you bring them, with the shop receipt',
    partsCustomer: 'Parts: the customer has them',
    gate: 'Gate',
    landmark: 'Landmark',
    playVoice: "The customer's voice note",
    watchVideo: 'Watch the video',
    errPrice: 'The price must be between {min} and {max}.',
    errEta: 'Say how soon you can get there.',
    errNote: 'Do not write your number or a CNIC in the note.',
    gone: 'This job is no longer open.',
  },
} as const;

export type ProWords = { [K in keyof (typeof PRO)['ur']]: string };

/** Fills {name} slots: fill(w.minutesLeft, { n: 6 }). */
export function fill(text: string, values: Record<string, string | number>): string {
  return text.replace(/\{(\w+)\}/g, (_, k: string) => String(values[k] ?? `{${k}}`));
}

/**
 * The database explains a refusal in English. On the technician's side the
 * box it belongs to is enough to say the same thing in his language.
 */
export function proError(w: ProWords, field: string | null | undefined, fallback: string): string {
  const key = field ? (`err${field.charAt(0).toUpperCase()}${field.slice(1)}` as keyof ProWords) : null;
  return (key && w[key]) || fallback;
}

const KEY = 'pechkas.pro.lang';

/** The technician's words, and a switch he can flip. Remembered on his phone. */
export function useProWords(): { w: ProWords; lang: Lang; toggle: () => void } {
  const [lang, setLang] = useState<Lang>('ur');
  useEffect(() => {
    AsyncStorage.getItem(KEY)
      .then((v) => {
        if (v === 'en' || v === 'ur') setLang(v);
      })
      .catch(() => {});
  }, []);
  const toggle = () => {
    const next: Lang = lang === 'ur' ? 'en' : 'ur';
    setLang(next);
    AsyncStorage.setItem(KEY, next).catch(() => {});
  };
  return { w: PRO[lang], lang, toggle };
}
