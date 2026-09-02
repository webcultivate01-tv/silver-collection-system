// Giving a customer a silver coin, in the order the admin actually does it:
//
//   1. pick the employee        whose client it is
//   2. pick the user            from that employee's list
//   3. see what they hold       and weigh the coin they are being given
//   4. generate the report      had / rate / coin / remaining
//   5. confirm the handover     the only step that moves anything
//
// No money changes hands anywhere in this flow. The customer receives a
// physical silver coin of the weight the admin types, and that same weight
// comes off their holding. The rupee figure on screen is what the coin is
// WORTH at today's rate - shown so both sides know what was handed over, never
// as cash owed.
//
// The steps are deliberately separate screens rather than one long form. Every
// figure the admin acts on belongs to one customer, and a form that keeps its
// contents while the customer underneath it changes is exactly how the wrong
// person is handed a coin.
//
// Two rules run through the whole file:
//
//   * No coin is given without a report. The "Confirm handover" button does
//     not exist until a report has been generated, and it disappears again the
//     moment anything the report describes changes.
//
//   * The report is the authority, not this screen. The live figure under the
//     amount box while typing is an estimate to help the admin land on a
//     weight; it is labelled as one, and it is never what gets recorded. What
//     gets recorded is what the server put in the report.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";

import {
  clearPayoutReport,
  confirmPayout,
  fetchPayoutEmployees,
  fetchPayoutUserView,
  fetchPayoutUsers,
  generatePayoutReport,
  resetPayoutFlow,
  selectPayoutEmployee,
  selectPayoutUser,
} from "../store/payoutsSlice.js";

import ConfirmModal from "./ConfirmModal.jsx";
import PayoutReport from "./PayoutReport.jsx";
import { PayoutStatusBadge } from "./PaymentStatusBadge.jsx";
import { documentUrl } from "./DocumentUpload.jsx";
import { formatDate, formatRupees, initialsOf } from "../utils/format.js";
import { amountForGrams, formatGrams, roundGrams } from "../utils/silverMath.js";
import {
  IconAlert,
  IconArrowLeft,
  IconCash,
  IconCheck,
  IconReport,
  IconSearch,
  IconSilver,
  IconUsers,
} from "./Icons.jsx";

// Below a milligram there is no coin worth striking - the same floor the
// server applies, so this screen never offers a handover the server will
// refuse.
const MIN_GRAMS = 0.001;

const STEPS = [
  { key: 1, label: "Employee" },
  { key: 2, label: "User" },
  { key: 3, label: "Coin" },
  { key: 4, label: "Report" },
  { key: 5, label: "Handover" },
];

