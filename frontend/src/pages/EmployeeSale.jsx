// The other half of the counter: an employee picks a customer, enters how much
// silver they want to cash out, and the sale is recorded.
//
// The payout shown while typing is only a preview - the server prices the sale
// from the rate it has published and stores the weight to six decimals. Both
// sides run the same arithmetic (utils/silverMath.js mirrors
// backend/utils/silverMath.js), so what is previewed is what is saved.
//
// The customer picker and their holding are the same ones the buy screen uses,
// out of purchasesSlice - there is one definition of what someone holds, and
// it is what caps this form.

import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  fetchCustomerHolding,
  fetchCustomers,
  selectCustomer,
} from "../store/purchasesSlice.js";
import {
  clearLastSale,
  fetchMyRecordedSales,
  fetchSaleRate,
  recordSale,
} from "../store/salesSlice.js";
import { formatDate, formatRupees, initialsOf } from "../utils/format.js";
import { amountForGrams, formatGrams, gramsForAmount, roundGrams } from "../utils/silverMath.js";
import { PayoutStatusBadge } from "../components/PaymentStatusBadge.jsx";
import { IconCheck, IconRate, IconSearch, IconSilver, IconUsers } from "../components/Icons.jsx";

// Which side of the trade the employee is typing. Grams is the default because
// grams are what actually leaves the holding; rupees is there because that is
// how customers usually ask ("give me ₹500 of it").
const BY_GRAMS = "grams";
const BY_RUPEES = "rupees";

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

