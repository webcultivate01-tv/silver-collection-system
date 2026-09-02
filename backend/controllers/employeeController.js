// Admin-side Employee Management: register (with documents), list, view, edit,
// reset a forgotten password, block/unblock and delete.

const bcrypt = require("bcryptjs");
const EmployeeModel = require("../models/employeeModel");
const validateEmployee = require("../utils/validateEmployee");
const { validateEmployeeDocuments } = require("../utils/validateEmployee");
const generateTempPassword = require("../utils/generateTempPassword");
const {
  DOCUMENTS,
  buildFolderName,
  deleteFolder,
  folderExistsOnDisk,
  removeFile,
  renameFolder,
  saveDocuments,
} = require("../utils/employeeFiles");

// Aadhaar is sensitive, so the list view only ever shows the last 4 digits.
function maskAadhaar(aadhaar) {
  return `XXXX XXXX ${String(aadhaar).slice(-4)}`;
}

function toListItem(employee) {
  return { ...employee, aadhaar_number: maskAadhaar(employee.aadhaar_number) };
}

// "EMP0007" - readable ID derived from the row id, generated automatically.
function employeeCodeFor(id) {
  return `EMP${String(id).padStart(4, "0")}`;
}

async function assertNoConflict(values, excludeId = null) {
  const conflict = await EmployeeModel.findConflict({
    email: values.email,
    aadhaarNumber: values.aadhaarNumber,
    panNumber: values.panNumber,
    excludeId,
  });

  if (!conflict) return null;

  if (conflict.email === values.email) {
    return { email: "An employee with this email already exists" };
  }

  if (conflict.aadhaar_number === values.aadhaarNumber) {
    return { aadhaarNumber: "An employee with this Aadhaar number already exists" };
  }

  return { panNumber: "An employee with this PAN number already exists" };
}

// "<firstname>-<lastname>", with a numeric suffix if that folder already
// belongs to somebody else.
async function reserveFolderName(values, excludeId = null) {
  const base = buildFolderName(values.firstName, values.lastName);

  let candidate = base;
  let suffix = 2;

  while ((await EmployeeModel.folderNameTaken(candidate, excludeId)) || folderExistsOnDisk(candidate)) {
    candidate = `${base}-${suffix}`;
    suffix += 1;
  }

  return candidate;
}

