import React, { Suspense, lazy } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import { usePermissions } from './utils/permissions';
import Layout from './components/layout/Layout';
import LoginPage from './pages/LoginPage';

// Lazy-loaded page components
const Dashboard = lazy(() => import('./pages/Dashboard'));
const Users = lazy(() => import('./pages/Users'));
const UserDetail = lazy(() => import('./pages/UserDetail'));
const Verification = lazy(() => import('./pages/Verification'));
const Jobs = lazy(() => import('./pages/Jobs'));
const JobDetail = lazy(() => import('./pages/JobDetail'));
const Listings = lazy(() => import('./pages/Listings'));
const ListingDetail = lazy(() => import('./pages/ListingDetail'));
const Transactions = lazy(() => import('./pages/Transactions'));
const TransactionDetail = lazy(() => import('./pages/TransactionDetail'));
const Oversight = lazy(() => import('./pages/Oversight'));
const DisputeDetail = lazy(() => import('./pages/DisputeDetail'));
const GawaPoints = lazy(() => import('./pages/GawaPoints'));
const AppealDetail = lazy(() => import('./pages/AppealDetail'));
const Messages = lazy(() => import('./pages/Messages'));
const Settings = lazy(() => import('./pages/Settings'));
const SupportDashboard = lazy(() => import('./pages/SupportDashboard'));
const Rentals = lazy(() => import('./pages/Rentals'));
const RentalDetail = lazy(() => import('./pages/RentalDetail'));
const Assessments = lazy(() => import('./pages/Assessments'));
const TakeAssessment = lazy(() => import('./pages/TakeAssessment'));
const TrustLedger = lazy(() => import('./pages/TrustLedger'));
const JobReviewQueue = lazy(() => import('./pages/JobReviewQueue'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));

function ProtectedRoute({ children, requiredPermission }) {
  const { user } = useAuth();
  const { can } = usePermissions(user);
  if (!user) return <Navigate to="/" />;
  if (requiredPermission && !can(requiredPermission)) {
    return <Navigate to="/" />;
  }
  return children;
}

export default function App() {
  const { user, isAuthenticated } = useAuth();
  const { can } = usePermissions(user);

  if (!isAuthenticated) {
    return (
      <Suspense fallback={
        <div className="page-loading">
          <div className="page-loading__spinner" />
        </div>
      }>
        <Routes>
          <Route path="/reset-password" element={<ResetPasswordPage />} />
          <Route path="*" element={<LoginPage />} />
        </Routes>
      </Suspense>
    );
  }

  return (
    <Layout>
      <Suspense fallback={
        <div className="page-loading">
          <div className="page-loading__spinner" />
        </div>
      }>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/users" element={<ProtectedRoute requiredPermission="viewUsers"><Users /></ProtectedRoute>} />
          <Route path="/users/:id" element={<ProtectedRoute requiredPermission="viewUserDetail"><UserDetail /></ProtectedRoute>} />
          <Route path="/verifications" element={<ProtectedRoute requiredPermission="viewVerifications"><Verification /></ProtectedRoute>} />
          <Route path="/jobs" element={<ProtectedRoute requiredPermission="viewJobs"><Jobs /></ProtectedRoute>} />
          <Route path="/jobs/:id" element={<ProtectedRoute requiredPermission="viewJobDetail"><JobDetail /></ProtectedRoute>} />
          <Route path="/listings" element={<ProtectedRoute requiredPermission="viewListings"><Listings /></ProtectedRoute>} />
          <Route path="/listings/:id" element={<ProtectedRoute requiredPermission="viewListingDetail"><ListingDetail /></ProtectedRoute>} />
          {can('viewTransactions') && <Route path="/transactions" element={<Transactions />} />}
          {can('viewTransactionDetail') && <Route path="/transactions/:id" element={<TransactionDetail />} />}
          <Route path="/rentals" element={<ProtectedRoute requiredPermission="viewRentals"><Rentals /></ProtectedRoute>} />
          <Route path="/rentals/:id" element={<ProtectedRoute requiredPermission="viewRentalDetail"><RentalDetail /></ProtectedRoute>} />
          <Route path="/oversight" element={<ProtectedRoute requiredPermission="viewDisputes"><Oversight /></ProtectedRoute>} />
          <Route path="/job-review-queue" element={<ProtectedRoute requiredPermission="viewDisputes"><JobReviewQueue /></ProtectedRoute>} />
          <Route path="/disputes/:id" element={<ProtectedRoute requiredPermission="viewDisputeDetail"><DisputeDetail /></ProtectedRoute>} />
          {can('viewGawaPoints') && <Route path="/gawa-points" element={<GawaPoints />} />}
          <Route path="/appeals/:id" element={<ProtectedRoute requiredPermission="viewAppealDetail"><AppealDetail /></ProtectedRoute>} />
          <Route path="/messages" element={<ProtectedRoute requiredPermission="viewMessages"><Messages /></ProtectedRoute>} />
          <Route path="/assessments" element={<ProtectedRoute requiredPermission="viewAssessments"><Assessments /></ProtectedRoute>} />
          <Route path="/assessments/take/:categoryId" element={<ProtectedRoute requiredPermission="takeAssessment"><TakeAssessment /></ProtectedRoute>} />
          <Route path="/settings" element={<ProtectedRoute requiredPermission="viewSettings"><Settings /></ProtectedRoute>} />
          <Route path="/support" element={<ProtectedRoute requiredPermission="viewSupportDashboard"><SupportDashboard /></ProtectedRoute>} />
          {can('viewTransactions') && <Route path="/trust-ledger" element={<TrustLedger />} />}
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </Suspense>
    </Layout>
  );
}
