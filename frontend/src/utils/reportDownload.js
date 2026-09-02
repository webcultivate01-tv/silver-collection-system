// Turns a report table into a file the user can keep.
//
// Two formats, both built in the browser from data that is already on screen -
// no extra dependency and, more importantly, no new API call, so downloading a
// report can never turn into a write.
//
//   CSV  - saved straight to disk; opens in Excel / Google Sheets.
//   PDF  - rendered into its own window and handed to the print dialog, where
//          "Save as PDF" produces the file. Same approach as the existing
//          employee record printout.
//
// A report is described once and both formats read from it:
//   columns: [{ key: "email", label: "Email", align: "right" }]
//   rows:    [{ email: "a@b.com", ... }]  - values already formatted for display

const CSV_MIME = "text/csv;charset=utf-8;";

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

// "—" is a nice dash on screen but noise in a spreadsheet.
function cellValue(row, column) {
  const value = row[column.key];
  if (value === null || value === undefined || value === "—") return "";
  return String(value);
}

function timestampSuffix() {
  const now = new Date();
  const pad = (part) => String(part).padStart(2, "0");
  return (
    `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}` +
    `_${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

export function reportFileName(baseName) {
  return `${baseName}_${timestampSuffix()}`;
}

function triggerDownload(blob, fileName) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Give the browser a moment to start the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// A cell starting with '=', '@', '+' or '-' can be read as a formula by Excel,
// so those get a leading quote that stops it being evaluated.
//
// '+' and '-' are only escaped when what follows isn't plainly a number: that
// keeps "+91 9876543210" readable (a phone number Excel can't evaluate anyway)
// while still catching "+SUM(...)" and the "-2+3+cmd|..." DDE trick.
const NUMBER_LIKE = /^[+-][\d\s.-]*$/;

function looksLikeFormula(text) {
  if (/^[=@]/.test(text)) return true;
  return /^[+-]/.test(text) && !NUMBER_LIKE.test(text);
}

// Quotes inside a field are doubled, per RFC 4180.
function csvField(value) {
  const text = String(value ?? "");
  const safe = looksLikeFormula(text) ? `'${text}` : text;
  return `"${safe.replace(/"/g, '""')}"`;
}

export function downloadCsvReport({ fileName, title = "", columns, rows, meta = [] }) {
  const lines = [];

  if (title) lines.push(csvField(title));
  meta.forEach(([label, value]) => lines.push(`${csvField(label)},${csvField(value)}`));
  if (title || meta.length) lines.push("");

  lines.push(columns.map((column) => csvField(column.label)).join(","));
  rows.forEach((row) => {
    lines.push(columns.map((column) => csvField(cellValue(row, column))).join(","));
  });

  // The BOM is what makes Excel read ₹ and other non-ASCII characters
  // correctly. Written as an escape so it survives any editor that would
  // otherwise strip an invisible character from the source.
  const blob = new Blob([`﻿${lines.join("\r\n")}`], { type: CSV_MIME });
  triggerDownload(blob, `${fileName}.csv`);
}

export function downloadPdfReport({ title, columns, rows, meta = [] }) {
  const printWindow = window.open("", "_blank", "width=1000,height=1000");

  if (!printWindow) {
    window.alert("Please allow pop-ups for this site to download the report as a PDF.");
    return;
  }

  const metaHtml = meta
    .map(
      ([label, value]) =>
        `<div><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`
    )
    .join("");

  const headHtml = columns
    .map(
      (column) =>
        `<th class="${column.align === "right" ? "right" : ""}">${escapeHtml(column.label)}</th>`
    )
    .join("");

  const bodyHtml = rows.length
    ? rows
        .map(
          (row) =>
            `<tr>${columns
              .map(
                (column) =>
                  `<td class="${column.align === "right" ? "right" : ""}">${escapeHtml(
                    row[column.key] ?? "—"
                  )}</td>`
              )
              .join("")}</tr>`
        )
        .join("")
    : `<tr><td class="empty" colspan="${columns.length}">No records matched this report.</td></tr>`;

  const printedOn = new Date().toLocaleString("en-IN", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(title)}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 28px;
    font-family: "Segoe UI", Arial, sans-serif;
    color: #1f2937;
    font-size: 12px;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    gap: 10px 28px;
    margin: 0 0 18px;
  }
  .meta div { font-size: 11px; color: #6b7280; }
  .meta strong { display: block; font-size: 13px; color: #111827; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { border: 1px solid #d1d5db; padding: 6px 9px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; }
  tbody tr:nth-child(even) td { background: #fafafa; }
  .right { text-align: right; }
  .empty { text-align: center; color: #9ca3af; padding: 24px; }
  footer { margin-top: 20px; border-top: 1px solid #d1d5db; padding-top: 8px; color: #6b7280; font-size: 10px; }
  @page { margin: 12mm; }
  @media print {
    body { padding: 0; }
    thead { display: table-header-group; }
    tr { break-inside: avoid; }
  }
</style>
</head>
<body>
  ${metaHtml ? `<div class="meta">${metaHtml}</div>` : ""}

  <table>
    <thead><tr>${headHtml}</tr></thead>
    <tbody>${bodyHtml}</tbody>
  </table>

  <footer>Generated on ${escapeHtml(printedOn)} · ${rows.length} record(s)</footer>

  <script>
    window.addEventListener("load", function () {
      window.focus();
      window.print();
    });
  <\/script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}
