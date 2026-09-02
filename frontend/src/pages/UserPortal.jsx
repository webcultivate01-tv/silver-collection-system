// What a user sees after signing in at /user: what their silver is worth right
// now, how the balance got there, and anything still waiting on the shop.
// Their own details and the password form live on their profile page, reached
// from the sidebar.

import { Fragment, useEffect, useMemo } from "react";
import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { fetchUserProfile, selectUser } from "../store/userAuthSlice.js";
import { fetchTodayRate } from "../store/silverRateSlice.js";
import { fetchMyHolding } from "../store/purchasesSlice.js";
import { formatDate, formatRelativeTime, formatRupees } from "../utils/format.js";
import { amountForGrams, formatGrams } from "../utils/silverMath.js";
import { PaymentStatusBadge, PayoutStatusBadge } from "../components/PaymentStatusBadge.jsx";
import {
  IconAlert,
  IconArrowRight,
  IconCheck,
  IconClock,
  IconRate,
  IconReport,
  IconSilver,
  IconTrendDown,
  IconTrendUp,
  IconUser,
} from "../components/Icons.jsx";

// The dashboard is a summary - the last few days of buying, and the last few
// sell-backs. "My History" is where the whole book lives.
const RECENT_DAYS = 5;
const RECENT_SALES = 5;

