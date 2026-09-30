/*
 * The panel's ONLY icon component.
 *
 * This used to be ~25 hand-inlined Feather SVG paths, with a comment saying the
 * paths matched the mobile app "so the two halves of the product draw the same
 * icons". That stopped being true when the app moved to Phosphor — so this now
 * wraps Phosphor too, and the claim holds again.
 *
 * Same design as LibotBulacan/components/Icon.js: the PUBLIC API stays the
 * Feather name vocabulary that every call site and config object already uses
 * (`<Icon name="flag" />`), and the mapping to Phosphor happens here. No call
 * site had to change.
 *
 * Unlike the mobile app, a plain named import is correct here: Vite/Rollup
 * tree-shake (the package sets `"sideEffects": false`), so only the icons
 * listed below ship. Metro does not tree-shake, which is why the React Native
 * copy has to deep-import one module per icon.
 */
import {
  Aperture, Archive, ArrowRight, Bell, CaretDown, CaretUp, Check, CheckCircle, Clock,
  Desktop, Flag, ForkKnife, Hand, Image, Info, MapPin, Moon, Package, Pause, PencilSimple,
  Prohibit, SignOut, Sparkle, Star, Sun, ThumbsDown, ThumbsUp, Trash, Users,
  Warning, Wrench, X,
} from '@phosphor-icons/react';

const MAP = {
  'alert-triangle': Warning,
  'aperture':       Aperture,   // AR — same glyph as the app's AR mission
  'archive':        Archive,
  'arrow-right':    ArrowRight,
  'bell':           Bell,
  'box':            Package,
  'check':          Check,
  'check-circle':   CheckCircle,
  'chevron-down':   CaretDown,
  'chevron-up':     CaretUp,
  'clock':          Clock,
  'edit':           PencilSimple,
  'flag':           Flag,
  'hand':           Hand,
  'image':          Image,
  'info':           Info,
  'log-out':        SignOut,
  'map-pin':        MapPin,
  'monitor':        Desktop,
  'moon':           Moon,
  'pause':          Pause,
  'slash':          Prohibit,
  'sparkle':        Sparkle,
  'star':           Star,
  'sun':            Sun,
  'thumbs-down':    ThumbsDown,
  'thumbs-up':      ThumbsUp,
  'tool':           Wrench,
  'trash':          Trash,
  'users':          Users,
  'utensils':       ForkKnife,  // not a Feather name — Feather has no food glyph
  'x':              X,
};

/**
 * @param name   Feather-style name (see MAP above)
 * @param weight 'regular' | 'bold' | 'fill' | 'duotone' — `fill` gives the
 *               filled variant, which the old inline outline-only set could
 *               not do at all.
 */
export default function Icon({ name, size = 14, color = 'currentColor', weight = 'regular', style }) {
  const Cmp = MAP[name];
  // An unknown name renders nothing rather than breaking the row it sits in —
  // same behaviour as the component this replaces.
  if (!Cmp) {
    if (import.meta.env.DEV) {
      console.warn(`[Icon] Unknown icon "${name}" — add it to the MAP in components/Icon.jsx`);
    }
    return null;
  }
  return (
    <Cmp
      size={size}
      color={color}
      weight={weight}
      // Keeps the glyph optically centred next to text instead of sitting on
      // the baseline the way an emoji does.
      style={{ verticalAlign: '-0.15em', flexShrink: 0, ...style }}
      aria-hidden="true"
      focusable="false"
    />
  );
}
