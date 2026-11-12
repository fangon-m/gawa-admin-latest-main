const { resolveEntityId } = require('../utilities/entityIds');

/**
 * Route params accept both the raw UUID and the friendly entity ID shown in
 * the admin UI (USR-123456, JOB-123456, ...). The UUID is what the rest of the
 * server expects, so it is resolved here once per request.
 */
function resolveEntityParam(type) {
  return async function resolveEntity(req, res, next) {
    if (!req.params.id) return next();

    const resolved = await resolveEntityId(type, req.params.id);
    if (!resolved) {
      return res.status(404).json({ error: 'Not found' });
    }
    req.params.id = resolved;
    return next();
  };
}

module.exports = { resolveEntityParam };
