// Admin registers a new employee and hands them a temporary password.

import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import EmployeeForm, { emptyEmployee, validate } from "./EmployeeForm.jsx";
import CredentialBox from "../../components/CredentialBox.jsx";
import PasswordInput from "../../components/PasswordInput.jsx";
import { clearEmployeeErrors, createEmployee } from "../../store/employeesSlice.js";
import { IconArrowLeft, IconKey } from "../../components/Icons.jsx";

// Mirrors backend/utils/generateTempPassword.js - readable, no ambiguous characters.
function suggestPassword() {
  const letters = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz";
  const digits = "23456789";
  const alphabet = letters + digits;
  const random = crypto.getRandomValues(new Uint32Array(10));
  return Array.from(random, (n, i) => {
    if (i === 0) return letters[n % letters.length];
    if (i === 1) return digits[n % digits.length];
    return alphabet[n % alphabet.length];
  }).join("");
}

export default function EmployeeRegister() {
  const [values, setValues] = useState({ ...emptyEmployee, tempPassword: "" });
  const [localErrors, setLocalErrors] = useState({});
  const [issued, setIssued] = useState(null);

  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { saving, error, fieldErrors } = useSelector((state) => state.employees);

  useEffect(() => {
    dispatch(clearEmployeeErrors());
  }, [dispatch]);

  const errors = { ...fieldErrors, ...localErrors };

  async function handleSubmit(e) {
    e.preventDefault();

    const found = validate(values, { requirePassword: true, requireDocuments: true });
    setLocalErrors(found);
    if (Object.keys(found).length) return;

    const result = await dispatch(createEmployee({ ...values, age: Number(values.age) }));

    if (createEmployee.fulfilled.match(result)) {
      setIssued({
        id: result.payload.id,
        employeeCode: result.payload.employee_code,
        fullName: result.payload.full_name,
        email: result.payload.email,
        password: values.tempPassword,
      });
    }
  }

  if (issued) {
    return (
      <div className="max-w-2xl space-y-6">
        <div className="alert-success">Employee registered successfully.</div>

        <div className="card px-6 py-5">
          <div className="text-xs font-semibold uppercase tracking-wider text-silver-500">
            Employee ID (generated automatically)
          </div>
          <div className="mt-1 text-2xl font-bold tracking-wide text-silver-900 tabular-nums">
            {issued.employeeCode}
          </div>
          <p className="mt-1 text-sm text-silver-500">
            {issued.fullName} · documents saved on the server.
          </p>
        </div>

        <CredentialBox
          email={issued.email}
          password={issued.password}
          title="Employee login credentials"
        />

        <div className="flex flex-wrap gap-3">
          <Link to={`/dashboard/employees/${issued.id}`} className="btn-primary">
            View employee
          </Link>
          <Link to="/dashboard/employees" className="btn-secondary">
            Back to list
          </Link>
          <button
            className="btn-secondary"
            onClick={() => {
              setValues({ ...emptyEmployee, tempPassword: "" });
              setIssued(null);
            }}
          >
            Register another
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <button
          onClick={() => navigate("/dashboard/employees")}
          className="inline-flex items-center gap-1.5 text-sm text-silver-500 hover:text-silver-800"
        >
          <IconArrowLeft className="w-4 h-4" />
          Employees
        </button>
        <h1 className="mt-2 text-2xl font-bold text-silver-900">Register Employee</h1>
        <p className="mt-1 text-sm text-silver-500">
          Add a new team member, upload their documents and give them access to the employee
          portal. The employee ID is generated for you.
        </p>
      </div>

      {error && <div className="alert-error">{error}</div>}

      <form onSubmit={handleSubmit}>
        <div className="card">
          <div className="card-body">
            <EmployeeForm values={values} errors={errors} onChange={setValues}>
              <section>
                <h3 className="text-sm font-semibold text-silver-900">Portal Access</h3>
                <p className="mt-1 text-xs text-silver-500">
                  The employee signs in at <code className="text-silver-700">/employee</code> with
                  their email and this password, then must change it.
                </p>

                <div className="mt-4 max-w-sm">
                  <label className="label">Temporary Password</label>
                  <div className="flex gap-2">
                    <div className="flex-1">
                      <PasswordInput
                        value={values.tempPassword}
                        onChange={(e) => setValues({ ...values, tempPassword: e.target.value })}
                        className={errors.tempPassword ? "input-error" : ""}
                        placeholder="At least 6 characters"
                        autoComplete="new-password"
                      />
                    </div>
                    <button
                      type="button"
                      className="btn-secondary shrink-0"
                      onClick={() => setValues({ ...values, tempPassword: suggestPassword() })}
                    >
                      <IconKey className="w-4 h-4" />
                      Generate
                    </button>
                  </div>
                  {errors.tempPassword && <p className="field-error">{errors.tempPassword}</p>}
                </div>
              </section>
            </EmployeeForm>
          </div>

          <div className="px-6 py-4 border-t border-silver-200 flex justify-end gap-3">
            <Link to="/dashboard/employees" className="btn-secondary">
              Cancel
            </Link>
            <button type="submit" disabled={saving} className="btn-primary">
              {saving ? "Registering..." : "Register Employee"}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
}
