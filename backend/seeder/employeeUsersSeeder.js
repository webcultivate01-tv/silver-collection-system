// Run with: npm run seed:employee-users -- <employee-email>
// Defaults to EMPLOYEE_USERS_EMAIL from .env, or tejasmehar7@gmail.com.
//
// Registers a batch of demo users owned by one employee, so the employee panel's
// User Management screen (and the admin's "Added by" filter) has something to
// show without filling the form ten times by hand.
//
// These are ordinary portal users - the same rows POST /api/employee/users
// creates: they sign in at /user with the password printed at the end, and a
// purchase can be recorded against them at the counter. The one difference is
// their documents: a seeder has no files to upload, so those columns stay
// NULL. The employee panel's edit form fills them in later, which is exactly
// what employeeUserController.updateUser() already handles for a user that has
// no documents yet.
//
// Re-running is safe: a user whose email, Aadhaar or PAN number is already
// taken is skipped, not duplicated.

require("dotenv").config();
const bcrypt = require("bcryptjs");
const { pool } = require("../config/db");
const EmployeeModel = require("../models/employeeModel");
const ManagedUserModel = require("../models/managedUserModel");
const { emailTakenAnywhere } = require("../models/accounts");
const { ROLES } = require("../middleware/authMiddleware");
const { slugify } = require("../utils/employeeFiles");
const { buildUserFolder, userFolderExistsOnDisk } = require("../utils/userFiles");

// The password every seeded user gets. It is only a demo credential, so it is
// the same for all ten and printed once the run finishes.
const PASSWORD = process.env.EMPLOYEE_USERS_PASSWORD || "User@123";

// Ten users, each with the details the register form asks for. Aadhaar, PAN
// and mobile numbers are made up but well-formed, because the same validation
// the form applies is applied here.
const USERS = [
  {
    firstName: "Aarav",   lastName: "Sharma",  email: "aarav.sharma@example.com",
    mobile: "9812345601", age: 29, dateOfBirth: "1996-04-12",
    aadhaarNumber: "421056789012", panNumber: "AARSH1201A",
    address: "12 MG Road, Andheri West, Mumbai 400058",
  },
  {
    firstName: "Diya",    lastName: "Patel",   email: "diya.patel@example.com",
    mobile: "9812345602", age: 34, dateOfBirth: "1991-09-03",
    aadhaarNumber: "421056789023", panNumber: "DIPTL2202B",
    address: "45 Ashram Road, Navrangpura, Ahmedabad 380009",
  },
  {
    firstName: "Rohan",   lastName: "Verma",   email: "rohan.verma@example.com",
    mobile: "9812345603", age: 41, dateOfBirth: "1984-01-27",
    aadhaarNumber: "421056789034", panNumber: "ROVER3303C",
    address: "8 Civil Lines, Kanpur 208001",
  },
  {
    firstName: "Ananya",  lastName: "Iyer",    email: "ananya.iyer@example.com",
    mobile: "9812345604", age: 26, dateOfBirth: "1999-11-19",
    aadhaarNumber: "421056789045", panNumber: "ANIYR4404D",
    address: "27 Anna Salai, Teynampet, Chennai 600018",
  },
  {
    firstName: "Kabir",   lastName: "Singh",   email: "kabir.singh@example.com",
    mobile: "9812345605", age: 37, dateOfBirth: "1988-06-08",
    aadhaarNumber: "421056789056", panNumber: "KASIN5505E",
    address: "104 Model Town, Ludhiana 141002",
  },
  {
    firstName: "Meera",   lastName: "Nair",    email: "meera.nair@example.com",
    mobile: "9812345606", age: 31, dateOfBirth: "1994-02-14",
    aadhaarNumber: "421056789067", panNumber: "MENAR6606F",
    address: "3 Marine Drive, Ernakulam, Kochi 682031",
  },
  {
    firstName: "Vivaan",  lastName: "Reddy",   email: "vivaan.reddy@example.com",
    mobile: "9812345607", age: 45, dateOfBirth: "1980-08-22",
    aadhaarNumber: "421056789078", panNumber: "VIRED7707G",
    address: "76 Banjara Hills Road No 2, Hyderabad 500034",
  },
  {
    firstName: "Ishita",  lastName: "Bose",    email: "ishita.bose@example.com",
    mobile: "9812345608", age: 28, dateOfBirth: "1997-12-05",
    aadhaarNumber: "421056789089", panNumber: "ISBOS8808H",
    address: "19 Park Street, Kolkata 700016",
  },
  {
    firstName: "Arjun",   lastName: "Deshmukh", email: "arjun.deshmukh@example.com",
    mobile: "9812345609", age: 33, dateOfBirth: "1992-03-30",
    aadhaarNumber: "421056789090", panNumber: "ARDES9909J",
    address: "58 FC Road, Shivajinagar, Pune 411005",
  },
  {
    firstName: "Sanya",   lastName: "Gupta",   email: "sanya.gupta@example.com",
    mobile: "9812345610", age: 24, dateOfBirth: "2001-07-16",
    aadhaarNumber: "421056789101", panNumber: "SAGUP1010K",
    address: "221 Lajpat Nagar II, New Delhi 110024",
  },
];

