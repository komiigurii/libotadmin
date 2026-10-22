/*
 * The drawing behind components/TownSeal.jsx, kept out of the component file
 * so it only exports a component (React Fast Refresh needs that).
 */
import { BULACAN_MUNICIPALITIES } from './municipalities';

/**
 * The town's seal ink — its own for each of the 24 (the app's
 * utils/townEmblem.js works it out the same way). Hues step 105° through the
 * municipality list, which visits all 24 before repeating and keeps
 * neighbours far apart; the lightness keeps white text above 7:1.
 */
export function sealInk(town = '') {
  let i = BULACAN_MUNICIPALITIES.indexOf(town);
  if (i < 0) { for (const ch of town) i = (i * 31 + ch.charCodeAt(0)) >>> 0; }
  return `hsl(${(i * 105) % 360} 45% 30%)`;
}

/** An eight-point star: long rays on the compass points, short between. */
export function starPath(cx, cy, long, short, waist) {
  const pts = [];
  for (let i = 0; i < 16; i++) {
    const angle = (Math.PI / 8) * i - Math.PI / 2;
    const r = i % 4 === 0 ? long : i % 2 === 0 ? short : waist;
    pts.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
}
