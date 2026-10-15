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
    approvedTitle: 'Mubarak ho, aap approve ho gaye',
    approvedText: 'Kaam milna app ke agle update mein shuru hoga. Hum aap ko bata denge.',
    rejectedTitle: 'Abhi approve nahi hua',
    rejectedText: 'Pechkas ki wajah:',
    applyAgain: 'Dobara apply karein',
    suspendedTitle: 'Aap ka account roka gaya hai',
    suspendedText: 'Pechkas office se rabta karein. Wajah:',
    yourDetails: 'Aap ki maloomat',
    account: 'Account',
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
    approvedTitle: 'Congratulations, you are approved',
    approvedText: 'Jobs start arriving in the next update of the app. We will let you know.',
    rejectedTitle: 'Not approved yet',
    rejectedText: 'Pechkas says:',
    applyAgain: 'Apply again',
    suspendedTitle: 'Your account is paused',
    suspendedText: 'Please contact the Pechkas office. The reason:',
    yourDetails: 'Your details',
    account: 'Account',
  },
} as const;

export type ProWords = { [K in keyof (typeof PRO)['ur']]: string };

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
