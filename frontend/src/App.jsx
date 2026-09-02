// "/" is the public landing page - the only route that renders without a
// session. Its Login button offers the customer and employee doors; the admin
// door is not advertised there and is still reached by typing /admin.
//
// Each role has its own front door, and each door opens on that role's login
// page:  /admin -> admin login,  /employee -> employee login,  /user -> user login.
//
// The admin door serves two roles. What comes back from the login decides where
// they land and what they can open afterwards:
//   role "admin"    -> /dashboard/*  the full admin panel
//   role "subadmin" -> /sub-admin/*  every report the admin can pull, plus
//                                    accepting employees' cash handovers
// ProtectedRoute keeps them apart, so a typed URL can't cross the line.
//
// Where the two roles do the same job they render the same component rather
// than a copy of it - Reports on both sides is ReportCenterGrid, and Cash
// Settlements on both sides is CashSettlements.

import { Navigate, Route, Routes } from "react-router-dom";

import Landing from "./pages/Landing.jsx";
import Login from "./pages/Login.jsx";
import ForgotPassword from "./pages/ForgotPassword.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Profile from "./pages/Profile.jsx";
import CashSettlements from "./pages/CashSettlements.jsx";
import EmployeeList from "./pages/admin/EmployeeList.jsx";
import EmployeeRegister from "./pages/admin/EmployeeRegister.jsx";
import EmployeeDetail from "./pages/admin/EmployeeDetail.jsx";
import EmployeeCollections from "./pages/admin/EmployeeCollections.jsx";
import UserList from "./pages/admin/UserList.jsx";
import UserDetail from "./pages/admin/UserDetail.jsx";
import SilverRate from "./pages/admin/SilverRate.jsx";
import AdminManagement from "./pages/admin/AdminManagement.jsx";
import AdminPayouts from "./pages/admin/AdminPayouts.jsx";
import Reports from "./pages/admin/Reports.jsx";

import SubAdminDashboard from "./pages/subadmin/SubAdminDashboard.jsx";
import SubAdminEmployeeReport from "./pages/subadmin/EmployeeReport.jsx";
import SubAdminSilverRateReport from "./pages/subadmin/SilverRateReport.jsx";
import SubAdminCollectionReport from "./pages/subadmin/CollectionReport.jsx";
import SubAdminReports from "./pages/subadmin/Reports.jsx";
import SubAdminPayoutReport from "./pages/subadmin/PayoutReport.jsx";

import EmployeeLogin from "./pages/EmployeeLogin.jsx";
import EmployeePortal from "./pages/EmployeePortal.jsx";
import EmployeeUsers from "./pages/EmployeeUsers.jsx";
import EmployeeUserRegister from "./pages/EmployeeUserRegister.jsx";
import EmployeeUserDetail from "./pages/EmployeeUserDetail.jsx";
import EmployeePurchase from "./pages/EmployeePurchase.jsx";
import EmployeeSale from "./pages/EmployeeSale.jsx";
import EmployeeSettlements from "./pages/EmployeeSettlements.jsx";
import EmployeeMonthlyCollections from "./pages/EmployeeMonthlyCollections.jsx";
import EmployeeProfile from "./pages/EmployeeProfile.jsx";

import UserLogin from "./pages/UserLogin.jsx";
import UserPortal from "./pages/UserPortal.jsx";
import UserHistory from "./pages/UserHistory.jsx";
import UserProfile from "./pages/UserProfile.jsx";

import ProtectedRoute from "./components/ProtectedRoute.jsx";
import EmployeeProtectedRoute from "./components/EmployeeProtectedRoute.jsx";
import UserProtectedRoute from "./components/UserProtectedRoute.jsx";
import DashboardLayout from "./components/DashboardLayout.jsx";
import SubAdminLayout from "./components/SubAdminLayout.jsx";
import EmployeeLayout from "./components/EmployeeLayout.jsx";
import UserLayout from "./components/UserLayout.jsx";
import { ROLE_ADMIN, ROLE_SUB_ADMIN } from "./store/authSlice.js";

function AdminPage({ children }) {
  return (
    <ProtectedRoute allow={[ROLE_ADMIN]}>
      <DashboardLayout>{children}</DashboardLayout>
    </ProtectedRoute>
  );
}

function SubAdminPage({ children }) {
  return (
    <ProtectedRoute allow={[ROLE_SUB_ADMIN]}>
      <SubAdminLayout>{children}</SubAdminLayout>
    </ProtectedRoute>
  );
}

function EmployeePage({ children }) {
  return (
    <EmployeeProtectedRoute>
      <EmployeeLayout>{children}</EmployeeLayout>
    </EmployeeProtectedRoute>
  );
}

function UserPage({ children }) {
  return (
    <UserProtectedRoute>
      <UserLayout>{children}</UserLayout>
    </UserProtectedRoute>
  );
}

