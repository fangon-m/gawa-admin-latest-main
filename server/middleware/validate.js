const { z } = require('zod');

/**
 * Middleware factory that validates req.body against a Zod schema.
 * Returns 400 with structured errors on failure.
 */
function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }
    req.body = result.data; // Use parsed/coerced data
    next();
  };
}

/**
 * Middleware factory that validates req.query against a Zod schema.
 */
function validateQuery(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.query);
    if (!result.success) {
      const errors = result.error.issues.map(issue => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));
      return res.status(400).json({ error: 'Invalid query parameters', details: errors });
    }
    req.query = result.data;
    next();
  };
}

// Common validation schemas
const schemas = {
  // Auth
  login: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),

  requestReset: z.object({
    email: z.string().email('Invalid email address'),
  }),
  resetPassword: z.object({
    accessToken: z.string().min(1, 'Access token is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  }),

  adminResetPassword: z.object({
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  }),

  // Users
  inviteUser: z.object({
    name: z.string().min(1, 'Name is required').max(100),
    email: z.string().email('Invalid email address'),
    role: z.enum(['admin', 'customer_support'], 'Role must be admin or customer_support'),
  }),
  archiveUser: z.object({
    reason: z.string().trim().min(1, 'Archive reason is required').max(500),
  }),

  // Verifications
  reviewVerification: z.object({
    remarks: z.string().optional(),
  }),

  rejectVerification: z.object({
    remarks: z.string().optional().nullable(),
  }),

  // Disputes
  updateDisputeStatus: z.object({
    status: z.enum(['pending', 'under-review', 'resolved', 'dismissed'], 'Invalid dispute status'),
    resolution: z.string().optional(),
    assignedTo: z.string().uuid('Invalid assigned user ID').optional(),
    notes: z.string().optional(),
  }),

  // Messages
  sendMessage: z.object({
    conversationId: z.string().uuid('Invalid conversation ID'),
    text: z.string().min(1, 'Message text is required').max(5000),
  }),

  createConversation: z.object({
    participantIds: z.array(z.string().uuid()).min(2, 'At least 2 participant IDs are required'),
  }),

  // Notes
  addNote: z.object({
    userId: z.string().uuid('Invalid user ID'),
    content: z.string().min(1, 'Note content is required').max(5000),
  }),

  // Notifications
  createNotification: z.object({
    type: z.string().min(1, 'Type is required'),
    title: z.string().min(1, 'Title is required'),
    description: z.string().optional(),
    link: z.string().optional(),
  }),

  // Incidents
  listIncidents: z.object({
    agentId: z.string().optional(),
    module: z.string().optional(),
    action: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.coerce.number().int().positive().max(1000).optional().default(50),
    page: z.coerce.number().int().positive().optional().default(1),
  }),
};

module.exports = { validate, validateQuery, schemas };
