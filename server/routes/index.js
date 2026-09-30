const express = require('express');
const router = express.Router();

router.use('/auth', require('./auth'));
router.use('/users', require('./users'));
router.use('/verifications', require('./verifications'));
router.use('/jobs', require('./jobs'));
router.use('/listings', require('./listings'));
router.use('/rentals', require('./rentals'));
router.use('/transactions', require('./transactions'));
router.use('/disputes', require('./disputes'));
router.use('/reports', require('./reports'));
router.use('/moderation', require('./moderation'));
router.use('/messages', require('./messages'));
router.use('/appeals', require('./appeals'));
router.use('/incidents', require('./incidents'));
router.use('/reviews', require('./reviews'));
router.use('/user-incidents', require('./userIncidents'));
router.use('/gawa-points', require('./gawaPoints'));
router.use('/fee-config', require('./feeConfig'));
router.use('/categories', require('./categories'));
router.use('/questions', require('./questions'));
router.use('/assessments', require('./assessments'));
router.use('/assessment-attempts', require('./assessmentAttempts'));
router.use('/notifications', require('./notifications'));
router.use('/dashboard', require('./dashboard'));
router.use('/trust-ledger', require('./trustLedger'));
router.use('/notes', require('./notes'));
router.use('/settings', require('./settings'));
router.use('/entity-notes', require('./entityNotes'));
router.use('/completions', require('./completions'));
// Completion routes are mounted under matches
router.use('/matches/:matchId/completions', require('./tasks'));

// Schema-aligned routes (migration 003 — new tables)
router.use('/roles', require('./roles'));
router.use('/skills', require('./skills'));
router.use('/assessments-tests', require('./assessmentsTests'));
router.use('/wallets', require('./wallets'));
router.use('/flags', require('./flags'));

router.get('/health', async (req, res) => {
  const supabase = require('../db/supabase');
  const dbConnected = await supabase.testConnection();
  res.json({ 
    status: dbConnected ? 'ok' : 'degraded', 
    service: 'GAWA Admin API', 
    version: '1.0.0', 
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected'
  });
});

module.exports = router;