// Same rule the controller uses: the employee's own folder, falling back to
// something stable for an employee registered before documents existed.
function employeeFolderFor(employee) {
  return slugify(employee.folder_name || employee.employee_code || `employee-${employee.id}`);
}

// "<employee-folder>/<firstname>-<lastname>", with a numeric suffix if that
// folder already belongs to somebody else - the controller's reserveUserFolder().
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

async function seedEmployeeUsers() {
  const email = (
    process.argv[2] ||
    process.env.EMPLOYEE_USERS_EMAIL ||
    "tejasmehar7@gmail.com"
  ).trim().toLowerCase();

  try {
    const employee = await EmployeeModel.findByEmail(email);

    if (!employee) {
      console.log(`No employee found for ${email}. Nothing to do.`);
      return;
    }

    console.log(`Adding users for ${employee.full_name} (${employee.employee_code})\n`);

    const hashedPassword = await bcrypt.hash(PASSWORD, 10);
    const created = [];
    const skipped = [];

    for (const user of USERS) {
      // Email is unique across every account table (a login searches all of
      // them), Aadhaar and PAN only across users - the same checks the form
      // makes.
      if (await emailTakenAnywhere(user.email, { excludeRole: ROLES.USER })) {
        skipped.push(`${user.email} - an account with this email already exists`);
        continue;
      }

      if (await ManagedUserModel.aadhaarTaken(user.aadhaarNumber)) {
        skipped.push(`${user.email} - Aadhaar number already registered`);
        continue;
      }

      if (await ManagedUserModel.panTaken(user.panNumber)) {
        skipped.push(`${user.email} - PAN number already registered`);
        continue;
      }

      const folderName = await reserveUserFolder(employee, user);

      const id = await ManagedUserModel.create({
        ...user,
        // Kept in step with the two halves of the name, because `name` is what
        // the portal, the counter screen and every report show.
        fullName: `${user.firstName} ${user.lastName}`,
        folderName,
        password: hashedPassword,
        employeeId: employee.id,
      });

      created.push(`#${id}  ${user.firstName} ${user.lastName}  ${user.email}`);
    }

    if (created.length) {
      console.log(`${created.length} user(s) registered:`);
      created.forEach((line) => console.log(`  ${line}`));
      console.log(`\n  Password: ${PASSWORD}  (same for all, sign in at /user)`);
    }

    if (skipped.length) {
      console.log(`\n${skipped.length} skipped:`);
      skipped.forEach((line) => console.log(`  ${line}`));
    }

    const counts = await ManagedUserModel.countByStatus(employee.id);
    console.log(
      `\n${employee.full_name} now has ${counts.total} user(s) - ` +
        `${counts.active} active, ${counts.inactive} inactive.`
    );
  } catch (error) {
    console.error("Failed to seed employee users:", error.message);
  } finally {
    await pool.end();
  }
}

seedEmployeeUsers();
