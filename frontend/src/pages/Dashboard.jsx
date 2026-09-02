// Landing page after admin login: today's rate, staff counts and quick actions.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectAdmin } from "../store/authSlice.js";
import { fetchEmployees } from "../store/employeesSlice.js";
import { fetchSettlements } from "../store/settlementsSlice.js";
import { fetchTodayRate } from "../store/silverRateSlice.js";
import { fetchAllPurchases } from "../store/purchasesSlice.js";
import { fetchAllSales } from "../store/salesSlice.js";
import { formatDate, formatRupees, initialsOf } from "../utils/format.js";
import { documentUrl } from "../components/DocumentUpload.jsx";
import { IconCash, IconPlus, IconRate, IconSilver, IconUsers } from "../components/Icons.jsx";

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

// Under each rate: how far it moved today, or which day it is from.
function rateHint(rate, isToday, movement) {
  if (!rate) return "Publish today's rates";
  if (!isToday) return `From ${formatDate(rate.rateDate)}`;
  if (!movement) return "Set today";

  return `${movement > 0 ? "▲" : "▼"} ₹${formatRupees(Math.abs(movement))} vs previous`;
}

export default function Dashboard() {
  const dispatch = useDispatch();
  const admin = useSelector(selectAdmin);
  const { counts, list } = useSelector((state) => state.employees);
  const { rate, change, isToday } = useSelector((state) => state.silverRate);
  const { all: pendingSettlements } = useSelector((state) => state.settlements);
  const { allTotals: purchaseTotals } = useSelector((state) => state.purchases);
  const { allTotals: saleTotals } = useSelector((state) => state.sales);

  useEffect(() => {
    dispatch(fetchTodayRate());
    dispatch(fetchEmployees({}));
    dispatch(fetchSettlements({ status: "pending" }));
    dispatch(fetchAllPurchases({ limit: 1 }));
    dispatch(fetchAllSales({ limit: 1 }));
  }, [dispatch]);

  const recent = list.slice(0, 5);
  const pendingCashTotal = pendingSettlements.reduce(
    (sum, settlement) => sum + Number(settlement.totalAmount),
    0
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">
          Welcome back{admin ? `, ${admin.name.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-silver-500">
          Here's how your silver collection is looking today.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Buying rate (per gm)"
          value={rate ? `₹${formatRupees(rate.buyRatePerGram)}` : "Not set"}
          hint={rateHint(rate, isToday, change?.buy)}
          tone={rate ? "text-silver-900" : "text-silver-400"}
          icon={<IconRate className="w-5 h-5" />}
          iconTone="bg-silver-100 text-silver-600"
        />
        <StatCard
          label="Selling rate (per gm)"
          value={rate ? `₹${formatRupees(rate.sellRatePerGram)}` : "Not set"}
          hint={rateHint(rate, isToday, change?.sell)}
          tone={rate ? "text-silver-900" : "text-silver-400"}
          icon={<IconRate className="w-5 h-5" />}
          iconTone="bg-amber-50 text-amber-600"
        />
        <StatCard
          label="Total employees"
          value={counts.total}
          hint={`${counts.active} active`}
          icon={<IconUsers className="w-5 h-5" />}
          iconTone="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Blocked employees"
          value={counts.blocked}
          hint={counts.blocked === 0 ? "Everyone has access" : "Access temporarily suspended"}
          tone={counts.blocked > 0 ? "text-red-600" : "text-silver-900"}
          icon={<IconUsers className="w-5 h-5" />}
          iconTone={counts.blocked > 0 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"}
        />
        <StatCard
          label="Cash awaiting acceptance"
          value={`₹${formatRupees(pendingCashTotal)}`}
          hint={
            pendingSettlements.length === 0
              ? "Nothing handed over yet"
              : `${pendingSettlements.length} handover${pendingSettlements.length === 1 ? "" : "s"} to review`
          }
          tone={pendingSettlements.length > 0 ? "text-amber-600" : "text-silver-900"}
          icon={<IconCash className="w-5 h-5" />}
          iconTone={pendingSettlements.length > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}
        />
      </div>

      <div>
        <h2 className="text-sm font-semibold uppercase tracking-wider text-silver-500">
          Business Overview
        </h2>
        <div className="mt-3 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            label="Silver purchased"
            value={purchaseTotals ? purchaseTotals.gramsLabel : "—"}
            hint={
              purchaseTotals
                ? `${purchaseTotals.purchases} purchase${purchaseTotals.purchases === 1 ? "" : "s"} · ₹${formatRupees(purchaseTotals.totalPaid)} paid out`
                : "Loading…"
            }
            icon={<IconSilver className="w-5 h-5" />}
            iconTone="bg-silver-100 text-silver-600"
          />
          <StatCard
            label="Silver sold back"
            value={saleTotals ? saleTotals.gramsLabel : "—"}
            hint={
              saleTotals
                ? `${saleTotals.sales} sale${saleTotals.sales === 1 ? "" : "s"} · ₹${formatRupees(saleTotals.totalPayable)} payable`
                : "Loading…"
            }
            icon={<IconSilver className="w-5 h-5" />}
            iconTone="bg-brand-50 text-brand-600"
          />
          <StatCard
            label="Payouts pending"
            value={saleTotals ? saleTotals.pendingCount : "—"}
            hint={
              saleTotals
                ? saleTotals.pendingCount === 0
                  ? "Nothing owed to customers"
                  : `₹${formatRupees(saleTotals.pendingPayable)} to be paid out`
                : "Loading…"
            }
            tone={saleTotals?.pendingCount > 0 ? "text-amber-600" : "text-silver-900"}
            icon={<IconCash className="w-5 h-5" />}
            iconTone={saleTotals?.pendingCount > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}
          />
          <StatCard
            label="Customers served"
            value={purchaseTotals ? purchaseTotals.customers : "—"}
            hint="Have bought silver at least once"
            icon={<IconUsers className="w-5 h-5" />}
            iconTone="bg-brand-50 text-brand-600"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="card lg:col-span-2 overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Recently Registered</h2>
            <Link
              to="/dashboard/employees"
              className="text-sm font-medium text-brand-600 hover:underline"
            >
              View all
            </Link>
          </div>

          {recent.length === 0 ? (
            <div className="py-14 text-center">
              <p className="text-sm font-medium text-silver-900">No employees yet</p>
              <p className="mt-1 text-sm text-silver-500">
                Register your first team member to get started.
              </p>
              <Link to="/dashboard/employees/new" className="btn-primary mt-4">
                <IconPlus className="w-4 h-4" />
                Register Employee
              </Link>
            </div>
          ) : (
            <ul className="divide-y divide-silver-200">
              {recent.map((employee) => (
                <li key={employee.id}>
                  <Link
                    to={`/dashboard/employees/${employee.id}`}
                    className="flex items-center gap-3 px-6 py-4 hover:bg-silver-50/70 transition-colors"
                  >
                    {employee.profile_photo ? (
                      <img
                        src={documentUrl(employee.profile_photo)}
                        alt={employee.full_name}
                        className="w-9 h-9 shrink-0 rounded-full border border-silver-200 object-cover"
                      />
                    ) : (
                      <span className="grid place-items-center w-9 h-9 shrink-0 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                        {initialsOf(employee.full_name)}
                      </span>
                    )}
                    <div className="min-w-0 flex-1 leading-tight">
                      <div className="text-sm font-medium text-silver-900 truncate">
                        {employee.full_name}
                      </div>
                      <div className="text-xs text-silver-500 truncate">{employee.email}</div>
                    </div>
                    <span className="hidden sm:block text-xs text-silver-500">
                      {formatDate(employee.created_at)}
                    </span>
                    {employee.is_blocked && <span className="badge-danger">Blocked</span>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="card h-fit">
          <div className="card-header">
            <h2 className="card-title">Quick Actions</h2>
          </div>
          <div className="card-body space-y-3">
            <Link to="/dashboard/employees/new" className="btn-primary w-full">
              <IconPlus className="w-4 h-4" />
              Register Employee
            </Link>
            <Link to="/dashboard/silver-rate" className="btn-secondary w-full">
              <IconRate className="w-4 h-4" />
              {isToday ? "Update Today's Rates" : "Set Today's Rates"}
            </Link>
            <Link to="/dashboard/settlements" className="btn-secondary w-full">
              <IconCash className="w-4 h-4" />
              Review Cash Settlements
            </Link>
            <Link to="/dashboard/payouts" className="btn-secondary w-full">
              <IconCash className="w-4 h-4" />
              Review Payouts
            </Link>
            <Link to="/dashboard/employees" className="btn-secondary w-full">
              <IconUsers className="w-4 h-4" />
              Manage Employees
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
