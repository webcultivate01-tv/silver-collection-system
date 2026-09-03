// Every message left on the landing page's contact form, and what the shop
// has done about each one.
//
// One screen for both panel roles, which is why it lives here rather than in
// pages/admin - the same reasoning as CashSettlements.jsx. The main admin
// opens it at /dashboard/enquiries and a sub-admin at /sub-admin/enquiries,
// and an enquiry is worked the same way by whoever gets to it first: mark it
// In Progress when you pick it up, Closed when it is answered, and leave a
// note saying what was agreed. The row records which of the two moved it, so
// they don't both ring the same person.
//
// The one difference between the roles is Delete, which only the main admin
// sees: closing an enquiry is working it, deleting one destroys the record
// that it ever arrived. A sub-admin who tries anyway is refused by the server,
// not just by a hidden button.
//
// An enquiry is written by a stranger, so everything on this screen is
// untrusted text. It is all rendered as text - React escapes it - and the two
// things that could act on their own, the email and the phone number, are
// links the reader chooses to follow, not anything the page does by itself.

import { useEffect, useMemo, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import {
  clearEnquiriesError,
  clearEnquiriesNotice,
  deleteEnquiry,
  fetchEnquiries,
  updateEnquiry,
} from "../store/enquiriesSlice.js";
import { selectIsMainAdmin } from "../store/authSlice.js";
import { formatDateTime, formatRelativeTime, initialsOf } from "../utils/format.js";
import ConfirmModal from "../components/ConfirmModal.jsx";
import {
  IconAlert,
  IconCheck,
  IconClock,
  IconMail,
  IconPhone,
  IconSearch,
  IconTrash,
} from "../components/Icons.jsx";

// The tabs, in the order an enquiry moves through them. `key` is both the tab
// and the `status` the API is asked for; "all" is the one that isn't a status.
const TABS = [
  { key: "new", label: "New", countKey: "new" },
  { key: "in_progress", label: "In Progress", countKey: "in_progress" },
  { key: "closed", label: "Closed", countKey: "closed" },
  { key: "all", label: "All", countKey: "total" },
];

const STATUS_LABEL = {
  new: "New",
  in_progress: "In Progress",
  closed: "Closed",
};

// Same three words wherever a status is shown, so the tab, the badge and the
// button never disagree about what an enquiry is called.
function EnquiryStatusBadge({ status }) {
  if (status === "closed") return <span className="badge-success">Closed</span>;
  if (status === "in_progress") return <span className="badge-warning">In Progress</span>;
  return <span className="badge-info">New</span>;
}

// What each status offers as its next step. A closed enquiry can be reopened,
// because somebody writing back is the normal reason to reopen one.
const NEXT_STEPS = {
  new: [
    { status: "in_progress", label: "Start working", variant: "btn-primary btn-sm" },
    { status: "closed", label: "Close", variant: "btn-secondary btn-sm" },
  ],
  in_progress: [
    { status: "closed", label: "Mark closed", variant: "btn-primary btn-sm" },
    { status: "new", label: "Put back", variant: "btn-secondary btn-sm" },
  ],
  closed: [{ status: "in_progress", label: "Reopen", variant: "btn-secondary btn-sm" }],
};

function StatCard({ label, value, tone, hint }) {
  return (
    <div className="card px-5 py-4">
      <div className="text-sm text-silver-500">{label}</div>
      <div className={`mt-1 text-2xl font-bold tabular-nums ${tone}`}>{value}</div>
      {hint && <div className="mt-0.5 text-xs text-silver-500">{hint}</div>}
    </div>
  );
}

export default function Enquiries() {
  const dispatch = useDispatch();
  const { list, counts, loading, saving, notice, error } = useSelector((state) => state.enquiries);
  const isMainAdmin = useSelector(selectIsMainAdmin);

  const [tab, setTab] = useState("new");
  const [search, setSearch] = useState("");
  // Which row is expanded. Only one at a time: the panel underneath is where
  // the note is typed, and two open notes would be two half-finished thoughts.
  const [openId, setOpenId] = useState(null);
  // The note being typed, kept per enquiry so switching rows doesn't carry
  // one person's note over to another's.
  const [notes, setNotes] = useState({});
  const [confirmDelete, setConfirmDelete] = useState(null);

  // Debounced so typing doesn't fire a request per keystroke - same 300ms as
  // the Users screen.
  useEffect(() => {
    const timer = setTimeout(() => dispatch(fetchEnquiries({ status: tab, search })), 300);
    return () => clearTimeout(timer);
  }, [dispatch, tab, search]);

  useEffect(() => {
    return () => {
      dispatch(clearEnquiriesError());
      dispatch(clearEnquiriesNotice());
    };
  }, [dispatch]);

  // How many are waiting on somebody. It is the number the screen exists for,
  // so it gets said once at the top rather than being counted off the tabs.
  const waiting = counts.new + counts.in_progress;

  // Enquiries that never reached anybody's inbox. Normally none - but when
  // SMTP is misconfigured this list is the ONLY copy, and nothing else in the
  // app would say so.
  const unmailed = useMemo(() => list.filter((enquiry) => !enquiry.emailed).length, [list]);

  function toggleOpen(enquiry) {
    setOpenId((current) => (current === enquiry.id ? null : enquiry.id));
    setNotes((current) =>
      // Seed the box with what is already stored, once, so opening a row twice
      // doesn't discard an edit that hasn't been saved yet.
      current[enquiry.id] === undefined
        ? { ...current, [enquiry.id]: enquiry.adminNote }
        : current
    );
  }

  // The row buttons send a status and nothing else, so the stored note is
  // kept. The detail panel's own button is the only thing that sends one.
  function moveTo(enquiry, status) {
    dispatch(updateEnquiry({ id: enquiry.id, status }));
  }

  function saveNote(enquiry) {
    dispatch(updateEnquiry({ id: enquiry.id, status: enquiry.status, note: notes[enquiry.id] ?? "" }));
  }

  async function handleDelete() {
    const enquiry = confirmDelete;
    setConfirmDelete(null);
    await dispatch(deleteEnquiry(enquiry.id));
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Enquiries</h1>
        <p className="mt-1 text-sm text-silver-500">
          Messages left on the contact form on the website. Mark one In Progress when you pick it
          up so nobody rings the same person twice, and note what was agreed before you close it.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Waiting on us"
          value={waiting}
          tone={waiting > 0 ? "text-amber-600" : "text-silver-900"}
          hint={waiting === 0 ? "Everything has been answered" : `${counts.new} not yet opened`}
        />
        <StatCard label="Closed" value={counts.closed} tone="text-emerald-600" />
        <StatCard label="Total received" value={counts.total} tone="text-silver-900" />
      </div>

      {error && <div className="alert-error">{error}</div>}
      {notice && <div className="alert-success">{notice}</div>}

      {unmailed > 0 && (
        <div className="alert-warning flex items-start gap-2">
          <IconAlert className="mt-0.5 h-4 w-4 shrink-0" />
          <span>
            {unmailed} of these could not be emailed to the admins — this screen is the only place
            they exist. Check the SMTP settings on the server.
          </span>
        </div>
      )}

      <div className="card overflow-hidden">
        <div className="card-header flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          <div className="flex flex-wrap gap-1 rounded-lg bg-silver-100 p-1">
            {TABS.map(({ key, label, countKey }) => (
              <button
                key={key}
                onClick={() => setTab(key)}
                className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
                  tab === key
                    ? "bg-white text-silver-900 shadow-card"
                    : "text-silver-500 hover:text-silver-800"
                }`}
              >
                {label}
                <span className="ml-1.5 tabular-nums text-silver-400">{counts[countKey]}</span>
              </button>
            ))}
          </div>

          <div className="relative flex-1 lg:max-w-sm">
            <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-silver-400" />
            <input
              type="search"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="input pl-9"
              placeholder="Search name, email, phone or message"
            />
          </div>
        </div>

        {loading && list.length === 0 ? (
          <div className="py-16 text-center text-sm text-silver-500">Loading enquiries...</div>
        ) : list.length === 0 ? (
          <div className="py-16 text-center">
            <span className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-silver-100 text-silver-400">
              <IconMail className="h-6 w-6" />
            </span>
            <p className="mt-3 text-sm font-medium text-silver-900">
              {search ? "Nothing matches that search" : "No enquiries here"}
            </p>
            <p className="mt-1 text-sm text-silver-500">
              {search
                ? "Try a name, an email address or a phone number."
                : "Messages from the website's contact form land here."}
            </p>
          </div>
        ) : (
          <ul className="divide-y divide-silver-200">
            {list.map((enquiry) => (
              <li key={enquiry.id}>
                <div className="flex flex-wrap items-start gap-4 px-6 py-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-100 text-xs font-semibold text-brand-700">
                    {initialsOf(enquiry.name)}
                  </span>

                  <button onClick={() => toggleOpen(enquiry)} className="min-w-0 flex-1 text-left">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold text-silver-900">{enquiry.name}</span>
                      <EnquiryStatusBadge status={enquiry.status} />
                      {!enquiry.emailed && (
                        <span className="badge-danger" title="The notification email did not go out">
                          Not emailed
                        </span>
                      )}
                    </div>

                    {/* Two lines, no more: the list is for finding the right
                        enquiry, and the whole message is one click away. */}
                    <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-silver-600">
                      {enquiry.message}
                    </p>

                    <div className="mt-1 text-xs text-silver-500">
                      {formatRelativeTime(enquiry.createdAt)}
                      {enquiry.handledByName && (
                        <> · {STATUS_LABEL[enquiry.status]} by {enquiry.handledByName}</>
                      )}
                    </div>
                  </button>

                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    {NEXT_STEPS[enquiry.status].map((step) => (
                      <button
                        key={step.status}
                        onClick={() => moveTo(enquiry, step.status)}
                        disabled={saving}
                        className={step.variant}
                      >
                        {step.status === "closed" && <IconCheck className="h-4 w-4" />}
                        {step.label}
                      </button>
                    ))}
                  </div>
                </div>

                {openId === enquiry.id && (
                  <div className="space-y-4 border-t border-silver-200 bg-silver-50 px-6 py-5">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <a
                        href={`mailto:${enquiry.email}`}
                        className="flex items-center gap-3 rounded-lg border border-silver-200 bg-white p-3 transition-colors hover:bg-silver-50"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                          <IconMail className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold uppercase tracking-wider text-silver-500">
                            Email
                          </span>
                          <span className="block break-all text-sm font-medium text-silver-900">
                            {enquiry.email}
                          </span>
                        </span>
                      </a>

                      <a
                        href={`tel:${enquiry.phone}`}
                        className="flex items-center gap-3 rounded-lg border border-silver-200 bg-white p-3 transition-colors hover:bg-silver-50"
                      >
                        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-50 text-brand-600">
                          <IconPhone className="h-4 w-4" />
                        </span>
                        <span className="min-w-0">
                          <span className="block text-xs font-semibold uppercase tracking-wider text-silver-500">
                            Phone
                          </span>
                          <span className="block break-all text-sm font-medium text-silver-900">
                            {enquiry.phone}
                          </span>
                        </span>
                      </a>
                    </div>

                    <div className="rounded-lg border border-silver-200 bg-white p-4">
                      <div className="text-xs font-semibold uppercase tracking-wider text-silver-500">
                        Message
                      </div>
                      {/* whitespace-pre-line keeps the visitor's own line
                          breaks; it is still rendered as text, never markup. */}
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-silver-800">
                        {enquiry.message}
                      </p>
                      <div className="mt-3 flex items-center gap-1.5 border-t border-silver-200 pt-3 text-xs text-silver-500">
                        <IconClock className="h-3.5 w-3.5" />
                        Received {formatDateTime(enquiry.createdAt)}
                      </div>
                    </div>

                    <div>
                      <label htmlFor={`note-${enquiry.id}`} className="label">
                        Internal note
                      </label>
                      <textarea
                        id={`note-${enquiry.id}`}
                        rows={3}
                        maxLength={2000}
                        value={notes[enquiry.id] ?? ""}
                        onChange={(e) =>
                          setNotes((current) => ({ ...current, [enquiry.id]: e.target.value }))
                        }
                        className="input resize-y"
                        placeholder="What was agreed, who called, what to do next"
                      />
                      <p className="mt-1 text-xs text-silver-500">
                        Only the panel sees this. It is never sent to the person who wrote in.
                      </p>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <button
                          onClick={() => saveNote(enquiry)}
                          disabled={saving || (notes[enquiry.id] ?? "") === enquiry.adminNote}
                          className="btn-primary btn-sm"
                        >
                          Save note
                        </button>

                        {enquiry.handledByName && (
                          <span className="text-xs text-silver-500">
                            Last touched by {enquiry.handledByName} on{" "}
                            {formatDateTime(enquiry.handledAt)}
                          </span>
                        )}

                        {/* Only the main admin. The server refuses it for a
                            sub-admin either way - this just doesn't offer a
                            button that would only ever answer 403. */}
                        {isMainAdmin && (
                          <button
                            onClick={() => setConfirmDelete(enquiry)}
                            disabled={saving}
                            className="btn-danger btn-sm ml-auto"
                          >
                            <IconTrash className="h-4 w-4" />
                            Delete
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <ConfirmModal
        open={Boolean(confirmDelete)}
        title="Delete this enquiry?"
        message={
          confirmDelete
            ? `${confirmDelete.name}'s message will be removed for good. There is no other record of it in the panel.`
            : ""
        }
        confirmLabel="Delete"
        confirmVariant="btn-danger"
        loading={saving}
        onConfirm={handleDelete}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
