// Every payout the shop has ever made, and the two quite different things that
// word covers:
//
//   Silver coin  the admin handed the customer a coin from the panel. No money
//                moved at all; the rupee figure on the row is what the coin was
//                WORTH on the day. Complete the moment it is recorded, because
//                the admin recording it is the admin who handed it over.
//   Cash         an employee bought silver back at the counter. The customer's
//                silver went immediately; the money waits here for the admin to
//                approve it.
//
// Both are the same event to the ledger - silver leaving a customer's account -
// so they share one table rather than sitting on two screens that would each
// show half the day. But they are not the same thing to the customer, so every
// row says which it was, and the totals keep the coin weight separate from the
// cash still owed.
//
// The figures above the table come from the server filtered by exactly the
// filters below it, so the totals always describe the rows on screen. That is
// why they are not summed here from `sales`: the list is capped at 200 rows,
// and a total summed from a truncated list would quietly understate the money.
//
// `readOnly` is the sub-admin's copy of this screen. Every filter, every
// figure and the same CSV/PDF download - approving a payout is the one thing
// taken out, because paying money out is the main admin's decision. It is a
// prop rather than a second component so the report a sub-admin downloads is
// built by the same code as the admin's and cannot come to say something
// different. The server refuses a sub-admin's POST to /api/sales/:id/approve
// regardless; this is what stops the button being offered in the first place.

import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import {
  approveSale,
  clearApprovedMessage,
  clearSaleError,
  fetchAllSales,
} from "../store/salesSlice.js";
import ReportDownloadButtons from "./ReportDownloadButtons.jsx";
import { PayoutStatusBadge } from "./PaymentStatusBadge.jsx";
import { formatDate, formatDateTime, formatRupees } from "../utils/format.js";
import { IconCash, IconCheck, IconClose, IconSearch } from "./Icons.jsx";

const STATUSES = [
  { value: "all", label: "All" },
  { value: "paid", label: "Paid" },
  { value: "pending", label: "Awaiting payout" },
];

const SOURCES = [
  { value: "all", label: "Everywhere" },
  { value: "admin", label: "From the admin panel" },
  { value: "counter", label: "From the counter" },
];

// What the customer actually walked away with. Separate from SOURCES on
// purpose: "where was it recorded" and "what did they receive" are two
// questions, and today's answers lining up is not a reason to conflate them.
const KINDS = [
  { value: "all", label: "Coins and cash" },
  { value: "coin", label: "Silver coins" },
  { value: "cash", label: "Cash" },
];

const COLUMNS = [
  { key: "date", label: "Date" },
  { key: "customer", label: "Customer" },
  { key: "mobile", label: "Mobile" },
  { key: "employee", label: "Employee" },
  { key: "silver", label: "Silver", align: "right" },
  { key: "rate", label: "Rate (per gm)", align: "right" },
  { key: "amount", label: "Value (Rs.)", align: "right" },
  { key: "received", label: "Received" },
  { key: "source", label: "Recorded at" },
  { key: "handledBy", label: "Handled by" },
  { key: "status", label: "Status" },
];

function Total({ label, value, hint, tone = "text-silver-900" }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-silver-500">
        {label}
      </div>
      <div className={`mt-0.5 text-xl font-bold tabular-nums ${tone}`}>{value}</div>
      {hint && <div className="text-xs text-silver-500">{hint}</div>}
    </div>
  );
}

