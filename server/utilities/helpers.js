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

function calculatePagination(page = 1, limit = 20) {
  const p = Math.max(1, parseInt(page));
  const l = Math.min(100, Math.max(1, parseInt(limit)));
  return { page: p, limit: l, offset: (p - 1) * l };
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

module.exports = { generateId, sanitizeString, formatCurrency, calculatePagination, paginatedResponse, toCamelCase, getFullName };
