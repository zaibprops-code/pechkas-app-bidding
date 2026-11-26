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
