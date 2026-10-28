import { colour, shadow } from '@pechkas/shared/src/tokens.ts';
// The same font files the app ships (apps/mobile loads them from these
// packages too), bundled with the panel: nothing is fetched from Google.
import jakarta400 from '@expo-google-fonts/plus-jakarta-sans/400Regular/PlusJakartaSans_400Regular.ttf';
import jakarta500 from '@expo-google-fonts/plus-jakarta-sans/500Medium/PlusJakartaSans_500Medium.ttf';
import jakarta600 from '@expo-google-fonts/plus-jakarta-sans/600SemiBold/PlusJakartaSans_600SemiBold.ttf';
import jakarta700 from '@expo-google-fonts/plus-jakarta-sans/700Bold/PlusJakartaSans_700Bold.ttf';
import jakarta800 from '@expo-google-fonts/plus-jakarta-sans/800ExtraBold/PlusJakartaSans_800ExtraBold.ttf';
import bricolage800 from '@expo-google-fonts/bricolage-grotesque/800ExtraBold/BricolageGrotesque_800ExtraBold.ttf';
import plexMono600 from '@expo-google-fonts/ibm-plex-mono/600SemiBold/IBMPlexMono_600SemiBold.ttf';

/**
 * The admin panel's look comes from the same place as the app's: the
 * colours and the card shadow from packages/shared/src/tokens.ts, turned
 * into CSS variables (`--green`, `--soft-yellow`, `--shadow-card` …) that
 * admin.css uses — admin.css never types a colour of its own — and the
 * app's typefaces. docs/DESIGN.md is the rule book for both.
 */
export function applyLook() {
  const root = document.documentElement.style;
  for (const [name, value] of Object.entries(colour)) root.setProperty(`--${name.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase())}`, value);
  root.setProperty('--shadow-card', shadow.card);

  const faces: [string, string, number][] = [
    ['Plus Jakarta Sans', jakarta400, 400],
    ['Plus Jakarta Sans', jakarta500, 500],
    ['Plus Jakarta Sans', jakarta600, 600],
    ['Plus Jakarta Sans', jakarta700, 700],
    ['Plus Jakarta Sans', jakarta800, 800],
    ['Bricolage Grotesque', bricolage800, 800],
    ['IBM Plex Mono', plexMono600, 600],
  ];
  const css = faces
    .map(([family, url, weight]) => `@font-face{font-family:'${family}';src:url(${url}) format('truetype');font-weight:${weight};font-style:normal;font-display:swap}`)
    .join('\n');
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);
}
