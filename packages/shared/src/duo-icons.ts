/**
 * The two-tone icons' shapes, in ONE place: the app draws them with
 * react-native-svg (apps/mobile/src/components/DuoIcon.tsx) and the admin
 * panel with plain SVG (apps/admin/src/Duo.tsx), so the two can never draw
 * a different bell. A 24-unit grid. `paint` says how each shape is drawn:
 * `accent` the yellow fill on the part that matters, `line` the ink outline
 * (1.8 wide, round ends, unless `strokeWidth` says otherwise), `ink` a solid
 * ink dot, `white` a white shape with an ink outline (the camera's lens).
 * docs/DESIGN.md says when to use them. Add a new one here, in the same style:
 * drawn inside 3–21 so nothing touches the tile's edge, one clear shape and
 * at most two details, yellow on ONE main part — at 22 points a third detail
 * is mush (the owner found the busier set "collapsed" in the menu).
 */
export type DuoPaint = 'accent' | 'line' | 'ink' | 'white';
export type DuoShape =
  | { shape: 'path'; paint: DuoPaint; d: string; strokeWidth?: number }
  | { shape: 'rect'; paint: DuoPaint; x: number; y: number; width: number; height: number; rx?: number; strokeWidth?: number }
  | { shape: 'circle'; paint: DuoPaint; cx: number; cy: number; r: number; strokeWidth?: number };

