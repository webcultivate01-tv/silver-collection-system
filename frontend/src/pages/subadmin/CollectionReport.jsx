// Sub-admin's Employee Collection report: the same screen the admin gets, and
// it needs no read-only trimming - there is nothing on it to act on. The
// endpoints behind it are GETs under panelReadAccess, which a sub-admin token
// already carries.

import EmployeeCollectionReport from "../../components/EmployeeCollectionReport.jsx";

export default function CollectionReport() {
  return (
    <EmployeeCollectionReport
      title="Employee Collection Report"
      description="Pick an employee, choose the dates, and download everything they collected in that period."
    />
  );
}