// @route GET /api/employees
async function listEmployees(req, res) {
  try {
    const { search = "", status = "all" } = req.query;
    const employees = await EmployeeModel.findAll({ search, status });
    const counts = await EmployeeModel.countByStatus();

    res.json({ employees: employees.map(toListItem), counts });
  } catch (error) {
    console.error("listEmployees failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/employees/:id
async function getEmployee(req, res) {
  try {
    const employee = await EmployeeModel.findById(req.params.id);

    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    res.json({ employee });
  } catch (error) {
    console.error("getEmployee failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/employees  (multipart/form-data)
// The admin supplies a temporary password (or lets the UI generate one) plus
// the employee's profile photo, Aadhaar and PAN card scans. The employee ID is
// generated here; the employee is forced to change the password on first login.
async function createEmployee(req, res) {
  try {
    const { errors, values } = validateEmployee(req.body, { staffFields: true });
    const files = req.files || {};

    const tempPassword = String(req.body.tempPassword || "").trim();
    if (tempPassword.length < 6) {
      errors.tempPassword = "Temporary password must be at least 6 characters";
    }

    Object.assign(errors, validateEmployeeDocuments(files));

    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Please correct the highlighted fields", errors });
    }

    const conflict = await assertNoConflict(values);
    if (conflict) {
      return res.status(409).json({ message: Object.values(conflict)[0], errors: conflict });
    }

    const folderName = await reserveFolderName(values);
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    const id = await EmployeeModel.create({ ...values, folderName, password: hashedPassword });

    // The row exists now, so any failure while writing the documents has to roll
    // it back - a half-registered employee would be worse than none.
    try {
      await EmployeeModel.setEmployeeCode(id, employeeCodeFor(id));
      const savedPaths = await saveDocuments(folderName, files);
      await EmployeeModel.updateDocuments(id, savedPaths);
    } catch (error) {
      await EmployeeModel.remove(id);
      await deleteFolder(folderName);
      throw error;
    }

    const employee = await EmployeeModel.findById(id);

    res.status(201).json({ message: "Employee registered successfully", employee });
  } catch (error) {
    console.error("createEmployee failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/employees/:id  (multipart/form-data)
// Documents are optional here - only the ones re-picked get replaced.
async function updateEmployee(req, res) {
  try {
    const existing = await EmployeeModel.findById(req.params.id);
    if (!existing) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const { errors, values } = validateEmployee(req.body, { staffFields: true });
    if (Object.keys(errors).length) {
      return res.status(400).json({ message: "Please correct the highlighted fields", errors });
    }

    const conflict = await assertNoConflict(values, existing.id);
    if (conflict) {
      return res.status(409).json({ message: Object.values(conflict)[0], errors: conflict });
    }

    // Renaming the employee renames their folder so it keeps matching their name.
    // "ramesh-sharma-2" already belongs to this Ramesh Sharma, so leave it alone.
    const desiredFolder = buildFolderName(values.firstName, values.lastName);
    const keepsFolder =
      existing.folder_name && new RegExp(`^${desiredFolder}(-\\d+)?$`).test(existing.folder_name);

    let folderName = existing.folder_name;
    let movedPaths = {};

    if (!keepsFolder) {
      const reserved = await reserveFolderName(values, existing.id);
      const moved = await renameFolder(existing.folder_name, reserved, existing);

      if (moved) {
        folderName = moved.folderName;
        movedPaths = moved.paths;
      } else if (!existing.folder_name) {
        // Registered before documents existed - this is where its files go now.
        folderName = reserved;
      }
      // Otherwise the move couldn't happen; the documents stay where they are.
    }

    await EmployeeModel.update(existing.id, { ...values, folderName });

    const savedPaths = await saveDocuments(folderName, req.files || {});
    await EmployeeModel.updateDocuments(existing.id, { ...movedPaths, ...savedPaths });

    // Drop whichever old files were just replaced.
    for (const doc of DOCUMENTS) {
      const previous = movedPaths[doc.column] || existing[doc.column];
      if (savedPaths[doc.column] && previous) {
        await removeFile(previous);
      }
    }

    const employee = await EmployeeModel.findById(existing.id);

    res.json({ message: "Employee details updated", employee });
  } catch (error) {
    console.error("updateEmployee failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/employees/:id/reset-password
// For when an employee forgets their password. The new temp password is
// returned once here and never stored in plain text.
async function resetEmployeePassword(req, res) {
  try {
    const employee = await EmployeeModel.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const tempPassword = generateTempPassword();
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    await EmployeeModel.updatePassword(employee.id, hashedPassword, true);

    res.json({
      message: "Password reset successfully",
      tempPassword,
      employee: await EmployeeModel.findById(employee.id),
    });
  } catch (error) {
    console.error("resetEmployeePassword failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/employees/:id/block
async function setEmployeeBlocked(req, res) {
  try {
    const employee = await EmployeeModel.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    const blocked = req.body.blocked === true || req.body.blocked === "true";
    await EmployeeModel.setBlocked(employee.id, blocked);

    res.json({
      message: blocked ? "Employee has been blocked" : "Employee has been unblocked",
      employee: await EmployeeModel.findById(employee.id),
    });
  } catch (error) {
    console.error("setEmployeeBlocked failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route DELETE /api/employees/:id
// Removes the record and the whole document folder from disk.
async function deleteEmployee(req, res) {
  try {
    const employee = await EmployeeModel.findById(req.params.id);
    if (!employee) {
      return res.status(404).json({ message: "Employee not found" });
    }

    await EmployeeModel.remove(employee.id);
    await deleteFolder(employee.folder_name);

    res.json({ message: `${employee.full_name} has been deleted`, id: employee.id });
  } catch (error) {
    console.error("deleteEmployee failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  listEmployees,
  getEmployee,
  createEmployee,
  updateEmployee,
  resetEmployeePassword,
  setEmployeeBlocked,
  deleteEmployee,
};
