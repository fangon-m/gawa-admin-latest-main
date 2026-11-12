const supabase = require('../db/supabase');

/**
 * Friendly entity IDs.
 *
 * The admin UI shows short numeric IDs (e.g. USR-123456) derived from the row
 * UUID with an FNV-1a hash. This mirrors the client helper
 * `formatEntityIdNumeric` so a friendly ID in the URL can be resolved back to
 * the row without ever exposing the UUID.
 */

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
const CACHE_TTL_MS = 60_000;
const MAX_SCANNED_ROWS = 50000;

// table + id column per entity type. The prefix matches the ID shown in the UI.
const ENTITY_SOURCES = {
  user: { table: 'users_table', column: 'id', prefix: 'USR-' },
  job: { table: 'job_posts', column: 'job_post_id', prefix: 'JOB-' },
  listing: { table: 'equipment_listings', column: 'listing_id', prefix: 'LST-' },
  rental: { table: 'equipment_rentals', column: 'rental_id', prefix: 'RNT-' },
  transaction: { table: 'transactions', column: 'id', prefix: 'TXN-' },
};

function entityIdNumeric(id) {
  if (!id) return '';
  let hash = 0x811c9dc5;
  const str = String(id).replace(/-/g, '');
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = (hash * 0x01000193) >>> 0;
  }
  return (hash % 1000000).toString().padStart(6, '0');
}

function entityIdToken(id, prefix = 'USR-') {
  const numeric = entityIdNumeric(id);
  return numeric ? `${prefix}${numeric}` : '';
}

const caches = new Map();

async function getEntityIdMap(type, force = false) {
  const source = ENTITY_SOURCES[type];
  if (!source) return new Map();

  const cached = caches.get(type);
  if (!force && cached && Date.now() - cached.at < CACHE_TTL_MS && cached.map.size > 0) {
    return cached.map;
  }

  const { data, error } = await supabase
    .from(source.table)
    .select(source.column)
    .limit(MAX_SCANNED_ROWS);

  if (error) {
    console.error(`[EntityIds] Could not load ${source.table} ids:`, error.message);
    return cached ? cached.map : new Map();
  }

  const map = new Map();
  for (const row of data || []) {
    const raw = row[source.column];
    const numeric = entityIdNumeric(raw);
    if (!numeric) continue;
    if (!map.has(numeric)) map.set(numeric, []);
    map.get(numeric).push(raw);
  }
  caches.set(type, { at: Date.now(), map });
  return map;
}

/**
 * Resolves a route param that is either a UUID or a friendly ID (USR-123456).
 * Ambiguous friendly IDs (hash collisions) resolve to null so the caller can
 * answer 404 instead of opening the wrong row.
 */
async function resolveEntityId(type, param) {
  if (!param) return null;
  const source = ENTITY_SOURCES[type];
  if (!source) return null;

  const value = String(param).trim();
  if (UUID_PATTERN.test(value)) return value;

  const numeric = value.replace(new RegExp(`^${source.prefix}`, 'i'), '');
  if (!/^\d{1,6}$/.test(numeric)) return null;

  let matches = (await getEntityIdMap(type)).get(numeric);
  if (!matches) {
    matches = (await getEntityIdMap(type, true)).get(numeric);
  }
  if (!matches || matches.length !== 1) return null;
  return matches[0];
}

// Kept for the user routes, which resolve account ids only.
async function resolveUserId(param) {
  return resolveEntityId('user', param);
}

module.exports = {
  ENTITY_SOURCES,
  entityIdNumeric,
  entityIdToken,
  resolveEntityId,
  resolveUserId,
};
