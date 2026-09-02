// The Employee Collection report: type an employee's name, pick a from -> to
// date range, read the total and download exactly those rows.
//
// Two faces over one set of state (useCollectionReport below), so they can
// never disagree about a figure:
//
//   EmployeeCollectionReportCard -> a card in the admin's Reports grid, sized
//                                   and shaped like the cards beside it
//   EmployeeCollectionReport     -> the same report as a page of its own,
//                                   which is how the sub-admin panel shows it
//
// Neither writes anything. Both reach the same two endpoints under
// /api/collections/employees (panelReadAccess allows admin and sub-admin), so
// the totals here can never drift from the admin's Employee Collections
// screen.

import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearCollectionsError,
  clearSelectedCollections,
  fetchCollectionEmployees,
  fetchEmployeeCollections,
} from "../store/collectionsSlice.js";
import { documentUrl } from "./DocumentUpload.jsx";
import ReportDownloadButtons from "./ReportDownloadButtons.jsx";
import { PaymentStatusBadge } from "./PaymentStatusBadge.jsx";
import { buildEmployeeCollectionReport } from "../utils/reportBuilders.js";
import { formatDate, formatRupees, initialsOf } from "../utils/format.js";
import { IconCash, IconClose, IconCollection, IconSearch, IconUsers } from "./Icons.jsx";

const MAX_SUGGESTIONS = 8;

// Something for the download buttons to hold before an employee is picked: no
// rows, so they sit disabled alongside the other cards' buttons rather than
// appearing out of nowhere once a report exists.
const EMPTY_REPORT = {
  fileName: "employee-collections",
  title: "Employee Collections",
  columns: [],
  rows: [],
  meta: [],
};

function Avatar({ name, image, className = "h-9 w-9" }) {
  if (image) {
    return (
      <img
        src={documentUrl(image)}
        alt=""
        className={`${className} shrink-0 rounded-full border border-silver-200 object-cover`}
      />
    );
  }

  return (
    <span
      className={`${className} grid shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700`}
    >
      {initialsOf(name)}
    </span>
  );
}

