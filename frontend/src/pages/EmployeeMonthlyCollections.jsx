// Monthly Collection: the employee's own answer to "how much did I take in,
// month by month".
//
// These are the same `silver_purchases` rows the admin reads on their Employee
// Collections screen, only pinned to whoever is signed in - the API takes the
// employee off the token, so this page never passes an id and can never show
// somebody else's counter.
//
// One year at a time. Opening a month pulls that month's individual payments
// underneath it, so a figure can always be traced back to the clients behind
// it.

import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearMonthDetail,
  clearMyCollectionsError,
  fetchMyMonthCollections,
  fetchMyMonthlyCollections,
} from "../store/collectionsSlice.js";
import { selectEmployee } from "../store/employeeAuthSlice.js";
import { documentUrl } from "../components/DocumentUpload.jsx";
import ReportDownloadButtons from "../components/ReportDownloadButtons.jsx";
import { PaymentStatusBadge, SettlementStatusBadge } from "../components/PaymentStatusBadge.jsx";
import { buildMonthlyCollectionReport } from "../utils/reportBuilders.js";
import { formatDate, formatRupees, initialsOf } from "../utils/format.js";
import {
  IconCash,
  IconChevronDown,
  IconCollection,
  IconSilver,
  IconUsers,
} from "../components/Icons.jsx";

