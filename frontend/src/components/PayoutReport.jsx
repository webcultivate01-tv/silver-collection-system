// The payout report: what the customer had, today's rate, the silver coin they
// are being given, and what stays in their account.
//
// No money changes hands. The rupee figure here is what the coin is WORTH at
// the rate published that day - recorded so both sides know what was handed
// over and so the day can be reconciled. It is never called a payment, and the
// customer is never told they were paid anything. They were given a coin.
//
// This is the piece of paper the admin reads before handing it over and the
// customer signs afterwards, so it is deliberately plain and deliberately
// dumb. Every figure comes from the server's report object exactly as sent -
// nothing here adds, subtracts or re-rounds anything. If this component did
// its own arithmetic, the weight the customer signs for and the weight the
// ledger records could differ by a rounding step, and neither of them would
// have any way to tell which one was real.
//
// The report's `reference` is deliberately not printed anywhere on it. It is a
// machine key: the report issues one, the handover spends it, and the database
// refuses a second handover carrying the same one - which is what makes a
// double click harmless. Nobody reads it, quotes it or types it, so putting a
// UUID in front of a customer would only be noise on the page they sign.
//
// It renders in two states, and the difference matters:
//
//   proposal  before the handover. The figures are a quote, and the screen
//             says so - nothing has moved yet.
//   receipt   the same report after the coin was given. The silver is off the
//             account; this is the record of it.

import { formatDate, formatDateTime, formatRupees } from "../utils/format.js";
import { downloadCsvReport, reportFileName } from "../utils/reportDownload.js";
import { IconAlert, IconCheck, IconDownload, IconPrint } from "./Icons.jsx";

// The report as rows, for the CSV and the printout. Built once so the file the
// admin keeps and the card they read can never say different things.
function reportRows(report) {
  const rows = [
    ["Customer", report.customer.name],
    ["Mobile", report.customer.mobile ? `+91 ${report.customer.mobile}` : "—"],
    ["Email", report.customer.email || "—"],
    ["Registered by", report.customer.employeeName || "—"],
    ["Payout date", formatDate(report.payoutDate)],
    [
      "Silver rate (per gram)",
      `₹${formatRupees(report.rate.ratePerGram)}${
        report.rate.isToday ? " (today)" : ` (published ${formatDate(report.rate.rateDate)})`
      }`,
    ],
    ["Silver held before", report.before.gramsLabel],
    ["Value of holding at this rate", `₹${formatRupees(report.before.value)}`],
    ["Given to customer", "Silver coin"],
    ["Weight of the coin", report.payout.gramsLabel],
    ["Value of the coin at this rate", `₹${formatRupees(report.payout.value)}`],
    ["Silver remaining in account", report.after.gramsLabel],
    ["Value of remaining silver", `₹${formatRupees(report.after.value)}`],
    ["Cash paid", "None — settled in silver"],
  ];

  return rows.map(([field, value]) => ({ field, value }));
}

const REPORT_COLUMNS = [
  { key: "field", label: "Detail" },
  { key: "value", label: "Value" },
];

