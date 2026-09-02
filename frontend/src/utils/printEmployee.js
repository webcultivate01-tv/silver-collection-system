// Builds a printable one-page record of a single employee and sends it to the
// printer. It renders into its own window rather than print-styling the admin
// page, so the sidebar, buttons and dialogs can't end up on the paper.

import { documentUrl } from "../components/DocumentUpload.jsx";
import { formatAadhaar, formatDate, formatDateTime } from "./format.js";

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

function row(label, value) {
  const text = value === 0 || value ? escapeHtml(value) : "—";
  return `<tr><th>${escapeHtml(label)}</th><td>${text}</td></tr>`;
}

function documentCard(label, path) {
  const body = path
    ? `<img src="${escapeHtml(documentUrl(path))}" alt="${escapeHtml(label)}" />`
    : `<div class="missing">Not uploaded</div>`;
  return `<figure>${body}<figcaption>${escapeHtml(label)}</figcaption></figure>`;
}

function statusOf(employee) {
  if (employee.is_blocked) return "Blocked";
  if (employee.must_change_password) return "Pending password setup";
  return "Active";
}

export function printEmployee(employee) {
  if (!employee) return;

  const printWindow = window.open("", "_blank", "width=900,height=1000");

  if (!printWindow) {
    window.alert("Please allow pop-ups for this site to print the employee record.");
    return;
  }

  const documents = [
    ["Profile photo", employee.profile_photo],
    ["Aadhaar card — Front", employee.aadhaar_front],
    ["Aadhaar card — Back", employee.aadhaar_back],
    ["PAN card — Front", employee.pan_front],
  ];

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(employee.full_name)} — Employee Record</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    padding: 32px;
    font-family: "Segoe UI", Arial, sans-serif;
    color: #1f2937;
    font-size: 13px;
  }
  header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 24px;
    border-bottom: 2px solid #111827;
    padding-bottom: 14px;
  }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #6b7280; font-size: 12px; }
  .code {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: .06em;
    white-space: nowrap;
  }
  h2 {
    font-size: 12px;
    text-transform: uppercase;
    letter-spacing: .08em;
    color: #6b7280;
    margin: 26px 0 10px;
  }
  table { width: 100%; border-collapse: collapse; }
  th, td {
    border: 1px solid #d1d5db;
    padding: 7px 10px;
    text-align: left;
    vertical-align: top;
  }
  th { width: 34%; background: #f3f4f6; font-weight: 600; }
  .docs {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
  }
  figure { margin: 0; border: 1px solid #d1d5db; padding: 8px; }
  figure img { width: 100%; height: 130px; object-fit: contain; display: block; }
  .missing {
    height: 130px;
    display: flex;
    align-items: center;
    justify-content: center;
    color: #9ca3af;
    background: #f9fafb;
    font-size: 11px;
  }
  figcaption { margin-top: 6px; font-size: 11px; color: #374151; text-align: center; }
  footer { margin-top: 26px; border-top: 1px solid #d1d5db; padding-top: 8px; color: #6b7280; font-size: 11px; }
  @page { margin: 14mm; }
  @media print {
    body { padding: 0; }
    figure, table { break-inside: avoid; }
  }
</style>
</head>
<body>
  <header>
    <div>
      <h1>${escapeHtml(employee.full_name)}</h1>
      <div class="sub">Shiv Shakti Silver · Employee Record</div>
    </div>
    <div class="code">${escapeHtml(employee.employee_code || "")}</div>
  </header>

  <h2>Employee Details</h2>
  <table>
    ${row("Employee ID", employee.employee_code)}
    ${row("First Name", employee.first_name)}
    ${row("Last Name", employee.last_name)}
    ${row("Mobile Number", employee.mobile ? `+91 ${employee.mobile}` : "")}
    ${row("Alternate Mobile", employee.alternate_mobile ? `+91 ${employee.alternate_mobile}` : "")}
    ${row("Email", employee.email)}
    ${row("Date of Birth", formatDate(employee.date_of_birth))}
    ${row("Age", employee.age ? `${employee.age} years` : "")}
    ${row("Aadhaar Number", formatAadhaar(employee.aadhaar_number))}
    ${row("PAN Number", employee.pan_number)}
    ${row("Address", employee.address)}
    ${row("Account Status", statusOf(employee))}
    ${row("Registered On", formatDateTime(employee.created_at))}
    ${employee.is_blocked ? row("Blocked On", formatDateTime(employee.blocked_at)) : ""}
    ${row("Document Folder", employee.folder_name ? `/uploads/employees/${employee.folder_name}` : "")}
  </table>

  <h2>Documents</h2>
  <div class="docs">
    ${documents.map(([label, path]) => documentCard(label, path)).join("")}
  </div>

  <footer>Printed on ${escapeHtml(formatDateTime(new Date()))}</footer>

  <script>
    // Wait for the document scans to arrive, otherwise they print as blanks.
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
