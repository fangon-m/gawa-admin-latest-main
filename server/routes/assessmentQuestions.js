const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/assessmentQuestions');
const importCtrl = require('../controllers/assessmentQuestionImport');
const { authenticate } = require('../middleware/auth');
const { authorize, ROLES } = require('../middleware/roles');
const { createAuditLog } = require('../middleware/auditLogger');
const multer = require('multer');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 3, fieldSize: 200 },
  fileFilter(req, file, callback) {
    if (!/\.(xlsx|xls|csv)$/i.test(file.originalname || '')) {
      return callback(new Error('Only .xlsx, .xls, and .csv files are supported.'));
    }
    callback(null, true);
  },
});

async function handleUploadError(error, req, res, next) {
  if (!error) return next();
  const tooLarge = error instanceof multer.MulterError && error.code === 'LIMIT_FILE_SIZE';
  const status = tooLarge ? 413 : 400;
  const message = tooLarge ? 'The uploaded file must be 5 MB or smaller.' : error.message;
  await createAuditLog({
    agentId: req.user?.id,
    agentName: req.user?.name,
    action: 'ASSESSMENT_QUESTION_IMPORT_FAILED',
    module: 'assessment-questions',
    targetId: req.body?.assessmentId || null,
    targetType: 'skill_assessment',
    description: `Import rejected: ${message}`,
    ipAddress: req.ip,
    userAgent: req.headers?.['user-agent'],
  });
  return res.status(status).json({ error: message });
}

router.get('/', authenticate, ctrl.listAssessmentQuestions);
router.get('/:id', authenticate, ctrl.getAssessmentQuestionById);
router.post('/import', authenticate, authorize(ROLES.ADMIN), upload.single('file'), importCtrl.importAssessmentQuestions, handleUploadError);
router.post('/', authenticate, authorize(ROLES.ADMIN), ctrl.createAssessmentQuestion);
router.put('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.updateAssessmentQuestion);
router.delete('/:id', authenticate, authorize(ROLES.ADMIN), ctrl.deleteAssessmentQuestion);

module.exports = router;