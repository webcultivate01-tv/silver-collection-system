// Shell for every user-portal page, built to the same plan as the admin and
// employee shells: a fixed sidebar on the left that never scrolls, and a top
// bar + scrollable page content on the right.

import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import UserSidebar from "./UserSidebar.jsx";
import SilverRatePill from "./SilverRatePill.jsx";
import { IconMenu } from "./Icons.jsx";

export default function UserLayout({ children }) {
  const location = useLocation();
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setSidebarOpen(false);
  }, [location.pathname]);

  return (
    <div className="h-screen bg-silver-100">
      <UserSidebar open={sidebarOpen} onClose={() => setSidebarOpen(false)} />

      <div className="flex flex-col h-screen lg:ml-64">
        <header className="h-16 shrink-0 bg-white/90 backdrop-blur border-b border-silver-200 flex items-center gap-4 px-4 sm:px-6">
          <button
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden p-2 -ml-2 rounded-lg text-silver-500 hover:bg-silver-100"
            aria-label="Open menu"
          >
            <IconMenu />
          </button>

          <SilverRatePill />
        </header>

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
