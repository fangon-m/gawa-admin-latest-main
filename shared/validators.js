const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_REGEX = /^\+?[\d\s\-()]{7,20}$/;
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidEmail(email) {
  return EMAIL_REGEX.test(email);
}

function isValidPhone(phone) {
  return PHONE_REGEX.test(phone);
}

function isValidUuid(value) {
  return UUID_REGEX.test(value);
}

function sanitizeString(str) {
  if (typeof str !== 'string') return '';
  return str.trim().replace(/<[^>]*>/g, '');
}

function isValidPagination(page, limit) {
  const p = Number(page);
  const l = Number(limit);
  return Number.isInteger(p) && p >= 1 && Number.isInteger(l) && l >= 1 && l <= 100;
}

if (typeof module !== 'undefined') {
  module.exports = { isValidEmail, isValidPhone, isValidUuid, sanitizeString, isValidPagination };
}