export default function App() {
  return (
    <Routes>
      {/* Public site. The only route anyone can open without a session. */}
      <Route path="/" element={<Landing />} />

      {/* Admin */}
      <Route path="/admin" element={<Login />} />
      <Route path="/admin/forgot-password" element={<ForgotPassword role="admin" />} />

      <Route path="/dashboard" element={<AdminPage><Dashboard /></AdminPage>} />
      <Route path="/dashboard/employees" element={<AdminPage><EmployeeList /></AdminPage>} />
      <Route path="/dashboard/employees/new" element={<AdminPage><EmployeeRegister /></AdminPage>} />
      <Route path="/dashboard/employees/:id" element={<AdminPage><EmployeeDetail /></AdminPage>} />
      <Route path="/dashboard/collections" element={<AdminPage><EmployeeCollections /></AdminPage>} />
      <Route
        path="/dashboard/collections/:employeeId"
        element={<AdminPage><EmployeeCollections /></AdminPage>}
      />
      <Route path="/dashboard/users" element={<AdminPage><UserList /></AdminPage>} />
      <Route path="/dashboard/users/:id" element={<AdminPage><UserDetail /></AdminPage>} />
      <Route path="/dashboard/silver-rate" element={<AdminPage><SilverRate /></AdminPage>} />
      <Route path="/dashboard/settlements" element={<AdminPage><CashSettlements /></AdminPage>} />
      <Route path="/dashboard/payouts" element={<AdminPage><AdminPayouts /></AdminPage>} />
      <Route path="/dashboard/reports" element={<AdminPage><Reports /></AdminPage>} />
      <Route path="/dashboard/admins" element={<AdminPage><AdminManagement /></AdminPage>} />
      <Route path="/dashboard/profile" element={<AdminPage><Profile /></AdminPage>} />

      {/* Sub-Admin */}
      <Route path="/sub-admin" element={<SubAdminPage><SubAdminDashboard /></SubAdminPage>} />
      <Route
        path="/sub-admin/employees"
        element={<SubAdminPage><SubAdminEmployeeReport /></SubAdminPage>}
      />
      <Route
        path="/sub-admin/silver-rate"
        element={<SubAdminPage><SubAdminSilverRateReport /></SubAdminPage>}
      />
      <Route
        path="/sub-admin/collection-report"
        element={<SubAdminPage><SubAdminCollectionReport /></SubAdminPage>}
      />
      <Route
        path="/sub-admin/reports"
        element={<SubAdminPage><SubAdminReports /></SubAdminPage>}
      />
      <Route
        path="/sub-admin/payouts"
        element={<SubAdminPage><SubAdminPayoutReport /></SubAdminPage>}
      />
      {/* The same screen the admin opens at /dashboard/settlements. A
          sub-admin can accept a handover here - the one write their account
          is allowed anywhere in the app (authMiddleware.js). */}
      <Route
        path="/sub-admin/settlements"
        element={<SubAdminPage><CashSettlements /></SubAdminPage>}
      />

      {/* Employee */}
      <Route path="/employee" element={<EmployeeLogin />} />
      <Route path="/employee/forgot-password" element={<ForgotPassword role="employee" />} />
      <Route path="/employee/portal" element={<EmployeePage><EmployeePortal /></EmployeePage>} />
      <Route path="/employee/users" element={<EmployeePage><EmployeeUsers /></EmployeePage>} />
      <Route path="/employee/users/new" element={<EmployeePage><EmployeeUserRegister /></EmployeePage>} />
      <Route path="/employee/users/:id" element={<EmployeePage><EmployeeUserDetail /></EmployeePage>} />
      <Route path="/employee/purchases" element={<EmployeePage><EmployeePurchase /></EmployeePage>} />
      <Route path="/employee/sales" element={<EmployeePage><EmployeeSale /></EmployeePage>} />
      <Route path="/employee/settlements" element={<EmployeePage><EmployeeSettlements /></EmployeePage>} />
      <Route
        path="/employee/collections"
        element={<EmployeePage><EmployeeMonthlyCollections /></EmployeePage>}
      />
      <Route path="/employee/profile" element={<EmployeePage><EmployeeProfile /></EmployeePage>} />

      {/* User */}
      <Route path="/user" element={<UserLogin />} />
      <Route path="/user/forgot-password" element={<ForgotPassword role="user" />} />
      <Route path="/user/portal" element={<UserPage><UserPortal /></UserPage>} />
      <Route path="/user/history" element={<UserPage><UserHistory /></UserPage>} />
      <Route path="/user/profile" element={<UserPage><UserProfile /></UserPage>} />

      {/* Old links kept working */}
      <Route path="/login" element={<Navigate to="/admin" replace />} />
      <Route path="/forgot-password" element={<Navigate to="/admin/forgot-password" replace />} />
      <Route path="/employee/login" element={<Navigate to="/employee" replace />} />
      <Route path="/employee/change-password" element={<Navigate to="/employee/profile" replace />} />

      {/* An unknown URL belongs on the public page now, not the admin door. */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
