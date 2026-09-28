const ROLES = {
  ADMIN: 'admin',
  CUSTOMER_SUPPORT: 'customer_support',
};

const ROLE_HIERARCHY = {
  [ROLES.ADMIN]: 100,
  [ROLES.CUSTOMER_SUPPORT]: 50,
};

const JOB_STATUS = {
  DRAFT: 'draft',
  OPEN: 'open',
  IN_PROGRESS: 'in_progress',
  COMPLETED: 'completed',
  FINISHED: 'finished',
  CANCELLED: 'cancelled',
  ARCHIVED: 'archived',
};

const VERIFICATION_STATUS = {
  PENDING: 'pending',
  VERIFIED: 'verified',
  REJECTED: 'rejected',
  FLAGGED: 'flagged',
};

const DISPUTE_STATUS = {
  OPEN: 'open',
  UNDER_REVIEW: 'under_review',
  RESOLVED: 'resolved',
  DISMISSED: 'dismissed',
  ESCALATED: 'escalated',
};

const TRANSACTION_STATUS = {
  PENDING: 'pending',
  COMPLETED: 'completed',
  FAILED: 'failed',
  REFUNDED: 'refunded',
  ON_HOLD: 'on_hold',
};

const NOTIFICATION_TYPES = {
  INFO: 'info',
  WARNING: 'warning',
  ERROR: 'error',
  SUCCESS: 'success',
};

if (typeof module !== 'undefined') {
  module.exports = { ROLES, ROLE_HIERARCHY, JOB_STATUS, VERIFICATION_STATUS, DISPUTE_STATUS, TRANSACTION_STATUS, NOTIFICATION_TYPES };
}
