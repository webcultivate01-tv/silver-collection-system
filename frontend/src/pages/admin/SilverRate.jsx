// Admin sets today's silver rate: a buying rate and a selling rate, both per
// gram. Whatever is saved here is what the navbar and every portal show.
//
// Both are named from the CUSTOMER's side, which is what makes the spread run
// the way it does: a customer buys at the buying rate and sells back at the
// lower selling rate, so buying - selling is the shop's margin and a negative
// spread means the two have been entered the wrong way round. Each side of the
// counter prices itself from its own rate - see purchaseController.js and
// saleController.js on the backend.

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearRateStatus,
  fetchRateHistory,
  fetchTodayRate,
  saveTodayRate,
} from "../../store/silverRateSlice.js";
import { formatDate, formatRupees } from "../../utils/format.js";
import RateFigure from "../../components/RateFigure.jsx";
import { IconClose, IconRate, IconSearch } from "../../components/Icons.jsx";

export default function SilverRate() {
  const dispatch = useDispatch();
  const { rate, change, isToday, history, historyLoading, saving, error, savedMessage } =
    useSelector((state) => state.silverRate);

  const [formOpen, setFormOpen] = useState(false);
  const [buyRate, setBuyRate] = useState("");
  const [sellRate, setSellRate] = useState("");
  const [search, setSearch] = useState("");
  // The date-range filter. Either end works on its own: "from" alone is
  // everything since that day, "to" alone everything up to it.
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filtered = Boolean(search || from || to);

  useEffect(() => {
    dispatch(fetchTodayRate());
    return () => dispatch(clearRateStatus());
  }, [dispatch]);

  // Debounced so typing in the search box doesn't fire a request per keystroke.
  // The dates go through the same timer: picking one is a single event, so the
  // wait is not noticeable, and one effect keeps the three filters in step.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchRateHistory({ search, from, to })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search, from, to]);

  function clearFilters() {
    setSearch("");
    setFrom("");
    setTo("");
  }

  // Pre-fill with today's rates so the admin edits rather than retypes.
  useEffect(() => {
    if (rate && isToday) {
      setBuyRate(String(rate.buyRatePerGram));
      setSellRate(String(rate.sellRatePerGram));
    }
  }, [rate, isToday]);

  function openForm() {
    dispatch(clearRateStatus());
    setFormOpen(true);
  }

  async function handleSubmit(e) {
    e.preventDefault();

    const result = await dispatch(
      saveTodayRate({
        buyRatePerGram: Number(buyRate),
        sellRatePerGram: Number(sellRate),
      })
    );

    if (!result.error) {
      setFormOpen(false);
      // Refreshed here, with the filters currently on screen, so publishing a
      // rate does not quietly clear the admin's date range.
      dispatch(fetchRateHistory({ search, from, to }));
    }
  }

  const spread = rate ? rate.buyRatePerGram - rate.sellRatePerGram : null;
  const formSpread = Number(buyRate) - Number(sellRate);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Silver Rate</h1>
        <p className="mt-1 text-sm text-silver-500">
          Publish today's rates per gram, from the customer's side: the buying rate is what
          they pay to buy silver, the selling rate what they're paid to sell it back. Both
          appear in the navbar and in every employee's portal.
        </p>
      </div>

      {savedMessage && !formOpen && <div className="alert-success">{savedMessage}</div>}
      {error && !formOpen && <div className="alert-error">{error}</div>}

      {/* Current rates */}
      <div className="card overflow-hidden">
        <div className="relative overflow-hidden bg-gradient-to-br from-silver-800 via-silver-800 to-silver-900 px-5 py-4 text-white">
          <IconRate className="pointer-events-none absolute -right-3 -top-3 h-16 w-16 text-white/[0.06]" />

          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">
                {isToday ? "Today's Published Rates" : "Latest Published Rates"}
              </span>
              {isToday && (
                <span className="flex h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_0_3px_rgba(52,211,153,0.25)]" />
              )}
            </div>

            {/* The one thing this screen is for, so it is sized to be found and
                hit first - bigger than the buttons that only search or filter. */}
            <button
              onClick={openForm}
              className="btn gap-2.5 px-5 py-3 text-base font-semibold bg-brand-600 text-white shadow-lift ring-1 ring-inset ring-brand-400/60 hover:bg-brand-500 focus:ring-brand-400/40"
            >
              <IconRate className="w-5 h-5" />
              {isToday ? "Update Today's Rate" : "Set Today's Rate"}
            </button>
          </div>

          {rate ? (
            <>
              <div className="relative mt-3 flex flex-wrap items-start gap-x-8 gap-y-3">
                <RateFigure
                  label="Buying Rate"
                  value={rate.buyRatePerGram}
                  change={change?.buy}
                  hint="what a customer pays"
                  size="sm"
                />
                <div className="hidden self-stretch w-px bg-white/15 sm:block" />
                <RateFigure
                  label="Selling Rate"
                  value={rate.sellRatePerGram}
                  change={change?.sell}
                  hint="what a customer is paid"
                  size="sm"
                />
                <div className="hidden self-stretch w-px bg-white/15 sm:block" />
                <div>
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
                    Spread
                  </div>
                  <div className="text-2xl font-bold tabular-nums">
                    ₹{formatRupees(Math.abs(spread))}
                  </div>
                  <div className="mt-1 text-xs text-white/60">
                    {spread <= 0 ? "negative — check rates" : "per gram"}
                  </div>
                </div>
              </div>

              <div className="relative mt-3 text-xs text-white/60">
                {isToday ? "Set today" : `Set on ${formatDate(rate.rateDate)}`}
              </div>
            </>
          ) : (
            <p className="relative mt-3 text-sm text-white/70">
              No rates published yet. Use the button above to set them.
            </p>
          )}
        </div>

        {rate && !isToday && (
          <div className="px-6 py-3 bg-amber-50 border-t border-amber-200 text-sm text-amber-800">
            Today's rates haven't been set yet — the figures above are from{" "}
            {formatDate(rate.rateDate)}.
          </div>
        )}
      </div>

      {/* History */}
      <div className="card overflow-hidden">
        <div className="card-header flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2">
            <h2 className="card-title">Rate History</h2>
            {history.length > 0 && (
              <span className="badge-neutral">
                {history.length} {history.length === 1 ? "day" : "days"}
              </span>
            )}
          </div>

          <div className="relative w-full sm:max-w-xs">
            <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-silver-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9 pr-8"
              placeholder="Search a day's rate, e.g. 10 Aug"
            />
            {search && (
              <button
                type="button"
                onClick={() => setSearch("")}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-silver-400 hover:text-silver-600"
                aria-label="Clear search"
              >
                <IconClose className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* A range can't run backwards, so each end caps the other in the
              picker itself rather than only once the rows come back empty -
              the same rule the report filters use. */}
          <div className="flex w-full items-end gap-2.5 sm:w-auto">
            <div className="min-w-0 flex-1 sm:flex-none">
              <label htmlFor="rate-from" className="label mb-1 text-[11px]">
                From
              </label>
              <input
                id="rate-from"
                type="date"
                value={from}
                max={to || undefined}
                onChange={(e) => setFrom(e.target.value)}
                className="input w-full sm:w-auto"
              />
            </div>

            <div className="min-w-0 flex-1 sm:flex-none">
              <label htmlFor="rate-to" className="label mb-1 text-[11px]">
                To
              </label>
              <input
                id="rate-to"
                type="date"
                value={to}
                min={from || undefined}
                onChange={(e) => setTo(e.target.value)}
                className="input w-full sm:w-auto"
              />
            </div>
          </div>

          {filtered && (
            <button type="button" onClick={clearFilters} className="btn-secondary shrink-0">
              Clear
            </button>
          )}
        </div>

        {historyLoading && history.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">Loading rates...</div>
        ) : history.length === 0 ? (
          <div className="py-16 text-center">
            <IconRate className="mx-auto h-8 w-8 text-silver-300" />
            <p className="mt-3 text-sm text-silver-500">
              {filtered ? "No rates match these filters" : "No rates recorded yet"}
            </p>
            {filtered && (
              <button type="button" onClick={clearFilters} className="btn-secondary mt-4">
                Clear filters
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[520px]">
              <thead className="bg-silver-50 border-b border-silver-200">
                <tr>
                  <th className="table-head">Date</th>
                  <th className="table-head text-right">Buying rate (per gm)</th>
                  <th className="table-head text-right">Selling rate (per gm)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-silver-200">
                {history.map((entry, i) => {
                  const isCurrent = isToday && rate && entry.rateDate === rate.rateDate;
                  return (
                    <tr
                      key={entry.id}
                      className={`transition-colors hover:bg-silver-50/70 ${
                        i % 2 === 1 ? "bg-silver-50/40" : ""
                      }`}
                    >
                      <td className="table-cell font-medium text-silver-900">
                        <span className="inline-flex items-center gap-2">
                          {formatDate(entry.rateDate)}
                          {isCurrent && <span className="badge-success">Today</span>}
                        </span>
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        ₹{formatRupees(entry.buyRatePerGram)}
                      </td>
                      <td className="table-cell text-right tabular-nums">
                        ₹{formatRupees(entry.sellRatePerGram)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Set / update rates */}
      {formOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-silver-900/40 backdrop-blur-sm"
            onClick={() => setFormOpen(false)}
          />

          <form
            onSubmit={handleSubmit}
            className="relative w-full max-w-md card shadow-lift animate-fade-in"
          >
            <div className="card-header">
              <h2 className="card-title">
                {isToday ? "Update Today's Rates" : "Set Today's Rates"}
              </h2>
              <button
                type="button"
                onClick={() => setFormOpen(false)}
                className="text-silver-400 hover:text-silver-600"
                aria-label="Close"
              >
                <IconClose />
              </button>
            </div>

            <div className="card-body space-y-5">
              {error && <div className="alert-error">{error}</div>}

              <div>
                <label className="label">Buying rate per gram — what a customer pays</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-silver-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.000001"
                    min="0.01"
                    required
                    autoFocus
                    value={buyRate}
                    onChange={(e) => setBuyRate(e.target.value)}
                    className="input tabular-nums pl-7"
                    placeholder="96.50"
                  />
                </div>
              </div>

              <div>
                <label className="label">Selling rate per gram — what a customer is paid</label>
                <div className="relative">
                  <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-silver-400">
                    ₹
                  </span>
                  <input
                    type="number"
                    step="0.000001"
                    min="0.01"
                    required
                    value={sellRate}
                    onChange={(e) => setSellRate(e.target.value)}
                    className="input tabular-nums pl-7"
                    placeholder="98.50"
                  />
                </div>
              </div>

              {buyRate !== "" && sellRate !== "" && !Number.isNaN(formSpread) && (
                <div
                  className={`flex items-center justify-between rounded-lg px-3.5 py-2.5 text-sm ${
                    formSpread > 0
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  <span>Spread (buying − selling)</span>
                  <span className="font-semibold tabular-nums">
                    ₹{formatRupees(Math.abs(formSpread))}
                    {formSpread <= 0 && " (negative)"}
                  </span>
                </div>
              )}
            </div>

            <div className="px-6 py-4 border-t border-silver-200 flex justify-end gap-3">
              <button type="button" className="btn-secondary" onClick={() => setFormOpen(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving..." : isToday ? "Update Rates" : "Publish Rates"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
