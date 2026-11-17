import React from 'react';
import * as lucideIcons from 'lucide-react';
import { BookOpen } from 'lucide-react';

/**
 * Skill icons are stored as free text in `skills.icon`. The picker writes lucide
 * export names ("Hammer"), but rows also arrive from older data and the mobile
 * app with plain trade words. "Mop" is the common one: lucide never shipped a
 * `Mop` icon, so the lookup missed and the raw word was printed inside the icon
 * tile. Map those words onto the closest real icon instead.
 */
const ICON_ALIASES = {
  mop: 'BrushCleaning',
  mopping: 'BrushCleaning',
  broom: 'BrushCleaning',
  sweeping: 'BrushCleaning',
  cleaning: 'BrushCleaning',
  housekeeping: 'BrushCleaning',
};

// Built once: lucide exports each icon under several names (Hammer, HammerIcon,
// LucideHammer), so a case-insensitive lookup is all that is needed.
const ICONS_BY_NAME = new Map(
  Object.entries(lucideIcons)
    .filter(([, value]) => typeof value === 'function' || Boolean(value && value.$$typeof))
    .map(([name, Icon]) => [name.toLowerCase(), Icon])
);

function normalize(value) {
  return String(value || '').trim().toLowerCase().replace(/[-_\s]/g, '');
}

export function isImageIcon(icon) {
  const value = String(icon || '').trim();
  return /^https?:\/\//i.test(value) || value.startsWith('/') || value.startsWith('data:');
}

export function resolveLucideIcon(icon) {
  const normalized = normalize(icon);
  if (!normalized) return null;
  const alias = ICON_ALIASES[normalized];
  if (alias) return lucideIcons[alias] || null;
  return ICONS_BY_NAME.get(normalized) || null;
}

/**
 * Renders a skill's icon: an uploaded image, a lucide icon (aliases included),
 * an emoji/short label, or a neutral book icon when nothing is set.
 */
export function SkillIcon({ icon, size = 24 }) {
  if (!icon) return <BookOpen size={size} />;

  if (isImageIcon(icon)) {
    return <img src={String(icon).trim()} alt="" style={{ width: size, height: size, objectFit: 'contain' }} />;
  }

  const Icon = resolveLucideIcon(icon);
  if (Icon) return <Icon size={size} />;

  return <span role="img" aria-label={icon} style={{ fontSize: size }}>{icon}</span>;
}

export default SkillIcon;
