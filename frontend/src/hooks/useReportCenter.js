// Everything the report download centre does apart from drawing it: the
// filters each card carries, the fetch each filter triggers, the suggestions
// each search box offers, and the report object the download buttons write.
//
// The admin and sub-admin Reports pages both read from here, so a filter can
// never mean one thing on one page and something else on the other - only the
// page furniture around the cards differs. Every endpoint used is a GET the
// sub-admin's read-only token already reaches (panelReadAccess).

import { useEffect, useMemo } from "react";
import { useDispatch, useSelector } from "react-redux";

import { fetchEmployeeReport, fetchSilverRateReport } from "../store/reportsSlice.js";
import { fetchUsers } from "../store/adminUsersSlice.js";
import { fetchSettlements } from "../store/settlementsSlice.js";
import { fetchAllPurchases } from "../store/purchasesSlice.js";
import { useReportFilterState, useUnfilteredRows } from "../components/ReportFilters.jsx";
import {
  buildEmployeeReport,
  buildPurchaseReport,
  buildSettlementReport,
  buildSilverRateReport,
  buildUserReport,
} from "../utils/reportBuilders.js";
import {
  SILVER_RATE_REPORT_FILTERS,
  employeeReportFilters,
  purchaseReportFilters,
  settlementReportFilters,
  userReportFilters,
} from "../utils/reportFilterFields.js";
import { uniqueOptions } from "../utils/suggest.js";

// A phone number is worth showing beside a name - two people can share a
// first name, a number can't be shared.
function mobileHint(mobile) {
  return mobile ? `+91 ${mobile}` : "";
}

function joinHint(...parts) {
  return parts.filter(Boolean).join(" · ");
}

export function useReportCenter() {
  const dispatch = useDispatch();

  const { employees, employeesLoading, rates, ratesLoading } = useSelector(
    (state) => state.reports
  );
  const {
    list: users,
    loading: usersLoading,
    employees: userEmployeeOptions,
  } = useSelector((state) => state.adminUsers);
  const { all: settlements, allLoading: settlementsLoading } = useSelector(
    (state) => state.settlements
  );
  const { all: purchases, allLoading: purchasesLoading } = useSelector((state) => state.purchases);

  const employeeFilters = useReportFilterState(employeeReportFilters().defaults);
  const userFilters = useReportFilterState(userReportFilters().defaults);
  const rateFilters = useReportFilterState(SILVER_RATE_REPORT_FILTERS.defaults);
  const settlementFilters = useReportFilterState(settlementReportFilters().defaults);
  const purchaseFilters = useReportFilterState(purchaseReportFilters().defaults);

  // Every card re-fetches whenever its own filters change, so what's on screen
  // (and what downloads) is always the current filter, not last session's
  // leftovers.
  useEffect(() => {
    dispatch(fetchEmployeeReport(employeeFilters.values));
  }, [dispatch, employeeFilters.values]);

  useEffect(() => {
    dispatch(fetchSilverRateReport({ ...rateFilters.values, limit: 500 }));
  }, [dispatch, rateFilters.values]);

  useEffect(() => {
    dispatch(fetchUsers(userFilters.values));
  }, [dispatch, userFilters.values]);

  useEffect(() => {
    dispatch(fetchSettlements(settlementFilters.values));
  }, [dispatch, settlementFilters.values]);

  useEffect(() => {
    dispatch(fetchAllPurchases({ ...purchaseFilters.values, limit: 200 }));
  }, [dispatch, purchaseFilters.values]);

  // What each search box offers under the cursor. The rows a card is holding
  // narrow as its own search narrows, so each list is taken from the last
  // fetch that had no search term - the full set, as it stood before typing.
  const employeeRoster = useUnfilteredRows(employees, !employeeFilters.values.search);
  const userRoster = useUnfilteredRows(users, !userFilters.values.search);
  const purchaseRoster = useUnfilteredRows(purchases, !purchaseFilters.values.search);

  const employeeSuggestions = useMemo(
    () =>
      uniqueOptions(employeeRoster, (employee) => ({
        value: `${employee.firstName} ${employee.lastName}`.trim(),
        label: `${employee.firstName} ${employee.lastName}`.trim(),
        hint: joinHint(employee.employeeCode, mobileHint(employee.mobile), employee.email),
      })),
    [employeeRoster]
  );

  const userSuggestions = useMemo(
    () =>
      uniqueOptions(userRoster, (user) => ({
        value: user.name,
        label: user.name,
        hint: joinHint(mobileHint(user.mobile), user.email),
        trailing: user.employee_name || "",
      })),
    [userRoster]
  );

  const purchaseSuggestions = useMemo(
    () =>
      uniqueOptions(purchaseRoster, (purchase) => ({
        value: purchase.customerName,
        label: purchase.customerName,
        hint: purchase.customerEmail || "",
        trailing: purchase.employeeName || "",
      })),
    [purchaseRoster]
  );

  const selectedUserEmployee = userEmployeeOptions.find(
    (employee) => String(employee.id) === userFilters.values.employeeId
  );
  const selectedSettlementEmployee = userEmployeeOptions.find(
    (employee) => String(employee.id) === settlementFilters.values.employeeId
  );

  return {
    employees: {
      count: employees.length,
      loading: employeesLoading,
      report: buildEmployeeReport(employees, employeeFilters.values),
      filters: {
        fields: employeeReportFilters(employeeSuggestions).fields,
        ...employeeFilters,
      },
    },

    users: {
      count: users.length,
      loading: usersLoading,
      report: buildUserReport(users, {
        ...userFilters.values,
        employeeLabel: selectedUserEmployee?.fullName,
      }),
      filters: {
        fields: userReportFilters(userEmployeeOptions, userSuggestions).fields,
        ...userFilters,
      },
    },

    rates: {
      count: rates.length,
      loading: ratesLoading,
      report: buildSilverRateReport(rates, rateFilters.values),
      filters: { fields: SILVER_RATE_REPORT_FILTERS.fields, ...rateFilters },
    },

    settlements: {
      count: settlements.length,
      loading: settlementsLoading,
      report: buildSettlementReport(settlements, {
        ...settlementFilters.values,
        employeeLabel: selectedSettlementEmployee?.fullName,
      }),
      filters: {
        fields: settlementReportFilters(userEmployeeOptions).fields,
        ...settlementFilters,
      },
    },

    purchases: {
      count: purchases.length,
      loading: purchasesLoading,
      report: buildPurchaseReport(purchases, purchaseFilters.values),
      filters: {
        fields: purchaseReportFilters(purchaseSuggestions).fields,
        ...purchaseFilters,
      },
    },
  };
}
