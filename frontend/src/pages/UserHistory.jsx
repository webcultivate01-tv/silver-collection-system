// The customer's full history, in two halves they switch between with the
// buttons at the top: what they have BOUGHT (purchases grouped day by day -
// each day showing what was paid, what it bought, and whether the cash behind
// it has reached the admin yet) and what they have been PAID OUT.
//
// Two tabs rather than one long page, because the two are opposite directions
// of the same account and someone opening this screen is almost always asking
// one question or the other, not both. "My Payouts" is a tab and not a page of
// its own so the date and status filters keep working across both.
//
// A payout is one of two quite different things, and the customer is told
// which:
//
//   Silver coin  the shop handed them a physical coin of that weight. Nothing
//                is owed and nothing is coming - they already have it. The
//                rupee column is what the coin was WORTH on the day, not money
//                anybody paid them.
//   Cash         they sold silver back at the counter for money, which may
//                still be waiting on the admin's approval.
//
// Showing a coin handover as "paid out" would tell someone they received money
// they never did, so the two never share a wording.

import { Fragment, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchMyHolding } from "../store/purchasesSlice.js";
import { formatDate, formatDateTime, formatRupees } from "../utils/format.js";
import { formatGrams } from "../utils/silverMath.js";
import { PaymentStatusBadge, PayoutStatusBadge } from "../components/PaymentStatusBadge.jsx";
import { IconCash, IconReport, IconSilver } from "../components/Icons.jsx";
import ReportFilters, { useReportFilterState } from "../components/ReportFilters.jsx";

// Client-side only - both tables come from the one fetchMyHolding call, so
// narrowing them is just a filter over what's already on screen, not a new
// request. "Pending"/"Success" reads the same way in both tables: a purchase
// still waiting on the admin, or a sell-back payout not yet made, is
// "Pending"; settled either way is "Success".
const HISTORY_FILTERS = {
  defaults: { from: "", to: "", status: "all" },
  fields: [
    { key: "from", type: "date", label: "From" },
    { key: "to", type: "date", label: "To" },
    {
      key: "status",
      type: "select",
      label: "Status",
      options: [
        { value: "all", label: "All" },
        { value: "pending", label: "Pending" },
        { value: "success", label: "Success" },
      ],
    },
  ],
};

const TABS = [
  { key: "purchases", label: "Purchases", Icon: IconReport },
  { key: "payouts", label: "My Payouts", Icon: IconCash },
];

// Purchases already come newest-first from the API, so grouping preserves
// that order - today's group first, then each earlier day in turn.
function groupByDay(purchases) {
  const groups = [];
  const byDate = new Map();

  for (const purchase of purchases) {
    const key = purchase.purchasedOn;
    let group = byDate.get(key);

    if (!group) {
      group = { date: key, purchases: [], totalAmount: 0, totalGrams: 0, pendingCount: 0 };
      byDate.set(key, group);
      groups.push(group);
    }

    group.purchases.push(purchase);
    group.totalAmount += Number(purchase.amountPaid);
    group.totalGrams += Number(purchase.grams);
    if (purchase.paymentStatus !== "success") group.pendingCount += 1;
  }

  return groups;
}

// The figures above the payouts table. Summed from the rows the filters have
// left on screen, never from the whole list, so the totals always describe
// exactly what the customer is looking at.
//
// Coin weight is kept apart from cash on purpose: adding a coin's value into
// "cash received" would tell someone the shop had paid them money it never
// did.
function summarisePayouts(sales) {
  const totals = {
    grams: 0,
    coinCount: 0,
    coinGrams: 0,
    cashPaid: 0,
    cashPending: 0,
    pendingCount: 0,
  };

  for (const sale of sales) {
    totals.grams += Number(sale.grams);

    if (sale.isCoin) {
      totals.coinCount += 1;
      totals.coinGrams += Number(sale.grams);
    } else if (sale.payoutStatus === "paid") {
      totals.cashPaid += Number(sale.amountPayable);
    } else {
      totals.cashPending += Number(sale.amountPayable);
      totals.pendingCount += 1;
    }
  }

  return totals;
}

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

