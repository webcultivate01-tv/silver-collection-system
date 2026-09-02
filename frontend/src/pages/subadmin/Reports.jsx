// Sub-admin's download centre - every report the main admin can generate, each
// downloadable as CSV or PDF from one place.
//
// The grid is ReportCenterGrid, the same component admin/Reports.jsx renders,
// so the two pages cannot drift apart: a card the admin gets is a card the
// sub-admin gets, filters and all. Only the heading differs.
//
// Every endpoint behind those cards is a GET the sub-admin's token already
// reaches (panelReadAccess): employees, silver-rates, users (Aadhaar-masked
// list only), settlements, purchases and collections.

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
