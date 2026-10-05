process.env.JWT_SECRET = 'test-secret';
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-key';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service-role-key';

jest.mock('../../middleware/auth', () => ({
  authenticate: (req, res, next) => {
    const role = req.headers['x-test-role'];
    if (!role) return res.status(401).json({ error: 'Authentication required' });
    req.user = { role, roles: [role] };
    next();
  },
}));

const mockRouteResponse = (req, res) => res.json({ reachedController: true });

jest.mock('../../controllers/users', () => ({
  listUsers: mockRouteResponse,
  getUserById: mockRouteResponse,
  listUserProposals: mockRouteResponse,
  listEscalatedUsers: mockRouteResponse,
  inviteUser: mockRouteResponse,
  updateUser: mockRouteResponse,
  suspendUser: mockRouteResponse,
  reinstateUser: mockRouteResponse,
  archiveUser: mockRouteResponse,
  unarchiveUser: mockRouteResponse,
  flagUser: mockRouteResponse,
  adminResetPassword: mockRouteResponse,
  escalateToDeletion: mockRouteResponse,
  removeFromEscalation: mockRouteResponse,
  deleteUser: mockRouteResponse,
}));
jest.mock('../../controllers/reports', () => ({
  listReports: mockRouteResponse,
  moderateReport: mockRouteResponse,
}));
jest.mock('../../controllers/reviews', () => ({
  listReviews: mockRouteResponse,
  getReviewById: mockRouteResponse,
}));
jest.mock('../../controllers/verifications', () => ({
  listVerifications: mockRouteResponse,
  getVerificationById: mockRouteResponse,
  approveVerification: mockRouteResponse,
  rejectVerification: mockRouteResponse,
}));
jest.mock('../../controllers/jobs', () => ({
  listJobs: mockRouteResponse,
  getJobById: mockRouteResponse,
  flagJob: mockRouteResponse,
  removeJob: mockRouteResponse,
}));
jest.mock('../../controllers/jobCheckIns', () => ({
  checkIn: mockRouteResponse,
  getCheckInStatus: mockRouteResponse,
}));
jest.mock('../../controllers/escalatedJobs', () => ({
  listEscalatedJobs: mockRouteResponse,
  resolveEscalatedJob: mockRouteResponse,
}));
jest.mock('../../controllers/listings', () => ({
  listListings: mockRouteResponse,
  getListingById: mockRouteResponse,
  flagListing: mockRouteResponse,
  removeListing: mockRouteResponse,
}));
jest.mock('../../controllers/rentals', () => ({
  listRentals: mockRouteResponse,
  getRentalById: mockRouteResponse,
  flagRental: mockRouteResponse,
  removeRental: mockRouteResponse,
}));
jest.mock('../../controllers/appeals', () => ({
  listAppeals: mockRouteResponse,
  getAppealById: mockRouteResponse,
  forwardAppeal: mockRouteResponse,
  decideAppeal: mockRouteResponse,
}));
jest.mock('../../controllers/disputes', () => ({
  listDisputes: mockRouteResponse,
  getDisputeById: mockRouteResponse,
  updateDisputeStatus: mockRouteResponse,
}));
jest.mock('../../controllers/messages', () => ({
  listConversations: mockRouteResponse,
  getConversation: mockRouteResponse,
  sendMessage: mockRouteResponse,
  createConversation: mockRouteResponse,
}));

const express = require('express');
const request = require('supertest');
const users = require('../users');
const reports = require('../reports');
const reviews = require('../reviews');
const verifications = require('../verifications');
const jobs = require('../jobs');
const listings = require('../listings');
const rentals = require('../rentals');
const appeals = require('../appeals');
const disputes = require('../disputes');
const messages = require('../messages');

const app = express();
app.use('/users', users);
app.use('/reports', reports);
app.use('/reviews', reviews);
app.use('/verifications', verifications);
app.use('/jobs', jobs);
app.use('/listings', listings);
app.use('/rentals', rentals);
app.use('/appeals', appeals);
app.use('/disputes', disputes);
app.use('/messages', messages);

describe('admin data read route authorization', () => {
  const restrictedReads = [
    '/users',
    '/users/user-id',
    '/users/user-id/proposals',
    '/reports',
    '/reviews',
    '/reviews/review-id',
    '/verifications',
    '/verifications/verification-id',
    '/jobs',
    '/jobs/job-id',
    '/listings',
    '/listings/listing-id',
    '/rentals',
    '/rentals/rental-id',
    '/appeals',
    '/appeals/appeal-id',
    '/disputes',
    '/disputes/dispute-id',
    '/messages',
    '/messages/conversation-id',
  ];

  it.each(restrictedReads)('denies a non-staff authenticated user from %s', async (path) => {
    const response = await request(app).get(path).set('x-test-role', 'client');

    expect(response.status).toBe(403);
    expect(response.body).toEqual({ error: 'Insufficient permissions' });
  });

  it.each(['admin', 'customer_support'])('allows %s to access approved staff reads', async (role) => {
    const response = await request(app)
      .get('/verifications/verification-id')
      .set('x-test-role', role);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ reachedController: true });
  });

  it('still requires authentication', async () => {
    const response = await request(app).get('/users');

    expect(response.status).toBe(401);
  });
});