// What counts as a match while typing: the name first, but a code, an email or
// a mobile finds them too - two people can share a first name, an employee ID
// can't be shared.
function matchesEmployee(employee, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [employee.fullName, employee.employeeCode, employee.email, employee.mobile]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

// Type-ahead over the roster, which is already in memory - so the list narrows
// on the keystroke, with no round trip between typing and seeing. `compact` is
// the card's smaller sizing, matching the filter fields it sits beside.
function EmployeeSuggest({ id, employees, loading, picked, onPick, onClear, compact = false }) {
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const matches = useMemo(
    () => employees.filter((employee) => matchesEmployee(employee, query)),
    [employees, query]
  );

  const showing = open ? matches.slice(0, MAX_SUGGESTIONS) : [];

  // A fresh query means a fresh list, so the highlight goes back to the top
  // rather than staying on whatever row happens to sit at that index.
  useEffect(() => setActive(0), [query]);

  // Cleared from outside - the card's "Clear filters" - so the box stops
  // naming an employee the report no longer shows.
  useEffect(() => {
    if (!picked) setQuery("");
  }, [picked]);

  function choose(employee) {
    setQuery(employee.fullName);
    setOpen(false);
    onPick(employee);
  }

  function handleChange(value) {
    setQuery(value);
    setOpen(true);
    // Editing the name after picking means the choice no longer stands - the
    // report must not keep showing an employee the box no longer names.
    if (picked) onClear();
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }

    if (showing.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((index) => (index + 1) % showing.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((index) => (index - 1 + showing.length) % showing.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(showing[Math.min(active, showing.length - 1)]);
    }
  }

  return (
    <div className="relative">
      <IconSearch
        className={`absolute top-1/2 -translate-y-1/2 text-silver-400 ${
          compact ? "left-2.5 h-3.5 w-3.5" : "left-3 h-4 w-4"
        }`}
      />
      <input
        id={id}
        type="text"
        value={query}
        onChange={(e) => handleChange(e.target.value)}
        onFocus={() => setOpen(true)}
        // Closing on blur would beat the click on a suggestion, so the rows
        // below commit on mousedown instead and this only tidies up after.
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        className={compact ? "input py-1.5 pl-8 pr-7 text-xs" : "input pl-9 pr-9"}
        placeholder={loading ? "Loading employees..." : "Type an employee's name"}
        autoComplete="off"
        role="combobox"
        aria-expanded={showing.length > 0}
        aria-autocomplete="list"
      />

      {query && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setQuery("");
            onClear();
          }}
          className={`absolute top-1/2 -translate-y-1/2 text-silver-400 hover:text-silver-600 ${
            compact ? "right-2.5" : "right-3"
          }`}
          aria-label="Clear the employee"
        >
          <IconClose className={compact ? "h-3 w-3" : "h-4 w-4"} />
        </button>
      )}

      {open && (
        <div className="absolute z-20 mt-1 w-full min-w-[16rem] overflow-hidden rounded-lg border border-silver-200 bg-white shadow-lg">
          {showing.length === 0 ? (
            <div className="px-3 py-3 text-sm text-silver-500">
              {loading ? "Loading employees..." : "No employee matches that name."}
            </div>
          ) : (
            <ul className="max-h-72 overflow-y-auto py-1">
              {showing.map((employee, index) => (
                <li key={employee.id}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(employee);
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={`flex w-full items-center gap-3 px-3 py-2 text-left ${
                      index === active ? "bg-silver-100" : "hover:bg-silver-50"
                    }`}
                  >
                    <Avatar
                      name={employee.fullName}
                      image={employee.profilePhoto}
                      className="h-8 w-8"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-silver-900">
                        {employee.fullName}
                      </span>
                      <span className="block truncate text-xs text-silver-500">
                        {employee.employeeCode || "—"}
                        {employee.mobile ? ` · +91 ${employee.mobile}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-semibold tabular-nums text-silver-700">
                      ₹{formatRupees(employee.summary.totalAmount)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Everything both faces of the report need: the roster for the type-ahead, the
// chosen employee and dates, and what came back for them.
function useCollectionReport() {
  const dispatch = useDispatch();
  const {
    employees,
    employeesLoading,
    employee,
    summary,
    collections,
    appliedFilters,
    detailLoading,
    error,
  } = useSelector((state) => state.collections);

  const [picked, setPicked] = useState(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  // The whole roster comes down once and the type-ahead filters it in memory.
  useEffect(() => {
    dispatch(fetchCollectionEmployees({ status: "all" }));
    return () => {
      dispatch(clearSelectedCollections());
      dispatch(clearCollectionsError());
    };
  }, [dispatch]);

  // Nothing is fetched until an employee is chosen; after that a changed date
  // re-reads the period. Debounced so stepping through a date field doesn't
  // fire a request per keystroke.
  useEffect(() => {
    if (!picked) return undefined;

    const timer = setTimeout(
      () => dispatch(fetchEmployeeCollections({ employeeId: picked.id, from, to })),
      300
    );
    return () => clearTimeout(timer);
  }, [dispatch, picked, from, to]);

  function clearEmployee() {
    setPicked(null);
    dispatch(clearSelectedCollections());
  }

  function clearAll() {
    setFrom("");
    setTo("");
    clearEmployee();
  }

  // The rows on screen are the rows in the file, and the total is carried into
  // the file's header block so a printed copy states it too.
  const report = useMemo(() => {
    if (!employee) return EMPTY_REPORT;
    return buildEmployeeCollectionReport(collections, employee, {
      from,
      to,
      total: summary?.totalAmount ?? 0,
    });
  }, [collections, employee, summary, from, to]);

  const periodLabel =
    from && to
      ? `${formatDate(from)} → ${formatDate(to)}`
      : from
        ? `From ${formatDate(from)}`
        : to
          ? `Up to ${formatDate(to)}`
          : "All time";

  return {
    employees,
    employeesLoading,
    employee,
    summary,
    collections,
    appliedFilters,
    detailLoading,
    error,
    picked,
    setPicked,
    from,
    setFrom,
    to,
    setTo,
    clearEmployee,
    clearAll,
    report,
    periodLabel,
    // Chosen *and* their figures are in - not merely chosen.
    showing: !!picked && !!employee,
  };
}

// The total, big and dark: the one figure the report exists to state, so both
// faces show it the same way and only the size changes.
function TotalPanel({ summary, caption, size = "lg" }) {
  const big = size === "lg";

  return (
    <div
      className={`relative overflow-hidden bg-gradient-to-br from-silver-800 via-silver-900 to-black text-white ${
        big ? "px-6 pb-6 pt-7 sm:px-8 sm:pt-8" : "rounded-lg px-4 py-4"
      }`}
    >
      <IconCash
        className={`pointer-events-none absolute text-white/[0.06] ${
          big ? "-right-4 -top-4 h-28 w-28" : "-right-3 -top-3 h-20 w-20"
        }`}
      />

      <div className="relative flex items-center gap-2 text-[11px] font-semibold uppercase tracking-widest text-white/60">
        <IconCash className="h-3.5 w-3.5" />
        Total collected
      </div>

      <div
        className={`relative mt-1.5 font-extrabold tracking-tight tabular-nums ${
          big ? "text-4xl sm:text-5xl lg:text-6xl" : "text-3xl"
        }`}
      >
        ₹{formatRupees(summary?.totalAmount ?? 0)}
      </div>

      <div className="relative mt-1.5 truncate text-xs text-white/70">{caption}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The card, for the admin's Reports grid
// ---------------------------------------------------------------------------

export function EmployeeCollectionReportCard() {
  const {
    employees,
    employeesLoading,
    employee,
    summary,
    collections,
    detailLoading,
    error,
    picked,
    setPicked,
    from,
    setFrom,
    to,
    setTo,
    clearEmployee,
    clearAll,
    report,
    periodLabel,
    showing,
  } = useCollectionReport();

  return (
    <div className="card flex flex-col gap-4 p-5">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-700">
          <IconCollection className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <h2 className="font-semibold text-silver-900">Employee Collections</h2>
          <p className="mt-0.5 text-sm text-silver-500">
            One employee at a time: what they collected between two dates.
          </p>
        </div>
      </div>

      {/* The same shape as ReportFilters on the cards beside it. The employee
          is typed rather than chosen from a select - a shop can carry more
          names than a dropdown reads well. */}
      <div className="flex flex-wrap items-end gap-2.5 border-b border-silver-100 pb-4">
        <div className="w-full sm:w-48">
          <label
            className="mb-1 block text-xs font-medium text-silver-500"
            htmlFor="collection-card-employee"
          >
            Employee
          </label>
          <EmployeeSuggest
            id="collection-card-employee"
            employees={employees}
            loading={employeesLoading}
            picked={picked}
            onPick={setPicked}
            onClear={clearEmployee}
            compact
          />
        </div>

        {/* From and To wrap as one unit, so the pair never splits over two
            rows in a card this narrow. */}
        <div className="flex w-full min-w-0 gap-2.5 sm:w-auto">
          <div className="w-full min-w-0 sm:w-36">
            <label
              className="mb-1 block text-xs font-medium text-silver-500"
              htmlFor="collection-card-from"
            >
              From
            </label>
            <input
              id="collection-card-from"
              type="date"
              value={from}
              max={to || undefined}
              onChange={(e) => setFrom(e.target.value)}
              className="input py-1.5 text-xs"
            />
          </div>

          <div className="w-full min-w-0 sm:w-36">
            <label
              className="mb-1 block text-xs font-medium text-silver-500"
              htmlFor="collection-card-to"
            >
              To
            </label>
            <input
              id="collection-card-to"
              type="date"
              value={to}
              min={from || undefined}
              onChange={(e) => setTo(e.target.value)}
              className="input py-1.5 text-xs"
            />
          </div>
        </div>

        {(picked || from || to) && (
          <button
            type="button"
            onClick={clearAll}
            className="pb-2 text-xs font-medium text-silver-500 hover:text-silver-800"
          >
            Clear filters
          </button>
        )}
      </div>

      {error && <div className="alert-error text-xs">{error}</div>}

      {showing ? (
        <TotalPanel summary={summary} size="sm" caption={`${employee.fullName} · ${periodLabel}`} />
      ) : (
        <div className="rounded-lg border border-dashed border-silver-300 px-4 py-6 text-center">
          <IconUsers className="mx-auto h-5 w-5 text-silver-400" />
          <p className="mt-2 text-xs text-silver-500">
            {picked
              ? "Loading their collections..."
              : "Type an employee's name to build this report."}
          </p>
        </div>
      )}

      <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-silver-100 pt-4">
        <div className="text-sm text-silver-500">
          {detailLoading ? (
            "Loading..."
          ) : (
            <>
              <span className="font-semibold tabular-nums text-silver-900">
                {showing ? collections.length : 0}
              </span>{" "}
              collections
            </>
          )}
        </div>
        <ReportDownloadButtons report={report} size="sm" />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// The page, for a route of its own
// ---------------------------------------------------------------------------

export default function EmployeeCollectionReport({ title, description }) {
  const {
    employees,
    employeesLoading,
    employee,
    summary,
    collections,
    appliedFilters,
    detailLoading,
    error,
    picked,
    setPicked,
    from,
    setFrom,
    to,
    setTo,
    clearEmployee,
    report,
    periodLabel,
    showing,
  } = useCollectionReport();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">{title}</h1>
        <p className="mt-1 text-sm text-silver-500">{description}</p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* Steps one and two: who, and over what period. */}
      <div className="card">
        <div className="card-body">
          <div className="grid gap-4 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <div>
              <label className="label" htmlFor="collection-page-employee">
                Employee
              </label>
              <EmployeeSuggest
                id="collection-page-employee"
                employees={employees}
                loading={employeesLoading}
                picked={picked}
                onPick={setPicked}
                onClear={clearEmployee}
              />
            </div>

            {/* One cell holding both dates - the period reads as a single
                From-to-To control rather than two stacked fields. */}
            <div className="grid grid-cols-2 gap-4">
              <div className="min-w-0">
                <label className="label" htmlFor="collection-page-from">
                  From date
                </label>
                <input
                  id="collection-page-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="input"
                />
              </div>

              <div className="min-w-0">
                <label className="label" htmlFor="collection-page-to">
                  To date
                </label>
                <input
                  id="collection-page-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="input"
                />
              </div>
            </div>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-silver-100 pt-4">
            <span className="text-sm text-silver-500">
              {showing ? (
                <>
                  <span className="font-medium text-silver-800">{employee.fullName}</span>
                  {" · "}
                  {periodLabel}
                </>
              ) : (
                "Pick an employee to build the report."
              )}
            </span>

            {(from || to) && (
              <button
                onClick={() => {
                  setFrom("");
                  setTo("");
                }}
                className="link-quiet"
              >
                Clear dates
              </button>
            )}

            <div className="ml-auto">
              <ReportDownloadButtons report={report} />
            </div>
          </div>
        </div>
      </div>

      {!showing ? (
        <div className="card py-16 text-center">
          {picked ? (
            // Chosen, but their figures are still on the way - saying "no
            // employee chosen" here would contradict the name in the box.
            <p className="text-sm text-silver-500">Loading {picked.fullName}'s collections...</p>
          ) : (
            <>
              <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-silver-100 text-silver-400">
                <IconUsers className="h-6 w-6" />
              </span>
              <p className="mt-3 text-sm font-medium text-silver-900">No employee chosen yet</p>
              <p className="mt-1 text-sm text-silver-500">
                Start typing a name above and pick from the suggestions.
              </p>
            </>
          )}
        </div>
      ) : (
        <>
          {/* Step three: the figure the whole screen is for. */}
          <div className="card overflow-hidden">
            <TotalPanel
              summary={summary}
              caption={`${employee.fullName}${
                employee.employeeCode ? ` · ${employee.employeeCode}` : ""
              } · ${periodLabel}`}
            />

            <dl className="grid grid-cols-2 gap-4 bg-black px-6 pb-7 pt-1 text-white sm:grid-cols-4 sm:px-8">
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Collections
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">{summary?.collections ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Clients
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">{summary?.clients ?? 0}</dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Silver
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  {summary?.collections ? summary.gramsLabel : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-[11px] font-semibold uppercase tracking-wider text-white/50">
                  Not handed over
                </dt>
                <dd className="mt-1 text-xl font-bold tabular-nums">
                  ₹{formatRupees(summary?.pendingAmount ?? 0)}
                </dd>
              </div>
            </dl>
          </div>

          <div className="card overflow-hidden">
            <div className="card-header">
              <h2 className="card-title">Collections in this period</h2>
              <span className="badge-neutral tabular-nums">{collections.length}</span>
            </div>

            {detailLoading ? (
              <div className="py-14 text-center text-sm text-silver-500">
                Loading collections...
              </div>
            ) : collections.length === 0 ? (
              <div className="py-14 text-center text-sm text-silver-500">
                {employee.fullName} collected nothing between these dates.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px]">
                  <thead className="border-b border-silver-200 bg-silver-50">
                    <tr>
                      <th className="table-head">Date</th>
                      <th className="table-head">Client</th>
                      <th className="table-head">Contact</th>
                      <th className="table-head text-right">Collected (₹)</th>
                      <th className="table-head text-right">Rate (per gm)</th>
                      <th className="table-head text-right">Silver</th>
                      <th className="table-head">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-silver-200">
                    {collections.map((row) => (
                      <tr key={row.id} className="transition-colors hover:bg-silver-50">
                        <td className="table-cell whitespace-nowrap">
                          {formatDate(row.purchasedOn)}
                        </td>
                        <td className="table-cell">
                          <div className="flex items-center gap-3">
                            <Avatar name={row.clientName} image={row.clientImage} />
                            <div className="min-w-0">
                              <div className="font-medium text-silver-900">{row.clientName}</div>
                              <div className="text-xs text-silver-500">{row.clientEmail}</div>
                            </div>
                          </div>
                        </td>
                        <td className="table-cell">
                          {row.clientMobile ? `+91 ${row.clientMobile}` : "—"}
                        </td>
                        <td className="table-cell text-right font-semibold tabular-nums text-silver-900">
                          {formatRupees(row.amountPaid)}
                        </td>
                        <td className="table-cell text-right tabular-nums">
                          {formatRupees(row.ratePerGram)}
                        </td>
                        <td className="table-cell text-right tabular-nums">{row.gramsLabel}</td>
                        <td className="table-cell">
                          <PaymentStatusBadge status={row.paymentStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  {/* The same total again, at the foot of the rows it adds up. */}
                  <tfoot>
                    <tr className="bg-silver-900 text-white">
                      <td
                        className="px-6 py-4 text-sm font-semibold uppercase tracking-wider"
                        colSpan={3}
                      >
                        Total
                      </td>
                      <td className="px-6 py-4 text-right text-lg font-extrabold tabular-nums">
                        ₹{formatRupees(summary?.totalAmount ?? 0)}
                      </td>
                      <td className="px-6 py-4" />
                      <td className="px-6 py-4 text-right text-sm font-semibold tabular-nums">
                        {summary?.collections ? summary.gramsLabel : "—"}
                      </td>
                      <td className="px-6 py-4" />
                    </tr>
                  </tfoot>
                </table>

                {!!appliedFilters?.limit && collections.length >= appliedFilters.limit && (
                  <div className="border-t border-silver-200 px-6 py-3 text-xs text-silver-500">
                    Showing the newest {appliedFilters.limit} collections. The total above still
                    covers every entry in this period — narrow the dates to list the rest.
                  </div>
                )}
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