export default function PayoutHistory({ employees = [], readOnly = false }) {
  const dispatch = useDispatch();
  const { all, allTotals, allLoading, approvingId, approvedMessage, error } = useSelector(
    (state) => state.sales
  );

  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [kind, setKind] = useState("all");
  const [employeeId, setEmployeeId] = useState("");
  const [search, setSearch] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = useMemo(
    () => ({ status, source, kind, employeeId, search, from, to }),
    [status, source, kind, employeeId, search, from, to]
  );

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchAllSales(filters)), 300);
    return () => clearTimeout(timer);
  }, [dispatch, filters]);

  useEffect(() => {
    return () => {
      dispatch(clearSaleError());
      dispatch(clearApprovedMessage());
    };
  }, [dispatch]);

  // The download is built from the rows on screen, so the file and the table
  // can never say different things.
  const report = useMemo(
    () => ({
      fileName: "silver_payout_history",
      title: "Silver Payout History",
      columns: COLUMNS,
      meta: [
        ["Status", STATUSES.find((option) => option.value === status)?.label || "All"],
        ["Recorded at", SOURCES.find((option) => option.value === source)?.label || "Everywhere"],
        ["Received", KINDS.find((option) => option.value === kind)?.label || "Coins and cash"],
        [
          "Employee",
          employees.find((employee) => String(employee.id) === employeeId)?.fullName ||
            "All employees",
        ],
        ["Date range", from || to ? `${from || "start"} to ${to || "today"}` : "All dates"],
        ["Rows", String(all.length)],
      ],
      rows: all.map((payout) => ({
        date: formatDate(payout.soldOn),
        customer: payout.customerName,
        mobile: payout.customerMobile ? `+91 ${payout.customerMobile}` : "—",
        employee: payout.ownerEmployeeName || "—",
        silver: payout.gramsLabel,
        rate: formatRupees(payout.ratePerGram),
        amount: formatRupees(payout.amountPayable),
        received: payout.payoutKindLabel,
        source: payout.source === "admin" ? "Admin panel" : "Counter",
        handledBy: payout.handledBy,
        status: payout.payoutStatus === "paid" ? "Paid" : "Awaiting payout",
      })),
    }),
    [all, status, source, kind, employeeId, employees, from, to]
  );

  const filtered =
    status !== "all" || source !== "all" || kind !== "all" || employeeId || search || from || to;

  return (
    <div className="space-y-6">
      {error && <div className="alert-error">{error}</div>}
      {approvedMessage && <div className="alert-success">{approvedMessage}</div>}

      {/* Money still to go out, when there is any. Kept at the top because it
          is the only figure on this screen that needs acting on. */}
      {allTotals && allTotals.pendingCount > 0 && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-silver-800 to-silver-900 px-6 py-5 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <IconCash className="h-4 w-4" />
              {readOnly ? "Awaiting the admin's approval" : "Awaiting your approval"}
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums">
              ₹{formatRupees(allTotals.pendingPayable)}
            </div>
            <div className="mt-1 text-xs text-white/60">
              Across {allTotals.pendingCount} counter sale
              {allTotals.pendingCount === 1 ? "" : "s"} — the customers' silver has already gone.
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <div className="card-header flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          <h2 className="card-title">Filters</h2>
          <div className="lg:ml-auto">
            <ReportDownloadButtons report={report} size="sm" />
          </div>
        </div>

        <div className="card-body grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <div>
            <label className="label">Status</label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="input"
            >
              {STATUSES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Customer received</label>
            <select value={kind} onChange={(e) => setKind(e.target.value)} className="input">
              {KINDS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Recorded at</label>
            <select
              value={source}
              onChange={(e) => setSource(e.target.value)}
              className="input"
            >
              {SOURCES.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">Employee</label>
            {/* The employee the CUSTOMER belongs to - an admin payout has
                nobody at the counter, so filtering on who served it would hide
                exactly the rows this screen is here to show. */}
            <select
              value={employeeId}
              onChange={(e) => setEmployeeId(e.target.value)}
              className="input"
            >
              <option value="">All employees</option>
              {employees.map((employee) => (
                <option key={employee.id} value={employee.id}>
                  {employee.fullName}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="label">From</label>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              max={to || undefined}
              className="input"
            />
          </div>

          <div>
            <label className="label">To</label>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              min={from || undefined}
              className="input"
            />
          </div>

          <div>
            <label className="label">Search</label>
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9"
                placeholder="Customer name, email or mobile"
              />
              {search && (
                <button
                  onClick={() => setSearch("")}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-silver-400 hover:text-silver-600"
                  aria-label="Clear search"
                  type="button"
                >
                  <IconClose className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {allTotals && (
        <div className="flex flex-wrap gap-x-12 gap-y-4 rounded-xl border border-silver-200 bg-white px-6 py-4 shadow-card">
          <Total
            label="Silver out of accounts"
            value={allTotals.gramsLabel}
            hint={`Across ${allTotals.sales} payout${allTotals.sales === 1 ? "" : "s"}`}
          />
          <Total
            label="Given as coins"
            value={allTotals.coinGramsLabel}
            hint={`${allTotals.coinCount} coin${
              allTotals.coinCount === 1 ? "" : "s"
            } worth ₹${formatRupees(allTotals.coinValue)} — no cash paid`}
          />
          <Total
            label="Cash paid out"
            value={`₹${formatRupees(allTotals.cashPaid)}`}
            hint="Counter sell-backs the admin has approved"
          />
          <Total
            label="Cash still to pay"
            value={`₹${formatRupees(allTotals.pendingPayable)}`}
            hint={`${allTotals.pendingCount} awaiting approval`}
            tone={allTotals.pendingPayable > 0 ? "text-amber-600" : "text-silver-400"}
          />
          <Total label="Customers" value={String(allTotals.customers)} />
        </div>
      )}

      <div className="card overflow-hidden">
        {allLoading && all.length === 0 ? (
          <div className="py-12 text-center text-sm text-silver-500">Loading payouts...</div>
        ) : all.length === 0 ? (
          <div className="py-12 text-center text-sm text-silver-500">
            {filtered
              ? "No payouts match these filters."
              : "No silver has been paid out yet. Payouts appear here as soon as one is made."}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1000px]">
              <thead className="border-b border-silver-200 bg-silver-50">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head">Customer</th>
                  <th className="table-head">Employee</th>
                  <th className="table-head text-right">Silver</th>
                  <th className="table-head text-right">Rate (per gm)</th>
                  <th className="table-head text-right">Value (₹)</th>
                  <th className="table-head">Received</th>
                  <th className="table-head">Status</th>
                  {!readOnly && <th className="table-head text-right">Action</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {all.map((payout) => (
                  <tr key={payout.id} className="transition-colors hover:bg-silver-50/70">
                    <td className="table-cell whitespace-nowrap font-medium text-silver-900">
                      {formatDate(payout.soldOn)}
                    </td>
                    <td className="table-cell">
                      <div className="font-medium text-silver-900">{payout.customerName}</div>
                      <div className="text-xs text-silver-500">
                        {payout.customerMobile ? `+91 ${payout.customerMobile}` : payout.customerEmail}
                      </div>
                    </td>
                    <td className="table-cell text-silver-500">
                      {payout.ownerEmployeeName || "—"}
                    </td>
                    <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                      {payout.gramsLabel}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(payout.ratePerGram)}
                    </td>
                    <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                      {formatRupees(payout.amountPayable)}
                    </td>
                    <td className="table-cell">
                      {payout.isCoin ? (
                        <span className="badge bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                          Silver coin
                        </span>
                      ) : (
                        <span className="badge-neutral">Cash</span>
                      )}
                      <div className="mt-0.5 text-xs text-silver-500">
                        {payout.source === "admin" ? "Admin panel" : "Counter"} ·{" "}
                        {payout.handledBy}
                      </div>
                    </td>
                    <td className="table-cell">
                      <PayoutStatusBadge status={payout.payoutStatus} />
                      {payout.payoutStatus === "paid" && payout.approvedAt && (
                        <div className="mt-0.5 text-xs text-silver-500">
                          {payout.approvedByName ? `${payout.approvedByName} · ` : ""}
                          {formatDateTime(payout.approvedAt)}
                        </div>
                      )}
                    </td>
                    {!readOnly && (
                      <td className="table-cell text-right">
                        {payout.payoutStatus === "pending" ? (
                          <button
                            onClick={() => dispatch(approveSale({ id: payout.id, filters }))}
                            disabled={approvingId === payout.id}
                            className="btn-primary py-1.5 text-sm"
                          >
                            <IconCheck className="h-4 w-4" />
                            {approvingId === payout.id ? "Approving..." : "Approve payout"}
                          </button>
                        ) : (
                          <span className="text-sm text-silver-400">—</span>
                        )}
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {all.length >= 200 && (
          <p className="border-t border-silver-200 px-6 py-3 text-xs text-silver-500">
            Showing the 200 most recent payouts. Narrow the date range to see older ones.
          </p>
        )}
      </div>
    </div>
  );
}