export default function UserHistory() {
  const dispatch = useDispatch();
  const { purchases, sales, loading, error } = useSelector((state) => state.purchases);
  const filters = useReportFilterState(HISTORY_FILTERS.defaults);
  const { from, to, status } = filters.values;

  // The open tab lives in the URL rather than in state, so "Sold back → View
  // all" on the dashboard can land straight on the payouts, and the browser's
  // back button steps between the two halves the way a customer expects.
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get("tab") === "payouts" ? "payouts" : "purchases";

  function openTab(key) {
    setSearchParams(key === "payouts" ? { tab: "payouts" } : {}, { replace: true });
  }

  useEffect(() => {
    dispatch(fetchMyHolding({ limit: 200 }));
  }, [dispatch]);

  const filteredPurchases = useMemo(() => {
    return purchases.filter((purchase) => {
      if (from && purchase.purchasedOn < from) return false;
      if (to && purchase.purchasedOn > to) return false;
      if (status === "pending" && purchase.paymentStatus === "success") return false;
      if (status === "success" && purchase.paymentStatus !== "success") return false;
      return true;
    });
  }, [purchases, from, to, status]);

  const filteredSales = useMemo(() => {
    return sales.filter((sale) => {
      if (from && sale.soldOn < from) return false;
      if (to && sale.soldOn > to) return false;
      // A coin was handed over the moment it was recorded, so it is never
      // "pending" - it is settled by definition, and filtering to Pending must
      // not turn one up.
      const isSettled = sale.isCoin || sale.payoutStatus === "paid";
      if (status === "pending" && isSettled) return false;
      if (status === "success" && !isSettled) return false;
      return true;
    });
  }, [sales, from, to, status]);

  const coinCount = useMemo(() => sales.filter((sale) => sale.isCoin).length, [sales]);
  const payoutTotals = useMemo(() => summarisePayouts(filteredSales), [filteredSales]);

  const days = useMemo(() => groupByDay(filteredPurchases), [filteredPurchases]);
  const filtered = Boolean(from || to || status !== "all");
  const counts = { purchases: purchases.length, payouts: sales.length };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">My History</h1>
        <p className="mt-1 text-sm text-silver-500">
          {tab === "purchases"
            ? "Every purchase, grouped by day. A payment shows Pending until your employee hands the cash to the admin and it's accepted — then it turns to Success."
            : "Every payout you have had — silver coins handed to you at the shop, and cash for anything you sold back."}
        </p>
      </div>

      {/* The two halves of the account. Counts sit on the buttons so the
          customer can see there is something under the other one without
          having to open it. */}
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-silver-200 bg-white p-1 shadow-card">
        {TABS.map(({ key, label, Icon }) => {
          const active = tab === key;

          return (
            <button
              key={key}
              type="button"
              onClick={() => openTab(key)}
              aria-pressed={active}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                active
                  ? "bg-brand-600 text-white shadow-card"
                  : "text-silver-600 hover:bg-silver-100 hover:text-silver-900"
              }`}
            >
              <Icon className="h-4 w-4" />
              {label}
              <span
                className={`rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                  active ? "bg-white/20 text-white" : "bg-silver-100 text-silver-500"
                }`}
              >
                {counts[key]}
              </span>
            </button>
          );
        })}
      </div>

      <div className="card px-5 py-4">
        <ReportFilters fields={HISTORY_FILTERS.fields} {...filters} />
      </div>

      {error && <div className="alert-error">{error}</div>}

      {tab === "purchases" ? (
        loading && purchases.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">Loading your history...</div>
        ) : purchases.length === 0 ? (
          <div className="card py-16 text-center">
            <IconReport className="mx-auto h-8 w-8 text-silver-300" />
            <p className="mt-3 text-sm font-medium text-silver-900">No purchases yet</p>
            <p className="mt-1 text-sm text-silver-500">
              Purchases recorded for you at the counter will appear here, grouped by day.
            </p>
          </div>
        ) : days.length === 0 ? (
          <div className="card py-16 text-center">
            <IconReport className="mx-auto h-8 w-8 text-silver-300" />
            <p className="mt-3 text-sm font-medium text-silver-900">
              No purchases match these filters
            </p>
            <p className="mt-1 text-sm text-silver-500">Try widening the date range or status.</p>
          </div>
        ) : (
          <div className="card overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-silver-200 bg-silver-50">
                  <tr>
                    <th className="table-head">Date</th>
                    <th className="table-head text-right">Paid (₹)</th>
                    <th className="table-head text-right">Rate (per gm)</th>
                    <th className="table-head text-right">Silver</th>
                    <th className="table-head">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-silver-200">
                  {days.map((day) => (
                    <Fragment key={day.date}>
                      {day.purchases.map((purchase) => (
                        <tr key={purchase.id} className="transition-colors hover:bg-silver-50/70">
                          <td className="table-cell whitespace-nowrap font-medium text-silver-900">
                            {formatDate(day.date)}
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
                          <td className="table-cell">
                            <PaymentStatusBadge status={purchase.paymentStatus} />
                          </td>
                        </tr>
                      ))}

                      {/* The day's own total, as a strip inside the table rather
                          than a heading above it. */}
                      {day.purchases.length > 1 && (
                        <tr className="bg-silver-50/60">
                          <td className="px-6 py-2 text-xs font-medium text-silver-500">
                            {day.purchases.length} purchases
                          </td>
                          <td className="px-6 py-2 text-right text-xs font-semibold tabular-nums text-silver-900">
                            {formatRupees(day.totalAmount)}
                          </td>
                          <td className="px-6 py-2" />
                          <td className="px-6 py-2 text-right text-xs font-semibold tabular-nums text-silver-900">
                            {formatGrams(day.totalGrams)}
                          </td>
                          <td className="px-6 py-2 text-xs text-silver-500">
                            {day.pendingCount === 0
                              ? "All settled"
                              : `${day.pendingCount} pending`}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )
      ) : loading && sales.length === 0 ? (
        <div className="py-16 text-center text-sm text-silver-500">Loading your payouts...</div>
      ) : sales.length === 0 ? (
        <div className="card py-16 text-center">
          <IconCash className="mx-auto h-8 w-8 text-silver-300" />
          <p className="mt-3 text-sm font-medium text-silver-900">No payouts yet</p>
          <p className="mt-1 text-sm text-silver-500">
            Silver coins handed to you, and cash for anything you sell back, will be listed here.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Money the shop still owes, when there is any. First on the screen
              because it is the only line here the customer is waiting on. */}
          {payoutTotals.cashPending > 0 && (
            <div className="alert-info">
              ₹{formatRupees(payoutTotals.cashPending)} from {payoutTotals.pendingCount} sell-back
              {payoutTotals.pendingCount === 1 ? "" : "s"} is still waiting on the shop's approval.
            </div>
          )}

          <div className="flex flex-wrap gap-x-12 gap-y-4 rounded-xl border border-silver-200 bg-white px-6 py-4 shadow-card">
            <Total
              label="Silver paid out"
              value={formatGrams(payoutTotals.grams)}
              hint={`Across ${filteredSales.length} payout${
                filteredSales.length === 1 ? "" : "s"
              }`}
            />
            <Total
              label="Given as coins"
              value={formatGrams(payoutTotals.coinGrams)}
              hint={`${payoutTotals.coinCount} silver coin${
                payoutTotals.coinCount === 1 ? "" : "s"
              } — no cash paid`}
            />
            <Total
              label="Cash received"
              value={`₹${formatRupees(payoutTotals.cashPaid)}`}
              hint="Sell-backs the shop has paid"
            />
            <Total
              label="Cash still to come"
              value={`₹${formatRupees(payoutTotals.cashPending)}`}
              hint={`${payoutTotals.pendingCount} awaiting approval`}
              tone={payoutTotals.cashPending > 0 ? "text-amber-600" : "text-silver-400"}
            />
          </div>

          <div className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">
                <IconSilver className="mr-2 inline h-4 w-4" />
                My Payouts
              </h2>
              {coinCount > 0 && (
                <span className="badge-neutral tabular-nums">
                  {coinCount} silver coin{coinCount === 1 ? "" : "s"}
                </span>
              )}
            </div>

            {filteredSales.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-silver-500">
                {filtered ? "No payouts match these filters." : "No payouts to show."}
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="border-b border-silver-200 bg-silver-50">
                    <tr>
                      <th className="table-head">Date</th>
                      <th className="table-head">You received</th>
                      <th className="table-head text-right">Silver</th>
                      <th className="table-head text-right">Rate (per gm)</th>
                      <th className="table-head text-right">Value (₹)</th>
                      <th className="table-head">Handled by</th>
                      <th className="table-head">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-silver-200">
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="transition-colors hover:bg-silver-50/70">
                        <td className="table-cell whitespace-nowrap font-medium text-silver-900">
                          {formatDate(sale.soldOn)}
                        </td>
                        <td className="table-cell">
                          {sale.isCoin ? (
                            <>
                              <span className="badge bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                                Silver coin
                              </span>
                              <div className="mt-0.5 text-xs text-silver-500">
                                {sale.gramsLabel} coin
                              </div>
                            </>
                          ) : (
                            <>
                              <span className="badge-neutral">Cash</span>
                              <div className="mt-0.5 text-xs text-silver-500">
                                ₹{formatRupees(sale.amountPayable)}
                              </div>
                            </>
                          )}
                        </td>
                        <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                          {sale.gramsLabel}
                        </td>
                        <td className="table-cell text-right tabular-nums">
                          {formatRupees(sale.ratePerGram)}
                        </td>
                        <td className="table-cell text-right tabular-nums">
                          {formatRupees(sale.amountPayable)}
                        </td>
                        <td className="table-cell text-silver-500">
                          {sale.handledBy || "—"}
                          <div className="text-xs text-silver-400">
                            {sale.source === "admin" ? "Shop counter (admin)" : "Counter"}
                          </div>
                        </td>
                        <td className="table-cell">
                          {/* A coin is already in their hands, so "Awaiting
                              payout" would be nonsense on one. Only cash can be
                              outstanding. */}
                          {sale.isCoin ? (
                            <span className="badge-success">Coin received</span>
                          ) : (
                            <PayoutStatusBadge status={sale.payoutStatus} />
                          )}
                          {!sale.isCoin && sale.payoutStatus === "paid" && sale.approvedAt && (
                            <div className="mt-0.5 text-xs text-silver-500">
                              {formatDateTime(sale.approvedAt)}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {coinCount > 0 && (
              <p className="border-t border-silver-100 px-6 py-3 text-xs text-silver-500">
                A silver coin payout is settled in metal, not money — the value shown is what the
                coin was worth on the day it was given to you.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
