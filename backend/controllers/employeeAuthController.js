// The employee side of authentication: login at /employee, view own profile,
// replace their own profile photo, change the temporary password the admin
// handed out, and reset a forgotten password with an emailed OTP (same flow
// the admin/user accounts use).

const bcrypt = require("bcryptjs");
const EmployeeModel = require("../models/employeeModel");
const generateToken = require("../utils/generateToken");
const { generateOtp, hashOtp, otpMatches } = require("../utils/generateOtp");
const { sendOtpEmail } = require("../utils/sendEmail");
const { buildFolderName, removeFile, saveDocuments } = require("../utils/employeeFiles");

const OTP_VALID_MINUTES = 10;
const MAX_OTP_ATTEMPTS = 5;

// bcrypt.compare throws on anything that is not a string, and a truthy
// non-string slips past a plain `!password` check - see authController.
function asCredential(value) {
  return typeof value === "string" ? value : "";
}

// Even to its owner, only the last 4 digits are shown - the same rule the
// admin list view follows.
function maskAadhaar(aadhaar) {
  if (!aadhaar) return null;
  return `XXXX XXXX ${String(aadhaar).slice(-4)}`;
}

function toPublicEmployee(employee) {
  return {
    id: employee.id,
    employeeCode: employee.employee_code,
    firstName: employee.first_name,
    lastName: employee.last_name,
    fullName: employee.full_name,
    profilePhoto: employee.profile_photo,
    email: employee.email,
    mobile: employee.mobile,
    alternateMobile: employee.alternate_mobile,
    age: employee.age,
    address: employee.address,
    dateOfBirth: employee.date_of_birth,
    aadhaarNumber: maskAadhaar(employee.aadhaar_number),
    panNumber: employee.pan_number,
    // The employee can look at their own ID scans, but only the admin can
    // replace them. Only the front of the PAN card is held now.
    documents: {
      aadhaarFront: employee.aadhaar_front,
      aadhaarBack: employee.aadhaar_back,
      panFront: employee.pan_front,
    },
    isBlocked: !!employee.is_blocked,
    mustChangePassword: !!employee.must_change_password,
    registeredOn: employee.created_at,
    lastUpdatedOn: employee.updated_at,
  };
}