export const DUO_ICONS = {
  home: [
    { shape: "path", paint: "accent", d: "M5.5 10.5L12 5l6.5 5.5V19a1 1 0 0 1-1 1h-11a1 1 0 0 1-1-1z" },
    { shape: "path", paint: "line", d: "M3.5 11.5L12 4.5l8.5 7M5.5 10v9a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-9" },
    { shape: "path", paint: "white", d: "M10 20v-4.5a2 2 0 0 1 4 0V20z" },
  ],
  jobs: [
    { shape: "rect", paint: "accent", x: 5.5, y: 5, width: 13, height: 16, rx: 2 },
    { shape: "rect", paint: "line", x: 5.5, y: 5, width: 13, height: 16, rx: 2 },
    { shape: "rect", paint: "white", x: 9, y: 3.5, width: 6, height: 3, rx: 1 },
    { shape: "path", paint: "line", d: "M9 11h6M9 15h4" },
  ],
  bell: [
    { shape: "path", paint: "accent", d: "M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5z" },
    { shape: "path", paint: "line", d: "M6.5 16.5v-5a5.5 5.5 0 0 1 11 0v5M4.5 16.5h15M10 19.5a2.2 2.2 0 0 0 4 0M12 4v2" },
  ],
  shield: [
    { shape: "path", paint: "accent", d: "M12 3.5l7 2.8v5.4c0 4.2-2.9 7.3-7 8.8-4.1-1.5-7-4.6-7-8.8V6.3z" },
    { shape: "path", paint: "line", d: "M12 3.5l7 2.8v5.4c0 4.2-2.9 7.3-7 8.8-4.1-1.5-7-4.6-7-8.8V6.3zM9 12l2.2 2.2 4-4.2" },
  ],
  help: [
    { shape: "circle", paint: "accent", cx: 12, cy: 12, r: 8.5 },
    { shape: "circle", paint: "line", cx: 12, cy: 12, r: 8.5 },
    { shape: "path", paint: "line", d: "M9.6 9.6a2.4 2.4 0 1 1 3.3 2.2c-.6.3-.9.7-.9 1.3v.4" },
    { shape: "path", paint: "line", d: "M12 16.6h.01", strokeWidth: 2.6 },
  ],
  support: [
    { shape: "rect", paint: "accent", x: 4, y: 12.5, width: 3.8, height: 6, rx: 1.5 },
    { shape: "rect", paint: "accent", x: 16.2, y: 12.5, width: 3.8, height: 6, rx: 1.5 },
    { shape: "path", paint: "line", d: "M4 15v-3a8 8 0 0 1 16 0v3M18 18.5a3 3 0 0 1-3 2.5h-2" },
    { shape: "rect", paint: "line", x: 4, y: 12.5, width: 3.8, height: 6, rx: 1.5 },
    { shape: "rect", paint: "line", x: 16.2, y: 12.5, width: 3.8, height: 6, rx: 1.5 },
  ],
  settings: [
    { shape: "path", paint: "accent", d: "M9.85 5.76L10.07 3.62L13.93 3.62L14.15 5.76L14.89 6.07L16.56 4.71L19.29 7.44L17.93 9.11L18.24 9.85L20.38 10.07L20.38 13.93L18.24 14.15L17.93 14.89L19.29 16.56L16.56 19.29L14.89 17.93L14.15 18.24L13.93 20.38L10.07 20.38L9.85 18.24L9.11 17.93L7.44 19.29L4.71 16.56L6.07 14.89L5.76 14.15L3.62 13.93L3.62 10.07L5.76 9.85L6.07 9.11L4.71 7.44L7.44 4.71L9.11 6.07z" },
    { shape: "path", paint: "line", d: "M9.85 5.76L10.07 3.62L13.93 3.62L14.15 5.76L14.89 6.07L16.56 4.71L19.29 7.44L17.93 9.11L18.24 9.85L20.38 10.07L20.38 13.93L18.24 14.15L17.93 14.89L19.29 16.56L16.56 19.29L14.89 17.93L14.15 18.24L13.93 20.38L10.07 20.38L9.85 18.24L9.11 17.93L7.44 19.29L4.71 16.56L6.07 14.89L5.76 14.15L3.62 13.93L3.62 10.07L5.76 9.85L6.07 9.11L4.71 7.44L7.44 4.71L9.11 6.07z" },
    { shape: "circle", paint: "white", cx: 12, cy: 12, r: 2.8 },
  ],
  share: [
    { shape: "circle", paint: "accent", cx: 17, cy: 6, r: 2.6 },
    { shape: "circle", paint: "accent", cx: 7, cy: 12, r: 2.6 },
    { shape: "circle", paint: "accent", cx: 17, cy: 18, r: 2.6 },
    { shape: "circle", paint: "line", cx: 17, cy: 6, r: 2.6 },
    { shape: "circle", paint: "line", cx: 7, cy: 12, r: 2.6 },
    { shape: "circle", paint: "line", cx: 17, cy: 18, r: 2.6 },
    { shape: "path", paint: "line", d: "M9.3 10.7l5.4-3.4M9.3 13.3l5.4 3.4" },
  ],
  briefcase: [
    { shape: "path", paint: "accent", d: "M4 10a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v3H4z" },
    { shape: "rect", paint: "line", x: 4, y: 8, width: 16, height: 11.5, rx: 2 },
    { shape: "path", paint: "line", d: "M9 8V6.5A1.5 1.5 0 0 1 10.5 5h3A1.5 1.5 0 0 1 15 6.5V8M4 13h16" },
  ],
  wallet: [
    { shape: "path", paint: "accent", d: "M15.5 11.5H20V16h-4.5a2.25 2.25 0 0 1 0-4.5z" },
    { shape: "rect", paint: "line", x: 4, y: 7, width: 16, height: 13, rx: 2 },
    { shape: "path", paint: "line", d: "M6 7l9.5-3a1 1 0 0 1 1.3 1V7M15.5 11.5H20V16h-4.5a2.25 2.25 0 0 1 0-4.5z" },
  ],
  mic: [
    { shape: "rect", paint: "accent", x: 9, y: 2.5, width: 6, height: 11.5, rx: 3 },
    { shape: "rect", paint: "line", x: 9, y: 2.5, width: 6, height: 11.5, rx: 3 },
    { shape: "path", paint: "line", d: "M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5v4M9 21.5h6" },
  ],
  video: [
    { shape: "rect", paint: "accent", x: 2.5, y: 6, width: 13, height: 12, rx: 2.5 },
    { shape: "rect", paint: "line", x: 2.5, y: 6, width: 13, height: 12, rx: 2.5 },
    { shape: "path", paint: "line", d: "M15.5 10.2l5.5-3v9.6l-5.5-3z" },
  ],
  lock: [
    { shape: "rect", paint: "accent", x: 4.5, y: 10.5, width: 15, height: 11, rx: 2.5 },
    { shape: "rect", paint: "line", x: 4.5, y: 10.5, width: 15, height: 11, rx: 2.5 },
    { shape: "path", paint: "line", d: "M8 10.5V7a4 4 0 0 1 8 0v3.5M12 14.5v3" },
  ],
  search: [
    { shape: "circle", paint: "accent", cx: 10.5, cy: 10.5, r: 6.5 },
    { shape: "circle", paint: "line", cx: 10.5, cy: 10.5, r: 6.5 },
    { shape: "path", paint: "line", d: "M15.5 15.5l5 5", strokeWidth: 2.2 },
  ],
  phone: [
    { shape: "path", paint: "accent", d: "M5 3.5h3.5l2 5-2.4 1.6a11 11 0 0 0 5.8 5.8l1.6-2.4 5 2v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" },
    { shape: "path", paint: "line", d: "M5 3.5h3.5l2 5-2.4 1.6a11 11 0 0 0 5.8 5.8l1.6-2.4 5 2v3.5a2 2 0 0 1-2 2A16.5 16.5 0 0 1 3 5.5a2 2 0 0 1 2-2z" },
  ],
  chat: [
    { shape: "path", paint: "accent", d: "M4 5.5A2 2 0 0 1 6 3.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4.2A2 2 0 0 1 4 14.5z" },
    { shape: "path", paint: "line", d: "M4 5.5A2 2 0 0 1 6 3.5h12a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H10l-5 4v-4.2A2 2 0 0 1 4 14.5z" },
    { shape: "path", paint: "line", d: "M8.5 10h.01M12 10h.01M15.5 10h.01", strokeWidth: 2.6 },
  ],
  pin: [
    { shape: "path", paint: "accent", d: "M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" },
    { shape: "path", paint: "line", d: "M12 22s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z" },
    { shape: "circle", paint: "line", cx: 12, cy: 10, r: 2.6 },
  ],
  flag: [
    { shape: "path", paint: "accent", d: "M5 4.5h12.5l-2.5 4 2.5 4H5z" },
    { shape: "path", paint: "line", d: "M5 21V4.5h12.5l-2.5 4 2.5 4H5" },
  ],
  tag: [
    { shape: "path", paint: "accent", d: "M3.5 5a1.5 1.5 0 0 1 1.5-1.5h6.9a1.5 1.5 0 0 1 1.06.44l7.6 7.6a1.5 1.5 0 0 1 0 2.12l-6.9 6.9a1.5 1.5 0 0 1-2.12 0l-7.6-7.6A1.5 1.5 0 0 1 3.5 11.9z" },
    { shape: "path", paint: "line", d: "M3.5 5a1.5 1.5 0 0 1 1.5-1.5h6.9a1.5 1.5 0 0 1 1.06.44l7.6 7.6a1.5 1.5 0 0 1 0 2.12l-6.9 6.9a1.5 1.5 0 0 1-2.12 0l-7.6-7.6A1.5 1.5 0 0 1 3.5 11.9z" },
    { shape: "circle", paint: "ink", cx: 8, cy: 8, r: 1.6 },
  ],
  star: [
    { shape: "path", paint: "accent", d: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" },
    { shape: "path", paint: "line", d: "M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9z" },
  ],
  camera: [
    { shape: "path", paint: "accent", d: "M3.5 8.5a2 2 0 0 1 2-2h2.3l1.7-2.5h5l1.7 2.5h2.3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" },
    { shape: "path", paint: "line", d: "M3.5 8.5a2 2 0 0 1 2-2h2.3l1.7-2.5h5l1.7 2.5h2.3a2 2 0 0 1 2 2V18a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2z" },
    { shape: "circle", paint: "white", cx: 12, cy: 13, r: 3.6 },
  ],
  clock: [
    { shape: "circle", paint: "accent", cx: 12, cy: 12, r: 9 },
    { shape: "circle", paint: "line", cx: 12, cy: 12, r: 9 },
    { shape: "path", paint: "line", d: "M12 7.5V12l3 2", strokeWidth: 2 },
  ],
  mail: [
    { shape: "rect", paint: "accent", x: 3, y: 5.5, width: 18, height: 13, rx: 2.5 },
    { shape: "rect", paint: "line", x: 3, y: 5.5, width: 18, height: 13, rx: 2.5 },
    { shape: "path", paint: "line", d: "M3.8 7l8.2 6 8.2-6" },
  ],
  doc: [
    { shape: "path", paint: "accent", d: "M13.5 3.5V8a1 1 0 0 0 1 1H19z" },
    { shape: "path", paint: "line", d: "M13.5 3.5H7a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V9zM13.5 3.5V8a1 1 0 0 0 1 1H19M8.5 13h7M8.5 16.5h5" },
  ],
  logout: [
    { shape: "rect", paint: "accent", x: 3.5, y: 3.5, width: 10, height: 17, rx: 2 },
    { shape: "rect", paint: "line", x: 3.5, y: 3.5, width: 10, height: 17, rx: 2 },
    { shape: "path", paint: "line", d: "M10 12h10.5M17 8.5l3.5 3.5-3.5 3.5", strokeWidth: 2 },
  ],
  trash: [
    { shape: "path", paint: "accent", d: "M6 7.5h12l-1 12a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 7 19.5z" },
    { shape: "path", paint: "line", d: "M6 7.5h12l-1 12a1.5 1.5 0 0 1-1.5 1.4h-7A1.5 1.5 0 0 1 7 19.5zM4 7.5h16M9.5 7.5V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2.5M10.5 11v6M13.5 11v6" },
  ],
  calendar: [
    { shape: "path", paint: "accent", d: "M4 8.5A2.5 2.5 0 0 1 6.5 6h11A2.5 2.5 0 0 1 20 8.5V11H4z" },
    { shape: "rect", paint: "line", x: 4, y: 6, width: 16, height: 14, rx: 2.5 },
    { shape: "path", paint: "line", d: "M8 4v4M16 4v4M4 11h16" },
  ],
  medal: [
    { shape: "circle", paint: "accent", cx: 12, cy: 10, r: 5.5 },
    { shape: "circle", paint: "line", cx: 12, cy: 10, r: 5.5 },
    { shape: "path", paint: "line", d: "M9.7 10l1.6 1.6 3-3M8.6 14.4l-1.1 6.1 4.5-2 4.5 2-1.1-6.1" },
  ],
  swap: [
    { shape: "path", paint: "line", d: "M7.5 4.5L4 8l3.5 3.5M4 8h13M16.5 12.5l3.5 3.5-3.5 3.5M20 16H7", strokeWidth: 2 },
  ],
} satisfies Record<string, readonly DuoShape[]>;

export type DuoName = keyof typeof DUO_ICONS;
