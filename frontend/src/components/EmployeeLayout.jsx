// Shell for every employee page, built to the same plan as the admin shell:
// a fixed sidebar on the left that never scrolls, and a top bar + scrollable
// page content on the right.

import { useEffect, useRef, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { useLocation } from "react-router-dom";
import EmployeeSidebar from "./EmployeeSidebar.jsx";
import SilverRatePill from "./SilverRatePill.jsx";
import { documentUrl } from "./DocumentUpload.jsx";
import { fetchEmployeeProfile, selectEmployee } from "../store/employeeAuthSlice.js";
import { initialsOf } from "../utils/format.js";
import { IconBell, IconMenu } from "./Icons.jsx";

function useClock() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  return now;
}

export default function EmployeeLayout({ children }) {
  const dispatch = useDispatch();
  const location = useLocation();
  const employee = useSelector(selectEmployee);
  const now = useClock();

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const notificationsRef = useRef(null);

  useEffect(() => {
    dispatch(fetchEmployeeProfile());
  }, [dispatch]);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    function handleClickOutside(event) {
      if (notificationsRef.current && !notificationsRef.current.contains(event.target)) {
        setShowNotifications(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

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
      <EmployeeSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

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

            {/* No "Set it" link - an employee cannot publish a rate. */}
            <SilverRatePill />
          </div>

          <div className="flex items-center gap-2 sm:gap-4">
            <div className="hidden md:block text-right leading-tight">
              <div className="text-sm font-medium text-silver-900">{dateLabel}</div>
              <div className="text-xs text-silver-500 tabular-nums">{timeLabel}</div>
            </div>

            <div className="relative" ref={notificationsRef}>
              <button
                onClick={() => setShowNotifications((prev) => !prev)}
                className="relative p-2 rounded-lg text-silver-500 hover:bg-silver-100 hover:text-silver-700 transition-colors"
                aria-label="Notifications"
              >
                <IconBell />
              </button>

              {showNotifications && (
                <div className="absolute right-0 mt-2 w-72 card shadow-lift py-2 z-20 animate-fade-in">
                  <div className="px-4 py-2 text-sm font-semibold text-silver-900 border-b border-silver-200">
                    Notifications
                  </div>
                  <div className="px-4 py-8 text-sm text-silver-500 text-center">
                    You're all caught up
                  </div>
                </div>
              )}
            </div>

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
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
