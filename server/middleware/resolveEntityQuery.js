const { resolveEntityId } = require('../utilities/entityIds');
const { isUuid } = require('../utilities/helpers');

/**
 * Resolves entity ids supplied as query parameters.
 *
 * The admin UI shows short ids (USR-123456, LST-792472) and sometimes sends
 * those instead of the underlying uuid. A page that filters by an entity it
 * has not loaded yet — ListingDetail asks for the listing's rentals before
 * the listing itself has arrived — sends the short id.
 *
 * Without this the value reaches the database, which rejects it as a
 * malformed uuid and turns a lookup into a 500.
 *
 * Usage:
 *   router.get('/', resolveEntityQuery(['ownerId', 'user']), ctrl.list);
 */
function resolveEntityQuery(...specs) {
  return async (req, res, next) => {
    for (const [param, type] of specs) {
      const value = req.query?.[param];
      if (value === undefined || value === null || value === '') continue;
      // Already a uuid: nothing to do, and the common case stays cheap.
      if (isUuid(String(value))) continue;

      const resolved = await resolveEntityId(type, String(value));
      if (!resolved) {
        return res.status(400).json({ error: `Invalid ${param}` });
      }
      req.query[param] = resolved;
    }
    next();
  };
}

module.exports = { resolveEntityQuery };
