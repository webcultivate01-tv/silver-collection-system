// Run with: npm run seed:demo
//
// Fills a local database with enough realistic data to click through the whole
// site: the admin, three employees, a dozen customers, a full month of silver
// rates for August 2026, and the purchases, cash handovers and payouts that
// follow from them.
//
// It is meant for a development machine only - every password here is a demo
// password and every Aadhaar/PAN number is invented (well-formed, so the same
// validation the forms apply would accept them, but not real).
//
// Re-running is safe. Accounts are matched by email and skipped if they exist,
// rates are upserted on their date, and the money rows are only written when
// the tables are empty, so a second run does not double anybody's holding.

require("dotenv").config();
const bcrypt = require("bcryptjs");

const { pool } = require("../config/db");
const {
  AdminModel,
  UserModel,
  findByEmailAnywhere,
  emailTakenAnywhere,
} = require("../models/accounts");
const EmployeeModel = require("../models/employeeModel");
const ManagedUserModel = require("../models/managedUserModel");
const SilverRateModel = require("../models/silverRateModel");
const SilverPurchaseModel = require("../models/silverPurchaseModel");
const SilverSaleModel = require("../models/silverSaleModel");
const CashSettlementModel = require("../models/cashSettlementModel");
const { ROLES } = require("../middleware/authMiddleware");
const { slugify, buildFolderName } = require("../utils/employeeFiles");
const { buildUserFolder, userFolderExistsOnDisk } = require("../utils/userFiles");
const { gramsForAmount, amountForGrams, roundGrams } = require("../utils/silverMath");

// ---------------------------------------------------------------------------
// Demo credentials
// ---------------------------------------------------------------------------
const ADMIN = {
  name: process.env.ADMIN_NAME || "Admin",
  email: (process.env.ADMIN_EMAIL || "admin@gmail.com").toLowerCase(),
  password: process.env.ADMIN_PASSWORD || "Admin123",
};

const EMPLOYEE_PASSWORD = "Employee@123";
const USER_PASSWORD = "User@123";

// The month the demo data sits in.
const YEAR = 2026;
const MONTH = 8; // August
const DAYS_IN_MONTH = 31;

// ---------------------------------------------------------------------------
// Deterministic "randomness"
// ---------------------------------------------------------------------------
// A fixed seed, so two people running this get the same database and something
// spotted on one machine can be reproduced on another. mulberry32 - small,
// fast, and good enough for demo numbers.
function makeRandom(seed) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = makeRandom(20260801);

function pick(list) {
  return list[Math.floor(random() * list.length)];
}