// @route POST /api/employee/login
async function employeeLogin(req, res) {
  try {
    const email = asCredential(req.body.email);
    const password = asCredential(req.body.password);

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password are required" });
    }

    const employee = await EmployeeModel.findByEmail(email.trim().toLowerCase());
    if (!employee) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    const isPasswordCorrect = await bcrypt.compare(password, employee.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Invalid email or password" });
    }

    // Checked after the password so a wrong guess can't reveal who is blocked.
    if (employee.is_blocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact the admin.",
      });
    }

    const token = generateToken({ id: employee.id, role: "employee" });

    res.json({
      message: "Login successful",
      token,
      employee: toPublicEmployee(employee),
    });
  } catch (error) {
    console.error("employeeLogin failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route GET /api/employee/me
async function getMyProfile(req, res) {
  try {
    res.json({ employee: toPublicEmployee(req.employee) });
  } catch (error) {
    console.error("getMyProfile failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/employee/profile-photo  (multipart/form-data)
// The one thing an employee may change about their own record. Everything else
// on the profile screen is read-only and stays the admin's to edit.
async function updateMyProfilePhoto(req, res) {
  try {
    const photo = req.files?.profilePhoto?.[0];

    if (!photo) {
      return res.status(400).json({ message: "Please choose a photo to upload" });
    }

    const employee = req.employee;

    // Registered before document folders existed - give them the same folder the
    // admin panel would have picked, and remember it on the row.
    const folderName =
      employee.folder_name || buildFolderName(employee.first_name, employee.last_name);

    const savedPaths = await saveDocuments(folderName, req.files);
    await EmployeeModel.updateDocuments(employee.id, { ...savedPaths, folder_name: folderName });

    // Drop the photo that was just replaced.
    if (employee.profile_photo && employee.profile_photo !== savedPaths.profile_photo) {
      await removeFile(employee.profile_photo);
    }

    res.json({
      message: "Profile photo updated",
      employee: toPublicEmployee(await EmployeeModel.findById(employee.id)),
    });
  } catch (error) {
    console.error("updateMyProfilePhoto failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route PUT /api/employee/change-password
async function changeMyPassword(req, res) {
  try {
    const currentPassword = asCredential(req.body.currentPassword);
    const newPassword = asCredential(req.body.newPassword);

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: "Current and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    // req.employee comes from the guard and excludes the hash, so re-read it here.
    const employee = await EmployeeModel.findByEmail(req.employee.email);

    const isPasswordCorrect = await bcrypt.compare(currentPassword, employee.password);
    if (!isPasswordCorrect) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await EmployeeModel.updatePassword(employee.id, hashedPassword, false);

    res.json({
      message: "Password changed successfully",
      employee: toPublicEmployee(await EmployeeModel.findById(employee.id)),
    });
  } catch (error) {
    console.error("changeMyPassword failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/employee/forgot-password
// Generates a 6-digit OTP, stores it (with a 10 minute expiry) and emails it.
async function employeeForgotPassword(req, res) {
  try {
    const email = asCredential(req.body.email).trim().toLowerCase();

    if (!email) {
      return res.status(400).json({ message: "Email is required" });
    }

    // Same reply either way, so this can't be used to discover who is registered.
    const generic = { message: "If that email exists, an OTP has been sent to it" };

    const employee = await EmployeeModel.findByEmail(email);
    if (!employee || employee.is_blocked) {
      return res.json(generic);
    }

    const otp = generateOtp();
    const expiresAt = new Date(Date.now() + OTP_VALID_MINUTES * 60 * 1000);

    await EmployeeModel.setResetOtp(employee.id, hashOtp(otp), expiresAt);
    await sendOtpEmail(email, otp);

    res.json(generic);
  } catch (error) {
    console.error("employeeForgotPassword failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

// @route POST /api/employee/reset-password
// Verifies the OTP and, if valid, saves the new password. The employee has
// chosen it themselves, so the "must change password" flag is cleared too.
async function employeeResetPassword(req, res) {
  try {
    const email = asCredential(req.body.email).trim().toLowerCase();
    const otp = asCredential(req.body.otp).trim();
    const newPassword = asCredential(req.body.newPassword);

    if (!email || !otp || !newPassword) {
      return res.status(400).json({ message: "Email, OTP and new password are required" });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({ message: "New password must be at least 6 characters" });
    }

    const employee = await EmployeeModel.findByEmail(email);
    if (!employee || !employee.reset_otp) {
      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    const isOtpExpired = new Date() > new Date(employee.reset_otp_expires);

    // Compared against the stored hash, in constant time; a wrong code costs an
    // attempt, and the code is retired after too many.
    if (!otpMatches(otp, employee.reset_otp) || isOtpExpired) {
      const attempts = await EmployeeModel.recordOtpFailure(employee.id);

      if (attempts >= MAX_OTP_ATTEMPTS || isOtpExpired) {
        await EmployeeModel.clearResetOtp(employee.id);
      }

      return res.status(400).json({ message: "Invalid or expired OTP" });
    }

    if (employee.is_blocked) {
      return res.status(403).json({
        message: "Your account has been blocked. Please contact the admin.",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await EmployeeModel.updatePassword(employee.id, hashedPassword, false);
    await EmployeeModel.clearResetOtp(employee.id);

    res.json({ message: "Password reset successful. You can now log in." });
  } catch (error) {
    console.error("employeeResetPassword failed:", error);
    res.status(500).json({ message: "Something went wrong on the server" });
  }
}

module.exports = {
  employeeLogin,
  getMyProfile,
  updateMyProfilePhoto,
  changeMyPassword,
  employeeForgotPassword,
  employeeResetPassword,
};
