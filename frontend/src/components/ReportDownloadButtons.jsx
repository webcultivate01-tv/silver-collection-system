// The download control used on every sub-admin report.
//
// It takes the report the page is already showing - same columns, same rows,
// same filters - so what you download is exactly what you see.

import {
  downloadCsvReport,
  downloadPdfReport,
  reportFileName,
} from "../utils/reportDownload.js";
import { IconDownload, IconPrint } from "./Icons.jsx";

export default function ReportDownloadButtons({ report, size = "" }) {
  const empty = report.rows.length === 0;
  const buttonSize = size === "sm" ? "btn-sm" : "";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        onClick={() => downloadCsvReport({ ...report, fileName: reportFileName(report.fileName) })}
        disabled={empty}
        className={`btn-primary ${buttonSize}`}
        title={empty ? "There is nothing to download yet" : "Download this report as a CSV file"}
      >
        <IconDownload className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
        Download CSV
      </button>

      <button
        onClick={() => downloadPdfReport(report)}
        disabled={empty}
        className={`btn-secondary ${buttonSize}`}
        title={empty ? "There is nothing to download yet" : "Open this report as a printable PDF"}
      >
        <IconPrint className={size === "sm" ? "w-3.5 h-3.5" : "w-4 h-4"} />
        Download PDF
      </button>
    </div>
  );
}