function dateOf(day) {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function rupees(amount) {
  return `Rs ${Number(amount).toLocaleString("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

// ---------------------------------------------------------------------------
// The people
// ---------------------------------------------------------------------------
const EMPLOYEES = [
  {
    firstName: "Rahul", lastName: "Joshi", email: "rahul.joshi@shivshaktisilver.test",
    mobile: "9820011001", alternateMobile: "9820011002", age: 32, dateOfBirth: "1993-05-14",
    aadhaarNumber: "500100200301", panNumber: "RAJOS1001A",
    address: "14 Zaveri Bazaar, Kalbadevi, Mumbai 400002",
  },
  {
    firstName: "Priya", lastName: "Kulkarni", email: "priya.kulkarni@shivshaktisilver.test",
    mobile: "9820011003", alternateMobile: null, age: 28, dateOfBirth: "1997-11-02",
    aadhaarNumber: "500100200302", panNumber: "PRKUL1002B",
    address: "7 Laxmi Road, Budhwar Peth, Pune 411002",
  },
  {
    firstName: "Imran", lastName: "Shaikh", email: "imran.shaikh@shivshaktisilver.test",
    mobile: "9820011004", alternateMobile: "9820011005", age: 41, dateOfBirth: "1984-02-19",
    aadhaarNumber: "500100200303", panNumber: "IMSHA1003C",
    address: "22 Manek Chowk, Khadia, Ahmedabad 380001",
  },
];

// Twelve customers, handed out to the three employees in turn (employeeIndex).
const USERS = [
  { firstName: "Aarav", lastName: "Sharma", email: "aarav.sharma@example.com", mobile: "9812345601", age: 29, dateOfBirth: "1996-04-12", aadhaarNumber: "421056789012", panNumber: "AARSH1201A", address: "12 MG Road, Andheri West, Mumbai 400058", employeeIndex: 0 },
  { firstName: "Diya", lastName: "Patel", email: "diya.patel@example.com", mobile: "9812345602", age: 34, dateOfBirth: "1991-09-03", aadhaarNumber: "421056789023", panNumber: "DIPTL2202B", address: "45 Ashram Road, Navrangpura, Ahmedabad 380009", employeeIndex: 1 },
  { firstName: "Rohan", lastName: "Verma", email: "rohan.verma@example.com", mobile: "9812345603", age: 41, dateOfBirth: "1984-01-27", aadhaarNumber: "421056789034", panNumber: "ROVER3303C", address: "8 Civil Lines, Kanpur 208001", employeeIndex: 2 },
  { firstName: "Ananya", lastName: "Iyer", email: "ananya.iyer@example.com", mobile: "9812345604", age: 26, dateOfBirth: "1999-11-19", aadhaarNumber: "421056789045", panNumber: "ANIYR4404D", address: "27 Anna Salai, Teynampet, Chennai 600018", employeeIndex: 0 },
  { firstName: "Kabir", lastName: "Singh", email: "kabir.singh@example.com", mobile: "9812345605", age: 37, dateOfBirth: "1988-06-08", aadhaarNumber: "421056789056", panNumber: "KASIN5505E", address: "104 Model Town, Ludhiana 141002", employeeIndex: 1 },
  { firstName: "Meera", lastName: "Nair", email: "meera.nair@example.com", mobile: "9812345606", age: 31, dateOfBirth: "1994-02-14", aadhaarNumber: "421056789067", panNumber: "MENAR6606F", address: "3 Marine Drive, Ernakulam, Kochi 682031", employeeIndex: 2 },
  { firstName: "Vivaan", lastName: "Reddy", email: "vivaan.reddy@example.com", mobile: "9812345607", age: 45, dateOfBirth: "1980-08-22", aadhaarNumber: "421056789078", panNumber: "VIRED7707G", address: "76 Banjara Hills Road No 2, Hyderabad 500034", employeeIndex: 0 },
  { firstName: "Ishita", lastName: "Bose", email: "ishita.bose@example.com", mobile: "9812345608", age: 28, dateOfBirth: "1997-12-05", aadhaarNumber: "421056789089", panNumber: "ISBOS8808H", address: "19 Park Street, Kolkata 700016", employeeIndex: 1 },
  { firstName: "Arjun", lastName: "Deshmukh", email: "arjun.deshmukh@example.com", mobile: "9812345609", age: 33, dateOfBirth: "1992-03-30", aadhaarNumber: "421056789090", panNumber: "ARDES9909J", address: "58 FC Road, Shivajinagar, Pune 411005", employeeIndex: 2 },
  { firstName: "Sanya", lastName: "Gupta", email: "sanya.gupta@example.com", mobile: "9812345610", age: 24, dateOfBirth: "2001-07-16", aadhaarNumber: "421056789101", panNumber: "SAGUP1010K", address: "221 Lajpat Nagar II, New Delhi 110024", employeeIndex: 0 },
  { firstName: "Neha", lastName: "Rane", email: "neha.rane@example.com", mobile: "9812345611", age: 30, dateOfBirth: "1995-10-09", aadhaarNumber: "421056789112", panNumber: "NERAN1111L", address: "9 Station Road, Thane West, Thane 400601", employeeIndex: 1 },
  { firstName: "Farhan", lastName: "Qureshi", email: "farhan.qureshi@example.com", mobile: "9812345612", age: 38, dateOfBirth: "1987-01-23", aadhaarNumber: "421056789123", panNumber: "FAQUR1212M", address: "31 Charminar Road, Hyderabad 500002", employeeIndex: 2 },
];

// ---------------------------------------------------------------------------
// 1. Admin
// ---------------------------------------------------------------------------
async function seedAdmin() {
  const existing = await findByEmailAnywhere(ADMIN.email);

  if (existing) {
    if (existing.role !== ROLES.ADMIN) {
      throw new Error(
        `${ADMIN.email} already exists as a ${existing.role}, so the admin cannot be created.`
      );
    }
    console.log(`  admin  ${ADMIN.email} already exists - kept as it is`);
    return existing.id;
  }

  const id = await AdminModel.create({
    name: ADMIN.name,
    email: ADMIN.email,
    password: await bcrypt.hash(ADMIN.password, 10),
  });

  console.log(`  admin  ${ADMIN.email} created`);
  return id;
}

// ---------------------------------------------------------------------------
// 2. Employees
// ---------------------------------------------------------------------------
// "EMP0007" - the same readable id controllers/employeeController.js derives.
function employeeCodeFor(id) {
  return `EMP${String(id).padStart(4, "0")}`;
}

async function reserveEmployeeFolder(employee) {
  const base = buildFolderName(employee.firstName, employee.lastName);

  let candidate = base;
  let suffix = 2;

  while (await EmployeeModel.folderNameTaken(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function seedEmployees() {
  const hashedPassword = await bcrypt.hash(EMPLOYEE_PASSWORD, 10);
  const rows = [];

  for (const employee of EMPLOYEES) {
    const existing = await EmployeeModel.findByEmail(employee.email);

    if (existing) {
      console.log(`  staff  ${existing.employee_code}  ${employee.email} already exists`);
      rows.push(existing);
      continue;
    }

    const folderName = await reserveEmployeeFolder(employee);

    const id = await EmployeeModel.create({
      ...employee,
      fullName: `${employee.firstName} ${employee.lastName}`,
      folderName,
      password: hashedPassword,
    });

    await EmployeeModel.setEmployeeCode(id, employeeCodeFor(id));

    // Registering through the admin panel forces a password change on first
    // login. These are demo logins meant to be signed straight into, so that
    // is cleared here - the flow itself is still testable from a real
    // registration.
    await EmployeeModel.updatePassword(id, hashedPassword, false);

    console.log(`  staff  ${employeeCodeFor(id)}  ${employee.email} created`);
    rows.push(await EmployeeModel.findByEmail(employee.email));
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 3. Customers
// ---------------------------------------------------------------------------
function employeeFolderFor(employee) {
  return slugify(employee.folder_name || employee.employee_code || `employee-${employee.id}`);
}

async function reserveUserFolder(employee, user) {
  const base = buildUserFolder(employeeFolderFor(employee), user.firstName, user.lastName);

  let candidate = base;
  let suffix = 2;

  while (
    (await ManagedUserModel.folderNameTaken(candidate)) ||
    userFolderExistsOnDisk(candidate)
  ) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

async function seedUsers(employees) {
  const hashedPassword = await bcrypt.hash(USER_PASSWORD, 10);
  const rows = [];

  for (const user of USERS) {
    const employee = employees[user.employeeIndex];

    const existing = await UserModel.findByEmail(user.email);
    if (existing) {
      console.log(`  user   ${user.email} already exists`);
      rows.push({ ...existing, employee });
      continue;
    }

    // The same three uniqueness checks the employee panel's register form makes.
    if (await emailTakenAnywhere(user.email, { excludeRole: ROLES.USER })) {
      console.log(`  user   ${user.email} skipped - the email belongs to another account`);
      continue;
    }
    if (await ManagedUserModel.aadhaarTaken(user.aadhaarNumber)) {
      console.log(`  user   ${user.email} skipped - Aadhaar already registered`);
      continue;
    }
    if (await ManagedUserModel.panTaken(user.panNumber)) {
      console.log(`  user   ${user.email} skipped - PAN already registered`);
      continue;
    }

    const folderName = await reserveUserFolder(employee, user);

    const id = await ManagedUserModel.create({
      ...user,
      fullName: `${user.firstName} ${user.lastName}`,
      folderName,
      password: hashedPassword,
      employeeId: employee.id,
    });

    console.log(`  user   #${id} ${user.firstName} ${user.lastName} -> ${employee.employee_code}`);
    rows.push({ id, ...user, employee });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// 4. August 2026 silver rates
// ---------------------------------------------------------------------------
// One row per day of the month. The buying rate wanders up and down around
// Rs 112/g the way a real quote does; the selling rate sits about 2.5% under
// it, which is where the shop's margin comes from.
function buildRates() {
  const rates = [];
  let buy = 111.4;

  for (let day = 1; day <= DAYS_IN_MONTH; day += 1) {
    // A drift of roughly +/- Rs 1.20 a day, nudged back towards Rs 112 so a
    // month of steps does not wander off somewhere silly.
    const drift = (random() - 0.48) * 2.4;
    const pullBack = (112 - buy) * 0.08;
    buy = Math.min(122, Math.max(103, buy + drift + pullBack));

    const buyRate = Number(buy.toFixed(2));
    const sellRate = Number((buy * 0.975).toFixed(2));

    rates.push({ day, rateDate: dateOf(day), buyRate, sellRate });
  }

  return rates;
}

async function seedRates(adminId) {
  const rates = buildRates();

  for (const rate of rates) {
    await SilverRateModel.upsertForDate({
      rateDate: rate.rateDate,
      buyRatePerGram: rate.buyRate,
      sellRatePerGram: rate.sellRate,
      updatedBy: adminId,
    });
  }

  const first = rates[0];
  const last = rates[rates.length - 1];
  console.log(
    `  ${rates.length} daily rates for August ${YEAR}: ` +
      `${first.rateDate} buy Rs ${first.buyRate}/g -> ${last.rateDate} buy Rs ${last.buyRate}/g`
  );

  return rates;
}

// ---------------------------------------------------------------------------
// 5. Purchases, 6. cash handovers, 7. payouts
// ---------------------------------------------------------------------------
// These are only written into an empty table. Purchases are what a holding is
// made of, so adding another month of them on every run would quietly inflate
// every customer's balance and make the numbers on screen meaningless.
async function moneyTablesAreEmpty() {
  const [[{ purchases }]] = await pool.query(
    "SELECT COUNT(*) AS purchases FROM silver_purchases"
  );
  const [[{ sales }]] = await pool.query("SELECT COUNT(*) AS sales FROM silver_sales");
  return Number(purchases) === 0 && Number(sales) === 0;
}

// What a customer hands over at the counter - round notes, not odd amounts.
const AMOUNTS = [500, 1000, 1500, 2000, 2500, 3000, 5000, 7500, 10000];

async function seedPurchases(users, rates) {
  const byDay = new Map(rates.map((rate) => [rate.day, rate]));
  let count = 0;
  let total = 0;

  for (const user of users) {
    // Two to five visits over the month, on distinct days so one customer's
    // history reads like a sequence of visits rather than a burst.
    const visits = 2 + Math.floor(random() * 4);
    const days = new Set();

    while (days.size < visits) {
      days.add(1 + Math.floor(random() * DAYS_IN_MONTH));
    }

    for (const day of [...days].sort((a, b) => a - b)) {
      const rate = byDay.get(day);
      const amount = pick(AMOUNTS);
      // The customer buys at the day's BUYING rate, frozen into the row.
      const grams = gramsForAmount(amount, rate.buyRate);

      await SilverPurchaseModel.create({
        userId: user.id,
        employeeId: user.employee.id,
        amountPaid: amount,
        ratePerGram: rate.buyRate,
        grams,
        purchasedOn: rate.rateDate,
      });

      count += 1;
      total += amount;
    }
  }

  console.log(`  ${count} purchases worth ${rupees(total)} across ${users.length} customers`);
}

// Two rounds of handovers, so the admin panel has all three states to look at:
// accepted (settled, purchases showing 'success'), pending (waiting on the
// admin), and nothing handed over yet.
async function seedSettlements(employees, adminId) {
  const [first, second, third] = employees;

  // Employee 1: handed over and accepted - the finished case.
  const acceptedId = await CashSettlementModel.createFromUnsettled(first.id, dateOf(20));
  if (acceptedId) {
    await CashSettlementModel.accept(acceptedId, { id: adminId, role: ROLES.ADMIN });
    console.log(`  settlement #${acceptedId} (${first.employee_code}) accepted`);
  }

  // Employee 2: handed over, still waiting on the admin - what the pending
  // badge on the dashboard counts.
  const pendingId = await CashSettlementModel.createFromUnsettled(second.id, dateOf(28));
  if (pendingId) {
    console.log(`  settlement #${pendingId} (${second.employee_code}) pending acceptance`);
  }

  // Employee 3: nothing handed over yet, so their own panel still shows a
  // cash-in-hand total waiting to be settled.
  if (third) {
    console.log(`  ${third.employee_code} has cash in hand, nothing handed over yet`);
  }
}

// A few customers selling silver back. The holding is checked inside
// SilverSaleModel.create(), so a sale can never take out more than was bought.
async function seedSales(users, rates, adminId) {
  const lastRate = rates[rates.length - 1];
  const midRate = rates[24];

  // Every third customer sells a slice of what they hold back to the shop.
  const sellers = users.filter((_, index) => index % 3 === 0).slice(0, 4);
  let count = 0;

  for (const [index, user] of sellers.entries()) {
    const [[{ held }]] = await pool.query(
      "SELECT COALESCE(SUM(grams), 0) AS held FROM silver_purchases WHERE user_id = ?",
      [user.id]
    );

    const holding = Number(held);
    if (holding <= 0) continue;

    // A quarter to a half of the holding - enough to leave a balance behind.
    const grams = roundGrams(holding * (0.25 + random() * 0.25));
    if (grams <= 0) continue;

    // Alternating so the payouts screen has both an approved row and one still
    // waiting: the customer sells back at the day's SELLING rate.
    const paid = index % 2 === 0;
    const rate = paid ? midRate : lastRate;

    const result = await SilverSaleModel.create({
      userId: user.id,
      employeeId: user.employee.id,
      grams,
      ratePerGram: rate.sellRate,
      amountPayable: amountForGrams(grams, rate.sellRate),
      soldOn: rate.rateDate,
      payoutKind: "cash",
      payoutStatus: paid ? "paid" : "pending",
      approvedBy: paid ? adminId : null,
    });

    if (result.id) count += 1;
  }

  // One silver coin handed over from the admin panel, where no cash moves at
  // all - the other payout_kind, so that column is not all 'cash' on screen.
  const coinBuyer = users.find((user) => !sellers.includes(user));
  if (coinBuyer) {
    const [[{ held }]] = await pool.query(
      "SELECT COALESCE(SUM(grams), 0) AS held FROM silver_purchases WHERE user_id = ?",
      [coinBuyer.id]
    );

    const grams = roundGrams(Math.min(10, Number(held)));

    if (grams > 0) {
      const result = await SilverSaleModel.create({
        userId: coinBuyer.id,
        employeeId: null,
        recordedByAdminId: adminId,
        grams,
        ratePerGram: lastRate.sellRate,
        amountPayable: amountForGrams(grams, lastRate.sellRate),
        soldOn: lastRate.rateDate,
        payoutKind: "coin",
        payoutStatus: "paid",
        approvedBy: adminId,
        requestId: `demo-coin-${coinBuyer.id}`,
      });

      if (result.id) count += 1;
    }
  }

  console.log(`  ${count} payouts recorded (cash, plus one silver coin)`);
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
async function seedDemo() {
  try {
    console.log("Admin");
    const adminId = await seedAdmin();

    console.log("\nEmployees");
    const employees = await seedEmployees();

    console.log("\nCustomers");
    const users = await seedUsers(employees);

    console.log("\nSilver rates");
    const rates = await seedRates(adminId);

    if (await moneyTablesAreEmpty()) {
      console.log("\nPurchases");
      await seedPurchases(users, rates);

      console.log("\nCash handovers");
      await seedSettlements(employees, adminId);

      console.log("\nPayouts");
      await seedSales(users, rates, adminId);
    } else {
      console.log(
        "\nPurchases, handovers and payouts already exist - left alone so holdings stay correct."
      );
      console.log("  To rebuild them: TRUNCATE silver_sales, cash_settlements, silver_purchases;");
    }

    console.log("\n---------------------------------------------");
    console.log("Sign in with:");
    console.log(`  /admin     ${ADMIN.email}  /  ${ADMIN.password}`);
    console.log(`  /employee  ${EMPLOYEES[0].email}  /  ${EMPLOYEE_PASSWORD}`);
    console.log(`  /user      ${USERS[0].email}  /  ${USER_PASSWORD}`);
    console.log("(every employee and every customer uses the same demo password)");
  } catch (error) {
    console.error("\nFailed to seed demo data:", error.message);
    process.exitCode = 1;
  } finally {
    await pool.end();
  }
}

seedDemo();
