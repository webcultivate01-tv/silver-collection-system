// Navigation for the sub-admin: every report they can pull, and the cash
// handovers they can accept. Nothing that manages employees, rates or
// accounts.
//
// It is a separate component from the admin Sidebar on purpose - the admin
// sidebar keeps its own links and this one can never accidentally grow an
// admin-only entry.

import { NavLink } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { logout, selectAdmin } from "../store/authSlice.js";
import { fileUrl } from "../api/axios.js";
import { initialsOf } from "../utils/format.js";
import SidebarBrand from "./SidebarBrand.jsx";
import {
  IconCash,
  IconCollection,
  IconDashboard,
  IconLogout,
  IconMail,
  IconRate,
  IconReport,
  IconSilver,
  IconUsers,
} from "./Icons.jsx";

const links = [
  { to: "/sub-admin", label: "Dashboard", end: true, Icon: IconDashboard },
  { to: "/sub-admin/employees", label: "Employee Report", end: false, Icon: IconUsers },
  {
    to: "/sub-admin/collection-report",
    label: "Collection Report",
    end: false,
    Icon: IconCollection,
  },
  { to: "/sub-admin/silver-rate", label: "Silver Rate Report", end: false, Icon: IconRate },
  { to: "/sub-admin/payouts", label: "Payout Report", end: false, Icon: IconSilver },
  { to: "/sub-admin/reports", label: "Reports", end: false, Icon: IconReport },
  // The two screens here that do something rather than show something, so
  // they sit at the bottom, apart from the reports above them.
  { to: "/sub-admin/enquiries", label: "Enquiries", end: false, Icon: IconMail },
  { to: "/sub-admin/settlements", label: "Cash Settlements", end: false, Icon: IconCash },
];

export default function SubAdminSidebar({ open, onClose }) {
  const dispatch = useDispatch();
  const subAdmin = useSelector(selectAdmin);

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
        <SidebarBrand panel="Sub-Admin Panel" onClose={onClose} />

        {/* Says what this account can do, right where the navigation starts. */}
        <div className="mx-3 mt-4 flex items-start gap-2.5 rounded-lg border border-silver-200 bg-silver-50 px-3 py-2.5">
          <IconReport className="mt-0.5 h-4 w-4 shrink-0 text-silver-500" />
          <div className="leading-tight">
            <div className="text-xs font-semibold text-silver-800">Reports, cash & enquiries</div>
            <div className="mt-0.5 text-[11px] text-silver-500">
              Download any report, accept employee cash, answer enquiries
            </div>
          </div>
        </div>

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
            {subAdmin?.profile_image ? (
              <img
                src={fileUrl(subAdmin.profile_image, "admin")}
                alt=""
                className="w-9 h-9 rounded-full object-cover border border-silver-200"
              />
            ) : (
              <span className="grid place-items-center w-9 h-9 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                {initialsOf(subAdmin?.name)}
              </span>
            )}
            <div className="min-w-0 leading-tight">
              <div className="text-sm font-medium text-silver-900 truncate">
                {subAdmin?.name || "Sub-Admin"}
              </div>
              <div className="text-[11px] text-silver-500 truncate">{subAdmin?.email}</div>
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
