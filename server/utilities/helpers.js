const crypto = require('crypto');

function generateId(prefix = '') {
  const id = crypto.randomUUID();
  return prefix ? `${prefix}-${id.slice(0, 8)}` : id.slice(0, 12);
}

function sanitizeString(str) {
  if (!str) return '';
  return str.trim().replace(/<[^>]*>/g, '');
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-PH', {
    style: 'currency',
    currency: 'PHP',
  }).format(amount);
}

const DEFAULT_PAGE_LIMIT = 20;
const MAX_PAGE_LIMIT = 100;

/**
 * Clamps pagination inputs so a caller cannot ask the database for an
 * unbounded result set (a `limit=10000000` request would otherwise turn the
 * list endpoints into a memory-exhaustion vector).
 *
 * `maxLimit` may be raised per endpoint when a legitimate consumer needs a
 * larger page (e.g. the assessment question bank), but it is never unbounded.
 */
function calculatePagination(page = 1, limit = DEFAULT_PAGE_LIMIT, maxLimit = MAX_PAGE_LIMIT) {
  const parsedPage = Number.parseInt(page, 10);
  const parsedLimit = Number.parseInt(limit, 10);
  const ceiling = Number.isFinite(maxLimit) && maxLimit > 0 ? maxLimit : MAX_PAGE_LIMIT;
  const p = Number.isFinite(parsedPage) ? Math.max(1, parsedPage) : 1;
  const l = Number.isFinite(parsedLimit) ? Math.min(ceiling, Math.max(1, parsedLimit)) : DEFAULT_PAGE_LIMIT;
  return { page: p, limit: l, offset: (p - 1) * l };
}

const UUID_PATTERN = /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i;
// Friendly entity ids as shown in the admin UI, e.g. USR-123456.
const FRIENDLY_ID_PATTERN = /^[A-Za-z]{2,4}-\d{1,6}$/;

function isUuid(value) {
  return typeof value === 'string' && UUID_PATTERN.test(value.trim());
}

/**
 * Filters that are interpolated into a PostgREST filter expression must never
 * contain syntax characters. `,` opens a new predicate, `(` / `)` delimit a
 * group and `:` introduces a cast, so a value carrying any of them lets the
 * caller restructure the query (and use the row count as a blind oracle over
 * columns that are not part of the projection).
 *
 * Search terms are normalised to a conservative allow-list instead of being
 * rejected, so ordinary punctuation in a name ("Doe, John") still searches.
 */
function sanitizeSearchTerm(value, { maxLength = 100 } = {}) {
  if (value === undefined || value === null) return '';
  const raw = String(value);
  // Everything outside the allow-list becomes a single space so that
  // "x%,complete_address.ilike.%a" collapses to "x  complete_address ilike  a"
  // and is then matched as a literal substring.
  const cleaned = raw
    .replace(/[^\p{L}\p{N} ._@'-]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // `_` is a single-character wildcard in LIKE. Escape it so a search term
  // cannot widen the match beyond the literal text the caller typed. The
  // backslash is introduced here, after sanitising, so it is never
  // caller-controlled.
  return cleaned.replace(/_/g, '\\_').slice(0, maxLength);
}

/**
 * Identifiers interpolated into PostgREST filters must be either a UUID or a
 * friendly entity id. Anything else is rejected outright rather than
 * sanitised, because a partial match would silently widen the filter.
 */
function sanitizeEntityFilter(value) {
  if (value === undefined || value === null || value === '') return '';
  const raw = String(value).trim();
  if (UUID_PATTERN.test(raw)) return raw;
  if (FRIENDLY_ID_PATTERN.test(raw)) return raw;
  return '';
}

/**
 * Sends an error response without leaking driver detail. PostgREST errors
 * disclose table, column and constraint names, which is exactly the
 * reconnaissance an attacker needs to craft filter injection payloads.
 */
function sendError(res, err, { status = 500, fallback = 'Something went wrong' } = {}) {
  const code = err?.code ? ` [${err.code}]` : '';
  console.error(`[Error]${code}`, err?.message || err || 'Unknown error');
  return res.status(status).json({ error: fallback });
}

function paginatedResponse(data, total, page, limit) {
  return {
    data,
    pagination: {
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    },
  };
}

/**
 * Convert snake_case object keys to camelCase recursively.
 */
function toCamelCase(obj) {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(toCamelCase);
  if (typeof obj !== 'object') return obj;
  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    const camelKey = key.replace(/_([a-z])/g, (_, c) => c.toUpperCase());
    result[camelKey] = toCamelCase(value);
  }
  return result;
}

function getFullName(user) {
  if (!user) return '';
  const parts = [user.first_name, user.middle_name, user.last_name].filter(Boolean);
  return parts.join(' ') || user.email || '';
}

module.exports = {
  generateId,
  sanitizeString,
  formatCurrency,
  calculatePagination,
  paginatedResponse,
  toCamelCase,
  getFullName,
  isUuid,
  sanitizeSearchTerm,
  sanitizeEntityFilter,
  sendError,
  UUID_PATTERN,
  FRIENDLY_ID_PATTERN,
  DEFAULT_PAGE_LIMIT,
  MAX_PAGE_LIMIT,
};
