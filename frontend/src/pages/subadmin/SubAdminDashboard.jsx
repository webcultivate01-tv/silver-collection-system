// Landing page after a sub-admin logs in.
//
// Its own screen, not the admin dashboard with the buttons taken out: monitoring
// figures at the top, the reports they can pull underneath, and a download
// action on each.
//
// Cash waiting to be accepted is the one thing on here that needs doing rather
// than reading, so it gets a banner above everything else instead of a stat
// tile among the others - an employee standing at the counter with the day's
// takings shouldn't have to be noticed among four figures.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectAdmin } from "../../store/authSlice.js";
import {
  fetchEmployeeReport,
  fetchReportSummary,
  fetchSilverRateReport,
} from "../../store/reportsSlice.js";
import { fetchSettlements } from "../../store/settlementsSlice.js";
import { buildEmployeeReport, buildSilverRateReport } from "../../utils/reportBuilders.js";
import ReportDownloadButtons from "../../components/ReportDownloadButtons.jsx";
import { formatDate, formatDateTime, formatRupees } from "../../utils/format.js";
import { IconCash, IconRate, IconReport, IconUsers } from "../../components/Icons.jsx";

function StatCard({ label, value, hint, tone = "text-silver-900", icon, iconTone }) {
  return (
    <div className="card p-5 flex items-start gap-4">
      <span className={`grid place-items-center w-11 h-11 shrink-0 rounded-lg ${iconTone}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm text-silver-500">{label}</div>
        <div className={`mt-0.5 text-xl font-bold truncate tabular-nums ${tone}`}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-silver-500">{hint}</div>}
      </div>
    </div>
  );
}

// One card per report: what it covers, how fresh it is, view + download.
function ReportCard({ title, description, rowLabel, rowCount, loading, viewPath, report }) {
  return (
    <div className="card flex flex-col">
      <div className="card-header">
        <div className="flex items-center gap-3">
          <span className="grid place-items-center w-9 h-9 rounded-lg bg-brand-50 text-brand-600">
            <IconReport className="w-5 h-5" />
          </span>
          <h2 className="card-title">{title}</h2>
        </div>
        <Link to={viewPath} className="text-sm font-medium text-brand-600 hover:underline">
          View
        </Link>
      </div>

      <div className="card-body flex-1 space-y-4">
        <p className="text-sm text-silver-500">{description}</p>

        <div className="rounded-lg bg-silver-50 border border-silver-200 px-4 py-3">
          <div className="text-xs text-silver-500">{rowLabel}</div>
          <div className="mt-0.5 text-lg font-bold tabular-nums text-silver-900">
            {loading ? "…" : rowCount}
          </div>
        </div>
      </div>

      <div className="border-t border-silver-200 px-6 py-4">
        <ReportDownloadButtons report={report} size="sm" />
      </div>
    </div>
  );
}

// Under each rate: how far it moved, or the day it was published on.
function rateHint(rate, movement) {
  if (!rate) return "No rate published yet";
  if (!movement) return `Published ${formatDate(rate.rateDate)}`;

  return `${movement > 0 ? "▲" : "▼"} ₹${formatRupees(Math.abs(movement))} vs previous`;
}

export default function SubAdminDashboard() {
  const dispatch = useDispatch();
  const subAdmin = useSelector(selectAdmin);
  const {
    summary,
    summaryLoading,
    employees,
    employeesLoading,
    rates,
    ratesLoading,
    error,
  } = useSelector((state) => state.reports);
  const { all: settlements } = useSelector((state) => state.settlements);

  // The dashboard pre-loads both reports so its download buttons are ready
  // without a trip through the report pages first, and the pending handovers
  // so the banner below is right the moment the page paints.
  useEffect(() => {
    dispatch(fetchReportSummary());
    dispatch(fetchEmployeeReport({}));
    dispatch(fetchSilverRateReport({ limit: 100 }));
    dispatch(fetchSettlements({ status: "pending" }));
  }, [dispatch]);

  const counts = summary?.employees || { total: 0, active: 0, blocked: 0 };
  const rate = summary?.rate || null;
  const change = summary?.change ?? null;

  // The list was fetched with status=pending, but filtering again costs
  // nothing and means a stale list from another screen can't inflate this.
  const pending = settlements.filter((settlement) => settlement.status === "pending");
  const pendingTotal = pending.reduce(
    (sum, settlement) => sum + Number(settlement.totalAmount),
    0
  );

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">
            Welcome{subAdmin ? `, ${subAdmin.name.split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-silver-500">
            Your reporting overview for the silver collection system.
          </p>
        </div>

        <span className="badge-neutral">
          <IconReport className="w-3.5 h-3.5" />
          Reports and employee cash handovers
        </span>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Money an employee is waiting to hand over. Only shown when there is
          some - an empty version of this would be a banner saying nothing. */}
      {pending.length > 0 && (
        <Link
          to="/sub-admin/settlements"
          className="card block overflow-hidden transition-shadow hover:shadow-lg"
        >
          <div className="bg-gradient-to-r from-silver-800 to-silver-900 px-6 py-5 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <IconCash className="h-4 w-4" />
              Cash waiting to be accepted
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums">
              ₹{formatRupees(pendingTotal)}
            </div>
            <div className="mt-1 text-xs text-white/60">
              Across {pending.length} handover{pending.length === 1 ? "" : "s"} — count the
              cash, then accept it here.
            </div>
          </div>
        </Link>
      )}

      {/* Monitoring figures */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Buying rate (per gm)"
          value={rate ? `₹${formatRupees(rate.buyRatePerGram)}` : "Not set"}
          hint={rateHint(rate, change?.buy)}
          tone={rate ? "text-silver-900" : "text-silver-400"}
          icon={<IconRate className="w-5 h-5" />}
          iconTone="bg-silver-100 text-silver-600"
        />
        <StatCard
          label="Selling rate (per gm)"
          value={rate ? `₹${formatRupees(rate.sellRatePerGram)}` : "Not set"}
          hint={rateHint(rate, change?.sell)}
          tone={rate ? "text-silver-900" : "text-silver-400"}
          icon={<IconRate className="w-5 h-5" />}
          iconTone="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Total employees"
          value={summaryLoading ? "…" : counts.total}
          hint={`${counts.active} active`}
          icon={<IconUsers className="w-5 h-5" />}
          iconTone="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Blocked employees"
          value={summaryLoading ? "…" : counts.blocked}
          hint={counts.blocked === 0 ? "Everyone has access" : "Access temporarily suspended"}
          tone={counts.blocked > 0 ? "text-red-600" : "text-silver-900"}
          icon={<IconUsers className="w-5 h-5" />}
          iconTone={counts.blocked > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}
        />
      </div>

      {/* Reports */}
      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-silver-500">
          Available Reports
        </h2>

        <div className="mt-3 grid gap-6 lg:grid-cols-2">
          <ReportCard
            title="Employee Report"
            description="Every registered employee with their contact details, account status and registration date."
            rowLabel="Records available"
            rowCount={employees.length}
            loading={employeesLoading}
            viewPath="/sub-admin/employees"
            report={buildEmployeeReport(employees, {})}
          />

          <ReportCard
            title="Silver Rate Report"
            description="The published daily silver rate per gram, per 10 grams and per kilogram."
            rowLabel="Days recorded"
            rowCount={rates.length}
            loading={ratesLoading}
            viewPath="/sub-admin/silver-rate"
            report={buildSilverRateReport(rates, {})}
          />
        </div>
      </div>

      {summary?.generatedAt && (
        <p className="text-xs text-silver-400">
          Data loaded {formatDateTime(summary.generatedAt)}
        </p>
      )}
    </div>
  );
}
