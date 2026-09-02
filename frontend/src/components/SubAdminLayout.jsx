// Shell for every sub-admin page: their own sidebar on the left, a slim bar on
// top and the page content below.
//
// Two things it does beyond looking like the admin shell:
//   * re-checks the account on every navigation, so a sub-admin who is
//     deactivated while signed in is signed out at their next click
//   * shows the "you can't open that page" notice after ProtectedRoute has
//     bounced them off an admin-only URL

import { useEffect, useState } from "react";
import { useDispatch } from "react-redux";
import { useLocation, useNavigate } from "react-router-dom";
import SubAdminSidebar from "./SubAdminSidebar.jsx";
import SilverRatePill from "./SilverRatePill.jsx";
import { fetchAdminProfile } from "../store/authSlice.js";
import { IconClose, IconMenu, IconShield } from "./Icons.jsx";

function useClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

export default function SubAdminLayout({ children }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const navigate = useNavigate();
  const now = useClock();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [deniedFrom, setDeniedFrom] = useState(null);

  // Also the deactivation check: a refused profile call ends the session.
  useEffect(() => {
    dispatch(fetchAdminProfile());
  }, [dispatch, location.pathname]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  // Read the redirect reason once, then drop it from history so a refresh
  // doesn't show the same banner again.
  useEffect(() => {
    if (location.state?.deniedFrom) {
      setDeniedFrom(location.state.deniedFrom);
      navigate(location.pathname, { replace: true, state: null });
    }
  }, [location.state, location.pathname, navigate]);

  const dateLabel = now.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });
  const timeLabel = now.toLocaleTimeString("en-IN", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  return (
    <div className="h-screen bg-silver-100">
      <SubAdminSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col h-screen lg:ml-64">
        <header className="h-16 shrink-0 bg-white/90 backdrop-blur border-b border-silver-200 flex items-center justify-between gap-4 px-4 sm:px-6">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 -ml-2 rounded-lg text-silver-500 hover:bg-silver-100"
              aria-label="Open menu"
            >
              <IconMenu />
            </button>

            {/* No "Set it" link - a sub-admin cannot publish a rate. */}
            <SilverRatePill />
          </div>

          <div className="flex items-center gap-3 sm:gap-4">
            <span className="badge-neutral hidden sm:inline-flex">
              <IconShield className="w-3.5 h-3.5" />
              Sub-Admin
            </span>

            <div className="hidden md:block text-right leading-tight">
              <div className="text-sm font-medium text-silver-900">{dateLabel}</div>
              <div className="text-xs text-silver-500 tabular-nums">{timeLabel}</div>
            </div>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {deniedFrom && (
            <div className="alert-error mb-6 flex items-start justify-between gap-4">
              <span>
                <strong className="font-semibold">Access denied.</strong>{" "}
                <span className="font-mono text-xs">{deniedFrom}</span> is an admin-only page.
                You've been brought back to your dashboard.
              </span>
              <button
                onClick={() => setDeniedFrom(null)}
                className="shrink-0 text-red-500 hover:text-red-700"
                aria-label="Dismiss"
              >
                <IconClose className="w-4 h-4" />
              </button>
            </div>
          )}

          {children}
        </main>
      </div>
    </div>
  );
}
