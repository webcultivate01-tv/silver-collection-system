// Every cash handover an employee has made: what's waiting to be accepted,
// and what's already settled. Accepting one is the only write on this
// screen, and it is what flips every purchase in that batch - and everywhere
// that shows it, employee and customer alike - from Pending to Success.
//
// One screen for both panel roles, which is why it lives here rather than in
// pages/admin: the main admin opens it at /dashboard/settlements and a
// sub-admin at /sub-admin/settlements, and they see and do the same thing.
// Taking an employee's cash at the end of the day is the job a sub-admin was
// added for - whoever is at the shop counts the money and accepts the
// handover, and the row records which of them did it (see
// models/cashSettlementModel.js). A second, near-identical copy of this
// screen would only be a way for the two to start disagreeing.

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  acceptSettlement,
  clearLastAccepted,
  clearSelectedSettlement,
  clearSettlementsError,
  fetchSettlementDetail,
  fetchSettlements,
} from "../store/settlementsSlice.js";
import { formatDate, formatDateTime, formatRupees } from "../utils/format.js";
import { SettlementStatusBadge } from "../components/PaymentStatusBadge.jsx";
import { IconCash, IconCheck } from "../components/Icons.jsx";

const FILTERS = [
  { value: "pending", label: "Awaiting Admin" },
  { value: "accepted", label: "Accepted" },
  { value: "all", label: "All" },
];

export default function CashSettlements() {
  const dispatch = useDispatch();
  const { all, allLoading, selectedDetail, accepting, lastAccepted, error } = useSelector(
    (state) => state.settlements
  );

  const [filter, setFilter] = useState("pending");
  const [date, setDate] = useState("");
  const [openId, setOpenId] = useState(null);

  useEffect(() => {
    dispatch(fetchSettlements({ status: filter, date }));
  }, [dispatch, filter, date]);

  useEffect(() => {
    return () => {
      dispatch(clearSettlementsError());
      dispatch(clearSelectedSettlement());
      dispatch(clearLastAccepted());
    };
  }, [dispatch]);

  function toggleOpen(settlement) {
    if (openId === settlement.id) {
      setOpenId(null);
      dispatch(clearSelectedSettlement());
      return;
    }
    setOpenId(settlement.id);
    dispatch(fetchSettlementDetail(settlement.id));
  }

  async function handleAccept(id) {
    dispatch(clearLastAccepted());
    await dispatch(acceptSettlement(id));
  }

  const pendingTotal = all
    .filter((s) => s.status === "pending")
    .reduce((sum, s) => sum + Number(s.totalAmount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Cash Settlements</h1>
        <p className="mt-1 text-sm text-silver-500">
          Each row is one employee's end-of-day handover. Accept it once you have the cash in
          hand — that's what marks those purchases Success everywhere.
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}
      {lastAccepted && <div className="alert-success">{lastAccepted.message}</div>}

      {filter === "pending" && all.length > 0 && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-silver-800 to-silver-900 px-6 py-5 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <IconCash className="h-4 w-4" />
              Awaiting your acceptance
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums">
              ₹{formatRupees(pendingTotal)}
            </div>
            <div className="mt-1 text-xs text-white/60">
              Across {all.length} handover{all.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => setFilter(f.value)}
            className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
              filter === f.value
                ? "bg-brand-600 text-white shadow-card"
                : "bg-white text-silver-600 ring-1 ring-inset ring-silver-200 hover:bg-silver-50"
            }`}
          >
            {f.label}
          </button>
        ))}

        <div className="ml-auto flex items-center gap-2">
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="input"
            aria-label="Filter by settlement date"
          />
          {date && (
            <button
              onClick={() => setDate("")}
              className="text-xs font-medium text-silver-500 hover:text-silver-800"
            >
              Clear date
            </button>
          )}
        </div>
      </div>

      <div className="card overflow-hidden">
        {allLoading && all.length === 0 ? (
          <div className="py-14 text-center text-sm text-silver-500">Loading handovers...</div>
        ) : all.length === 0 ? (
          <div className="py-14 text-center text-sm text-silver-500">
            No handovers {filter === "pending" ? "waiting" : "here"} yet.
          </div>
        ) : (
          <ul className="divide-y divide-silver-200">
            {all.map((settlement) => (
              <li key={settlement.id}>
                <div className="flex flex-wrap items-center gap-4 px-6 py-4">
                  <button
                    onClick={() => toggleOpen(settlement)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-silver-900">
                        {settlement.employeeName}
                      </span>
                      <span className="text-xs text-silver-400">{settlement.employeeCode}</span>
                      <SettlementStatusBadge status={settlement.status} />
                    </div>
                    <div className="mt-0.5 text-xs text-silver-500">
                      {formatDate(settlement.settlementDate)} · {settlement.purchaseCount}{" "}
                      purchase{settlement.purchaseCount === 1 ? "" : "s"}
                      {settlement.status === "accepted" && (
                        <> · Accepted by {settlement.acceptedByName || "admin"} on{" "}
                          {formatDateTime(settlement.acceptedAt)}</>
                      )}
                    </div>
                  </button>

                  <div className="text-right">
                    <div className="text-lg font-bold tabular-nums text-silver-900">
                      ₹{formatRupees(settlement.totalAmount)}
                    </div>
                  </div>

                  {settlement.status === "pending" && (
                    <button
                      onClick={() => handleAccept(settlement.id)}
                      disabled={accepting}
                      className="btn-primary btn-sm shrink-0"
                    >
                      <IconCheck className="h-4 w-4" />
                      Accept Cash
                    </button>
                  )}
                </div>

                {openId === settlement.id && (
                  <div className="border-t border-silver-200 bg-silver-50 px-6 py-4">
                    {!selectedDetail || selectedDetail.settlement.id !== settlement.id ? (
                      <div className="text-sm text-silver-500">Loading purchases...</div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full min-w-[640px]">
                          <thead>
                            <tr>
                              <th className="table-head">Date</th>
                              <th className="table-head">Customer</th>
                              <th className="table-head text-right">Paid (₹)</th>
                              {/* The rate this row was priced at, frozen when
                                  it was recorded - not today's rate. It is
                                  what makes Paid ÷ Rate = Silver check out on
                                  a batch spanning more than one day. */}
                              <th className="table-head text-right">Rate (per gm)</th>
                              <th className="table-head text-right">Silver</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-silver-200">
                            {selectedDetail.purchases.map((purchase) => (
                              <tr key={purchase.id}>
                                <td className="table-cell">{formatDate(purchase.purchasedOn)}</td>
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
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
