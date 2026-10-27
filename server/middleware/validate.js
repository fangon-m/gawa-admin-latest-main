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
    token: z.string().min(20, 'Invalid reset link').max(200, 'Invalid reset link').optional(),
    accessToken: z.string().min(1).optional(),
    newPassword: z.string()
      .min(7, 'Password must be at least 7 characters')
      .max(128, 'Password must be at most 128 characters'),
  }).refine((value) => Boolean(value.token || value.accessToken), {
    message: 'A reset token is required',
    path: ['token'],
  }),
  changePassword: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(6, 'Password must be at least 6 characters'),
  }),

  // Users
  inviteUser: z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    email: z.string().trim().email('Invalid email address').max(254).transform(v => v.toLowerCase()),
    role: z.enum(['admin', 'customer_support'], 'Role must be admin or customer_support'),
  }),
  acceptInvite: z.object({
    token: z.string().min(20, 'Invalid invitation link').max(200, 'Invalid invitation link'),
    password: z.string()
      .min(7, 'Password must be at least 7 characters')
      .max(128, 'Password must be at most 128 characters'),
  }),
  archiveUser: z.object({
    reason: z.string().trim().min(1, 'Archive reason is required').max(500),
  }),
  issueReportAction: z.object({
    reason: z.string().trim().min(1, 'A reason is required').max(1000).optional(),
    durationDays: z.coerce.number().int().min(1).max(90).optional(),
    messageText: z.string().trim().min(1).max(2000).optional(),
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
    conversationId: z.string().regex(
      /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i,
      'Invalid conversation ID'
    ),
    text: z.string().trim().min(1, 'Message text is required').max(10000),
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
    userId: z.string().uuid('Invalid recipient ID').optional(),
    entityType: z.enum(['job_proposal', 'job_assignment', 'equipment_request', 'verification']).optional(),
    entityId: z.string().uuid('Invalid entity ID').optional(),
  }),

  // Activity Log
  listActivityLog: z.object({
    userId: z.string().uuid('Invalid user ID').optional(),
    activityType: z.string().optional(),
    category: z.string().optional(),
    scope: z.enum(['all', 'admin']).optional().default('all'),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
    limit: z.coerce.number().int().positive().max(1000).optional().default(50),
    page: z.coerce.number().int().positive().optional().default(1),
  }),
  createActivityLog: z.object({
    userId: z.string().uuid('Invalid user ID').optional(),
    activityType: z.enum([
      'deposit_refunded',
      'equipment_returned',
      'equipment_paid',
      'deposit_paid',
      'job_posted',
      'talent_hired',
      'job_payment_paid',
      'points_topped_up',
      'proposal_sent',
      'proposal_received',
      'job_cancelled',
      'equipment_listed',
      'rental_requested',
      'rental_request_received',
      'rental_request_approved',
      'rental_request_rejected',
      'rental_request_cancelled',
      // Admin activity types (require migration 004 to be applied to activity_log)
      'user_suspended',
      'user_reinstated',
      'user_archived',
      'user_unarchived',
      'user_deleted',
      'user_flagged',
      'user_auto_suspended',
      'user_warning_complied',
      'password_reset',
      'user_invited',
      'invite_accepted',
      'invite_resent',
      'invite_revoked',
      'invite_delivery_failed',
      'points_deducted',
      'content_flagged',
    ], 'Invalid activity type'),
    category: z.enum(['equipment', 'job', 'wallet', 'user'], 'Invalid category'),
    description: z.string().min(1, 'Description is required').max(2000),
    relatedListingId: z.string().uuid('Invalid listing ID').optional().nullable(),
    relatedJobPostId: z.string().uuid('Invalid job post ID').optional().nullable(),
    relatedUserId: z.string().uuid('Invalid user ID').optional().nullable(),
    relatedPaymentRequestId: z.string().uuid('Invalid payment request ID').optional().nullable(),
    amount: z.coerce.number().optional().nullable(),
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