// The printed version. Its own window rather than a print stylesheet on the
// page, matching how every other report in this app prints.
function printReport(report, { paid }) {
  const printWindow = window.open("", "_blank", "width=820,height=1000");

  if (!printWindow) {
    window.alert("Please allow pop-ups for this site to print the payout report.");
    return;
  }

  const escape = (value) =>
    String(value ?? "").replace(
      /[&<>"']/g,
      (character) =>
        ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
    );

  const rows = reportRows(report)
    .map((row) => `<tr><th>${escape(row.field)}</th><td>${escape(row.value)}</td></tr>`)
    .join("");

  const html = `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>Silver Coin Payout ${escape(report.customer.name)}</title>
<style>
  * { box-sizing: border-box; }
  body { margin: 0; padding: 32px; font-family: "Segoe UI", Arial, sans-serif; color: #1f2937; font-size: 13px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #6b7280; font-size: 12px; margin-bottom: 4px; }
  .status { display: inline-block; margin: 10px 0 18px; padding: 4px 10px; border-radius: 999px;
            font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .05em; }
  .paid { background: #dcfce7; color: #166534; }
  .quote { background: #fef9c3; color: #854d0e; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; }
  th, td { border: 1px solid #d1d5db; padding: 8px 10px; text-align: left; vertical-align: top; }
  th { background: #f3f4f6; font-weight: 600; width: 45%; }
  td { font-variant-numeric: tabular-nums; }
  .totals { display: flex; gap: 16px; margin-bottom: 18px; }
  .totals div { flex: 1; border: 1px solid #d1d5db; border-radius: 6px; padding: 10px 12px; }
  .totals span { display: block; font-size: 10px; text-transform: uppercase; letter-spacing: .05em; color: #6b7280; }
  .totals strong { display: block; font-size: 17px; margin-top: 3px; font-variant-numeric: tabular-nums; }
  .note { border: 1px solid #d1d5db; border-left: 3px solid #6b7280; border-radius: 4px;
          padding: 8px 12px; margin-bottom: 18px; color: #4b5563; font-size: 11px; }
  .sign { margin-top: 42px; display: flex; gap: 60px; }
  .sign div { flex: 1; border-top: 1px solid #9ca3af; padding-top: 6px; font-size: 11px; color: #6b7280; }
  footer { margin-top: 22px; border-top: 1px solid #d1d5db; padding-top: 8px; color: #6b7280; font-size: 10px; }
  @page { margin: 14mm; }
  @media print { body { padding: 0; } }
</style>
</head>
<body>
  <h1>Silver Coin ${paid ? "Receipt" : "Payout Report"}</h1>
  <div class="sub">${escape(report.customer.name)} · ${escape(formatDate(report.payoutDate))}</div>
  <div class="status ${paid ? "paid" : "quote"}">
    ${paid ? "Coin given" : "Quotation — coin not yet given"}
  </div>

  <div class="totals">
    <div><span>Silver held before</span><strong>${escape(report.before.gramsLabel)}</strong></div>
    <div><span>Coin given</span><strong>${escape(report.payout.gramsLabel)}</strong></div>
    <div><span>Remaining in account</span><strong>${escape(report.after.gramsLabel)}</strong></div>
  </div>

  <div class="note">
    Settled in silver. The customer received a silver coin of ${escape(
      report.payout.gramsLabel
    )}, valued at ₹${escape(
    formatRupees(report.payout.value)
  )} at that day's rate. No cash was paid.
  </div>

  <table><tbody>${rows}</tbody></table>

  <div class="sign">
    <div>Customer signature — coin received</div>
    <div>Authorised signatory</div>
  </div>

  <footer>
    Generated ${escape(formatDateTime(report.generatedAt))}
  </footer>

  <script>
    window.addEventListener("load", function () { window.focus(); window.print(); });
  <\/script>
</body>
</html>`;

  printWindow.document.write(html);
  printWindow.document.close();
}

// One line of the report, sized so the three that matter can be read at a
// glance without hunting through the detail table.
function Headline({ label, value, sub, tone = "" }) {
  return (
    <div className="min-w-0 flex-1">
      <div className="text-[11px] font-semibold uppercase tracking-wider text-silver-500">
        {label}
      </div>
      <div className={`mt-1 truncate text-2xl font-bold tabular-nums ${tone || "text-silver-900"}`}>
        {value}
      </div>
      {sub && <div className="mt-0.5 text-xs text-silver-500 tabular-nums">{sub}</div>}
    </div>
  );
}

function Line({ label, value, strong = false }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-2">
      <dt className="text-sm text-silver-500">{label}</dt>
      <dd
        className={`text-right text-sm tabular-nums ${
          strong ? "font-semibold text-silver-900" : "text-silver-700"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function PayoutReport({ report, paid = false, children }) {
  if (!report) return null;

  function handleCsv() {
    downloadCsvReport({
      fileName: reportFileName(
        `silver_coin_payout_${report.customer.name.replace(/\s+/g, "_").toLowerCase()}`
      ),
      title: `Silver Coin ${paid ? "Receipt" : "Payout Report"}`,
      columns: REPORT_COLUMNS,
      rows: reportRows(report),
      meta: [
        ["Customer", report.customer.name],
        ["Status", paid ? "Coin given" : "Quotation - coin not yet given"],
      ],
    });
  }

  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title">
          {paid ? (
            <>
              <IconCheck className="mr-2 inline h-4 w-4 text-emerald-600" />
              Coin Receipt
            </>
          ) : (
            "Payout Report"
          )}
        </h2>
        <div className="flex items-center gap-2">
          <button onClick={handleCsv} className="btn-secondary btn-sm" type="button">
            <IconDownload className="h-3.5 w-3.5" />
            CSV
          </button>
          <button
            onClick={() => printReport(report, { paid })}
            className="btn-secondary btn-sm"
            type="button"
          >
            <IconPrint className="h-3.5 w-3.5" />
            Print
          </button>
        </div>
      </div>

      {/* Until the handover is confirmed, nothing has moved. Saying that in as
          many words is the difference between a quote and a receipt, and it is
          the one thing on this card that must not be mistaken. */}
      {!paid && (
        <div className="flex items-start gap-2.5 border-b border-amber-200 bg-amber-50 px-6 py-3 text-sm text-amber-800">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            The coin has not been given yet. These are the figures the handover will be recorded
            with — check them, then confirm below.
          </span>
        </div>
      )}

      <div className="card-body space-y-5">
        <div className="flex flex-wrap gap-x-8 gap-y-4">
          <Headline
            label="Silver held"
            value={report.before.gramsLabel}
            sub={`Worth ₹${formatRupees(report.before.value)}`}
          />
          <Headline
            label={paid ? "Coin given" : "Coin to give"}
            value={report.payout.gramsLabel}
            sub={`Worth ₹${formatRupees(report.payout.value)} at ₹${formatRupees(
              report.payout.ratePerGram
            )} per gram`}
            tone="text-brand-600"
          />
          <Headline
            label="Stays in account"
            value={report.after.gramsLabel}
            sub={
              report.after.clearsAccount
                ? "This empties the account"
                : `Worth ₹${formatRupees(report.after.value)}`
            }
          />
        </div>

        {/* The whole point of this screen, said once, plainly. The rupee
            figures above are a valuation; nobody is owed them. */}
        <div className="rounded-lg border border-silver-200 bg-silver-50 px-4 py-3 text-sm text-silver-600">
          <span className="font-semibold text-silver-900">Settled in silver.</span> The customer
          receives a silver coin of {report.payout.gramsLabel}, not cash. The rupee figures show
          what that coin is worth at the rate below.
        </div>

        {/* The rate this whole report is valued at. Flagged when it isn't
            today's, because valuing a coin at yesterday's rate is a decision,
            not a detail. */}
        {!report.rate.isToday && (
          <div className="alert-info flex items-start gap-2.5">
            <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>
              This is the rate published on {formatDate(report.rate.rateDate)}, not today's. The
              coin will be valued at it unless you publish today's rate and generate the report
              again.
            </span>
          </div>
        )}

        <dl className="divide-y divide-silver-100 rounded-lg border border-silver-200 px-4">
          <Line label="Customer" value={report.customer.name} strong />
          <Line
            label="Mobile"
            value={report.customer.mobile ? `+91 ${report.customer.mobile}` : "—"}
          />
          <Line label="Registered by" value={report.customer.employeeName || "—"} />
          <Line label="Payout date" value={formatDate(report.payoutDate)} />
          <Line
            label="Silver rate (per gram)"
            value={`₹${formatRupees(report.rate.ratePerGram)}`}
          />
          <Line label="Silver held before" value={report.before.gramsLabel} strong />
          <Line label="Given to customer" value="Silver coin" />
          <Line label="Weight of the coin" value={report.payout.gramsLabel} strong />
          <Line
            label="Value of the coin at this rate"
            value={`₹${formatRupees(report.payout.value)}`}
          />
          <Line label="Silver remaining in account" value={report.after.gramsLabel} strong />
          <Line label="Cash paid" value="None — settled in silver" />
        </dl>

        <p className="text-[11px] text-silver-400">
          Generated {formatDateTime(report.generatedAt)}
        </p>

        {children}
      </div>
    </div>
  );
}
