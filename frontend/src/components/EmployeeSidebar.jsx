// Left navigation for the employee portal. Same shape as the admin Sidebar -
// fixed on large screens, a slide-in drawer below `lg` - but it only carries
// the screens an employee is allowed to open.

import { useNavigate, NavLink } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { employeeLogout, selectEmployee } from "../store/employeeAuthSlice.js";
import { initialsOf } from "../utils/format.js";
import SidebarBrand from "./SidebarBrand.jsx";
import { documentUrl } from "./DocumentUpload.jsx";
import {
  IconCash,
  IconCollection,
  IconDashboard,
  IconLogout,
  IconSilver,
  IconUser,
  IconUsers,
} from "./Icons.jsx";

const links = [
  { to: "/employee/portal", label: "Dashboard", end: true, Icon: IconDashboard },
  { to: "/employee/users", label: "User Management", end: false, Icon: IconUsers },
  { to: "/employee/purchases", label: "Record Purchase", end: false, Icon: IconSilver },
  { to: "/employee/sales", label: "Buy Silver Back", end: false, Icon: IconSilver },
  { to: "/employee/settlements", label: "Cash Handover", end: false, Icon: IconCash },
  { to: "/employee/collections", label: "Monthly Collection", end: false, Icon: IconCollection },
  { to: "/employee/profile", label: "Profile", end: false, Icon: IconUser },
];

export default function EmployeeSidebar({ open, onClose }) {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const employee = useSelector(selectEmployee);

  function handleLogout() {
    dispatch(employeeLogout());
    navigate("/employee", { replace: true });
  }

  // On a temporary password the only page they can open is this one, so don't
  // offer a Dashboard link that EmployeeProtectedRoute would bounce straight back.
  const visibleLinks = employee?.mustChangePassword
    ? links.filter((link) => link.to === "/employee/profile")
    : links;

  const linkClasses = ({ isActive }) =>
    `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
      isActive
        ? "bg-brand-600 text-white shadow-card"
        : "text-silver-600 hover:bg-silver-100 hover:text-silver-900"
    }`;

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-30 bg-silver-900/40 lg:hidden" onClick={onClose} />
      )}

      <aside
        className={`fixed left-0 top-0 z-40 h-screen w-64 shrink-0 flex flex-col bg-white border-r border-silver-200
                    transition-transform lg:translate-x-0 ${open ? "translate-x-0" : "-translate-x-full"}`}
      >
        <SidebarBrand panel="Employee Panel" onClose={onClose} />

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {visibleLinks.map(({ to, label, end, Icon }) => (
            <NavLink key={to} to={to} end={end} className={linkClasses} onClick={onClose}>
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-silver-200 p-3 space-y-3">
          <div className="flex items-center gap-3 px-1.5">
            {employee?.profilePhoto ? (
              <img
                src={documentUrl(employee.profilePhoto)}
                alt=""
                className="w-9 h-9 rounded-full object-cover border border-silver-200"
              />
            ) : (
              <span className="grid place-items-center w-9 h-9 rounded-full bg-amber-100 text-amber-700 text-xs font-semibold">
                {initialsOf(employee?.fullName)}
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-medium text-silver-900 truncate">
                {employee?.fullName || "Employee"}
              </div>
              <div className="text-[11px] text-silver-500 truncate">{employee?.email}</div>
            </div>
          </div>

          <button onClick={handleLogout} className="btn-secondary w-full">
            <IconLogout className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
