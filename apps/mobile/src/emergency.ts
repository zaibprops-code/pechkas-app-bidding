/**
 * The numbers the emergency screen shows. The owner confirmed these four on
 * 2026-10-15. They are safety numbers: change one only when the owner says
 * so, never from memory.
 */
export const EMERGENCY_NUMBERS = [
  { key: 'emPolice', number: '15' },
  { key: 'emRescue', number: '1122' },
  { key: 'emFire', number: '16' },
  { key: 'emEdhi', number: '115' },
] as const;
