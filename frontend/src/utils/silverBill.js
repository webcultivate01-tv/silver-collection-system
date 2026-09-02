// The GST tax invoice a customer is handed with their silver coin.
//
// This is the shop's bill, not an internal report: it is laid out to match the
// printed stationery the counter already uses - navy header band, the Bill To
// box, the HSN table, the signature - so a bill printed from the admin panel
// and one written by hand are the same document.
//
// It renders into its own window rather than print-styling the admin page, the
// same way every other printout in this app works, so the sidebar and buttons
// can't end up on the paper.
//
// ---------------------------------------------------------------------------
// Nothing here does arithmetic
// ---------------------------------------------------------------------------
// Every rupee figure on the bill comes out of `report.tax`, which the server
// computed (backend/utils/gst.js) and recorded the payout against. This file
// only formats. That is deliberate: the customer signs this piece of paper, so
// the number on it has to be the number the ledger holds - not one a browser
// worked out again and rounded a step differently.
//
// The coin's value at the published rate is the TAXABLE amount, and CGST 1.5%
// + SGST 1.5% go on top of it. A coin worth 194 bills at 200.

import { formatDate, formatRupees } from "./format.js";
import { BILL, BRAND_NAME, LOGO_URL, SIGNATURE_URL } from "./brand.js";

const NAVY = "#17395e";

function escapeHtml(value) {
  return String(value ?? "").replace(
    /[&<>"']/g,
    (character) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]
  );
}

// Rupees as they appear on a bill: two decimals, no symbol - the column header
// already says what the numbers are.
function money(value) {
  return formatRupees(value);
}

// The bill carries the date and the time separately, because two coins given
// to the same customer on one day are told apart by the clock.
function formatTime(value) {
  if (!value) return "—";
  const when = new Date(value);
  if (Number.isNaN(when.getTime())) return "—";
  return when.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" });
}

// One right-aligned summary line under the item row: label across the first
// three columns, amount in the fourth.
function summaryRow(label, value, { strong = false } = {}) {
  const cls = strong ? ' class="strong"' : "";
  return `<tr${cls}>
            <td colspan="3" class="label">${escapeHtml(label)}</td>
            <td>${escapeHtml(value)}</td>
          </tr>`;
}

