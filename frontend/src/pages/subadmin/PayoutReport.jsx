// Sub-admin's Payout Report - /sub-admin/payouts
//
// The same payout history the main admin reads on /dashboard/payouts, with the
// same filters, the same totals and the same CSV/PDF download. It is the same
// component (PayoutHistory) in `readOnly` mode: approving a payout is the main
// admin's decision, so that column simply isn't there.
//
// The employee dropdown is filled from /api/reports/employees rather than the
// admin flow's /api/payouts/employees. Both return the same roster; only the
// reports one is open to a sub-admin, and it is the list every other report on
// this panel already filters by - so "Ravi" means the same employee here as it
// does on the Reports page.

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";

import PayoutHistory from "../../components/PayoutHistory.jsx";
import { fetchEmployeeReport } from "../../store/reportsSlice.js";
import { IconEye } from "../../components/Icons.jsx";

export default function SubAdminPayoutReport() {
  const dispatch = useDispatch();
  const { employees } = useSelector((state) => state.reports);

  useEffect(() => {
    dispatch(fetchEmployeeReport({}));
  }, [dispatch]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">Payout Report</h1>
          <p className="mt-1 text-sm text-silver-500">
            Every silver payout the shop has made - coins handed over from the admin panel and
            cash sell-backs taken at the counter. Filter it, then download it as a CSV or PDF.
          </p>
        </div>

        <span className="badge-neutral">
          <IconEye className="w-3.5 h-3.5" />
          View and download
        </span>
      </div>

      <PayoutHistory employees={employees} readOnly />
    </div>
  );
}
