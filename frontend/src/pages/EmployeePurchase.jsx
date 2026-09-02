// The counter screen: an employee picks a customer, types what they paid, and
// the purchase is recorded.
//
// The picker lists only the users this employee registered themselves - the
// server decides that, not this screen (see backend/utils/customerAccess.js),
// and it refuses a purchase for anyone else's user the same way.
//
// The weight shown while typing is only a preview - the server prices the
// purchase from the rate it has published and stores the weight to six
// decimals. Both sides run the same arithmetic (utils/silverMath.js mirrors
// backend/utils/silverMath.js), so what is previewed is what is saved.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  clearPurchaseError,
  fetchCustomerHolding,
  fetchCustomers,
  fetchMyRecordedPurchases,
  fetchPurchaseRate,
  recordPurchase,
  selectCustomer,
} from "../store/purchasesSlice.js";
import { formatDate, formatRupees, initialsOf } from "../utils/format.js";
import { formatGrams, gramsForAmount } from "../utils/silverMath.js";
import { PaymentStatusBadge } from "../components/PaymentStatusBadge.jsx";
import { IconCheck, IconRate, IconSearch, IconSilver, IconUsers } from "../components/Icons.jsx";

// The amount is typed, never stepped - a plain text box, so the field carries
// no spinner arrows and no scroll-wheel nudge. This keeps what is typed to a
// rupee figure: digits, one decimal point, at most two paise.
function onlyAmount(value) {
  const cleaned = String(value).replace(/[^\d.]/g, "");
  const [rupees, ...rest] = cleaned.split(".");
  if (rest.length === 0) return rupees;
  return `${rupees}.${rest.join("").slice(0, 2)}`;
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

export default function EmployeePurchase() {
  const dispatch = useDispatch();
  const {
    ratePerGram,
    rateIsToday,
    customers,
    customersLoading,
    selectedCustomer,
    selectedHolding,
    selectedPurchases,
    recorded,
    saving,
    lastRecorded,
    error,
  } = useSelector((state) => state.purchases);

  const [search, setSearch] = useState("");
  const [amount, setAmount] = useState("");

  useEffect(() => {
    dispatch(fetchPurchaseRate());
    dispatch(fetchMyRecordedPurchases());
    return () => dispatch(clearPurchaseError());
  }, [dispatch]);

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchCustomers({ search })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search]);

  // Clear the amount once a purchase has gone through, ready for the next one.
  useEffect(() => {
    if (lastRecorded) setAmount("");
  }, [lastRecorded]);

  // What this amount buys at today's rate - recomputed as they type.
  const preview = useMemo(
    () => gramsForAmount(amount, ratePerGram),
    [amount, ratePerGram]
  );

  function handleSelect(customer) {
    dispatch(selectCustomer(customer));
    dispatch(fetchCustomerHolding(customer.id));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!selectedCustomer) return;
    dispatch(recordPurchase({ userId: selectedCustomer.id, amountPaid: Number(amount) }));
  }

  const canSubmit = !!selectedCustomer && preview !== null && preview > 0 && !saving;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Record a Purchase</h1>
        <p className="mt-1 text-sm text-silver-500">
          Take the payment, pick the customer, and their silver is added to their account at
          today's buying rate.
        </p>
      </div>

      {/* Today's buying rate - what the customer pays, and so the rate a
          purchase is priced at. The lower selling rate is what they'd get
          back on the sell screen. */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-silver-800 to-silver-900 px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
            <IconRate className="h-4 w-4" />
            Buying Rate (per gm)
          </div>

          {ratePerGram ? (
            <>
              <div className="mt-2 text-3xl font-bold tabular-nums">
                ₹{formatRupees(ratePerGram)}
              </div>
              <div className="mt-1 text-xs text-white/60">
                {rateIsToday
                  ? "Published today — this is what the customer pays per gram"
                  : "From the last published day — ask your admin to publish today's rate"}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/70">
              No rate has been published yet, so a purchase cannot be priced. Please ask your
              admin to publish today's rate.
            </p>
          )}
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Customer picker */}
        <div className="card lg:col-span-1 h-fit">
          <div className="card-header flex-col items-stretch gap-3">
            <h2 className="card-title">
              <IconUsers className="mr-2 inline h-4 w-4" />
              Customer
            </h2>
            <div className="relative">
              <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9"
                placeholder="Search by name or email"
              />
            </div>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {customersLoading && customers.length === 0 ? (
              <div className="py-10 text-center text-sm text-silver-500">Loading customers...</div>
            ) : customers.length === 0 ? (
              <div className="py-10 text-center text-sm text-silver-500">
                {search
                  ? `No customer of yours matched “${search}”`
                  : "You have not registered any users yet"}
              </div>
            ) : (
              <ul className="divide-y divide-silver-200">
                {customers.map((customer) => {
                  const active = selectedCustomer?.id === customer.id;

                  return (
                    <li key={customer.id}>
                      <button
                        type="button"
                        onClick={() => handleSelect(customer)}
                        className={`flex w-full items-center gap-3 px-6 py-3 text-left transition-colors ${
                          active ? "bg-brand-50" : "hover:bg-silver-50"
                        }`}
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-silver-100 text-xs font-semibold text-silver-600">
                          {initialsOf(customer.name)}
                        </span>
                        <span className="min-w-0 leading-tight">
                          <span className="block truncate text-sm font-medium text-silver-900">
                            {customer.name}
                          </span>
                          <span className="block truncate text-xs text-silver-500">
                            {customer.email}
                          </span>
                        </span>
                        {active && <IconCheck className="ml-auto h-4 w-4 shrink-0 text-brand-600" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>

        {/* Amount + preview */}
        <div className="card lg:col-span-2 h-fit">
          <div className="card-header">
            <h2 className="card-title">Amount Paid</h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="card-body space-y-5">
              {lastRecorded && (
                <div className="alert-success">
                  {lastRecorded.gramsLabel} added for {lastRecorded.customerName} — ₹
                  {formatRupees(lastRecorded.amountPaid)} at ₹
                  {formatRupees(lastRecorded.ratePerGram)}/g.
                </div>
              )}

              <div>
                <label className="label">Customer</label>
                <div className="input flex items-center bg-silver-50 text-silver-900">
                  {selectedCustomer ? (
                    <span className="truncate">
                      {selectedCustomer.name}
                      <span className="text-silver-500"> · {selectedCustomer.email}</span>
                    </span>
                  ) : (
                    <span className="text-silver-400">Pick a customer from the list</span>
                  )}
                </div>
              </div>

              <div>
                <label className="label">Amount paid (₹)</label>
                <input
                  type="text"
                  inputMode="decimal"
                  required
                  value={amount}
                  onChange={(e) => setAmount(onlyAmount(e.target.value))}
                  className="input tabular-nums"
                  placeholder="100.00"
                  disabled={!ratePerGram}
                />
              </div>

              {/* What that amount buys, live. Below a gram it reads in
                  milligrams, which is what most payments come to. */}
              <div className="rounded-lg border border-silver-200 bg-silver-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-silver-500">
                  This purchase
                </div>
                {preview !== null && preview > 0 ? (
                  <>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-silver-900">
                      {formatGrams(preview)}
                    </div>
                    <div className="mt-0.5 text-xs text-silver-500 tabular-nums">
                      ₹{formatRupees(amount)} ÷ ₹{formatRupees(ratePerGram)} per gram ={" "}
                      {formatGrams(preview)}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-sm text-silver-400">
                    Enter an amount to see what it buys.
                  </div>
                )}
              </div>

              <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
                {saving ? "Recording..." : "Record Purchase"}
              </button>
            </div>
          </form>
        </div>
      </div>

      {/* The selected customer's account */}
      {selectedCustomer && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">
              <IconSilver className="mr-2 inline h-4 w-4" />
              {selectedCustomer.name}'s Silver
            </h2>
          </div>

          <div className="flex flex-wrap gap-x-12 gap-y-4 border-b border-silver-200 px-6 py-4">
            <Figure label="Total held" value={selectedHolding.gramsLabel} />
            <Figure label="Total paid" value={`₹${formatRupees(selectedHolding.totalPaid)}`} />
            <Figure
              label="Purchases"
              value={String(selectedHolding.purchases)}
              hint={
                selectedHolding.lastPurchaseOn
                  ? `Last on ${formatDate(selectedHolding.lastPurchaseOn)}`
                  : "None yet"
              }
            />
          </div>

          {selectedPurchases.length === 0 ? (
            <div className="py-12 text-center text-sm text-silver-500">
              No purchases recorded for this customer yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-silver-200 bg-silver-50">
                  <tr>
                    <th className="table-head">Date</th>
                    <th className="table-head text-right">Paid (₹)</th>
                    <th className="table-head text-right">Rate (per gm)</th>
                    <th className="table-head text-right">Silver</th>
                    <th className="table-head">Recorded by</th>
                    <th className="table-head">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-silver-200">
                  {selectedPurchases.map((purchase) => (
                    <tr key={purchase.id} className="transition-colors hover:bg-silver-50/70">
                      <td className="table-cell font-medium text-silver-900">
                        {formatDate(purchase.purchasedOn)}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {formatRupees(purchase.amountPaid)}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        {formatRupees(purchase.ratePerGram)}
                      </td>
                      <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                        {purchase.gramsLabel}
                      </td>
                      <td className="table-cell text-silver-500">
                        {purchase.employeeName || "—"}
                      </td>
                      <td className="table-cell">
                        <PaymentStatusBadge status={purchase.paymentStatus} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* What this member of staff has taken at the counter */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Recorded by Me</h2>
          <div className="flex items-center gap-4">
            <Link to="/employee/sales" className="text-sm font-medium text-brand-600 hover:underline">
              Buy silver back
            </Link>
            <Link to="/employee/settlements" className="text-sm font-medium text-brand-600 hover:underline">
              Hand over cash
            </Link>
          </div>
        </div>

        {recorded.length === 0 ? (
          <div className="py-12 text-center text-sm text-silver-500">
            Purchases you record will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-silver-200 bg-silver-50">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head">Customer</th>
                  <th className="table-head text-right">Paid (₹)</th>
                  <th className="table-head text-right">Rate (per gm)</th>
                  <th className="table-head text-right">Silver</th>
                  <th className="table-head">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {recorded.map((purchase) => (
                  <tr key={purchase.id} className="transition-colors hover:bg-silver-50/70">
                    <td className="table-cell font-medium text-silver-900">
                      {formatDate(purchase.purchasedOn)}
                    </td>
                    <td className="table-cell">{purchase.customerName}</td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(purchase.amountPaid)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(purchase.ratePerGram)}
                    </td>
                    <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                      {purchase.gramsLabel}
                    </td>
                    <td className="table-cell">
                      <PaymentStatusBadge status={purchase.paymentStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
