// Sub-admin silver rate report: the published rate history with the same
// day-search the admin page has, and no way to publish or change a rate.

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { fetchReportSummary, fetchSilverRateReport } from "../../store/reportsSlice.js";
import { buildSilverRateReport } from "../../utils/reportBuilders.js";
import ReportDownloadButtons from "../../components/ReportDownloadButtons.jsx";
import RateFigure from "../../components/RateFigure.jsx";
import { formatDate, formatRupees } from "../../utils/format.js";
import { IconEye, IconSearch } from "../../components/Icons.jsx";

export default function SilverRateReport() {
  const dispatch = useDispatch();
  const { rates, ratesLoading, summary, error } = useSelector((state) => state.reports);

  const [search, setSearch] = useState("");

  useEffect(() => {
    dispatch(fetchReportSummary());
  }, [dispatch]);

  // Debounced so typing doesn't fire a request per keystroke.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchSilverRateReport({ search })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, search]);

  const report = buildSilverRateReport(rates, { search });

  const latest = summary?.rate || null;
  const change = summary?.change ?? null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-silver-900">Silver Rate Report</h1>
          <p className="mt-1 text-sm text-silver-500">
            The buying and selling rate published each day, per gram.
          </p>
        </div>

        <ReportDownloadButtons report={report} />
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Latest published rate */}
      <div className="card overflow-hidden">
        <div className="bg-gradient-to-r from-silver-800 to-silver-900 px-6 py-6 text-white">
          <div className="text-xs font-semibold uppercase tracking-wider text-white/60">
            Latest Published Rates
          </div>

          {latest ? (
            <>
              <div className="mt-3 flex flex-wrap items-start gap-x-12 gap-y-5">
                <RateFigure label="Buying Rate" value={latest.buyRatePerGram} change={change?.buy} />
                <div className="hidden self-stretch w-px bg-white/15 sm:block" />
                <RateFigure
                  label="Selling Rate"
                  value={latest.sellRatePerGram}
                  change={change?.sell}
                />
              </div>

              <div className="mt-4 text-xs text-white/60">
                Published {formatDate(latest.rateDate)}
              </div>
            </>
          ) : (
            <p className="mt-3 text-sm text-white/70">No rate has been published yet.</p>
          )}
        </div>
      </div>

      {/* History */}
      <div className="card overflow-hidden">
        <div className="card-header flex-col items-stretch gap-3 sm:flex-row sm:items-center">
          <h2 className="card-title">Rate History</h2>

          <div className="flex items-center gap-3">
            <div className="relative w-full sm:w-72">
              <IconSearch className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-silver-400" />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="input pl-9"
                placeholder="Search a day's rate, e.g. 10 Aug"
              />
            </div>

            <span className="badge-neutral hidden sm:inline-flex">
              <IconEye className="w-3.5 h-3.5" />
              Read-only
            </span>
          </div>
        </div>

        {ratesLoading && rates.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">Loading report...</div>
        ) : rates.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">
            {search ? `No rate found for “${search}”` : "No rates recorded yet"}
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
                {rates.map((entry) => (
                  <tr key={entry.id} className="hover:bg-silver-50/70 transition-colors">
                    <td className="table-cell font-medium text-silver-900">
                      {formatDate(entry.rateDate)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      ₹{formatRupees(entry.buyRatePerGram)}
                    </td>
                    <td className="table-cell text-right tabular-nums">
                      ₹{formatRupees(entry.sellRatePerGram)}
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