function StatTile({ label, value, hint, Icon }) {
  return (
    <div className="stat-tile">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="stat-label">{label}</div>
          <div className="stat-value tabular-nums">{value}</div>
        </div>
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-silver-100 text-silver-500">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

function Avatar({ name, image, className = "h-9 w-9" }) {
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

// Every month is drawn against the best month of the year, so a glance down
// the column shows the shape of the year rather than twelve equal rows.
function MonthBar({ amount, best }) {
  const share = best > 0 ? Math.max((amount / best) * 100, amount > 0 ? 4 : 0) : 0;

  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-silver-100">
      <div className="h-full rounded-full bg-brand-500" style={{ width: `${share}%` }} />
    </div>
  );
}

// What one month opens up into: every payment taken in it.
function MonthDetail({ detail, loading }) {
  if (!detail) {
    return (
      <div className="border-t border-silver-200 bg-silver-50 px-6 py-8 text-center text-sm text-silver-500">
        {loading ? "Loading this month..." : "Could not load this month."}
      </div>
    );
  }

  if (detail.collections.length === 0) {
    return (
      <div className="border-t border-silver-200 bg-silver-50 px-6 py-8 text-center text-sm text-silver-500">
        Nothing was collected in {detail.label}.
      </div>
    );
  }

  return (
    <div className="space-y-5 border-t border-silver-200 bg-silver-50 px-4 py-5 sm:px-6">
      <div>
        <div className="text-xs font-semibold uppercase tracking-wide text-silver-500">
          Every collection
        </div>
        <div className="mt-3 overflow-x-auto rounded-lg border border-silver-200 bg-white">
          <table className="w-full min-w-[760px]">
            <thead>
              <tr>
                <th className="table-head">Date</th>
                <th className="table-head">Client</th>
                <th className="table-head text-right">Collected (₹)</th>
                {/* The rate this row was priced at, frozen when the payment was
                    taken - not today's. It is what makes Collected ÷ Rate =
                    Silver check out across a month of moving rates. */}
                <th className="table-head text-right">Rate (per gm)</th>
                <th className="table-head text-right">Silver</th>
                <th className="table-head">Payment</th>
                <th className="table-head">Handover</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-silver-200">
              {detail.collections.map((row) => (
                <tr key={row.id} className="hover:bg-silver-50">
                  <td className="table-cell whitespace-nowrap">{formatDate(row.purchasedOn)}</td>
                  <td className="table-cell">
                    <div className="flex items-center gap-3">
                      <Avatar name={row.clientName} image={row.clientImage} />
                      <div className="min-w-0">
                        <div className="font-medium text-silver-900">{row.clientName}</div>
                        <div className="text-xs text-silver-500">
                          {row.clientMobile ? `+91 ${row.clientMobile}` : row.clientEmail}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td className="table-cell text-right font-semibold tabular-nums text-silver-900">
                    {formatRupees(row.amountPaid)}
                  </td>
                  <td className="table-cell text-right tabular-nums">
                    {formatRupees(row.ratePerGram)}
                  </td>
                  <td className="table-cell text-right tabular-nums">{row.gramsLabel}</td>
                  <td className="table-cell">
                    <PaymentStatusBadge status={row.paymentStatus} />
                  </td>
                  <td className="table-cell">
                    {row.settlement ? (
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-medium tabular-nums text-silver-700">
                          #{row.settlement.id}
                        </span>
                        <SettlementStatusBadge status={row.settlement.status} />
                      </div>
                    ) : (
                      <span className="text-xs text-silver-500">Still with you</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default function EmployeeMonthlyCollections() {
  const dispatch = useDispatch();
  const employee = useSelector(selectEmployee);
  const { monthly, monthlyLoading, monthDetail, monthDetailLoading, myError } = useSelector(
    (state) => state.collections
  );

  // The year being read, and the month opened underneath it. Both are page
  // state: the API picks the opening year, this only overrides it.
  const [year, setYear] = useState("");
  const [openMonth, setOpenMonth] = useState("");

  useEffect(() => {
    dispatch(fetchMyMonthlyCollections({ year }));
  }, [dispatch, year]);

  useEffect(() => {
    return () => {
      dispatch(clearMonthDetail());
      dispatch(clearMyCollectionsError());
    };
  }, [dispatch]);

  const months = monthly?.months || [];
  const summary = monthly?.summary;
  const shownYear = monthly?.year;
  const best = monthly?.bestMonth?.totalAmount || 0;

  const report = useMemo(
    () => buildMonthlyCollectionReport(months, employee, { year: shownYear || "" }),
    [months, employee, shownYear]
  );

  function toggleMonth(month) {
    if (openMonth === month) {
      setOpenMonth("");
      dispatch(clearMonthDetail());
      return;
    }

    setOpenMonth(month);
    dispatch(fetchMyMonthCollections(month));
  }

  // Switching years closes whatever month was open - its rows belong to the
  // year being left behind.
  function pickYear(next) {
    setOpenMonth("");
    dispatch(clearMonthDetail());
    setYear(String(next));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Monthly Collection</h1>
        <p className="mt-1 text-sm text-silver-500">
          Everything you have collected at the counter, month by month. Open a month to see the
          clients behind it.
        </p>
      </div>

      {myError && <div className="alert-error">{myError}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={`Collected in ${shownYear || "—"}`}
          value={`₹${formatRupees(summary?.totalAmount ?? 0)}`}
          hint={`${summary?.collections ?? 0} collection${summary?.collections === 1 ? "" : "s"}`}
          Icon={IconCollection}
        />
        <StatTile
          label="Silver bought"
          value={summary?.collections ? summary.gramsLabel : "—"}
          hint="Priced at the rate of the day each payment was taken"
          Icon={IconSilver}
        />
        <StatTile
          label="Clients"
          value={String(summary?.clients ?? 0)}
          hint={
            monthly?.bestMonth
              ? `Best month: ${monthly.bestMonth.label} · ₹${formatRupees(
                  monthly.bestMonth.totalAmount
                )}`
              : "Nothing collected this year yet"
          }
          Icon={IconUsers}
        />
        <StatTile
          label="Collected all-time"
          value={`₹${formatRupees(monthly?.allTime?.totalAmount ?? 0)}`}
          hint={`₹${formatRupees(summary?.pendingAmount ?? 0)} of ${
            shownYear || "this year"
          } still with you`}
          Icon={IconCash}
        />
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {(monthly?.years || []).map((one) => (
            <button
              key={one}
              onClick={() => pickYear(one)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium tabular-nums transition-colors ${
                one === shownYear
                  ? "bg-brand-600 text-white shadow-card"
                  : "bg-white text-silver-600 ring-1 ring-inset ring-silver-200 hover:bg-silver-50"
              }`}
            >
              {one}
            </button>
          ))}
        </div>
        <div className="ml-auto">
          <ReportDownloadButtons report={report} size="sm" />
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Month by month</h2>
        </div>

        {monthlyLoading && months.length === 0 ? (
          <div className="py-14 text-center text-sm text-silver-500">Loading your months...</div>
        ) : months.length === 0 ? (
          <div className="py-14 text-center text-sm text-silver-500">
            You haven't collected anything yet. Payments you record at the counter show up here.
          </div>
        ) : (
          <div className="divide-y divide-silver-200">
            {months.map((row) => {
              const open = openMonth === row.month;
              const empty = row.collections === 0;

              return (
                <div key={row.month}>
                  <button
                    onClick={() => toggleMonth(row.month)}
                    disabled={empty}
                    className={`flex w-full items-center gap-4 px-4 py-4 text-left sm:px-6 ${
                      empty ? "cursor-default" : "hover:bg-silver-50"
                    }`}
                  >
                    <div className="w-24 shrink-0 sm:w-28">
                      <div
                        className={`text-sm font-semibold ${
                          empty ? "text-silver-400" : "text-silver-900"
                        }`}
                      >
                        {row.label.split(" ")[0]}
                      </div>
                      <div className="text-xs tabular-nums text-silver-500">{row.year}</div>
                    </div>

                    <div className="hidden min-w-0 flex-1 space-y-2 sm:block">
                      <MonthBar amount={row.totalAmount} best={best} />
                      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-silver-500">
                        <span className="tabular-nums">
                          {row.collections} collection{row.collections === 1 ? "" : "s"}
                        </span>
                        <span className="tabular-nums">
                          {row.clients} client{row.clients === 1 ? "" : "s"}
                        </span>
                        <span className="tabular-nums">{empty ? "—" : row.gramsLabel}</span>
                        {row.pendingAmount > 0 && (
                          <span className="font-medium tabular-nums text-amber-600">
                            ₹{formatRupees(row.pendingAmount)} not handed over
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="ml-auto shrink-0 text-right sm:ml-0">
                      <div
                        className={`text-base font-bold tabular-nums ${
                          empty ? "text-silver-300" : "text-silver-900"
                        }`}
                      >
                        ₹{formatRupees(row.totalAmount)}
                      </div>
                      {row.lastOn && (
                        <div className="text-xs text-silver-500">Last {formatDate(row.lastOn)}</div>
                      )}
                    </div>

                    <IconChevronDown
                      className={`h-4 w-4 shrink-0 transition-transform ${
                        empty ? "invisible" : "text-silver-400"
                      } ${open ? "rotate-180" : ""}`}
                    />
                  </button>

                  {open && (
                    <MonthDetail
                      detail={monthDetail?.month === row.month ? monthDetail : null}
                      loading={monthDetailLoading}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
