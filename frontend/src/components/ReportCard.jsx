// One record type in the report download centre: what it holds, the filters
// that narrow it, how many rows those filters leave, and the two buttons that
// write exactly those rows to a file.
//
// Shared by the admin and sub-admin Reports pages - both grids are built from
// the same card, so a report looks and behaves the same wherever it is read.

import ReportDownloadButtons from "./ReportDownloadButtons.jsx";
import ReportFilters from "./ReportFilters.jsx";

export default function ReportCard({
  icon,
  title,
  description,
  count,
  countLabel,
  loading,
  report,
  filters,
}) {
  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          {icon}
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-silver-900">{title}</h2>
          <p className="mt-0.5 text-sm text-silver-500">{description}</p>
        </div>
      </div>

      {filters && <ReportFilters {...filters} />}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-silver-100 pt-4">
        <div className="text-sm text-silver-500">
          {loading ? (
            "Loading..."
          ) : (
            <>
              <span className="font-semibold tabular-nums text-silver-900">{count}</span>{" "}
              {countLabel}
            </>
          )}
        </div>
        <ReportDownloadButtons report={report} size="sm" />
      </div>
    </div>
  );
}