function StatTile({ label, value, hint, loading = false }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      {loading ? (
        <div className="skeleton mt-2 h-6 w-24" />
      ) : (
        <div className="stat-value tabular-nums">{value}</div>
      )}
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

// One side of today's rate, on a light card. RateFigure is the same idea on the
// dark header cards elsewhere in the app.
function RateColumn({ label, value, change, hint }) {
  return (
    <div className="min-w-0">
      <div className="stat-label">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums text-silver-900">
        ₹{formatRupees(value)}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <span className="text-xs text-silver-500">{hint}</span>
        {!!change && (
          <span className={change > 0 ? "delta-up" : "delta-down"}>
            {change > 0 ? (
              <IconTrendUp className="h-3 w-3" />
            ) : (
              <IconTrendDown className="h-3 w-3" />
            )}
            ₹{formatRupees(Math.abs(change))}
          </span>
        )}
      </div>
    </div>
  );
}

function StatusRow({ tone, icon, title, detail }) {
  const tones = {
    warning: "bg-amber-50 text-amber-600",
    ok: "bg-emerald-50 text-emerald-600",
  };

  return (
    <div className="flex items-start gap-3">
      <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${tones[tone]}`}>
        {icon}
      </span>
      <div className="min-w-0 leading-tight">
        <div className="text-sm font-medium text-silver-900">{title}</div>
        <div className="mt-0.5 text-xs text-silver-500">{detail}</div>
      </div>
    </div>
  );
}

export default function UserPortal() {
  const dispatch = useDispatch();
  const user = useSelector(selectUser);
  const { rate, change, isToday } = useSelector((state) => state.silverRate);
  const { holding, purchases, sales, loading } = useSelector((state) => state.purchases);

  useEffect(() => {
    dispatch(fetchUserProfile());
    dispatch(fetchTodayRate());
    dispatch(fetchMyHolding());
  }, [dispatch]);

  // What the shop would pay for the balance today, against what is still in it:
  // money paid in for purchases, less anything already paid back out.
  const netPaid = Number(holding.totalPaid) - Number(holding.totalReceived);
  const valueToday =
    rate && holding.totalGrams > 0 ? amountForGrams(holding.totalGrams, rate.sellRatePerGram) : null;
  const gain = valueToday !== null && netPaid > 0 ? valueToday - netPaid : null;
  const gainPercent = gain !== null ? (gain / netPaid) * 100 : null;

  const averageBuyRate =
    holding.boughtGrams > 0 ? Number(holding.totalPaid) / Number(holding.boughtGrams) : null;

  const awaitingPayment = purchases.filter((row) => row.paymentStatus !== "success").length;
  // Only a CASH payout can be outstanding. A silver coin was handed over at the
  // moment it was recorded, so counting one as "waiting to be paid" would tell
  // the customer money is coming that never was and never will be.
  const pendingPayouts = sales.filter((row) => !row.isCoin && row.payoutStatus !== "paid");
  const pendingPayoutAmount = pendingPayouts.reduce(
    (sum, row) => sum + Number(row.amountPayable),
    0
  );

  // The coins they have been given, and what those coins weighed. This is the
  // headline of the payout side of their account now that payouts are settled
  // in metal.
  const coinPayouts = sales.filter((row) => row.isCoin);
  const coinGrams = coinPayouts.reduce((sum, row) => sum + Number(row.grams), 0);

  // Date-wise, the way a customer reads their own book: one block per day they
  // paid in, each purchase inside it carrying the amount, the rate it was
  // priced at, the silver it bought and whether the payment has reached the
  // admin yet. Purchases arrive newest-first, so the map keeps that order.
  const purchaseDays = useMemo(() => {
    const byDate = new Map();

    for (const row of purchases) {
      let day = byDate.get(row.purchasedOn);

      if (!day) {
        day = { date: row.purchasedOn, rows: [], totalAmount: 0, totalGrams: 0, pending: 0 };
        byDate.set(row.purchasedOn, day);
      }

      day.rows.push(row);
      day.totalAmount += Number(row.amountPaid);
      day.totalGrams += Number(row.grams);
      if (row.paymentStatus !== "success") day.pending += 1;
    }

    return [...byDate.values()].slice(0, RECENT_DAYS);
  }, [purchases]);

  // Sell-backs move silver the other way, so they get their own short list
  // rather than being mixed into the days above.
  const recentSales = useMemo(() => sales.slice(0, RECENT_SALES), [sales]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">
            Hello{user ? `, ${String(user.name).split(" ")[0]}` : ""}
          </h1>
          <p className="mt-1 text-sm text-silver-500">
            Your silver, what it is worth today, and anything still in progress.
          </p>
        </div>

        <div className="flex items-center gap-2 text-xs text-silver-500">
          <IconClock className="h-4 w-4" />
          {rate
            ? isToday
              ? "Rates updated today"
              : `Rates as of ${formatDate(rate.rateDate)}`
            : "No rate published yet"}
        </div>
      </div>

      {/* Anything the customer is waiting on comes before the numbers. */}
      {(pendingPayouts.length > 0 || awaitingPayment > 0) && (
        <div className="alert-info flex flex-wrap items-center gap-x-2 gap-y-1">
          <IconClock className="h-4 w-4 shrink-0" />
          {pendingPayouts.length > 0 && (
            <span>
              ₹{formatRupees(pendingPayoutAmount)} in cash from {pendingPayouts.length}{" "}
              sell-back{pendingPayouts.length === 1 ? "" : "s"} is waiting to be paid out.
            </span>
          )}
          {awaitingPayment > 0 && (
            <span>
              {awaitingPayment} purchase{awaitingPayment === 1 ? "" : "s"} still to be confirmed by
              the shop.
            </span>
          )}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-3">
        {/* The headline: what the balance is, and what it is worth. */}
        <section className="card overflow-hidden lg:col-span-2">
          <div className="bg-gradient-to-br from-silver-800 via-silver-900 to-silver-900 px-6 py-6 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <IconSilver className="h-4 w-4" />
              Silver you hold
            </div>

            <div className="mt-3 flex flex-wrap items-end gap-x-10 gap-y-4">
              <div>
                <div className="text-5xl font-bold leading-none">
                  {holding.totalGrams > 0 ? formatGrams(holding.totalGrams) : "0.000 g"}
                </div>
                <div className="mt-2 text-xs text-white/60">
                  {holding.purchases} purchase{holding.purchases === 1 ? "" : "s"}
                  {holding.lastPurchaseOn ? ` · last on ${formatDate(holding.lastPurchaseOn)}` : ""}
                </div>
              </div>

              {valueToday !== null && (
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    Worth today
                  </div>
                  <div className="mt-1 text-3xl font-bold tabular-nums">
                    ₹{formatRupees(valueToday)}
                  </div>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    {gain !== null && (
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${
                          gain >= 0 ? "bg-emerald-400/15 text-emerald-300" : "bg-red-400/15 text-red-300"
                        }`}
                      >
                        {gain >= 0 ? (
                          <IconTrendUp className="h-3 w-3" />
                        ) : (
                          <IconTrendDown className="h-3 w-3" />
                        )}
                        ₹{formatRupees(Math.abs(gain))} ({Math.abs(gainPercent).toFixed(1)}%)
                      </span>
                    )}
                    <span className="text-xs text-white/60">
                      if you sold back at ₹{formatRupees(rate?.sellRatePerGram)}/g
                    </span>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="grid grid-cols-2 divide-x divide-silver-200 border-t border-silver-200 sm:grid-cols-3">
            <div className="px-5 py-4">
              <div className="stat-label">Total paid</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-silver-900">
                ₹{formatRupees(holding.totalPaid)}
              </div>
            </div>
            <div className="px-5 py-4">
              <div className="stat-label">Paid out to you</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-silver-900">
                {holding.soldGrams > 0 ? holding.soldGramsLabel : "—"}
              </div>
              <div className="text-xs text-silver-500">
                {holding.soldGrams === 0
                  ? "Nothing yet"
                  : coinPayouts.length > 0
                    ? `${formatGrams(coinGrams)} as silver coin${
                        coinPayouts.length === 1 ? "" : "s"
                      }`
                    : `₹${formatRupees(holding.totalReceived)} received`}
              </div>
            </div>
            <div className="col-span-2 border-t border-silver-200 px-5 py-4 sm:col-span-1 sm:border-t-0">
              <div className="stat-label">Your average buy rate</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-silver-900">
                {averageBuyRate ? `₹${formatRupees(averageBuyRate)}` : "—"}
              </div>
              <div className="text-xs text-silver-500">per gram, across your purchases</div>
            </div>
          </div>
        </section>

        {/* Today's rate, and where the customer stands with the shop. */}
        <div className="space-y-6">
          <section className="card">
            <div className="card-header">
              <h2 className="card-title">
                <IconRate className="mr-2 inline h-4 w-4" />
                Today&apos;s rate
              </h2>
            </div>

            {rate ? (
              <div className="flex gap-6 px-6 py-5">
                <RateColumn
                  label="Buying"
                  value={rate.buyRatePerGram}
                  change={change?.buy}
                  hint="what you pay"
                />
                <div className="w-px self-stretch bg-silver-200" />
                <RateColumn
                  label="Selling"
                  value={rate.sellRatePerGram}
                  change={change?.sell}
                  hint="what you get"
                />
              </div>
            ) : (
              <div className="px-6 py-8 text-center text-sm text-silver-500">
                No rate has been published yet. Please check back later.
              </div>
            )}
          </section>

          <section className="card">
            <div className="card-header">
              <h2 className="card-title">Where things stand</h2>
            </div>

            <div className="space-y-4 px-6 py-5">
              {pendingPayouts.length > 0 && (
                <StatusRow
                  tone="warning"
                  icon={<IconAlert className="h-4 w-4" />}
                  title={`₹${formatRupees(pendingPayoutAmount)} cash payout in progress`}
                  detail={`${pendingPayouts.length} sell-back${
                    pendingPayouts.length === 1 ? "" : "s"
                  } awaiting the shop`}
                />
              )}

              {awaitingPayment > 0 && (
                <StatusRow
                  tone="warning"
                  icon={<IconClock className="h-4 w-4" />}
                  title={`${awaitingPayment} purchase${
                    awaitingPayment === 1 ? "" : "s"
                  } being confirmed`}
                  detail="The silver is already yours - only the paperwork is pending"
                />
              )}

              {/* Coins are not "in progress" - they are done. Worth a line all the
                  same, so the customer can see the shop's record of what they
                  were handed. */}
              {coinPayouts.length > 0 && (
                <StatusRow
                  tone="ok"
                  icon={<IconCheck className="h-4 w-4" />}
                  title={`${formatGrams(coinGrams)} given to you as ${
                    coinPayouts.length === 1 ? "a silver coin" : "silver coins"
                  }`}
                  detail={`${coinPayouts.length} payout${
                    coinPayouts.length === 1 ? "" : "s"
                  } settled in silver, not cash`}
                />
              )}

              {pendingPayouts.length === 0 && awaitingPayment === 0 && (
                <StatusRow
                  tone="ok"
                  icon={<IconCheck className="h-4 w-4" />}
                  title="Everything is settled"
                  detail="Nothing is waiting on the shop right now"
                />
              )}

              <div className="grid grid-cols-2 gap-3 pt-1">
                <Link to="/user/history" className="action-tile">
                  <IconReport className="h-4 w-4" />
                  Full history
                </Link>
                <Link to="/user/profile" className="action-tile">
                  <IconUser className="h-4 w-4" />
                  My profile
                </Link>
              </div>
            </div>
          </section>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Purchases"
          value={holding.purchases}
          hint={
            holding.lastPurchaseOn
              ? `Latest ${formatRelativeTime(holding.lastPurchaseOn)}`
              : "None recorded yet"
          }
          loading={loading && purchases.length === 0}
        />
        <StatTile
          label="Silver bought"
          value={holding.boughtGrams > 0 ? holding.boughtGramsLabel : "—"}
          hint="Total across every purchase"
          loading={loading && purchases.length === 0}
        />
        <StatTile
          label="Sell-backs"
          value={holding.sales}
          hint={
            holding.lastSaleOn ? `Latest ${formatRelativeTime(holding.lastSaleOn)}` : "None yet"
          }
          loading={loading && purchases.length === 0}
        />
        <StatTile
          label="Money received"
          value={`₹${formatRupees(holding.totalReceived)}`}
          hint="Paid out on sell-backs"
          loading={loading && purchases.length === 0}
        />
      </div>

      <section className="card overflow-hidden">
        <div className="card-header">
          <h2 className="card-title">Purchases, day by day</h2>
          <Link to="/user/history" className="link-quiet inline-flex items-center gap-1">
            View all
            <IconArrowRight className="h-4 w-4" />
          </Link>
        </div>

        {purchaseDays.length === 0 ? (
          <div className="px-6 py-14 text-center">
            <p className="text-sm font-medium text-silver-900">Nothing here yet</p>
            <p className="mt-1 text-sm text-silver-500">
              Purchases recorded at the counter show up here straight away.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-silver-200 bg-silver-50">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head text-right">Amount (₹)</th>
                  <th className="table-head text-right">Rate (per gm)</th>
                  <th className="table-head text-right">Silver</th>
                  <th className="table-head">Payment</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {purchaseDays.map((day) => (
                  <Fragment key={day.date}>
                    {day.rows.map((purchase) => (
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

                    {/* A day's own total, so "what did I put in on Tuesday" is
                        answered without adding the rows up by hand. */}
                    {day.rows.length > 1 && (
                      <tr className="bg-silver-50/60">
                        <td className="px-6 py-2 text-xs font-medium text-silver-500">
                          {day.rows.length} purchases
                        </td>
                        <td className="px-6 py-2 text-right text-xs font-semibold tabular-nums text-silver-900">
                          {formatRupees(day.totalAmount)}
                        </td>
                        <td className="px-6 py-2" />
                        <td className="px-6 py-2 text-right text-xs font-semibold tabular-nums text-silver-900">
                          {formatGrams(day.totalGrams)}
                        </td>
                        <td className="px-6 py-2 text-xs text-silver-500">
                          {day.pending === 0 ? "All settled" : `${day.pending} pending`}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {recentSales.length > 0 && (
        <section className="card overflow-hidden">
          <div className="card-header">
            <h2 className="card-title">Sold back</h2>
            <Link to="/user/history?tab=payouts" className="link-quiet inline-flex items-center gap-1">
              View all
              <IconArrowRight className="h-4 w-4" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-silver-200 bg-silver-50">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head text-right">Paid out (₹)</th>
                  <th className="table-head text-right">Rate (per gm)</th>
                  <th className="table-head text-right">Silver</th>
                  <th className="table-head">Payout</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {recentSales.map((sale) => (
                  <tr key={sale.id} className="transition-colors hover:bg-silver-50/70">
                    <td className="table-cell whitespace-nowrap font-medium text-silver-900">
                      {formatDate(sale.soldOn)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(sale.amountPayable)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      {formatRupees(sale.ratePerGram)}
                    </td>
                    <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                      {sale.gramsLabel}
                    </td>
                    <td className="table-cell">
                      <PayoutStatusBadge status={sale.payoutStatus} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
