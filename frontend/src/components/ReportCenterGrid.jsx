// The report download centre's grid of cards.
//
// Both /dashboard/reports and /sub-admin/reports render this exact component,
// which is the point of it: "a sub-admin can generate every report the admin
// can" is a promise that used to be kept by two files listing the same cards
// in the same order, and it broke the moment one of them gained a card the
// other didn't. There is now one list, so it cannot happen again - a card
// added here appears on both pages, or on neither.
//
// Every card is filtered and fetched by useReportCenter, and every endpoint it
// reads is a GET behind panelReadAccess - the guard that already covers both
// panel roles. Nothing here writes, for either role.

import { useReportCenter } from "../hooks/useReportCenter.js";
import { EmployeeCollectionReportCard } from "./EmployeeCollectionReport.jsx";
import ReportCard from "./ReportCard.jsx";
import { IconCash, IconRate, IconReport, IconUsers } from "./Icons.jsx";

export default function ReportCenterGrid() {
  const reports = useReportCenter();

  return (
    <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
      <ReportCard
        icon={<IconUsers className="h-5 w-5" />}
        title="Employees"
        description="Registered staff, contact details and account status. Click the search box to pick a name from the roster."
        countLabel="employees"
        {...reports.employees}
      />

      <ReportCard
        icon={<IconUsers className="h-5 w-5" />}
        title="Users"
        description="Every customer, who added them, and their status. Start typing a name and pick it from the list."
        countLabel="users"
        {...reports.users}
      />

      <ReportCard
        icon={<IconRate className="h-5 w-5" />}
        title="Silver Rates"
        description="Published buying and selling rates. Pick a From and To date to pull one period's history."
        countLabel="rate entries"
        {...reports.rates}
      />

      <ReportCard
        icon={<IconCash className="h-5 w-5" />}
        title="Cash Settlements"
        description="Every employee handover, pending and accepted, over whatever period you choose. Pick one employee to pull their settlement history alone."
        countLabel="handovers"
        {...reports.settlements}
      />

      <ReportCard
        icon={<IconReport className="h-5 w-5" />}
        title="Purchases"
        description="The full silver purchase ledger, across every employee. Type a customer's name to narrow it."
        countLabel="purchases"
        {...reports.purchases}
      />

      {/* Its own card rather than a ReportCard: it picks one employee by name
          and states that employee's total, so it carries its own filters and
          its own figure. */}
      <EmployeeCollectionReportCard />
    </div>
  );
}
