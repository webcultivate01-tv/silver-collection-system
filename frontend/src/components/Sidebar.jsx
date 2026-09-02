// Left navigation for the admin panel. Fixed on large screens, a slide-in
// drawer below `lg`.

import { NavLink } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout, selectAdmin } from "../store/authSlice.js";
import { fileUrl } from "../api/axios.js";
import { initialsOf } from "../utils/format.js";
import SidebarBrand from "./SidebarBrand.jsx";
import {
  IconAdmins,
  IconCash,
  IconCollection,
  IconDashboard,
  IconIdCard,
  IconLogout,
  IconRate,
  IconReport,
  IconSilver,
  IconUser,
  IconUsers,
} from "./Icons.jsx";

const links = [
  { to: "/dashboard", label: "Dashboard", end: true, Icon: IconDashboard },
  { to: "/dashboard/employees", label: "Employees", end: false, Icon: IconUsers },
  { to: "/dashboard/collections", label: "Employee Collections", end: false, Icon: IconCollection },
  { to: "/dashboard/users", label: "Users", end: false, Icon: IconIdCard },
  { to: "/dashboard/silver-rate", label: "Silver Rate", end: false, Icon: IconRate },
  { to: "/dashboard/settlements", label: "Cash Settlements", end: false, Icon: IconCash },
  { to: "/dashboard/payouts", label: "Silver Payouts", end: false, Icon: IconSilver },
  { to: "/dashboard/reports", label: "Reports", end: false, Icon: IconReport },
  { to: "/dashboard/admins", label: "Admin Management", end: false, Icon: IconAdmins },
  { to: "/dashboard/profile", label: "My Profile", end: false, Icon: IconUser },
];

export default function Sidebar({ open, onClose }) {
  const dispatch = useDispatch();
  const admin = useSelector(selectAdmin);

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
        <SidebarBrand panel="Admin Panel" onClose={onClose} />

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {links.map(({ to, label, end, Icon }) => (
            <NavLink key={to} to={to} end={end} className={linkClasses} onClick={onClose}>
              <Icon className="w-5 h-5 shrink-0" />
              {label}
            </NavLink>
          ))}
        </nav>

        <div className="border-t border-silver-200 p-3 space-y-3">
          <div className="flex items-center gap-3 px-1.5">
            {admin?.profile_image ? (
              <img
                src={fileUrl(admin.profile_image, "admin")}
                alt=""
                className="w-9 h-9 rounded-full object-cover border border-silver-200"
              />
            ) : (
              <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                {initialsOf(admin?.name)}
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-medium text-silver-900 truncate">
                {admin?.name || "Admin"}
              </div>
              <div className="text-[11px] text-silver-500 truncate">{admin?.email}</div>
            </div>
          </div>

          <button onClick={() => dispatch(logout())} className="btn-secondary w-full">
            <IconLogout className="w-4 h-4" />
            Logout
          </button>
        </div>
      </aside>
    </>
  );
}
