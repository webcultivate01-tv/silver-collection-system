// One of this employee's users: full details, uploaded documents, inline
// editing, password reset and activate/deactivate.
//
// The API answers 404 for a user added by somebody else, so a typed URL with
// another employee's user id lands on the "not found" state below.
//
// The page reads top-down the same way the admin's user page does - who this
// is and how to reach them, then the figures, then the shape of the holding
// over time, then the rows behind those figures, with the record itself and
// its paperwork kept to the side. What the admin cannot do and this employee
// can - editing, resetting the password, switching access off - sits in one
// action bar under the header, so there is a single place to act from.

import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import EmployeeForm, { validate } from "./admin/EmployeeForm.jsx";
import ConfirmModal from "../components/ConfirmModal.jsx";
import CredentialBox from "../components/CredentialBox.jsx";
import { HoldingChart } from "../components/Charts.jsx";
import DocumentGallery from "../components/DocumentGallery.jsx";
import { documentUrl } from "../components/DocumentUpload.jsx";
import { PaymentStatusBadge, PayoutStatusBadge } from "../components/PaymentStatusBadge.jsx";
import {
  clearIssuedUserPassword,
  clearSelectedUser,
  clearUserErrors,
  fetchMyUser,
  resetUserPassword,
  toggleUserStatus,
  updateUser,
} from "../store/employeeUsersSlice.js";
import {
  formatAadhaar,
  formatDate,
  formatDateTime,
  formatRupees,
  initialsOf,
  toDateInputValue,
} from "../utils/format.js";
import {
  IconAlert,
  IconArrowLeft,
  IconBlock,
  IconCalendar,
  IconCheck,
  IconEdit,
  IconKey,
  IconMail,
  IconPhone,
  IconReport,
  IconSilver,
} from "../components/Icons.jsx";

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

// One figure from the holding, sized to be read across the counter.
function StatTile({ label, value, hint, muted = false }) {
  return (
    <div className="stat-tile">
      <div className="stat-label">{label}</div>
      <div className={`stat-value ${muted ? "text-silver-400" : ""}`}>{value}</div>
      {hint && <div className="stat-hint">{hint}</div>}
    </div>
  );
}

// A contact detail in the header, and a way to act on it - the employee
// reading this page is usually about to ring or write to the person named.
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

