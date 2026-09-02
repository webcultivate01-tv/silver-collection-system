import { configureStore } from "@reduxjs/toolkit";

import adminsReducer from "./adminsSlice.js";
import adminUsersReducer from "./adminUsersSlice.js";
import authReducer from "./authSlice.js";
import collectionsReducer from "./collectionsSlice.js";
import employeeAuthReducer from "./employeeAuthSlice.js";
import employeesReducer from "./employeesSlice.js";
import employeeUsersReducer from "./employeeUsersSlice.js";
import payoutsReducer from "./payoutsSlice.js";
import purchasesReducer from "./purchasesSlice.js";
import reportsReducer from "./reportsSlice.js";
import salesReducer from "./salesSlice.js";
import settlementsReducer from "./settlementsSlice.js";
import silverRateReducer from "./silverRateSlice.js";
import userAuthReducer from "./userAuthSlice.js";

export const store = configureStore({
  reducer: {
    admins: adminsReducer,
    // The admin panel's read-only view of every user.
    adminUsers: adminUsersReducer,
    auth: authReducer,
    // What each employee has collected at the counter, by client.
    collections: collectionsReducer,
    employeeAuth: employeeAuthReducer,
    employees: employeesReducer,
    // The users the signed-in employee has registered.
    employeeUsers: employeeUsersReducer,
    // The admin's Silver Payout flow: employee -> user -> report -> payment.
    payouts: payoutsReducer,
    purchases: purchasesReducer,
    reports: reportsReducer,
    // The sell-back ledger: customers cashing silver back out.
    sales: salesReducer,
    // The daily cash handover between employees and the admin.
    settlements: settlementsReducer,
    silverRate: silverRateReducer,
    userAuth: userAuthReducer,
  },
});
