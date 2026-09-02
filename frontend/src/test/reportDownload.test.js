// Downloaded reports.
//
// Two reasons this is worth testing carefully. The CSV is opened in Excel by
// people who did not create it, so a cell that Excel treats as a formula is a
// code-execution path into an admin's machine. And the PDF is the one place in
// the app where HTML is built by hand from user-supplied values rather than
// rendered by React, so it is the only place stored XSS could land.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { downloadCsvReport, downloadPdfReport, reportFileName } from "../utils/reportDownload.js";

// Capture what would have been written to disk instead of writing it.
let lastBlobText = "";
let lastFileName = "";

beforeEach(() => {
  lastBlobText = "";
  lastFileName = "";

  global.URL.createObjectURL = vi.fn((blob) => {
    // Blob.text() is async; the code revokes the URL on a timer, so read the
    // parts synchronously from the Blob we were handed.
    lastBlobText = blob.__parts.join("");
    return "blob:mock";
  });
  global.URL.revokeObjectURL = vi.fn();

  // jsdom's Blob does not expose its parts, so wrap it.
  const RealBlob = global.Blob;
  global.Blob = class extends RealBlob {
    constructor(parts, options) {
      super(parts, options);
      this.__parts = parts;
    }
  };

  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function () {
    lastFileName = this.download;
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const COLUMNS = [
  { key: "name", label: "Name" },
  { key: "amount", label: "Amount", align: "right" },
];

function csvFor(rows, extra = {}) {
  downloadCsvReport({ fileName: "test-report", columns: COLUMNS, rows, ...extra });
  return lastBlobText;
}

describe("CSV structure", () => {
  it("writes a header row and one row per record", () => {
    const csv = csvFor([
      { name: "Ramesh Sharma", amount: "1,000.00" },
      { name: "Priya Nair", amount: "2,500.00" },
    ]);

    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[0]).toBe('"Name","Amount"');
    expect(lines[1]).toBe('"Ramesh Sharma","1,000.00"');
    expect(lines).toHaveLength(3);
  });

  it("starts with a BOM so Excel reads the rupee sign correctly", () => {
    const csv = csvFor([{ name: "Ramesh", amount: "₹1,000" }]);
    expect(csv.charCodeAt(0)).toBe(0xfeff);
    expect(csv).toContain("₹1,000");
  });

  it("doubles embedded quotes, per RFC 4180", () => {
    const csv = csvFor([{ name: 'Ramesh "Ram" Sharma', amount: "1" }]);
    expect(csv).toContain('"Ramesh ""Ram"" Sharma"');
  });

  it("keeps a comma inside a field from splitting the row", () => {
    const csv = csvFor([{ name: "Sharma, Ramesh", amount: "1" }]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[1]).toBe('"Sharma, Ramesh","1"');
  });

  it("writes an em dash and a missing value as empty, not as text", () => {
    const csv = csvFor([{ name: "—", amount: null }]);
    const lines = csv.replace(/^﻿/, "").trim().split("\r\n");
    expect(lines[1]).toBe('"",""');
  });

  it("includes the title and meta rows when given", () => {
    const csv = csvFor([{ name: "A", amount: "1" }], {
      title: "Employee Report",
      meta: [["Generated", "23 Aug 2026"]],
    });

    expect(csv).toContain('"Employee Report"');
    expect(csv).toContain('"Generated","23 Aug 2026"');
  });

  it("stamps the file name with a timestamp", () => {
    csvFor([{ name: "A", amount: "1" }]);
    expect(lastFileName).toMatch(/^test-report\.csv$/);
    expect(reportFileName("employee-report")).toMatch(/^employee-report_\d{4}-\d{2}-\d{2}_\d{4}$/);
  });
});

describe("CSV formula injection", () => {
  it("neutralises the four dangerous leading characters", () => {
    const csv = csvFor([
      { name: "=1+1", amount: "1" },
      { name: "@SUM(A1)", amount: "1" },
      { name: "+SUM(A1)", amount: "1" },
      { name: "-2+3+cmd|'/c calc'!A1", amount: "1" },
    ]);

    // A leading apostrophe stops Excel evaluating the cell.
    expect(csv).toContain(`"'=1+1"`);
    expect(csv).toContain(`"'@SUM(A1)"`);
    expect(csv).toContain(`"'+SUM(A1)"`);
    expect(csv).toContain(`"'-2+3+cmd|'/c calc'!A1"`);
  });

  it("catches the classic DDE payload in a customer name", () => {
    const csv = csvFor([{ name: `=cmd|'/c calc'!A1`, amount: "1" }]);
    expect(csv).toContain(`"'=cmd`);
  });

  it("leaves a phone number readable", () => {
    // The reason the guard exempts number-like values: "+91 9876543210" is not
    // something Excel can evaluate, and quoting it would look like a bug.
    const csv = csvFor([{ name: "+91 9876543210", amount: "1" }]);
    expect(csv).toContain('"+91 9876543210"');
    expect(csv).not.toContain(`"'+91`);
  });

  it("leaves a negative rate change readable", () => {
    const csv = csvFor([{ name: "Change", amount: "-2.50" }]);
    expect(csv).toContain('"-2.50"');
  });

  // KNOWN DEFECT (BUG-23). The guard anchors on the very first character, so a
  // value with leading whitespace slips past - and several spreadsheet
  // programs trim before evaluating. `address` is only length-checked, so a
  // value like this can be stored.
  it("does NOT catch a payload behind leading whitespace", () => {
    const csv = csvFor([
      { name: "\t=1+1", amount: "1" },
      { name: " =1+1", amount: "1" },
    ]);

    expect(csv).toContain('"\t=1+1"');
    expect(csv).not.toContain(`"'\t=1+1"`); // should have been quoted
    expect(csv).toContain('" =1+1"');
  });
});

describe("PDF rendering", () => {
  let written;
  let printWindow;

  beforeEach(() => {
    written = "";
    printWindow = {
      document: {
        write: (html) => {
          written += html;
        },
        close: vi.fn(),
      },
      focus: vi.fn(),
      print: vi.fn(),
      close: vi.fn(),
      onload: null,
    };
    vi.spyOn(window, "open").mockReturnValue(printWindow);
  });

  it("escapes HTML in every cell, so a stored payload cannot execute", () => {
    downloadPdfReport({
      title: "Employee Report",
      columns: COLUMNS,
      rows: [{ name: '<img src=x onerror="alert(1)">', amount: "1" }],
    });

    expect(written).not.toContain("<img src=x");
    expect(written).toContain("&lt;img src=x");
    expect(written).toContain("&quot;");
  });

  it("escapes the title and the column labels too", () => {
    downloadPdfReport({
      title: "<script>alert(1)</script>",
      columns: [{ key: "name", label: "<b>Name</b>" }],
      rows: [{ name: "A" }],
    });

    expect(written).not.toContain("<script>alert(1)</script>");
    expect(written).toContain("&lt;script&gt;");
    expect(written).toContain("&lt;b&gt;Name&lt;/b&gt;");
  });

  it("escapes the meta rows", () => {
    downloadPdfReport({
      title: "R",
      columns: COLUMNS,
      rows: [{ name: "A", amount: "1" }],
      meta: [["<i>Filter</i>", "<svg onload=alert(1)>"]],
    });

    expect(written).not.toContain("<svg onload");
    expect(written).toContain("&lt;svg onload");
  });

  it("renders an explicit empty state rather than a blank table", () => {
    downloadPdfReport({ title: "R", columns: COLUMNS, rows: [] });

    expect(written).toContain("No records matched this report.");
    expect(written).toContain(`colspan="2"`);
  });

  it("warns instead of failing silently when pop-ups are blocked", () => {
    window.open.mockReturnValue(null);
    const alertSpy = vi.spyOn(window, "alert").mockImplementation(() => {});

    downloadPdfReport({ title: "R", columns: COLUMNS, rows: [] });

    expect(alertSpy).toHaveBeenCalledWith(expect.stringMatching(/pop-ups/i));
  });
});
