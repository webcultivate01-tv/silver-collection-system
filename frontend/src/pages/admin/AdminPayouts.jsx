// Silver Payouts — /dashboard/payouts
//
// Two things live here, because they are two halves of one job:
//
//   New Payout   the admin pays a customer directly. Pick the employee, pick
//                one of their users, see what that user holds, decide how much
//                of it to pay out, read the report, pay. The rest stays in the
//                customer's account.
//
//   History      every payout ever made, from the panel and from the counter
//                alike, with the counter's unapproved ones still waiting for
//                the admin's approval here.
//
// They are tabs on one screen rather than two screens because the question
// "have I already paid this person today?" comes up in the middle of paying
// them, and the answer should be one click away, not one navigation away.
//
// The employee list is loaded once here and handed to both tabs - the flow
// needs it to pick from, the history needs it to filter by, and loading it
// twice would be two requests for one list.

import { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";

import PayoutFlow from "../../components/PayoutFlow.jsx";
import PayoutHistory from "../../components/PayoutHistory.jsx";
import { fetchPayoutEmployees } from "../../store/payoutsSlice.js";
import { IconCash, IconReport } from "../../components/Icons.jsx";

const TABS = [
  { key: "new", label: "New Payout", Icon: IconCash },
  { key: "history", label: "Payout History", Icon: IconReport },
];

export default function AdminPayouts() {
  const dispatch = useDispatch();
  const { employees } = useSelector((state) => state.payouts);

  const [tab, setTab] = useState("new");

  // PayoutFlow asks for this list too. Both requests are the same GET, and the
  // one that lands second simply overwrites the first with identical data - so
  // the history tab has the employee filter populated even if the flow tab was
  // never opened.
  useEffect(() => {
    dispatch(fetchPayoutEmployees());
  }, [dispatch]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-silver-900">Silver Payouts</h1>
        <p className="mt-1 text-sm text-silver-500">
          Pay a customer out for the silver they hold, or approve a sell-back recorded at the
          counter. Whatever is not paid out stays in the customer's account.
        </p>
      </div>

      <div className="flex flex-wrap gap-1 rounded-lg bg-silver-100 p-1 w-fit">
        {TABS.map(({ key, label, Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              tab === key
                ? "bg-white text-silver-900 shadow-card"
                : "text-silver-500 hover:text-silver-800"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {/* Each tab keeps its own state while the other is on screen: the flow
          holds a half-finished payout, the history holds a set of filters, and
          neither should be thrown away because the admin glanced at the other.
          `hidden` rather than unmounting is what preserves them. */}
      <div className={tab === "new" ? "" : "hidden"}>
        <PayoutFlow />
      </div>

      <div className={tab === "history" ? "" : "hidden"}>
        <PayoutHistory employees={employees} />
      </div>
    </div>
  );
}
