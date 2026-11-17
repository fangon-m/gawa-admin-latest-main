// Vercel serverless entrypoint for the GAWA Admin API.
//
// Vercel's Node runtime can serve an Express app directly: the exported
// handler is invoked with the raw (req, res) pair, so no `app.listen` is
// needed. This file is the only thing that changes when moving from the
// long-running server (scripts/run-server.js) to a deployment.
//
// NODE_ENV has to be set before server/config is required, because config
// refuses to load without it (that guard is what keeps the production-only
// checks — required secrets, banned console mailer — switched on).
process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const { app } = require('../server/server');

module.exports = app;
