// The end-of-day screen: everything this employee has collected but not yet
// handed to the admin, and a single button to bundle it all into one
// handover. The purchases stay "Pending" until the admin actually accepts the
// cash - this button only tells the admin it's coming.

import { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearLastHandover,
  clearSettlementsError,
  fetchMySettlements,
  fetchPendingSummary,
  handOverCash,
} from "../store/settlementsSlice.js";
import { formatDate, formatDateTime, formatRupees } from "../utils/format.js";
import { SettlementStatusBadge } from "../components/PaymentStatusBadge.jsx";
import { IconCash, IconSilver } from "../components/Icons.jsx";

export default function EmployeeSettlements() {
  const dispatch = useDispatch();
  const {
    pendingSummary,
    pendingSummaryLoading,
    mine,
    handingOver,
    lastHandover,
    error,
  } = useSelector((state) => state.settlements);

  useEffect(() => {
    dispatch(fetchPendingSummary());
    dispatch(fetchMySettlements());
    return () => dispatch(clearSettlementsError());
  }, [dispatch]);

  function handleHandOver() {
    dispatch(clearLastHandover());
    dispatch(handOverCash());
  }

  const hasUnsettled = pendingSummary.count > 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Cash Handover</h1>
        <p className="mt-1 text-sm text-silver-500">
          Bundle everything you've collected and hand it to the admin. Once they accept the cash,
          every purchase in this batch turns from Pending to Success — for you and for the
          customer.
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {lastHandover && <div className="alert-success">{lastHandover.message}</div>}

      {/* Today's unsettled total */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-silver-800 to-silver-900 px-6 py-5 text-white">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
            <IconCash className="h-4 w-4" />
            Cash in hand, not yet handed over
          </div>

          {pendingSummaryLoading && pendingSummary.count === 0 ? (
            <div className="mt-3 text-sm text-white/70">Loading...</div>
          ) : hasUnsettled ? (
            <>
              <div className="mt-2 text-3xl font-bold tabular-nums">
                ₹{formatRupees(pendingSummary.totalAmount)}
              </div>
              <div className="mt-1 text-xs text-white/60">
                {pendingSummary.count} purchase{pendingSummary.count === 1 ? "" : "s"} not yet
                handed over
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/70">
              Nothing to hand over — every purchase you've taken is already with the admin.
            </p>
          )}
        </div>

        {hasUnsettled && (
          <div className="border-t border-silver-200 bg-silver-50 px-6 py-4">
            <button
              onClick={handleHandOver}
              disabled={handingOver}
              className="btn-primary w-full sm:w-auto"
            >
              <IconCash className="h-4 w-4" />
              {handingOver
                ? "Handing over..."
                : `Hand Over ₹${formatRupees(pendingSummary.totalAmount)} to Admin`}
            </button>
          </div>
        )}
      </div>

      {/* What's in this batch */}
      {hasUnsettled && (
        <div className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">
              <IconSilver className="mr-2 inline h-4 w-4" />
              Purchases in This Batch
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-silver-200 bg-silver-50">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head">Customer</th>
                  <th className="table-head text-right">Paid (₹)</th>
                  {/* The rate the row was priced at, frozen when it was
                      recorded - a batch can span days, so this is not
                      necessarily today's rate. */}
                  <th className="table-head text-right">Rate (per gm)</th>
                  <th className="table-head text-right">Silver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {pendingSummary.purchases.map((purchase) => (
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
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Handover history */}
      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">My Handovers</h2>
        </div>

        {mine.length === 0 ? (
          <div className="py-12 text-center text-sm text-silver-500">
            Handovers you make will appear here.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px]">
              <thead className="border-b border-silver-200 bg-silver-50">
                <tr>
                  <th className="table-head">Handed Over</th>
                  <th className="table-head text-right">Purchases</th>
                  <th className="table-head text-right">Amount (₹)</th>
                  <th className="table-head">Status</th>
                  <th className="table-head">Accepted</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {mine.map((settlement) => (
                  <tr key={settlement.id} className="transition-colors hover:bg-silver-50/70">
                    <td className="table-cell font-medium text-silver-900">
                      {formatDate(settlement.settlementDate)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {settlement.purchaseCount}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(settlement.totalAmount)}
                    </td>
                    <td className="table-cell">
                      <SettlementStatusBadge status={settlement.status} />
                    </td>
                    <td className="table-cell text-silver-500">
                      {settlement.status === "accepted"
                        ? `${settlement.acceptedByName || "Admin"} · ${formatDateTime(settlement.acceptedAt)}`
                        : "—"}
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
