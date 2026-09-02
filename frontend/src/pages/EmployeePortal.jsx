// Landing page after employee login. Laid out like the admin dashboard:
// today's rate and account facts as stat cards, then the employee's own
// details beside a quick-actions panel.

import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { selectEmployee } from "../store/employeeAuthSlice.js";
import { fetchMyCollectionTotals } from "../store/collectionsSlice.js";
import { fetchPendingSummary } from "../store/settlementsSlice.js";
import { fetchTodayRate } from "../store/silverRateSlice.js";
import { formatDate, formatRupees } from "../utils/format.js";
import {
  IconCash,
  IconCollection,
  IconIdCard,
  IconKey,
  IconRate,
  IconSilver,
  IconUser,
} from "../components/Icons.jsx";

function StatCard({ label, value, hint, tone = "text-silver-900", icon, iconTone, to }) {
  const Wrapper = to ? Link : "div";

  return (
    <Wrapper
      {...(to ? { to } : {})}
      className={`card p-5 flex items-start gap-4${
        to ? " transition-colors hover:border-brand-300 hover:shadow-card" : ""
      }`}
    >
      <span className={`grid place-items-center w-11 h-11 shrink-0 rounded-lg ${iconTone}`}>
        {icon}
      </span>
      <div className="min-w-0">
        <div className="text-sm text-silver-500">{label}</div>
        <div className={`mt-0.5 text-xl font-bold truncate tabular-nums ${tone}`}>{value}</div>
        {hint && <div className="mt-0.5 text-xs text-silver-500">{hint}</div>}
      </div>
    </Wrapper>
  );
}

function DetailRow({ label, value }) {
  return (
    <div className="py-3.5 sm:grid sm:grid-cols-3 sm:gap-4">
      <dt className="text-sm text-silver-500">{label}</dt>
      <dd className="mt-0.5 sm:mt-0 sm:col-span-2 text-sm font-medium text-silver-900 break-words">
        {value || "—"}
      </dd>
    </div>
  );
}

// Under each rate: how far it moved today, or which day it is from.
function rateHint(rate, isToday, movement) {
  if (!rate) return "Your admin hasn't published a rate yet";
  if (!isToday) return `From ${formatDate(rate.rateDate)}`;
  if (!movement) return "Set today";

  return `${movement > 0 ? "▲" : "▼"} ₹${formatRupees(Math.abs(movement))} vs previous`;
}

// Under the collected total: how many payments make it up, and how much of
// it landed this month. Before the figures arrive it stays quiet rather than
// claiming a zero nobody has counted yet.
function collectedHint(myTotals) {
  if (!myTotals) return "Adding up your collections...";

  const { collections } = myTotals.summary;
  if (!collections) return "Nothing collected at your counter yet";

  const month = myTotals.thisMonth.label.split(" ")[0];
  return `${collections} collection${collections === 1 ? "" : "s"} · ₹${formatRupees(
    myTotals.thisMonth.totalAmount
  )} in ${month}`;
}

export default function EmployeePortal() {
  const dispatch = useDispatch();
  const employee = useSelector(selectEmployee);
  const { rate, change, isToday } = useSelector((state) => state.silverRate);
  const { pendingSummary } = useSelector((state) => state.settlements);
  const { myTotals } = useSelector((state) => state.collections);

  // The profile itself is loaded once by EmployeeLayout.
  useEffect(() => {
    dispatch(fetchTodayRate());
    dispatch(fetchPendingSummary());
    dispatch(fetchMyCollectionTotals());
  }, [dispatch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">
          Welcome back{employee ? `, ${employee.firstName || employee.fullName.split(" ")[0]}` : ""}
        </h1>
        <p className="mt-1 text-sm text-silver-500">
          Here's today's rate and the details we have on file for you.
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
          label="Employee ID"
          value={employee?.employeeCode || "—"}
          hint={`Registered ${formatDate(employee?.registeredOn)}`}
          icon={<IconIdCard className="w-5 h-5" />}
          iconTone="bg-brand-50 text-brand-600"
        />
        <StatCard
          label="Total collected"
          value={`₹${formatRupees(myTotals?.summary.totalAmount ?? 0)}`}
          hint={collectedHint(myTotals)}
          to="/employee/collections"
          icon={<IconCollection className="w-5 h-5" />}
          iconTone="bg-emerald-50 text-emerald-600"
        />
        <StatCard
          label="Cash to hand over"
          value={`₹${formatRupees(pendingSummary.totalAmount)}`}
          hint={
            pendingSummary.count === 0
              ? "You're all handed over"
              : `${pendingSummary.count} purchase${pendingSummary.count === 1 ? "" : "s"} not yet with the admin`
          }
          tone={pendingSummary.count > 0 ? "text-amber-600" : "text-silver-900"}
          icon={<IconCash className="w-5 h-5" />}
          iconTone={pendingSummary.count > 0 ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600"}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Details */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <h2 className="card-title">My Details</h2>
          </div>
          <div className="px-6 divide-y divide-silver-200">
            <DetailRow label="Employee ID" value={employee?.employeeCode} />
            <DetailRow label="First Name" value={employee?.firstName} />
            <DetailRow label="Last Name" value={employee?.lastName} />
            <DetailRow label="Email" value={employee?.email} />
            <DetailRow label="Mobile Number" value={employee?.mobile} />
            <DetailRow label="Date of Birth" value={formatDate(employee?.dateOfBirth)} />
            <DetailRow label="Age" value={employee?.age ? `${employee.age} years` : ""} />
            <DetailRow label="Address" value={employee?.address} />
            <DetailRow label="Registered On" value={formatDate(employee?.registeredOn)} />
          </div>
          <div className="px-6 py-4 border-t border-silver-200 text-xs text-silver-500">
            Something out of date? Ask your admin to update it.
          </div>
        </div>

        {/* Security */}
        <div className="card h-fit">
          <div className="card-header">
            <h2 className="card-title">Quick Actions</h2>
          </div>
          <div className="card-body space-y-3">
            <p className="text-sm text-silver-600">
              Take a payment at the counter, or update your own photo and password from your
              profile.
            </p>
            <Link to="/employee/purchases" className="btn-primary w-full">
              <IconSilver className="w-4 h-4" />
              Record a Purchase
            </Link>
            <Link to="/employee/settlements" className="btn-secondary w-full">
              <IconCash className="w-4 h-4" />
              Hand Over Cash
            </Link>
            <Link to="/employee/profile" className="btn-secondary w-full">
              <IconUser className="w-4 h-4" />
              My Profile
            </Link>
            <Link to="/employee/profile" className="btn-secondary w-full">
              <IconKey className="w-4 h-4" />
              Change Password
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
