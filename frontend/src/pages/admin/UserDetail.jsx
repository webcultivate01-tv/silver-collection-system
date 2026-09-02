// One user, seen by the admin: who they are, what they hold, everything they
// have bought or sold back, and the documents the employee who registered them
// uploaded. Read-only - editing a user belongs to the employee who owns them.
//
// The page is built to be read top-down: the figures first (what they hold and
// what they have paid), then the shape of it over time, then the individual
// rows behind those figures, with the record itself and its paperwork kept to
// the side. The tables list the newest 50 of each, which is what the API
// returns.

import { useEffect, useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { clearSelectedUser, fetchUser } from "../../store/adminUsersSlice.js";
import { selectCanDownloadDocuments } from "../../store/authSlice.js";
import DocumentGallery from "../../components/DocumentGallery.jsx";
import { documentUrl } from "../../components/DocumentUpload.jsx";
import { HoldingChart } from "../../components/Charts.jsx";
import {
  formatAadhaar,
  formatDate,
  formatDateTime,
  formatRupees,
  initialsOf,
} from "../../utils/format.js";
import { PaymentStatusBadge, PayoutStatusBadge } from "../../components/PaymentStatusBadge.jsx";
import {
  IconAlert,
  IconArrowLeft,
  IconCalendar,
  IconMail,
  IconPhone,
  IconReport,
  IconSilver,
  IconUsers,
} from "../../components/Icons.jsx";

function DetailRow({ label, value, tabular = false }) {
  return (
    <div className="py-3">
      <dt className="text-[11px] font-semibold uppercase tracking-wider text-silver-400">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-words text-sm font-medium text-silver-900 ${
          tabular ? "tabular-nums" : ""
        }`}
      >
        {value || "—"}
      </dd>
    </div>
  );
}

// One figure from the holding, sized to be read across the room.
function StatTile({ label, value, hint, muted = false }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${muted ? "text-silver-400" : ""}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

// A contact detail in the header, and a way to act on it - the admin reading
// this page is usually about to ring or write to the person named on it.
function ContactChip({ icon, label, href }) {
  const className =
    "inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs text-white/90 ring-1 ring-inset ring-white/15";

  if (!label) return null;

  if (!href) {
    return (
      <span className={className}>
        {icon}
        {label}
      </span>
    );
  }

  return (
    <a href={href} className={`${className} transition-colors hover:bg-white/20`}>
      {icon}
      {label}
    </a>
  );
}

function SectionCard({ title, icon, count, children }) {
  return (
    <div className="card overflow-hidden">
      <div className="card-header">
        <h2 className="card-title">
          {icon}
          {title}
        </h2>
        {count !== undefined && <span className="badge-neutral tabular-nums">{count}</span>}
      </div>
      {children}
    </div>
  );
}

function EmptyRow({ icon, title, message }) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-silver-100 text-silver-400">
        {icon}
      </span>
      <p className="mt-3 text-sm font-medium text-silver-900">{title}</p>
      <p className="mt-1 text-sm text-silver-500">{message}</p>
    </div>
  );
}

function LoadingState() {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-32 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-64 w-full rounded-xl" />
    </div>
  );
}

export default function UserDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const {
    selected,
    selectedHolding: holding,
    selectedPurchases: purchases,
    selectedSales: sales,
    loading,
    error,
  } = useSelector((state) => state.adminUsers);

  // Admin and sub-admin may take a copy of an ID scan away; nobody else can.
  const canDownload = useSelector(selectCanDownloadDocuments);

  useEffect(() => {
    dispatch(fetchUser(id));
    return () => dispatch(clearSelectedUser());
  }, [dispatch, id]);

  // Cash the employee has taken but not yet handed over: the admin's own
  // outstanding balance against this customer, so it belongs on this page
  // rather than only on the settlements screen.
  const awaitingHandover = useMemo(
    () =>
      purchases
        .filter((purchase) => purchase.paymentStatus !== "success")
        .reduce((sum, purchase) => sum + Number(purchase.amountPaid || 0), 0),
    [purchases]
  );

  const pendingCount = purchases.filter(
    (purchase) => purchase.paymentStatus !== "success"
  ).length;

  // What each gram has cost this customer on average - one number that says
  // more about their buying than the running total does.
  const averageRate = holding.boughtGrams > 0 ? holding.totalPaid / holding.boughtGrams : 0;

  if (loading && !selected) return <LoadingState />;

  if (!selected) {
    return (
      <div className="max-w-md space-y-4">
        {error && <div className="alert-error">{error}</div>}
        <Link to="/dashboard/users" className="btn-secondary">
          Back to users
        </Link>
      </div>
    );
  }

  const firstName = selected.first_name || selected.name || "This user";

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link
          to="/dashboard/users"
          className="inline-flex items-center gap-1.5 text-sm text-silver-500 hover:text-silver-800"
        >
          <IconArrowLeft className="w-4 h-4" />
          Users
        </Link>
      </div>

      {/* Header: who this is, and how to reach them. */}
      <div className="card overflow-hidden">
        <div className="relative bg-gradient-to-br from-silver-800 via-silver-900 to-black px-6 py-6 sm:px-8">
          <IconSilver className="pointer-events-none absolute -right-6 -top-6 h-32 w-32 text-white/[0.06]" />

          <div className="relative flex flex-wrap items-center gap-5">
            {selected.profile_image ? (
              <img
                src={documentUrl(selected.profile_image)}
                alt={selected.name}
                className="h-16 w-16 shrink-0 rounded-full object-cover ring-2 ring-white/25"
              />
            ) : (
              <span className="grid h-16 w-16 shrink-0 place-items-center rounded-full bg-white/10 text-lg font-semibold text-white ring-2 ring-white/25">
                {initialsOf(selected.name)}
              </span>
            )}

            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight text-white">{selected.name}</h1>
                {selected.is_active ? (
                  <span className="badge bg-emerald-400/15 text-emerald-300 ring-1 ring-inset ring-emerald-300/30">
                    Active
                  </span>
                ) : (
                  <span className="badge bg-red-400/15 text-red-300 ring-1 ring-inset ring-red-300/30">
                    Inactive
                  </span>
                )}
              </div>

              <div className="mt-3 flex flex-wrap gap-2">
                <ContactChip
                  icon={<IconMail className="h-3.5 w-3.5" />}
                  label={selected.email}
                  href={selected.email ? `mailto:${selected.email}` : ""}
                />
                <ContactChip
                  icon={<IconPhone className="h-3.5 w-3.5" />}
                  label={selected.mobile ? `+91 ${selected.mobile}` : ""}
                  href={selected.mobile ? `tel:+91${selected.mobile}` : ""}
                />
                <ContactChip
                  icon={<IconCalendar className="h-3.5 w-3.5" />}
                  label={`Added ${formatDate(selected.created_at)}`}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {error && <div className="alert-error">{error}</div>}

      {/* The figures, before any of the rows behind them. */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label="Silver held now"
          value={holding.gramsLabel}
          hint={
            holding.soldGrams > 0
              ? `${holding.boughtGramsLabel} bought, ${holding.soldGramsLabel} sold back`
              : `Across ${holding.purchases} purchase${holding.purchases === 1 ? "" : "s"}`
          }
        />
        <StatTile
          label="Total paid"
          value={`₹${formatRupees(holding.totalPaid)}`}
          hint={
            averageRate > 0 ? `Average ₹${formatRupees(averageRate)} per gram` : "Nothing bought yet"
          }
        />
        <StatTile
          label="Sold back"
          value={holding.soldGrams > 0 ? holding.soldGramsLabel : "—"}
          muted={holding.soldGrams === 0}
          hint={
            holding.soldGrams > 0
              ? `₹${formatRupees(holding.totalReceived)} in value`
              : "Never cashed any silver out"
          }
        />
        <StatTile
          label="Awaiting handover"
          value={`₹${formatRupees(awaitingHandover)}`}
          muted={awaitingHandover === 0}
          hint={
            pendingCount > 0
              ? `${pendingCount} purchase${pendingCount === 1 ? "" : "s"} not yet settled`
              : "All cash accepted"
          }
        />
      </div>

      {pendingCount > 0 && (
        <div className="alert-info flex items-start gap-2.5">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            ₹{formatRupees(awaitingHandover)} of this customer's payments sit with the employee
            who took them. The silver is theirs either way - the cash is settled on the{" "}
            <Link to="/dashboard/settlements" className="font-semibold underline">
              Cash Settlements
            </Link>{" "}
            screen.
          </span>
        </div>
      )}

      <HoldingChart
        purchases={purchases}
        sales={sales}
        loading={loading}
        title={`${firstName}'s silver over time`}
        subtitle="Grams held, from their first purchase to today"
        emptyMessage="Once an employee records this customer's first purchase, their balance is charted here."
      />

      <div className="grid gap-6 lg:grid-cols-3">
        {/* The rows behind the figures. */}
        <div className="space-y-6 lg:col-span-2">
          <SectionCard
            title="Purchases"
            icon={<IconSilver className="mr-2 inline w-4 h-4" />}
            count={purchases.length}
          >
            {purchases.length === 0 ? (
              <EmptyRow
                icon={<IconSilver className="h-5 w-5" />}
                title="No purchases yet"
                message="Nothing has been bought at the counter under this customer's name."
              />
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[560px]">
                  <thead className="border-b border-silver-200 bg-silver-50">
                    <tr>
                      <th className="table-head">Date</th>
                      <th className="table-head text-right">Paid (₹)</th>
                      <th className="table-head text-right">Rate (per gm)</th>
                      <th className="table-head text-right">Silver</th>
                      <th className="table-head">Payment</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-silver-200">
                    {purchases.map((purchase) => (
                      <tr key={purchase.id} className="transition-colors hover:bg-silver-50/70">
                        <td className="table-cell whitespace-nowrap font-medium text-silver-900">
                          {formatDate(purchase.purchasedOn)}
                        </td>
                        <td className="table-cell text-right font-semibold tabular-nums text-silver-900">
                          {formatRupees(purchase.amountPaid)}
                        </td>
                        <td className="table-cell text-right tabular-nums">
                          {formatRupees(purchase.ratePerGram)}
                        </td>
                        <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                          {purchase.gramsLabel}
                        </td>
                        <td className="table-cell">
                          <PaymentStatusBadge status={purchase.paymentStatus} />
                        </td>
                      </tr>
                    ))}
                  </tbody>

                  <tfoot>
                    <tr className="border-t border-silver-200 bg-silver-50">
                      <td className="px-6 py-3 text-xs font-semibold uppercase tracking-wider text-silver-500">
                        Total
                      </td>
                      <td className="px-6 py-3 text-right text-sm font-bold tabular-nums text-silver-900">
                        {formatRupees(holding.totalPaid)}
                      </td>
                      <td className="px-6 py-3" />
                      <td className="px-6 py-3 text-right text-sm font-bold tabular-nums text-silver-900">
                        {holding.boughtGramsLabel}
                      </td>
                      <td className="px-6 py-3" />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </SectionCard>

          {/* Sold back. Only worth a card once there is something in it. */}
          {sales.length > 0 && (
            <SectionCard
              title="Payouts"
              icon={<IconReport className="mr-2 inline w-4 h-4" />}
              count={sales.length}
            >
              <div className="overflow-x-auto">
                <table className="w-full min-w-[660px]">
                  <thead className="border-b border-silver-200 bg-silver-50">
                    <tr>
                      <th className="table-head">Date</th>
                      <th className="table-head text-right">Silver</th>
                      <th className="table-head text-right">Rate (per gm)</th>
                      <th className="table-head text-right">Value (₹)</th>
                      <th className="table-head">Received</th>
                      <th className="table-head">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-silver-200">
                    {sales.map((sale) => (
                      <tr key={sale.id} className="transition-colors hover:bg-silver-50/70">
                        <td className="table-cell whitespace-nowrap font-medium text-silver-900">
                          {formatDate(sale.soldOn)}
                        </td>
                        <td className="table-cell text-right font-medium tabular-nums text-silver-900">
                          {sale.gramsLabel}
                        </td>
                        <td className="table-cell text-right tabular-nums">
                          {formatRupees(sale.ratePerGram)}
                        </td>
                        <td className="table-cell text-right tabular-nums">
                          {formatRupees(sale.amountPayable)}
                        </td>
                        <td className="table-cell">
                          {sale.isCoin ? (
                            <span className="badge bg-brand-50 text-brand-700 ring-1 ring-inset ring-brand-100">
                              Silver coin
                            </span>
                          ) : (
                            <span className="badge-neutral">Cash</span>
                          )}
                        </td>
                        <td className="table-cell">
                          {/* A coin is in the customer's hands already, so it
                              is never "awaiting payout" - only cash can be. */}
                          {sale.isCoin ? (
                            <span className="badge-success">Coin given</span>
                          ) : (
                            <PayoutStatusBadge status={sale.payoutStatus} />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </div>

        {/* The record itself, and its paperwork. */}
        <div className="space-y-6">
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Added By</h2>
            </div>
            <div className="card-body">
              {selected.employee_name ? (
                <>
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                      {initialsOf(selected.employee_name)}
                    </span>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-silver-900">
                        {selected.employee_name}
                      </div>
                      <div className="text-xs tabular-nums text-silver-500">
                        {selected.employee_code || "—"}
                      </div>
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap gap-2">
                    <Link
                      to={`/dashboard/employees/${selected.created_by_employee_id}`}
                      className="btn-secondary btn-sm"
                    >
                      <IconUsers className="h-3.5 w-3.5" />
                      View employee
                    </Link>
                    <Link
                      to={`/dashboard/collections/${selected.created_by_employee_id}`}
                      className="btn-secondary btn-sm"
                    >
                      Collections
                    </Link>
                  </div>

                  <p className="mt-3 text-xs text-silver-500">
                    Only this employee can edit the user or reset their password.
                  </p>
                </>
              ) : (
                <p className="text-sm text-silver-500">
                  This user was not added by an employee, so no employee manages them.
                </p>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">User Details</h2>
            </div>
            <dl className="divide-y divide-silver-100 px-6 py-1">
              <DetailRow label="First Name" value={selected.first_name} />
              <DetailRow label="Last Name" value={selected.last_name} />
              <DetailRow
                label="Mobile Number"
                value={selected.mobile ? `+91 ${selected.mobile}` : ""}
                tabular
              />
              <DetailRow label="Email" value={selected.email} />
              <DetailRow label="Date of Birth" value={formatDate(selected.date_of_birth)} />
              <DetailRow label="Age" value={selected.age ? `${selected.age} years` : ""} />
              <DetailRow
                label="Aadhaar Number"
                value={formatAadhaar(selected.aadhaar_number)}
                tabular
              />
              <DetailRow label="PAN Number" value={selected.pan_number} tabular />
              <DetailRow label="Address" value={selected.address} />
              <DetailRow label="Added On" value={formatDateTime(selected.created_at)} />
            </dl>
          </div>

          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Documents</h2>
              {canDownload && <span className="badge-neutral">Downloadable</span>}
            </div>
            <div className="card-body">
              <DocumentGallery
                record={selected}
                owner={selected.name}
                canDownload={canDownload}
              />
              <p className="mt-3 text-[11px] text-silver-400">
                Click a document to open it full size
                {canDownload && ", then Download to save a copy"}.
              </p>
            </div>
            {selected.folder_name && (
              <p className="border-t border-silver-100 px-6 py-3 text-[11px] text-silver-400">
                Stored in /uploads/user/{selected.folder_name}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
