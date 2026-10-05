const ROLES = { ADMIN: 'admin', CUSTOMER_SUPPORT: 'customer_support' };

const PERMISSIONS = {
  viewDashboard: { admin: true, customer_support: true },
  viewUsers: { admin: true, customer_support: true },
  viewUserDetail: { admin: true, customer_support: true },
  viewVerifications: { admin: true, customer_support: true },
  viewJobs: { admin: true, customer_support: true },
  viewJobDetail: { admin: true, customer_support: true },
  viewListings: { admin: true, customer_support: true },
  viewListingDetail: { admin: true, customer_support: true },
  viewTransactions: { admin: true, customer_support: false },
  viewTransactionDetail: { admin: true, customer_support: false },
  viewDisputes: { admin: true, customer_support: true },
  viewDisputeDetail: { admin: true, customer_support: true },
  viewModeration: { admin: true, customer_support: true },
  viewIncidents: { admin: true, customer_support: false },
  viewGawaPoints: { admin: true, customer_support: false },
  viewAppeals: { admin: true, customer_support: true },
  viewAppealDetail: { admin: true, customer_support: true },
  viewMessages: { admin: true, customer_support: true },
  viewSettings: { admin: true, customer_support: true },
  viewSupportDashboard: { admin: true, customer_support: true },

  viewRentals: { admin: true, customer_support: true },
  viewRentalDetail: { admin: true, customer_support: true },
  flagRental: { admin: true, customer_support: true },
  removeRental: { admin: true, customer_support: false },

  inviteUser: { admin: true, customer_support: false },
  releaseEscrow: { admin: true, customer_support: false },
  processRefund: { admin: true, customer_support: false },
  approvePayout: { admin: true, customer_support: false },
  resetPassword: { admin: true, customer_support: false },

  flagUser: { admin: true, customer_support: true },
  suspendUser: { admin: true, customer_support: false },
  reinstateUser: { admin: true, customer_support: false },
  archiveUser: { admin: true, customer_support: false },
  unarchiveUser: { admin: true, customer_support: false },
  deleteAccount: { admin: true, customer_support: false },
  approveVerification: { admin: true, customer_support: true },
  rejectVerification: { admin: true, customer_support: true },
  revokeVerification: { admin: true, customer_support: false },
  flagJob: { admin: true, customer_support: true },
  removeJob: { admin: true, customer_support: false },
  flagListing: { admin: true, customer_support: true },
  removeListing: { admin: true, customer_support: false },
  resolveDispute: { admin: true, customer_support: true },
  escalateDispute: { admin: true, customer_support: true },
  dismissDispute: { admin: true, customer_support: true },
  moderateReport: { admin: true, customer_support: true },
  sendMessage: { admin: true, customer_support: true },
  issuePoints: { admin: true, customer_support: false },
  deductPoints: { admin: true, customer_support: false },
  managePacks: { admin: true, customer_support: false },
  finalizeAppeal: { admin: true, customer_support: false },
  forwardAppeal: { admin: true, customer_support: true },
  acceptProposal: { admin: true, customer_support: false },
  finishJob: { admin: true, customer_support: false },
  completeJob: { admin: true, customer_support: false },

  manageTasks: { admin: true, customer_support: false },
  exportIncidents: { admin: true, customer_support: false },
  viewFinance: { admin: true, customer_support: false },
  viewAuditLogs: { admin: true, customer_support: false },
  manageSettings: { admin: true, customer_support: false },

  viewAssessments: { admin: true, customer_support: true },
  manageQuestions: { admin: true, customer_support: false },
  takeAssessment: { admin: true, customer_support: false },
  gradeAssessment: { admin: true, customer_support: false },

  viewEscalatedJobs: { admin: true, customer_support: true },
  resolveEscalatedJob: { admin: true, customer_support: false },

  viewAssessmentAttempts: { admin: true, customer_support: true },
  grantRetakeException: { admin: true, customer_support: false },

  // Skills & Assessment System
  viewSkills: { admin: true, customer_support: true },
  manageSkills: { admin: true, customer_support: false },
  manageSkillAssessments: { admin: true, customer_support: false },
  manageAssessmentQuestions: { admin: true, customer_support: false },

};

export function hasPermission(userRole, permission) {
  const perm = PERMISSIONS[permission];
  if (!perm) return false;
  return !!perm[userRole];
}

export function getEffectiveRole(user) {
  if (user?.role) return user.role;
  if (user?.roles?.length) return user.roles[0];
  return null;
}

export function usePermissions(user) {
  // Accept both legacy user?.role (string) and full user object
  const userRole = typeof user === 'string' ? user : getEffectiveRole(user);
  function can(permission) { return hasPermission(userRole, permission); }
  return { can, isAdmin: userRole === ROLES.ADMIN, isSupport: userRole === ROLES.CUSTOMER_SUPPORT };
}

export { ROLES };
