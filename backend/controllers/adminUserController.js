// The admin panel's Users screen: read-only.
//
// The admin sees every user in the system and which employee added them, can
// narrow the list down to one employee, and can open any user to see their full
// details and documents. Registering and editing users stays with the employee
// who owns them (see employeeUserController.js), so there is nothing here that
// writes.

const ManagedUserModel = require("../models/managedUserModel");
const SilverPurchaseModel = require("../models/silverPurchaseModel");
const SilverSaleModel = require("../models/silverSaleModel");
const { loadHolding } = require("../utils/holding");
const { toPurchase } = require("./purchaseController");
const { toSale } = require("./saleController");

// Aadhaar is sensitive, so a list row only ever shows the last 4 digits.
function maskAadhaar(aadhaar) {
  if (!aadhaar) return null;
  return `XXXX XXXX ${String(aadhaar).slice(-4)}`;
}

function toListItem(user) {
  return { ...user, aadhaar_number: maskAadhaar(user.aadhaar_number) };
}

// @route GET /api/users?employeeId=&search=&status=
// `employees` is the "Added by" filter: every employee with how many users they
// have registered.
async function listUsers(req, res) {
  try {
    const { search = "", status = "all" } = req.query;
    const employeeId = Number(req.query.employeeId) || null;

    const [users, counts, employees] = await Promise.all([
      ManagedUserModel.findAll({
        employeeId,
        search: String(search).trim().slice(0, 80),
        status,
      }),
      ManagedUserModel.countByStatus(employeeId),
      ManagedUserModel.countsByEmployee(),
    ]);

    res.json({ users: users.map(toListItem), counts, employees });
  } catch (error) {
    console.error("listUsers failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/users/:id
// Alongside the record itself: what they hold now, and the purchases and
// sell-backs behind that figure - the same numbers the customer sees in their
// own portal and the employee sees at the counter, computed the same way
// (see utils/holding.js) so none of the three ever disagrees with another.
async function getUser(req, res) {
  try {
    const user = await ManagedUserModel.findById(req.params.id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    const [holding, purchases, sales] = await Promise.all([
      loadHolding(user.id),
      SilverPurchaseModel.listForUser(user.id, { limit: 50 }),
      SilverSaleModel.listForUser(user.id, { limit: 50 }),
    ]);

    res.json({
      user,
      holding,
      purchases: purchases.map(toPurchase),
      sales: sales.map(toSale),
    });
  } catch (error) {
    console.error("getUser failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = { listUsers, getUser };
