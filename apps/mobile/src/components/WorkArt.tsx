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
  'plumber-taps': require('../../assets/work/plumber-taps.webp'),
  'plumber-toilet': require('../../assets/work/plumber-toilet.webp'),
  'plumber-geyser': require('../../assets/work/plumber-geyser.webp'),
  'plumber-motor': require('../../assets/work/plumber-motor.webp'),
  'plumber-drain': require('../../assets/work/plumber-drain.webp'),
  'plumber-leak': require('../../assets/work/plumber-leak.webp'),
  'plumber-sink': require('../../assets/work/plumber-sink.webp'),
  'plumber-shower': require('../../assets/work/plumber-shower.webp'),
  'plumber-filter': require('../../assets/work/plumber-filter.webp'),
  'plumber-flushtank': require('../../assets/work/plumber-flushtank.webp'),
  'plumber-float': require('../../assets/work/plumber-float.webp'),
  'plumber-commode': require('../../assets/work/plumber-commode.webp'),
  'plumber-geyserfit': require('../../assets/work/plumber-geyserfit.webp'),
  'plumber-descale': require('../../assets/work/plumber-descale.webp'),
  'plumber-geyserrepair': require('../../assets/work/plumber-geyserrepair.webp'),
  'plumber-motorfit': require('../../assets/work/plumber-motorfit.webp'),
  'plumber-motorrepair': require('../../assets/work/plumber-motorrepair.webp'),
  'plumber-blocked': require('../../assets/work/plumber-blocked.webp'),
  'plumber-sewer': require('../../assets/work/plumber-sewer.webp'),
  'plumber-hiddenleak': require('../../assets/work/plumber-hiddenleak.webp'),
  'ac-ac': require('../../assets/work/ac-ac.webp'),
  'ac-service': require('../../assets/work/ac-service.webp'),
  'ac-fitting': require('../../assets/work/ac-fitting.webp'),
  'ac-general': require('../../assets/work/ac-general.webp'),
  'ac-gas': require('../../assets/work/ac-gas.webp'),
  'ac-leak': require('../../assets/work/ac-leak.webp'),
  'ac-pcb': require('../../assets/work/ac-pcb.webp'),
  'ac-install': require('../../assets/work/ac-install.webp'),
  'ac-uninstall': require('../../assets/work/ac-uninstall.webp'),
  'ac-shifting': require('../../assets/work/ac-shifting.webp'),
  'ac-stand': require('../../assets/work/ac-stand.webp'),
  'ac-stabiliser': require('../../assets/work/ac-stabiliser.webp'),
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
  'el-ups': require('../../assets/work/el-ups.webp'),
  'el-changeover': require('../../assets/work/el-changeover.png'),
  'el-motorswitch': require('../../assets/work/el-motorswitch.png'),
  'ups-ups': require('../../assets/work/ups-ups.webp'),
  'solar-solar': require('../../assets/work/solar-solar.webp'),
  'solar-clean5': require('../../assets/work/solar-clean5.webp'),
  'solar-clean10': require('../../assets/work/solar-clean10.webp'),
  'solar-check': require('../../assets/work/solar-check.webp'),
  'solar-service': require('../../assets/work/solar-service.webp'),
  'solar-fault': require('../../assets/work/solar-fault.webp'),
  'app-appliances': require('../../assets/work/app-appliances.png'),
  'app-wmservice': require('../../assets/work/app-wmservice.png'),
  'app-install': require('../../assets/work/app-install.png'),
  'app-wmrepair': require('../../assets/work/app-wmrepair.png'),
  'app-fridge': require('../../assets/work/app-fridge.png'),
  'app-microwave': require('../../assets/work/app-microwave.png'),
  'cctv-cctv': require('../../assets/work/cctv-cctv.webp'),
  'cctv-camfit': require('../../assets/work/cctv-camfit.webp'),
  'cctv-camset': require('../../assets/work/cctv-camset.webp'),
  'cctv-camaim': require('../../assets/work/cctv-camaim.webp'),
  'cctv-camphone': require('../../assets/work/cctv-camphone.webp'),
  'cctv-camfault': require('../../assets/work/cctv-camfault.webp'),
  'wifi-wifi': require('../../assets/work/wifi-wifi.webp'),
  'wifi-router': require('../../assets/work/wifi-router.webp'),
  'wifi-extend': require('../../assets/work/wifi-extend.webp'),
  'wifi-cable': require('../../assets/work/wifi-cable.webp'),
  'wifi-office': require('../../assets/work/wifi-office.webp'),
  'wifi-dropping': require('../../assets/work/wifi-dropping.webp'),
  'paint-painting': require('../../assets/work/paint-painting.webp'),
  'paint-room': require('../../assets/work/paint-room.webp'),
  'paint-touchup': require('../../assets/work/paint-touchup.webp'),
  'paint-damp': require('../../assets/work/paint-damp.webp'),
  'paint-house': require('../../assets/work/paint-house.webp'),
  'pc-computers': require('../../assets/work/pc-computers.png'),
  'pc-slow': require('../../assets/work/pc-slow.png'),
  'pc-windows': require('../../assets/work/pc-windows.png'),
  'pc-virus': require('../../assets/work/pc-virus.png'),
  'pc-nostart': require('../../assets/work/pc-nostart.png'),
  'pc-parts': require('../../assets/work/pc-parts.png'),
  'carp-carpentry': require('../../assets/work/carp-carpentry.png'),
  'carp-door': require('../../assets/work/carp-door.png'),
  'carp-cupboard': require('../../assets/work/carp-cupboard.png'),
  'carp-shelf': require('../../assets/work/carp-shelf.png'),
  'carp-lock': require('../../assets/work/carp-lock.png'),
  'carp-hinge': require('../../assets/work/carp-hinge.png'),
  'carp-adjust': require('../../assets/work/carp-adjust.png'),
  'carp-newdoor': require('../../assets/work/carp-newdoor.png'),
  'carp-window': require('../../assets/work/carp-window.png'),
  'carp-wardrobe': require('../../assets/work/carp-wardrobe.png'),
  'carp-drawer': require('../../assets/work/carp-drawer.png'),
  'carp-flatpack': require('../../assets/work/carp-flatpack.png'),
  'carp-furniture': require('../../assets/work/carp-furniture.png'),
  'carp-shelffit': require('../../assets/work/carp-shelffit.png'),
  'carp-curtain': require('../../assets/work/carp-curtain.png'),
};

/**
 * A trade's own page can open with a wide 3D picture filling its yellow top
 * (A123): the object on the right, the trade's name on the left. Only a trade
 * that has one is listed; the others keep their picture beside the name.
 */
const TOPS: Record<string, ImageSourcePropType> = {
  ac: require('../../assets/work/ac-top.jpg'),
  cctv: require('../../assets/work/cctv-top.jpg'),
  wifi: require('../../assets/work/wifi-top.jpg'),
  ups: require('../../assets/work/ups-top.jpg'),
  solar: require('../../assets/work/solar-top.jpg'),
  plumber: require('../../assets/work/plumber-top.jpg'),
  painting: require('../../assets/work/paint-top.jpg'),
};

/** The wide picture for the top of a trade's page, if it has one. */
export function topOf(trade: string): ImageSourcePropType | undefined {
  return TOPS[trade];
}

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