export function silverBillHtml(report) {
  const { customer, payout, tax } = report;

  const address = BILL.addressLines.map(escapeHtml).join(" ");

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${escapeHtml(BRAND_NAME)} — Bill ${escapeHtml(report.billNo || "")}</title>
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: "Segoe UI", Arial, sans-serif;
    color: #111827;
    font-size: 13px;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  /* The page inset. It is padding rather than a @page margin on purpose - see
     the @page rule at the bottom - and it is what keeps the frame below off
     the very edge of the paper, where most printers cannot reach. */
  .sheet { width: 210mm; margin: 0 auto; padding: 6mm; }

  /* The hairline the whole bill sits inside. Thinner than the table rules, so
     it reads as the edge of the document rather than another box drawn on it. */
  .frame { border: 1px solid #000; }

  header {
    background: ${NAVY};
    color: #fff;
    display: flex;
    align-items: center;
    gap: 18px;
    padding: 14px 20px 6px;
  }
  header img.logo { height: 78px; width: auto; }
  .identity { flex: 1; text-align: center; }
  .identity h1 { margin: 0 0 4px; font-size: 27px; font-weight: 600; }
  .identity .line { font-size: 12.5px; line-height: 1.45; }
  .gstin { background: ${NAVY}; color: #fff; font-size: 15px; padding: 0 20px 12px; }

  /* Everything below the navy band. The band itself runs the full width of
     the frame, the way it does on the shop's stationery, so the inset lives
     here rather than on the band. */
  .body { padding: 0 10mm 12mm; }

  .meta { display: flex; justify-content: space-between; padding: 28px 4px 14px; }
  .meta div { line-height: 1.6; }

  .billto { border: 1.5px solid #111827; padding: 12px 14px; line-height: 1.7; }

  table { width: 100%; border-collapse: collapse; margin-top: -1.5px; }
  th, td { border: 1.5px solid #111827; padding: 9px 12px; }
  thead th { text-align: center; font-weight: 700; }
  tbody td { text-align: center; font-variant-numeric: tabular-nums; }
  tbody td.label { text-align: right; font-weight: 700; }
  tbody tr.strong td { font-weight: 700; }

  /* The caption belongs under the middle of the scribble, not under the right
     edge of the paper, so the two share one right-aligned box and centre
     inside it. */
  .sign { margin-top: 20px; text-align: right; }
  .signbox { display: inline-block; text-align: center; }
  .signbox img { height: 64px; width: auto; display: block; margin: 0 auto; }
  .signbox .caption { font-size: 13px; margin-top: 2px; }

  .rule { border-top: 2px solid #111827; margin: 16px 0 12px; }
  .thanks { text-align: center; font-size: 21px; }

  /* Margin zero is not cosmetic. The browser prints its own header and footer
     INTO the page margin - the document title and the date across the top, the
     "about:blank" URL and the page number across the bottom. With no margin
     there is nowhere for it to draw them, so they go and the bill is the only
     thing on the paper. The inset the page gives up is put back on .body. */
  @page { size: A4; margin: 0; }
  @media print { .sheet { width: auto; } }
</style>
</head>
<body>
  <div class="sheet">
    <div class="frame">
      <header>
        <img class="logo" src="${escapeHtml(LOGO_URL)}" alt="" />
        <div class="identity">
          <h1>${escapeHtml(BRAND_NAME.toUpperCase())}</h1>
          <div class="line"><strong>Address:</strong> ${address}</div>
          <div class="line">Email: ${escapeHtml(BILL.email)}</div>
          <div class="line">phone: ${escapeHtml(BILL.phone)}</div>
        </div>
      </header>
      <div class="gstin">GSTIN: ${escapeHtml(BILL.gstin)}</div>

      <div class="body">
        <div class="meta">
          <div>Bill No: ${escapeHtml(report.billNo || "—")}</div>
          <div>
            <div>Date: ${escapeHtml(formatDate(report.payoutDate))}</div>
            <div>Time: ${escapeHtml(formatTime(report.generatedAt))}</div>
          </div>
        </div>

        <div class="billto">
          <div>Bill To:</div>
          <div>Customer Name: ${escapeHtml(customer.name)}</div>
          <div>Phone No: ${customer.mobile ? escapeHtml(customer.mobile) : ""}</div>
          <div>Address: ${escapeHtml(customer.address || "")}</div>
        </div>

        <table>
          <thead>
            <tr>
              <th style="width:42%">Title</th>
              <th style="width:16%">HSN</th>
              <th style="width:18%">Qty</th>
              <th style="width:24%">Total Amount</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>${escapeHtml(BILL.itemTitle)}</td>
              <td>${escapeHtml(tax.hsn || BILL.hsn)}</td>
              <td>${escapeHtml(payout.gramsLabel)}</td>
              <td>${escapeHtml(money(tax.taxableAmount))}</td>
            </tr>
            ${summaryRow("Taxable Amount", money(tax.taxableAmount))}
            ${summaryRow(`CGST @ ${tax.cgstRate}%`, money(tax.cgstAmount))}
            ${summaryRow(`SGST @ ${tax.sgstRate}%`, money(tax.sgstAmount))}
            ${summaryRow("GST Include Amount", money(tax.gstIncludeAmount), { strong: true })}
            ${summaryRow("Total Amount", money(tax.totalAmount), { strong: true })}
          </tbody>
        </table>

        <div class="sign">
          <div class="signbox">
            <img src="${escapeHtml(SIGNATURE_URL)}" alt="" />
            <div class="caption">Signature</div>
          </div>
        </div>

        <div class="rule"></div>
        <div class="thanks">THANK YOU, VISIT AGAIN..!</div>
      </div>
    </div>
  </div>

  <script>
    // "load" rather than DOMContentLoaded: the logo and the signature have to
    // have arrived, or the bill prints with two empty boxes where the artwork
    // should be.
    window.addEventListener("load", function () { window.focus(); window.print(); });
  <${"/"}script>
</body>
</html>`;
}

// The window the bill prints into.
//
// Split out because a screen that has to FETCH the bill first - the payout
// history reprints one from the server - must open the window on the click
// itself and fill it in when the bill arrives. A window opened after an await
// is not a window the user asked for as far as the browser is concerned, and
// pop-up blockers stop it.
export function openBillWindow() {
  return window.open("", "_blank", "width=880,height=1040");
}

// Writes the bill into its window and sends it to the printer. Pass a window
// opened earlier on the click; otherwise one is opened here.
export function printSilverBill(report, printWindow) {
  const target = printWindow || openBillWindow();

  if (!target) {
    window.alert("Please allow pop-ups for this site to print the bill.");
    return;
  }

  if (!report || !report.tax) {
    target.close();
    window.alert("This payout has no bill to print.");
    return;
  }

  // open() first, so a caller that put a "preparing the bill" line in the
  // window while it fetched has it cleared rather than printed above the bill.
  target.document.open();
  target.document.write(silverBillHtml(report));
  target.document.close();
}
