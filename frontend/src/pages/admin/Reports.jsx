// Admin's download centre: every record the panel manages, exportable as CSV
// (opens straight in Excel) or PDF, in one place.
//
// Each card fetches its own record type and filters it server-side before
// it's ever turned into a report - the counts on screen, the CSV and the PDF
// are always the same rows. Filters start wide open ("download everything"),
// so a plain download with nothing touched behaves exactly as before.
//
// The cards themselves are ReportCenterGrid, which the sub-admin's Reports
// page renders too; this file is the heading above it.

import ReportCenterGrid from "../../components/ReportCenterGrid.jsx";

export default function Reports() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Reports</h1>
        <p className="mt-1 text-sm text-silver-500">
          Filter each record type below, then download it as a CSV (opens in Excel) or a PDF -
          the file always matches exactly what the filters describe.
        </p>
      </div>

      <ReportCenterGrid />
    </div>
  );
}