export default function EmployeeSale() {
  const dispatch = useDispatch();

  const { customers, customersLoading, selectedCustomer, selectedHolding } = useSelector(
    (state) => state.purchases
  );
  const { ratePerGram, rateIsToday, recorded, saving, lastRecorded, error } = useSelector(
    (state) => state.sales
  );

  const [search, setSearch] = useState("");
  const [mode, setMode] = useState(BY_GRAMS);
  const [entry, setEntry] = useState("");

  useEffect(() => {
    dispatch(fetchSaleRate());
    dispatch(fetchMyRecordedSales());
    return () => dispatch(clearLastSale());
  }, [dispatch]);

  // Debounced so typing a name doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchCustomers({ search })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search]);

  // Clear the box once a sale has gone through, ready for the next one.
  useEffect(() => {
    if (lastRecorded) setEntry("");
  }, [lastRecorded]);

  const available = Number(selectedHolding.totalGrams) || 0;

  // Whichever side they typed, resolve it to the pair the sale is made of.
  // Rupees are converted to grams exactly as the server will convert them.
  const preview = useMemo(() => {
    if (!ratePerGram || entry === "") return null;

    const grams =
      mode === BY_RUPEES ? gramsForAmount(entry, ratePerGram) : roundGrams(Number(entry));

    if (grams === null || !Number.isFinite(grams) || grams <= 0) return null;

    return { grams, payout: amountForGrams(grams, ratePerGram) };
  }, [entry, mode, ratePerGram]);

  // The holding is shown to the milligram, so an employee reading "2.294 g"
  // off the screen types 2.294 even when the exact remainder is 2.293578 g.
  // That is the display rounding, not an overdraw - so anything within half a
  // milligram of the true holding counts as "all of it", and the exact
  // remainder is what gets sent.
  const HALF_MILLIGRAM = 0.0005;
  const meansEverything =
    !!preview && preview.grams > available && preview.grams - available <= HALF_MILLIGRAM;

  // Caught here so the employee sees it before they hit the button; the server
  // checks it again under a lock, which is what actually prevents it.
  const tooMuch =
    !!preview && !!selectedCustomer && preview.grams > available && !meansEverything;

  function handleSelect(customer) {
    dispatch(selectCustomer(customer));
    dispatch(fetchCustomerHolding(customer.id));
    dispatch(clearLastSale());
    setEntry("");
  }

  function sellEverything() {
    setMode(BY_GRAMS);
    setEntry(String(roundGrams(available)));
  }

  function handleSubmit(e) {
    e.preventDefault();
    if (!selectedCustomer || !preview || tooMuch) return;

    // Always sent as grams: the amount box is a convenience for the person
    // typing, not a second way for the server to price a sale.
    const grams = meansEverything ? roundGrams(available) : preview.grams;
    dispatch(recordSale({ userId: selectedCustomer.id, grams }));
  }

  const canSubmit = !!selectedCustomer && !!preview && !tooMuch && !saving;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Buy Silver Back</h1>
        <p className="mt-1 text-sm text-silver-500">
          Pick the customer, enter how much they want to cash out, and their silver is deducted
          straight away — the cash is paid once the admin approves the payout.
        </p>
      </div>

      {/* Today's selling rate - the rate a sell-back is priced at. */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-silver-800 to-silver-900 px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
            <IconRate className="h-4 w-4" />
            Selling Rate (per gm)
          </div>

          {ratePerGram ? (
            <>
              <div className="mt-2 text-3xl font-bold tabular-nums">
                ₹{formatRupees(ratePerGram)}
              </div>
              <div className="mt-1 text-xs text-white/60">
                {rateIsToday
                  ? "Published today — this is what the customer is paid per gram"
                  : "From the last published day — ask your admin to publish today's rate"}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/70">
              No rate has been published yet, so a sale cannot be priced. Please ask your admin to
              publish today's rate.
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
                {search ? `No customer matched “${search}”` : "No customers yet"}
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
            <h2 className="card-title">Amount to Sell</h2>
          </div>

          <form onSubmit={handleSubmit}>
            <div className="card-body space-y-5">
              {lastRecorded && (
                <div className="alert-success">
                  {lastRecorded.gramsLabel} sold for {lastRecorded.customerName} — ₹
                  {formatRupees(lastRecorded.amountPayable)} at ₹
                  {formatRupees(lastRecorded.ratePerGram)}/g, awaiting the admin's approval.
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

              {selectedCustomer && (
                <div className="flex flex-wrap items-baseline justify-between gap-2 rounded-lg bg-brand-50 px-4 py-3">
                  <span className="text-sm text-silver-600">
                    Available to sell:{" "}
                    <span className="font-semibold tabular-nums text-silver-900">
                      {formatGrams(available)}
                    </span>
                  </span>
                  {available > 0 && (
                    <button
                      type="button"
                      onClick={sellEverything}
                      className="text-sm font-medium text-brand-600 hover:underline"
                    >
                      Sell everything
                    </button>
                  )}
                </div>
              )}

              {/* Two ways in to the same sale: customers ask for grams or for
                  rupees, and both end up stored as grams. */}
              <div>
                <div className="mb-2 inline-flex rounded-lg border border-silver-200 bg-silver-50 p-0.5">
                  {[
                    { key: BY_GRAMS, label: "In grams" },
                    { key: BY_RUPEES, label: "In rupees" },
                  ].map(({ key, label }) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => {
                        setMode(key);
                        setEntry("");
                      }}
                      className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                        mode === key
                          ? "bg-white text-silver-900 shadow-card"
                          : "text-silver-500 hover:text-silver-700"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>

                <label className="label">
                  {mode === BY_GRAMS ? "Silver to sell (g)" : "Cash to pay out (₹)"}
                </label>
                <input
                  type="number"
                  step={mode === BY_GRAMS ? "0.000001" : "0.01"}
                  min="0"
                  required
                  value={entry}
                  onChange={(e) => setEntry(e.target.value)}
                  className="input tabular-nums"
                  placeholder={mode === BY_GRAMS ? "2.000000" : "500.00"}
                  disabled={!ratePerGram || !selectedCustomer}
                />
              </div>

              {/* What that sale pays out, live. */}
              <div className="rounded-lg border border-silver-200 bg-silver-50 px-4 py-3">
                <div className="text-[11px] font-semibold uppercase tracking-wider text-silver-500">
                  This sale
                </div>
                {preview ? (
                  <>
                    <div className="mt-1 text-2xl font-bold tabular-nums text-silver-900">
                      {formatGrams(preview.grams)} → ₹{formatRupees(preview.payout)}
                    </div>
                    <div className="mt-0.5 text-xs text-silver-500 tabular-nums">
                      {formatGrams(preview.grams)} × ₹{formatRupees(ratePerGram)} per gram = ₹
                      {formatRupees(preview.payout)}
                    </div>
                  </>
                ) : (
                  <div className="mt-1 text-sm text-silver-400">
                    Enter an amount to see what it pays out.
                  </div>
                )}
              </div>

              {tooMuch && (
                <div className="alert-error">
                  {selectedCustomer.name} only holds {formatGrams(available)} — that's less than
                  the {formatGrams(preview.grams)} entered.
                </div>
              )}

              <button type="submit" disabled={!canSubmit} className="btn-primary w-full">
                {saving ? "Recording..." : "Record Sale"}
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

          <div className="flex flex-wrap gap-x-12 gap-y-4 px-6 py-4">
            <Figure label="Holds now" value={selectedHolding.gramsLabel} />
            <Figure
              label="Bought"
              value={selectedHolding.boughtGramsLabel || "—"}
              hint={`₹${formatRupees(selectedHolding.totalPaid)} paid in`}
            />
            <Figure
              label="Sold back"
              value={selectedHolding.soldGramsLabel || "—"}
              hint={`₹${formatRupees(selectedHolding.totalReceived || 0)} paid out`}
            />
            <Figure
              label="Sales"
              value={String(selectedHolding.sales || 0)}
              hint={
                selectedHolding.lastSaleOn
                  ? `Last on ${formatDate(selectedHolding.lastSaleOn)}`
                  : "None yet"
              }
            />
          </div>
        </div>
      )}

      {/* What this member of staff has bought back at the counter */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Sold Back Through Me</h2>
          <Link
            to="/employee/purchases"
            className="text-sm font-medium text-brand-600 hover:underline"
          >
            Record a purchase
          </Link>
        </div>

        {recorded.length === 0 ? (
          <div className="py-12 text-center text-sm text-silver-500">
            Sales you record will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[620px]">
              <thead className="border-b border-silver-200 bg-silver-50">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head">Customer</th>
                  <th className="table-head text-right">Silver</th>
                  <th className="table-head text-right">Rate (per gm)</th>
                  <th className="table-head text-right">Payout (₹)</th>
                  <th className="table-head">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {recorded.map((sale) => (
                  <tr key={sale.id} className="transition-colors hover:bg-silver-50/70">
                    <td className="table-cell font-medium text-silver-900">
                      {formatDate(sale.soldOn)}
                    </td>
                    <td className="table-cell">{sale.customerName}</td>
                    <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                      {sale.gramsLabel}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(sale.ratePerGram)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(sale.amountPayable)}
                    </td>
                    <td className="table-cell">
                      <PayoutStatusBadge status={sale.payoutStatus} />
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
