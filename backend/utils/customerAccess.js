// Who an employee is allowed to serve at the counter.
//
// A user row carries the employee who registered it (`created_by_employee_id`
// - see models/managedUserModel.js), and that ownership is the whole rule: an
// employee may look up, price and transact for their own users, and for nobody
// else's. It used to hold only in the employee panel's User Management, while
// the counter served anyone; both sides now read the same rule from here, so
// they cannot drift apart again.
//
// The answer to "not yours" is 404, not 403, and deliberately: an employee has
// no business learning that some other employee's user id exists. It is the
// same wording loadMyUser() in employeeUserController.js already gives, so
// probing the counter tells an outsider nothing the panel wouldn't.

const ManagedUserModel = require("../models/managedUserModel");

// Loads the customer this request names, but only if the signed-in employee
// registered them. Answers the request and returns null when they didn't.
async function loadMyCustomer(req, res, userId) {
  const id = Number(userId);
  const customer = Number.isInteger(id) && id > 0 ? await ManagedUserModel.findById(id) : null;

  if (!customer || Number(customer.created_by_employee_id) !== Number(req.employee.id)) {
    res.status(404).json({ message: "Customer not found" });
    return null;
  }

  return customer;
}

module.exports = { loadMyCustomer };
