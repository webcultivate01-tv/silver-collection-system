// Employee Collections: pick an employee, then read back everything they have
// collected at the counter and which client each rupee came from.
//
// Two screens behind one route:
//   /dashboard/collections             -> the picker, every employee with their running total
//   /dashboard/collections/:employeeId -> that employee's collections
//
// Nothing here writes. The rows are the same purchases the Cash Settlements
// screen bundles into handovers, which is why every row carries the handover
// it went into - "collected from whom, and where did that cash go".

import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import {
  clearCollectionsError,
  clearSelectedCollections,
  fetchCollectionEmployees,
  fetchEmployeeCollections,
} from "../../store/collectionsSlice.js";
import { documentUrl } from "../../components/DocumentUpload.jsx";
import ReportDownloadButtons from "../../components/ReportDownloadButtons.jsx";
import { PaymentStatusBadge, SettlementStatusBadge } from "../../components/PaymentStatusBadge.jsx";
import {
  buildCollectionClientReport,
  buildEmployeeCollectionReport,
} from "../../utils/reportBuilders.js";
import { formatDate, formatRupees, initialsOf } from "../../utils/format.js";
import {
  IconArrowLeft,
  IconCash,
  IconClose,
  IconIdCard,
  IconSearch,
  IconSilver,
  IconUsers,
} from "../../components/Icons.jsx";

const EMPLOYEE_FILTERS = [
  { value: "all", label: "All" },
  { value: "active", label: "Active" },
  { value: "blocked", label: "Blocked" },
];

const STATUS_FILTERS = [
  { value: "all", label: "All collections" },
  { value: "pending", label: "Not handed over" },
  { value: "success", label: "Settled" },
];

