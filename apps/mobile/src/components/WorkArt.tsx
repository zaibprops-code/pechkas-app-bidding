import { Image, type ImageSourcePropType } from 'react-native';
import { workPicture } from '@pechkas/shared/src/work';
import { TradeArt } from './TradeArt';

/**
 * A kind of work, a group or a job, as a picture where it has one (A121, the
 * owner's choice: people here understand a picture of the problem faster
 * than its name), else as its line drawing. Which ones have a picture is
 * `JOB_PICTURES` / `ART_PICTURES` in packages/shared/src/work.ts; the files
 * are made in Figma's image tool, cut out onto no background, and checked by
 * eye before they go in. Objects only, never people. A picture is drawn
 * larger than a drawing (`picture`), because it carries more detail.
 */
const PICTURES: Record<string, ImageSourcePropType> = {
  'plumber-taps': require('../../assets/work/plumber-taps.png'),
  'plumber-toilet': require('../../assets/work/plumber-toilet.png'),
  'plumber-geyser': require('../../assets/work/plumber-geyser.png'),
  'plumber-motor': require('../../assets/work/plumber-motor.png'),
  'plumber-drain': require('../../assets/work/plumber-drain.png'),
  'plumber-leak': require('../../assets/work/plumber-leak.png'),
  'plumber-sink': require('../../assets/work/plumber-sink.png'),
  'plumber-shower': require('../../assets/work/plumber-shower.png'),
  'plumber-filter': require('../../assets/work/plumber-filter.png'),
  'ac-ac': require('../../assets/work/ac-ac.png'),
  'ac-service': require('../../assets/work/ac-service.png'),
  'ac-fitting': require('../../assets/work/ac-fitting.png'),
  'ac-general': require('../../assets/work/ac-general.png'),
  'ac-gas': require('../../assets/work/ac-gas.png'),
  'ac-leak': require('../../assets/work/ac-leak.png'),
  'ac-pcb': require('../../assets/work/ac-pcb.png'),
  'ac-install': require('../../assets/work/ac-install.png'),
  'ac-uninstall': require('../../assets/work/ac-uninstall.png'),
  'ac-shifting': require('../../assets/work/ac-shifting.png'),
  'ac-stand': require('../../assets/work/ac-stand.png'),
  'ac-stabiliser': require('../../assets/work/ac-stabiliser.png'),
  'el-electrician': require('../../assets/work/el-electrician.png'),
  'el-fans': require('../../assets/work/el-fans.png'),
  'el-switches': require('../../assets/work/el-switches.png'),
  'el-power': require('../../assets/work/el-power.png'),
  'el-ceilingfan': require('../../assets/work/el-ceilingfan.png'),
  'el-exhaust': require('../../assets/work/el-exhaust.png'),
  'el-chandelier': require('../../assets/work/el-chandelier.png'),
  'el-switch': require('../../assets/work/el-switch.png'),
  'el-newsocket': require('../../assets/work/el-newsocket.png'),
  'el-doorbell': require('../../assets/work/el-doorbell.png'),
  'el-breaker': require('../../assets/work/el-breaker.png'),
  'el-tracing': require('../../assets/work/el-tracing.png'),
  'el-rewiring': require('../../assets/work/el-rewiring.png'),
  'el-ups': require('../../assets/work/el-ups.png'),
  'el-changeover': require('../../assets/work/el-changeover.png'),
  'el-motorswitch': require('../../assets/work/el-motorswitch.png'),
  'ups-ups': require('../../assets/work/ups-ups.png'),
  'solar-solar': require('../../assets/work/solar-solar.png'),
  'solar-clean5': require('../../assets/work/solar-clean5.png'),
  'solar-clean10': require('../../assets/work/solar-clean10.png'),
  'solar-check': require('../../assets/work/solar-check.png'),
  'solar-service': require('../../assets/work/solar-service.png'),
  'solar-fault': require('../../assets/work/solar-fault.png'),
};

/** The picture for a trade (its own page) or a job (its own, else its group's), if there is one. */
export function pictureOf(trade: string, job?: string): ImageSourcePropType | undefined {
  const key = workPicture(trade, job);
  return key ? PICTURES[key] : undefined;
}

/** The picture for a drawing's key (a group's `art`), if there is one. */
export function pictureOfArt(art: string): ImageSourcePropType | undefined {
  const key = workPicture(art);
  return key ? PICTURES[key] : undefined;
}

export function WorkArt({ art, source, size, picture }: { art: string; source?: ImageSourcePropType; size: number; picture?: number }) {
  const src = source ?? pictureOfArt(art);
  if (src) {
    const p = picture ?? size;
    return <Image source={src} style={{ width: p, height: p }} resizeMode="contain" accessible={false} />;
  }
  return <TradeArt trade={art} size={size} />;
}