function EmptyRow({ icon, title, message, action }) {
  return (
    <div className="px-6 py-12 text-center">
      <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-silver-100 text-silver-400">
        {icon}
      </span>
      <p className="mt-3 text-sm font-medium text-silver-900">{title}</p>
      <p className="mt-1 text-sm text-silver-500">{message}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

function LoadingState() {
  return (
    <div className="max-w-6xl space-y-6">
      <div className="skeleton h-4 w-24" />
      <div className="skeleton h-40 w-full rounded-xl" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="skeleton h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="skeleton h-64 w-full rounded-xl" />
    </div>
  );
}

function toFormValues(user) {
  return {
    firstName: user.first_name || "",
    lastName: user.last_name || "",
    mobile: user.mobile || "",
    email: user.email || "",
    age: user.age === null || user.age === undefined ? "" : String(user.age),
    address: user.address || "",
    aadhaarNumber: user.aadhaar_number || "",
    panNumber: user.pan_number || "",
    dateOfBirth: toDateInputValue(user.date_of_birth),
    // Only set when a replacement file is picked.
    profilePhoto: null,
    aadhaarFront: null,
    aadhaarBack: null,
    panFront: null,
  };
}

export default function EmployeeUserDetail() {
  const { id } = useParams();
  const dispatch = useDispatch();
  const {
    selected,
    selectedHolding: holding,
    selectedPurchases: purchases,
    selectedSales: sales,
    loading,
    saving,
    error,
    fieldErrors,
    issuedPassword,
  } = useSelector((state) => state.employeeUsers);

  const [editing, setEditing] = useState(false);
  const [values, setValues] = useState(null);
  const [localErrors, setLocalErrors] = useState({});
  const [confirm, setConfirm] = useState(null); // "reset" | "activate" | "deactivate"
  const [savedMessage, setSavedMessage] = useState("");

  useEffect(() => {
    dispatch(fetchMyUser(id));
    return () => {
      dispatch(clearSelectedUser());
      dispatch(clearIssuedUserPassword());
      dispatch(clearUserErrors());
    };
  }, [dispatch, id]);

  // Cash this employee has taken for this user but not yet handed over. It is
  // their own outstanding balance, so it belongs on this page rather than only
  // on the settlements screen.
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
        <Link to="/employee/users" className="btn-secondary">
          <IconArrowLeft className="h-4 w-4" />
          Back to my users
        </Link>
      </div>
    );
  }

  function startEditing() {
    setValues(toFormValues(selected));
    setLocalErrors({});
    setSavedMessage("");
    dispatch(clearUserErrors());
    setEditing(true);
  }

  async function handleSave(e) {
    e.preventDefault();

    const found = validate(values, { subject: "user" });
    setLocalErrors(found);
    if (Object.keys(found).length) return;

    const result = await dispatch(
      updateUser({ id: selected.id, ...values, age: Number(values.age) })
    );

    if (updateUser.fulfilled.match(result)) {
      setEditing(false);
      setSavedMessage("User details updated");
    }
  }

  async function handleConfirm() {
    if (confirm === "reset") {
      await dispatch(resetUserPassword(selected.id));
    } else {
      await dispatch(toggleUserStatus({ id: selected.id, active: confirm === "activate" }));
    }
    setConfirm(null);
  }

  const confirmProps = {
    reset: {
      title: "Reset password?",
      message: `A new password will be generated for ${selected.name}. Their current password will stop working immediately.`,
      confirmLabel: "Reset password",
      confirmVariant: "btn-primary",
    },
    deactivate: {
      title: "Deactivate this user?",
      message: `${selected.name} won't be able to sign in, and no purchase can be recorded for them until you activate them again. Their silver is kept.`,
      confirmLabel: "Deactivate user",
      confirmVariant: "btn-danger",
    },
    activate: {
      title: "Activate this user?",
      message: `${selected.name} will be able to sign in again with their existing password.`,
      confirmLabel: "Activate user",
      confirmVariant: "btn-primary",
    },
  }[confirm] || {};

  const firstName = selected.first_name || selected.name || "This user";

  return (
    <div className="max-w-6xl space-y-6">
      <div>
        <Link
          to="/employee/users"
          className="inline-flex items-center gap-1.5 text-sm text-silver-500 hover:text-silver-800"
        >
          <IconArrowLeft className="w-4 h-4" />
          My Users
        </Link>
      </div>

      {savedMessage && <div className="alert-success">{savedMessage}</div>}
      {error && <div className="alert-error">{error}</div>}
      {issuedPassword && (
        <CredentialBox
          email={selected.email}
          password={issuedPassword}
          title="New password"
          audience="user"
        />
      )}

      {/* Header: who this is, how to reach them, and everything that can be
          done to the record - one bar, so there is a single place to act. */}
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

        {!editing && (
          <div className="flex flex-wrap items-center gap-3 border-t border-silver-200 bg-white px-6 py-4 sm:px-8">
            <button className="btn-primary" onClick={startEditing}>
              <IconEdit className="h-4 w-4" />
              Edit Details
            </button>
            <button
              className="btn-secondary"
              disabled={saving}
              onClick={() => setConfirm("reset")}
            >
              <IconKey className="h-4 w-4" />
              Reset Password
            </button>

            <div className="sm:ml-auto">
              {selected.is_active ? (
                <button
                  className="btn-secondary text-red-600 hover:bg-red-50"
                  disabled={saving}
                  onClick={() => setConfirm("deactivate")}
                >
                  <IconBlock className="h-4 w-4" />
                  Deactivate
                </button>
              ) : (
                <button
                  className="btn-primary"
                  disabled={saving}
                  onClick={() => setConfirm("activate")}
                >
                  <IconCheck className="h-4 w-4" />
                  Activate User
                </button>
              )}
            </div>

            <p className="w-full text-xs text-silver-500">
              {selected.is_active
                ? "Resetting issues a new password straight away. Deactivating stops them signing in - their record and their silver are kept."
                : "This user cannot sign in or buy silver until you activate them again."}
            </p>
          </div>
        )}
      </div>

      {editing ? (
        /* Edit mode: nothing else on screen competes with the form. */
        <form onSubmit={handleSave}>
          <div className="card">
            <div className="card-header">
              <h2 className="card-title">Edit Details</h2>
              <span className="text-xs text-silver-500">
                Re-upload a document only to replace it
              </span>
            </div>
            <div className="card-body">
              <EmployeeForm
                values={values}
                errors={{ ...fieldErrors, ...localErrors }}
                onChange={setValues}
                existing={selected}
                subject="user"
                photoColumn="profile_image"
              />
            </div>
            <div className="flex justify-end gap-3 border-t border-silver-200 px-6 py-4">
              <button type="button" className="btn-secondary" onClick={() => setEditing(false)}>
                Cancel
              </button>
              <button type="submit" disabled={saving} className="btn-primary">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </div>
          </div>
        </form>
      ) : (
        <>
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
                averageRate > 0
                  ? `Average ₹${formatRupees(averageRate)} per gram`
                  : "Nothing bought yet"
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
              label="Cash with you"
              value={`₹${formatRupees(awaitingHandover)}`}
              muted={awaitingHandover === 0}
              hint={
                pendingCount > 0
                  ? `${pendingCount} purchase${pendingCount === 1 ? "" : "s"} not yet settled`
                  : "All cash handed over"
              }
            />
          </div>

          {pendingCount > 0 && (
            <div className="alert-info flex items-start gap-2.5">
              <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                ₹{formatRupees(awaitingHandover)} you took for this customer has not been handed
                over yet. The silver is theirs either way - the cash is cleared on the{" "}
                <Link to="/employee/settlements" className="font-semibold underline">
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
            emptyMessage="Once you record this customer's first purchase, their balance is charted here."
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
                    action={
                      <Link to="/employee/purchases" className="btn-primary btn-sm">
                        Record a purchase
                      </Link>
                    }
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
                              {/* A coin is in the customer's hands already, so
                                  it is never "awaiting payout" - only cash
                                  can be. */}
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
                  <span className="badge-neutral">View only</span>
                </div>
                <div className="card-body">
                  {/* No `canDownload`: an employee reads a customer's ID over
                      the page, but saving a copy of it is the admin's call. */}
                  <DocumentGallery record={selected} owner={selected.name} />
                  <p className="mt-3 text-[11px] text-silver-400">
                    Click a document to open it full size.
                    {selected.folder_name && ` Stored in /uploads/user/${selected.folder_name}`}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </>
      )}

      <ConfirmModal
        open={!!confirm}
        loading={saving}
        onCancel={() => setConfirm(null)}
        onConfirm={handleConfirm}
        {...confirmProps}
      />
    </div>
  );
}