function Avatar({ name, image, className = "h-10 w-10" }) {
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

function StatTile({ label, value, hint, Icon }) {
  return (
    <div className="stat-tile">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="stat-label">{label}</div>
          <div className="stat-value tabular-nums">{value}</div>
        </div>
        {Icon && (
          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-silver-100 text-silver-500">
            <Icon className="h-5 w-5" />
          </span>
        )}
      </div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

function FilterPills({ options, value, onChange }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      {options.map((option) => (
        <button
          key={option.value}
          onClick={() => onChange(option.value)}
          className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
            value === option.value
              ? "bg-brand-600 text-white shadow-card"
              : "bg-white text-silver-600 ring-1 ring-inset ring-silver-200 hover:bg-silver-50"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function SearchBox({ value, onChange, placeholder }) {
  return (
    <div className="relative">
      <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver-400" />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input pl-9"
        placeholder={placeholder}
      />
      {value && (
        <button
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-silver-400 hover:text-silver-600"
          aria-label="Clear search"
        >
          <IconClose className="h-4 w-4" />
        </button>
      )}
    </div>
  );
}

// What the admin can type to find an employee: their name, their code, their
// email or their mobile. Matched here rather than on the server so the list
// narrows on the keystroke, with no round trip between typing and seeing.
function matchesEmployee(employee, query) {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;

  return [
    employee.fullName,
    employee.employeeCode,
    employee.email,
    employee.mobile,
  ]
    .filter(Boolean)
    .some((field) => String(field).toLowerCase().includes(needle));
}

// The search box on the picker, with the matching employees dropping down
// under it. Picking one opens their collections straight away - the same thing
// clicking their card does, without having to find the card.
function EmployeeSuggestBox({ value, onChange, suggestions, onPick }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);

  const showing = value.trim() && open ? suggestions.slice(0, 6) : [];

  // A fresh query means a fresh list, so the highlight goes back to the top
  // rather than staying on whatever row happened to sit at that index.
  useEffect(() => setActive(0), [value]);

  function choose(employee) {
    setOpen(false);
    onPick(employee);
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
      <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver-400" />
      <input
        type="text"
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Closing on blur would beat the click on a suggestion, so the rows
        // below commit on mousedown instead and this only tidies up after.
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        className="input pl-9"
        placeholder="Search employees"
        autoComplete="off"
        role="combobox"
        aria-expanded={showing.length > 0}
        aria-autocomplete="list"
      />
      {value && (
        <button
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onChange("")}
          className="absolute right-3 top-1/2 -translate-y-1/2 text-silver-400 hover:text-silver-600"
          aria-label="Clear search"
        >
          <IconClose className="h-4 w-4" />
        </button>
      )}

      {value.trim() && open && (
        <div className="absolute z-20 mt-1 w-full overflow-hidden rounded-lg border border-silver-200 bg-white shadow-lg">
          {showing.length === 0 ? (
            <div className="px-3 py-3 text-sm text-silver-500">No employee matches that.</div>
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

// ---------------------------------------------------------------------------
// The picker
// ---------------------------------------------------------------------------

function EmployeePicker() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { employees, employeesLoading, error } = useSelector((state) => state.collections);

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");

  // The whole roster for the chosen status comes down once; the search box
  // filters it here, so a keystroke never waits on a request.
  useEffect(() => {
    dispatch(fetchCollectionEmployees({ status }));
  }, [dispatch, status]);

  const matches = useMemo(
    () => employees.filter((employee) => matchesEmployee(employee, search)),
    [employees, search]
  );

  function openEmployee(employee) {
    navigate(`/dashboard/collections/${employee.id}`);
  }

  // The headline total is what this employee list adds up to - so it follows
  // the search rather than quietly reporting the unfiltered roster.
  const collectedTotal = matches.reduce((sum, one) => sum + Number(one.summary.totalAmount), 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Employee Collections</h1>
        <p className="mt-1 text-sm text-silver-500">
          Choose an employee to see every rupee they have collected at the counter, and which
          client it came from.
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {matches.length > 0 && (
        <div className="card overflow-hidden">
          <div className="bg-gradient-to-r from-silver-800 to-silver-900 px-6 py-5 text-white">
            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-white/60">
              <IconCash className="h-4 w-4" />
              Collected by these employees
            </div>
            <div className="mt-2 text-3xl font-bold tabular-nums">
              ₹{formatRupees(collectedTotal)}
            </div>
            <div className="mt-1 text-xs text-white/60">
              Across {matches.length} employee{matches.length === 1 ? "" : "s"}
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-3">
        <FilterPills options={EMPLOYEE_FILTERS} value={status} onChange={setStatus} />
        <div className="ml-auto w-full sm:w-72">
          <EmployeeSuggestBox
            value={search}
            onChange={setSearch}
            suggestions={matches}
            onPick={openEmployee}
          />
        </div>
      </div>

      {employeesLoading && employees.length === 0 ? (
        <div className="card py-14 text-center text-sm text-silver-500">Loading employees...</div>
      ) : matches.length === 0 ? (
        <div className="card py-14 text-center text-sm text-silver-500">
          No employees match this search.
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {matches.map((employee) => (
            <button
              key={employee.id}
              onClick={() => openEmployee(employee)}
              className="card p-5 text-left transition-colors hover:border-brand-300 hover:shadow-card"
            >
              <div className="flex items-center gap-3">
                <Avatar
                  name={employee.fullName}
                  image={employee.profilePhoto}
                  className="h-11 w-11"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-semibold text-silver-900">
                    {employee.fullName}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-silver-500">
                    <span className="tabular-nums">{employee.employeeCode || "—"}</span>
                    {employee.isBlocked && <span className="badge-danger">Blocked</span>}
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-silver-200 pt-4">
                <div className="text-xs font-medium uppercase tracking-wide text-silver-500">
                  Collected
                </div>
                <div className="mt-1 text-xl font-bold tabular-nums text-silver-900">
                  ₹{formatRupees(employee.summary.totalAmount)}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <div className="flex justify-between gap-2">
                    <dt className="text-silver-500">Clients</dt>
                    <dd className="font-medium tabular-nums text-silver-800">
                      {employee.summary.clients}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-silver-500">Entries</dt>
                    <dd className="font-medium tabular-nums text-silver-800">
                      {employee.summary.collections}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-silver-500">Silver</dt>
                    <dd className="font-medium tabular-nums text-silver-800">
                      {employee.summary.collections ? employee.summary.gramsLabel : "—"}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="text-silver-500">Last</dt>
                    <dd className="font-medium text-silver-800">
                      {employee.summary.lastOn ? formatDate(employee.summary.lastOn) : "—"}
                    </dd>
                  </div>
                </dl>

                {employee.summary.pendingAmount > 0 && (
                  <div className="mt-3 rounded-lg bg-amber-50 px-3 py-2 text-xs font-medium text-amber-700">
                    ₹{formatRupees(employee.summary.pendingAmount)} not handed over yet
                  </div>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// One employee's collections
// ---------------------------------------------------------------------------

function ClientTable({ clients, onPick }) {
  if (clients.length === 0) {
    return (
      <div className="py-14 text-center text-sm text-silver-500">
        No client has paid this employee in the chosen period.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[860px]">
        <thead>
          <tr>
            <th className="table-head">Client</th>
            <th className="table-head">Contact</th>
            <th className="table-head text-right">Entries</th>
            <th className="table-head text-right">Collected (₹)</th>
            <th className="table-head text-right">Silver</th>
            <th className="table-head text-right">Pending (₹)</th>
            <th className="table-head">First → Latest</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-silver-200">
          {clients.map((client) => (
            <tr key={client.clientId} className="hover:bg-silver-50">
              <td className="table-cell">
                <button
                  onClick={() => onPick(client)}
                  className="flex items-center gap-3 text-left"
                  title="Show only this client's collections"
                >
                  <Avatar name={client.name} image={client.image} className="h-9 w-9" />
                  <div className="min-w-0">
                    <div className="font-medium text-silver-900">{client.name}</div>
                    <div className="text-xs text-silver-500">{client.email}</div>
                  </div>
                </button>
              </td>
              <td className="table-cell">{client.mobile ? `+91 ${client.mobile}` : "—"}</td>
              <td className="table-cell text-right tabular-nums">{client.collections}</td>
              <td className="table-cell text-right font-semibold tabular-nums text-silver-900">
                {formatRupees(client.totalAmount)}
              </td>
              <td className="table-cell text-right tabular-nums">{client.gramsLabel}</td>
              <td className="table-cell text-right tabular-nums">
                {client.pendingAmount > 0 ? (
                  <span className="font-medium text-amber-600">
                    {formatRupees(client.pendingAmount)}
                  </span>
                ) : (
                  "—"
                )}
              </td>
              <td className="table-cell whitespace-nowrap text-xs text-silver-500">
                {formatDate(client.firstOn)} → {formatDate(client.lastOn)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CollectionTable({ collections, limit }) {
  if (collections.length === 0) {
    return (
      <div className="py-14 text-center text-sm text-silver-500">
        Nothing collected in the chosen period.
      </div>
    );
  }

  // The row list is capped; the totals and the per-client table above it are
  // not. Say so rather than let the two quietly disagree.
  const capped = !!limit && collections.length >= limit;

  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[980px]">
        <thead>
          <tr>
            <th className="table-head">Date</th>
            <th className="table-head">Client</th>
            <th className="table-head">Contact</th>
            <th className="table-head text-right">Collected (₹)</th>
            {/* The rate this row was priced at, frozen when it was recorded -
                not today's rate. It is what makes Collected ÷ Rate = Silver
                check out on a list spanning more than one day. */}
            <th className="table-head text-right">Rate (per gm)</th>
            <th className="table-head text-right">Silver</th>
            <th className="table-head">Payment</th>
            <th className="table-head">Handover</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-silver-200">
          {collections.map((row) => (
            <tr key={row.id} className="hover:bg-silver-50">
              <td className="table-cell whitespace-nowrap">{formatDate(row.purchasedOn)}</td>
              <td className="table-cell">
                <Link
                  to={`/dashboard/users/${row.clientId}`}
                  className="flex items-center gap-3 hover:text-brand-600"
                >
                  <Avatar name={row.clientName} image={row.clientImage} className="h-9 w-9" />
                  <div className="min-w-0">
                    <div className="font-medium text-silver-900">{row.clientName}</div>
                    <div className="text-xs text-silver-500">
                      {row.ownClient ? "Registered by this employee" : "Registered elsewhere"}
                    </div>
                  </div>
                </Link>
              </td>
              <td className="table-cell">
                <div>{row.clientMobile ? `+91 ${row.clientMobile}` : "—"}</div>
                <div className="text-xs text-silver-500">{row.clientEmail}</div>
              </td>
              <td className="table-cell text-right font-semibold tabular-nums text-silver-900">
                {formatRupees(row.amountPaid)}
              </td>
              <td className="table-cell text-right tabular-nums">{formatRupees(row.ratePerGram)}</td>
              <td className="table-cell text-right tabular-nums">{row.gramsLabel}</td>
              <td className="table-cell">
                <PaymentStatusBadge status={row.paymentStatus} />
              </td>
              <td className="table-cell">
                {row.settlement ? (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium tabular-nums text-silver-700">
                        #{row.settlement.id}
                      </span>
                      <SettlementStatusBadge status={row.settlement.status} />
                    </div>
                    <div className="text-xs text-silver-500">{formatDate(row.settlement.date)}</div>
                  </div>
                ) : (
                  <span className="text-xs text-silver-500">Still with the employee</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      {capped && (
        <div className="border-t border-silver-200 px-6 py-3 text-xs text-silver-500">
          Showing the newest {limit} collections. The totals and the per-client table above
          still cover every entry — narrow the dates to see the rest here.
        </div>
      )}
    </div>
  );
}

function CollectionsDetail({ employeeId }) {
  const dispatch = useDispatch();
  const { employee, summary, clients, collections, appliedFilters, detailLoading, error } =
    useSelector((state) => state.collections);

  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [status, setStatus] = useState("all");
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("clients");

  useEffect(() => {
    const timer = setTimeout(
      () => dispatch(fetchEmployeeCollections({ employeeId, from, to, status, search })),
      300
    );
    return () => clearTimeout(timer);
  }, [dispatch, employeeId, from, to, status, search]);

  useEffect(() => {
    return () => {
      dispatch(clearSelectedCollections());
      dispatch(clearCollectionsError());
    };
  }, [dispatch]);

  // The download always describes the tab being looked at, so what comes down
  // is what is on screen.
  const report = useMemo(() => {
    if (!employee) return null;
    const filters = { from, to, status, total: summary?.totalAmount ?? 0 };
    return tab === "clients"
      ? buildCollectionClientReport(clients, employee, filters)
      : buildEmployeeCollectionReport(collections, employee, filters);
  }, [tab, clients, collections, employee, summary, from, to, status]);

  const filtered = !!(from || to || search || status !== "all");

  function showOneClient(client) {
    setSearch(client.email);
    setTab("collections");
  }

  function clearFilters() {
    setFrom("");
    setTo("");
    setStatus("all");
    setSearch("");
  }

  if (detailLoading && !employee) {
    return <div className="py-16 text-center text-sm text-silver-500">Loading collections...</div>;
  }

  if (!employee) {
    return (
      <div className="max-w-md space-y-4">
        {error && <div className="alert-error">{error}</div>}
        <Link to="/dashboard/collections" className="btn-secondary">
          Back to employees
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Link
        to="/dashboard/collections"
        className="inline-flex items-center gap-1.5 text-sm text-silver-500 hover:text-silver-800"
      >
        <IconArrowLeft className="w-4 h-4" />
        Employee Collections
      </Link>

      <div className="card">
        <div className="flex flex-wrap items-center gap-5 p-6">
          <Avatar name={employee.fullName} image={employee.profilePhoto} className="h-16 w-16" />

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-silver-900">{employee.fullName}</h1>
              {employee.employeeCode && (
                <span className="badge-neutral tabular-nums">{employee.employeeCode}</span>
              )}
              {employee.isBlocked && <span className="badge-danger">Blocked</span>}
            </div>
            <p className="mt-1 text-sm text-silver-500">
              {employee.email}
              {employee.mobile ? ` · +91 ${employee.mobile}` : ""}
            </p>
          </div>

          <Link to={`/dashboard/employees/${employee.id}`} className="btn-secondary">
            <IconIdCard className="h-4 w-4" />
            Employee record
          </Link>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Total collected"
          value={`₹${formatRupees(summary?.totalAmount ?? 0)}`}
          hint={`${summary?.collections ?? 0} collection${summary?.collections === 1 ? "" : "s"}`}
          Icon={IconCash}
        />
        <StatTile
          label="Silver bought"
          value={summary?.collections ? summary.gramsLabel : "—"}
          hint="Priced at the rate of the day each entry was recorded"
          Icon={IconSilver}
        />
        <StatTile
          label="Clients collected from"
          value={String(summary?.clients ?? 0)}
          hint={summary?.lastOn ? `Latest on ${formatDate(summary.lastOn)}` : "Nothing collected yet"}
          Icon={IconUsers}
        />
        <StatTile
          label="Not handed over"
          value={`₹${formatRupees(summary?.pendingAmount ?? 0)}`}
          hint={`${summary?.pendingCount ?? 0} waiting · ₹${formatRupees(
            summary?.settledAmount ?? 0
          )} settled`}
          Icon={IconCash}
        />
      </div>

      <div className="card">
        <div className="card-body space-y-4">
          <div className="flex flex-wrap items-end gap-3">
            {/* From and To wrap together, so the period stays on one line
                however narrow the card gets. */}
            <div className="flex w-full min-w-0 gap-3 sm:w-auto">
              <div className="w-full min-w-0 sm:w-40">
                <label className="label" htmlFor="collections-from">
                  From
                </label>
                <input
                  id="collections-from"
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                  className="input"
                />
              </div>
              <div className="w-full min-w-0 sm:w-40">
                <label className="label" htmlFor="collections-to">
                  To
                </label>
                <input
                  id="collections-to"
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                  className="input"
                />
              </div>
            </div>
            <div className="min-w-[16rem] flex-1">
              <label className="label" htmlFor="collections-search">
                Client
              </label>
              <SearchBox
                value={search}
                onChange={setSearch}
                placeholder="Search by client name, email or mobile"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <FilterPills options={STATUS_FILTERS} value={status} onChange={setStatus} />
            {filtered && (
              <button onClick={clearFilters} className="link-quiet">
                Clear filters
              </button>
            )}
            {report && (
              <div className="ml-auto">
                <ReportDownloadButtons report={report} size="sm" />
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="card overflow-hidden">
        <div className="card-header">
          <div className="flex flex-wrap items-center gap-2">
            <button
              onClick={() => setTab("clients")}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === "clients" ? "bg-silver-900 text-white" : "text-silver-600 hover:bg-silver-100"
              }`}
            >
              By client ({clients.length})
            </button>
            <button
              onClick={() => setTab("collections")}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                tab === "collections"
                  ? "bg-silver-900 text-white"
                  : "text-silver-600 hover:bg-silver-100"
              }`}
            >
              Every collection ({collections.length})
            </button>
          </div>
        </div>

        {detailLoading ? (
          <div className="py-14 text-center text-sm text-silver-500">Loading collections...</div>
        ) : tab === "clients" ? (
          <ClientTable clients={clients} onPick={showOneClient} />
        ) : (
          <CollectionTable collections={collections} limit={appliedFilters?.limit} />
        )}
      </div>
    </div>
  );
}

export default function EmployeeCollections() {
  const { employeeId } = useParams();
  return employeeId ? <CollectionsDetail employeeId={employeeId} /> : <EmployeePicker />;
}
