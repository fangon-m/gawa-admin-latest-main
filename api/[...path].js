// Catch-all for /api/* so every Express route (including nested ones such as
// /api/auth/login) reaches the same application instance. `api/index.js`
// covers the bare /api path.
module.exports = require('./index.js');
