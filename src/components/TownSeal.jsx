import { sealInk, starPath } from '../utils/townSeal';

/*
 * The seal the app draws for a town badge that has no image yet (the app's
 * components/TownEmblem.js — keep the two drawings alike): the town's name
 * around the rim, "BULACAN" below, and the eight-point star of the Libot logo
 * in the middle. One ink per town, picked from the town's name, the same in
 * both themes like the leaderboard medals.
 */
export default function TownSeal({ town, size = 96 }) {
  const ink = sealInk(town);
  const id = `seal-${town.replace(/\W+/g, '-')}`;
  const name = town.toUpperCase();
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" role="img" aria-label={`${town} seal`}>
      <defs>
        <path id={`${id}-top`} d="M 16 50 A 34 34 0 0 1 84 50" />
        <path id={`${id}-bottom`} d="M 20 54 A 30 30 0 0 0 80 54" />
      </defs>
      <circle cx="50" cy="50" r="48" style={{ fill: ink }} />
      <circle cx="50" cy="50" r="44" style={{ fill: 'none', stroke: '#FFFFFF', strokeOpacity: 0.55, strokeWidth: 1, strokeDasharray: '1.5 2.5' }} />
      <circle cx="50" cy="50" r="25" style={{ fill: '#FFFFFF', fillOpacity: 0.12 }} />
      <path d={starPath(50, 50, 21, 12, 5.5)} style={{ fill: '#F2CE1B' }} />
      <circle cx="50" cy="50" r="3.2" style={{ fill: ink }} />
      <text style={{ fill: '#FFFFFF', fontSize: name.length > 12 ? 7 : 8.5, fontWeight: 700, letterSpacing: '0.12em', fontFamily: 'inherit' }}>
        <textPath href={`#${id}-top`} startOffset="50%" textAnchor="middle">{name}</textPath>
      </text>
      <text style={{ fill: '#FFFFFF', fillOpacity: 0.8, fontSize: 6, fontWeight: 600, letterSpacing: '0.3em', fontFamily: 'inherit' }}>
        <textPath href={`#${id}-bottom`} startOffset="50%" textAnchor="middle">BULACAN</textPath>
      </text>
    </svg>
  );
}