function Stepper({ current }) {
  return (
    <ol className="flex flex-wrap items-center gap-x-2 gap-y-2 text-xs font-medium">
      {STEPS.map((step, index) => {
        const done = step.key < current;
        const active = step.key === current;

        return (
          <li key={step.key} className="flex items-center gap-2">
            <span
              className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-semibold ${
                active
                  ? "bg-brand-600 text-white"
                  : done
                    ? "bg-emerald-100 text-emerald-700"
                    : "bg-silver-100 text-silver-400"
              }`}
            >
              {done ? <IconCheck className="h-3.5 w-3.5" /> : step.key}
            </span>
            <span className={active ? "text-silver-900" : "text-silver-400"}>{step.label}</span>
            {index < STEPS.length - 1 && <span className="text-silver-300">›</span>}
          </li>
        );
      })}
    </ol>
  );
}

function Avatar({ name, image, className = "h-10 w-10" }) {
  if (image) {
    return (
      <img
        src={documentUrl(image)}
        alt=""
        className={`${className} shrink-0 rounded-full border border-silver-200 object-cover`}
      />
    );
  }

  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700`}
    >
      {initialsOf(name)}
    </span>
  );
}

function BackLink({ children, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-1.5 text-sm text-silver-500 hover:text-silver-800"
    >
      <IconArrowLeft className="h-4 w-4" />
      {children}
    </button>
  );
}

function Figure({ label, value, hint }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-silver-500">
        {label}
      </div>
      <div className="mt-0.5 text-lg font-bold tabular-nums text-silver-900">{value}</div>
      {hint && <div className="text-xs text-silver-500">{hint}</div>}
    </div>
  );
}

// -------------------------------------------------------------------------
// Step 1 - the employee
// -------------------------------------------------------------------------
function StepEmployee({ employees, loading, onPick }) {
  const [search, setSearch] = useState("");

  const shown = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return employees;

    return employees.filter(
      (employee) =>
        employee.fullName.toLowerCase().includes(term) ||
        String(employee.employeeCode || "").toLowerCase().includes(term)
    );
  }, [employees, search]);

  return (
    <div className="card overflow-hidden">
      <div className="card-header flex-col items-stretch gap-3 sm:flex-row sm:items-center">
        <h2 className="card-title">
          <IconUsers className="mr-2 inline h-4 w-4" />
          Choose the employee
        </h2>
        <div className="relative sm:ml-auto sm:w-72">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="input pl-9"
            placeholder="Search by name or code"
          />
        </div>
      </div>

      {loading && employees.length === 0 ? (
        <div className="py-16 text-center text-sm text-silver-500">Loading employees...</div>
      ) : shown.length === 0 ? (
        <div className="py-16 text-center text-sm text-silver-500">
          {search ? `No employee matched “${search}”` : "No employees yet."}
        </div>
      ) : (
        <ul className="divide-y divide-silver-200">
          {shown.map((employee) => (
            <li key={employee.id}>
              <button
                type="button"
                onClick={() => onPick(employee)}
                className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-silver-50"
              >
                <Avatar name={employee.fullName} />

                <span className="min-w-0 flex-1 leading-tight">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-semibold text-silver-900">
                      {employee.fullName}
                    </span>
                    {employee.isBlocked && <span className="badge-danger">Blocked</span>}
                  </span>
                  <span className="block text-xs tabular-nums text-silver-500">
                    {employee.employeeCode || "—"} · {employee.users} user
                    {employee.users === 1 ? "" : "s"}
                  </span>
                </span>

                {/* What their whole client book is holding. An employee whose
                    clients hold nothing has no coin to give, and seeing
                    that here saves opening the list to find out. */}
                <span className="shrink-0 text-right">
                  <span className="block text-[11px] font-semibold uppercase tracking-wider text-silver-400">
                    Clients hold
                  </span>
                  <span
                    className={`block text-sm font-bold tabular-nums ${
                      employee.heldGrams >= MIN_GRAMS ? "text-silver-900" : "text-silver-400"
                    }`}
                  >
                    {employee.heldGramsLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// -------------------------------------------------------------------------
// Step 2 - the user
// -------------------------------------------------------------------------
function StepUser({ employee, users, totals, loading, search, onSearch, onPick, onBack }) {
  return (
    <div className="space-y-4">
      <BackLink onClick={onBack}>Employees</BackLink>

      <div className="card overflow-hidden">
        <div className="card-header flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="min-w-0">
            <h2 className="card-title">
              <IconUsers className="mr-2 inline h-4 w-4" />
              {employee ? `${employee.fullName}'s users` : "Users"}
            </h2>
            {totals && (
              <p className="mt-1 text-xs text-silver-500 tabular-nums">
                {totals.users} user{totals.users === 1 ? "" : "s"} · {totals.withSilver} holding
                silver · {totals.heldGramsLabel} between them
              </p>
            )}
          </div>

          <div className="relative sm:ml-auto sm:w-72">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => onSearch(e.target.value)}
              className="input pl-9"
              placeholder="Search by name, email or mobile"
            />
          </div>
        </div>

        {loading && users.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">Loading users...</div>
        ) : users.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">
            {search
              ? `No user matched “${search}”`
              : "This employee has not registered any users yet."}
          </div>
        ) : (
          <ul className="divide-y divide-silver-200">
            {users.map((user) => (
              <li key={user.id}>
                <button
                  type="button"
                  onClick={() => onPick(user)}
                  className="flex w-full items-center gap-4 px-6 py-4 text-left transition-colors hover:bg-silver-50"
                >
                  <Avatar name={user.name} image={user.profileImage} />

                  <span className="min-w-0 flex-1 leading-tight">
                    <span className="flex flex-wrap items-center gap-2">
                      <span className="truncate text-sm font-semibold text-silver-900">
                        {user.name}
                      </span>
                      {!user.isActive && <span className="badge-danger">Inactive</span>}
                    </span>
                    <span className="block truncate text-xs text-silver-500">
                      {user.email}
                      {user.mobile ? ` · +91 ${user.mobile}` : ""}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-[11px] font-semibold uppercase tracking-wider text-silver-400">
                      Holds
                    </span>
                    <span
                      className={`block text-sm font-bold tabular-nums ${
                        user.canPayout ? "text-silver-900" : "text-silver-400"
                      }`}
                    >
                      {user.holding.gramsLabel}
                    </span>
                    {!user.canPayout && (
                      <span className="block text-[11px] text-silver-400">
                        {user.isActive ? "No silver to give" : "Account deactivated"}
                      </span>
                    )}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

// -------------------------------------------------------------------------
// Steps 3-5 - the customer's silver, the report, and the handover
// -------------------------------------------------------------------------
function StepPayout({
  view,
  loading,
  report,
  reportLoading,
  reportError,
  paying,
  receipt,
  paidMessage,
  error,
  onBack,
  onGenerate,
  onAmountChanged,
  onConfirm,
  onDone,
}) {
  const [entry, setEntry] = useState("");
  const [confirming, setConfirming] = useState(false);

  const customer = view?.customer;
  const holding = view?.holding;
  const rate = view?.rate;
  const available = Number(holding?.totalGrams) || 0;

  // A finished handover closes the dialog and empties the box, ready for the
  // next one.
  useEffect(() => {
    if (receipt) {
      setConfirming(false);
      setEntry("");
    }
  }, [receipt]);

  // What the typed weight means: what the coin is worth at today's rate, and
  // what would be left afterwards. The same arithmetic the server runs
  // (utils/silverMath.js mirrors the backend file), but it is still only an
  // estimate - the report is what the handover is recorded from.
  const estimate = useMemo(() => {
    if (!rate?.ratePerGram || entry === "") return null;

    const grams = roundGrams(Number(entry));

    if (grams === null || !Number.isFinite(grams) || grams <= 0) return null;

    return {
      grams,
      value: amountForGrams(grams, rate.ratePerGram),
      remaining: roundGrams(available - grams),
    };
  }, [entry, rate, available]);

  const tooMuch = !!estimate && estimate.grams > available;

  function updateEntry(value) {
    setEntry(value);
    // What is on the form no longer matches the report, so the report - and
    // the Confirm button under it - go away until a new one is generated.
    onAmountChanged();
  }

  // "A coin for everything they hold". The exact holding, not the rounded
  // label on screen: the label reads "2.294 g" where the account really holds
  // 2.293578 g, and a coin struck to what the label says would be heavier than
  // the silver backing it.
  function coinForEverything() {
    updateEntry(String(roundGrams(available)));
  }

  function handleGenerate(e) {
    e.preventDefault();
    if (!estimate || tooMuch) return;

    // Always grams. The admin is entering what a physical coin weighs, so
    // there is no other side of this to type.
    onGenerate({ grams: roundGrams(Number(entry)) });
  }

  if (loading && !view) {
    return (
      <div className="space-y-4">
        <div className="skeleton h-4 w-24" />
        <div className="skeleton h-32 w-full rounded-xl" />
        <div className="skeleton h-64 w-full rounded-xl" />
      </div>
    );
  }

  if (!view) {
    return (
      <div className="space-y-4">
        <BackLink onClick={onBack}>Users</BackLink>
        {error && <div className="alert-error">{error}</div>}
      </div>
    );
  }

  const canGenerate = !!estimate && !tooMuch && !reportLoading && customer.isActive;

  return (
    <div className="space-y-6">
      <BackLink onClick={onBack}>Users</BackLink>

      {/* Who is receiving the coin. Kept at the top of every step from here on, so the
          admin can never be looking at one customer's figures while thinking
          of another. */}
      <div className="card overflow-hidden">
        <div className="flex flex-wrap items-center gap-4 bg-gradient-to-br from-silver-800 via-silver-900 to-black px-6 py-5">
          <Avatar name={customer.name} image={customer.profileImage} className="h-14 w-14" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-bold tracking-tight text-white">{customer.name}</h2>
              {!customer.isActive && (
                <span className="badge bg-red-400/15 text-red-300 ring-1 ring-inset ring-red-300/30">
                  Inactive
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-xs text-white/60">
              {customer.email}
              {customer.mobile ? ` · +91 ${customer.mobile}` : ""}
              {customer.employeeName ? ` · added by ${customer.employeeName}` : ""}
            </p>
          </div>

          <div className="text-right">
            <div className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
              Silver in account
            </div>
            <div className="text-2xl font-bold tabular-nums text-white">
              {holding.gramsLabel}
            </div>
            {view.holdingValue !== null && (
              <div className="text-xs tabular-nums text-white/60">
                Worth ₹{formatRupees(view.holdingValue)}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-10 gap-y-4 px-6 py-4">
          <Figure
            label="Bought"
            value={holding.boughtGramsLabel}
            hint={`₹${formatRupees(holding.totalPaid)} paid in`}
          />
          <Figure
            label="Already given out"
            value={holding.soldGrams > 0 ? holding.soldGramsLabel : "—"}
            hint={`₹${formatRupees(holding.totalReceived)} received`}
          />
          <Figure
            label="Today's rate"
            value={rate ? `₹${formatRupees(rate.ratePerGram)}/g` : "—"}
            hint={
              rate
                ? rate.isToday
                  ? "Published today"
                  : `Published ${formatDate(rate.rateDate)}`
                : "No rate published"
            }
          />
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {paidMessage && <div className="alert-success">{paidMessage}</div>}

      {/* The coin has been handed over: the receipt replaces the form. Leaving
          a weight box live under a completed handover is how a second coin
          gets given by accident. */}
      {receipt ? (
        <>
          <PayoutReport report={receipt} paid>
            <div className="flex flex-wrap gap-3 border-t border-silver-200 pt-4">
              <button type="button" onClick={onDone} className="btn-secondary">
                Pay someone else
              </button>
            </div>
          </PayoutReport>
        </>
      ) : (
        <>
          {!rate && (
            <div className="alert-error flex items-start gap-2.5">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                No silver rate has been published, so a payout cannot be priced.{" "}
                <Link to="/dashboard/silver-rate" className="font-semibold underline">
                  Publish today's rate
                </Link>{" "}
                first.
              </span>
            </div>
          )}

          {!customer.isActive && (
            <div className="alert-error">
              This customer's account is deactivated, so no payout can be made. Their silver stays
              where it is.
            </div>
          )}

          {available < MIN_GRAMS && customer.isActive && (
            <div className="alert-info">
              {customer.name} holds no silver, so there is no coin to give.
            </div>
          )}

          {/* Step 3 - the coin */}
          {rate && customer.isActive && available >= MIN_GRAMS && (
            <div className="card">
              <div className="card-header">
                <h2 className="card-title">
                  <IconSilver className="mr-2 inline h-4 w-4" />
                  Weigh the silver coin
                </h2>
              </div>

              <form onSubmit={handleGenerate}>
                <div className="card-body space-y-5">
                  <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-brand-50 px-4 py-3">
                    <span className="text-sm text-silver-600">
                      Silver available to give:{" "}
                      <span className="font-semibold tabular-nums text-silver-900">
                        {formatGrams(available)}
                      </span>
                    </span>
                    <button
                      type="button"
                      onClick={coinForEverything}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      Give it all
                    </button>
                  </div>

                  {/* One box, in grams. The admin is entering what a physical
                      coin weighs - there is no rupee side to a coin, and
                      offering one would invite them to type an amount and let
                      the system pick a weight the coin in their hand doesn't
                      have. */}
                  <div>
                    <label className="label">Weight of the coin (g)</label>
                    <input
                      type="number"
                      step="0.000001"
                      min="0"
                      required
                      value={entry}
                      onChange={(e) => updateEntry(e.target.value)}
                      className="input tabular-nums"
                      placeholder="10.000000"
                      autoComplete="off"
                    />
                    <p className="mt-1.5 text-xs text-silver-500">
                      Exactly what the coin weighs. This much silver comes off {customer.name}'s
                      account; the rest stays in it.
                    </p>
                  </div>

                  {/* An estimate, and labelled as one. The report below is what
                      the handover is actually recorded from. */}
                  <div className="rounded-lg border border-silver-200 bg-silver-50 px-4 py-3">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-silver-500">
                      Estimate
                    </div>
                    {estimate ? (
                      <>
                        <div className="mt-1 text-xl font-bold tabular-nums text-silver-900">
                          {formatGrams(estimate.grams)} coin
                        </div>
                        <div className="mt-0.5 text-xs tabular-nums text-silver-500">
                          Worth ₹{formatRupees(estimate.value)} at today's rate ·{" "}
                          {formatGrams(Math.max(estimate.remaining, 0))} would stay in the account
                        </div>
                      </>
                    ) : (
                      <div className="mt-1 text-sm text-silver-400">
                        Enter the coin's weight to see what it comes to.
                      </div>
                    )}
                  </div>

                  {tooMuch && (
                    <div className="alert-error">
                      {customer.name} holds only {formatGrams(available)} — less silver than the{" "}
                      {formatGrams(estimate.grams)} coin entered.
                    </div>
                  )}

                  {reportError && <div className="alert-error">{reportError}</div>}

                  <button type="submit" disabled={!canGenerate} className="btn-primary w-full">
                    <IconReport className="h-4 w-4" />
                    {reportLoading ? "Generating report..." : "Generate payout report"}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Step 4 - the report, and step 5 hanging off the bottom of it */}
          {report && (
            <PayoutReport report={report}>
              <div className="flex flex-wrap items-center gap-3 border-t border-silver-200 pt-4">
                <button
                  type="button"
                  onClick={() => setConfirming(true)}
                  disabled={paying}
                  className="btn-primary"
                >
                  <IconSilver className="h-4 w-4" />
                  {paying
                    ? "Recording..."
                    : `Give the ${report.payout.gramsLabel} coin`}
                </button>
                <span className="text-xs text-silver-500">
                  Confirm only once the coin is in the customer's hands.
                </span>
              </div>
            </PayoutReport>
          )}
        </>
      )}

      {/* Past payouts for this customer, so the admin can see at a glance
          whether they have already been given a coin today. */}
      {view.payouts.length > 0 && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">
              <IconSilver className="mr-2 inline h-4 w-4" />
              Past payouts
            </h2>
            <span className="badge-neutral tabular-nums">{view.payouts.length}</span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-silver-200 bg-silver-50">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head text-right">Silver</th>
                  <th className="table-head text-right">Rate (per gm)</th>
                  <th className="table-head text-right">Worth (₹)</th>
                  <th className="table-head">Received</th>
                  <th className="table-head">Handled by</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {view.payouts.map((payout) => (
                  <tr key={payout.id} className="transition-colors hover:bg-silver-50/70">
                    <td className="table-cell whitespace-nowrap font-medium text-silver-900">
                      {formatDate(payout.soldOn)}
                    </td>
                    <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                      {payout.gramsLabel}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(payout.ratePerGram)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
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
                    </td>
                    <td className="table-cell text-silver-500">{payout.handledBy}</td>
                    <td className="table-cell">
                      <PayoutStatusBadge status={payout.payoutStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <ConfirmModal
        open={confirming}
        title="Confirm this handover"
        message={
          report ? (
            <span>
              Give <strong className="text-silver-900">{customer.name}</strong> a silver coin of{" "}
              <strong className="text-silver-900">{report.payout.gramsLabel}</strong>, worth ₹
              {formatRupees(report.payout.value)} at ₹
              {formatRupees(report.payout.ratePerGram)} per gram.
              <br />
              <br />
              {report.after.clearsAccount
                ? "This empties their account — no silver will be left in it."
                : `${report.after.gramsLabel} stays in their account.`}
              <br />
              <br />
              <span className="text-silver-500">
                No money changes hands. This takes the silver off their account straight away and
                cannot be undone.
              </span>
            </span>
          ) : (
            ""
          )
        }
        confirmLabel="Yes, coin given"
        loading={paying}
        onConfirm={onConfirm}
        onCancel={() => setConfirming(false)}
      />
    </div>
  );
}

// -------------------------------------------------------------------------
// The flow itself
// -------------------------------------------------------------------------
export default function PayoutFlow() {
  const dispatch = useDispatch();
  const {
    employees,
    employeesLoading,
    employeeId,
    users,
    usersTotals,
    usersLoading,
    userId,
    view,
    viewLoading,
    report,
    reportLoading,
    reportError,
    paying,
    receipt,
    paidMessage,
    error,
  } = useSelector((state) => state.payouts);

  const [userSearch, setUserSearch] = useState("");

  useEffect(() => {
    dispatch(fetchPayoutEmployees());
  }, [dispatch]);

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    if (!employeeId) return undefined;

    const timer = setTimeout(
      () => dispatch(fetchPayoutUsers({ employeeId, search: userSearch })),
      300
    );
    return () => clearTimeout(timer);
  }, [dispatch, employeeId, userSearch]);

  useEffect(() => {
    if (userId) dispatch(fetchPayoutUserView(userId));
  }, [dispatch, userId]);

  const selectedEmployee = employees.find((employee) => employee.id === employeeId) || null;

  const step = userId ? (receipt ? 5 : report ? 4 : 3) : employeeId ? 2 : 1;

  function pickEmployee(employee) {
    setUserSearch("");
    dispatch(selectPayoutEmployee(employee.id));
  }

  function backToEmployees() {
    setUserSearch("");
    dispatch(selectPayoutEmployee(""));
  }

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-silver-200 bg-white px-5 py-4 shadow-card">
        <Stepper current={step} />
      </div>

      {step === 1 && (
        <StepEmployee employees={employees} loading={employeesLoading} onPick={pickEmployee} />
      )}

      {step === 2 && (
        <StepUser
          employee={selectedEmployee}
          users={users}
          totals={usersTotals}
          loading={usersLoading}
          search={userSearch}
          onSearch={setUserSearch}
          onPick={(user) => dispatch(selectPayoutUser(user.id))}
          onBack={backToEmployees}
        />
      )}

      {step >= 3 && (
        <StepPayout
          view={view}
          loading={viewLoading}
          report={report}
          reportLoading={reportLoading}
          reportError={reportError}
          paying={paying}
          receipt={receipt}
          paidMessage={paidMessage}
          error={error}
          onBack={() => dispatch(selectPayoutUser(null))}
          onGenerate={(amount) => dispatch(generatePayoutReport({ userId, ...amount }))}
          onAmountChanged={() => dispatch(clearPayoutReport())}
          onConfirm={() => dispatch(confirmPayout({ report }))}
          onDone={() => {
            // resetPayoutFlow empties the employee list along with everything
            // else, and the effect that loads it only runs on mount - so it is
            // asked for again here rather than leaving step 1 blank.
            dispatch(resetPayoutFlow());
            dispatch(fetchPayoutEmployees());
          }}
        />
      )}

      {step === 1 && error && <div className="alert-error">{error}</div>}
    </div>
  );
}
