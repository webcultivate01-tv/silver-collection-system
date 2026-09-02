// The one place that decides how a purchase's or a handover's status reads,
// so "pending" and "success" look identical on the employee, admin and user
// panels - a customer and an employee looking at the same purchase should
// never see two different words for the same state.

export function PaymentStatusBadge({ status }) {
  if (status === "success") {
    return <span className="badge-success">Success</span>;
  }
  return <span className="badge-warning">Pending</span>;
}

// A sell-back payout: the customer's silver is already gone, but the cash
// hasn't left the till until an admin says so.
export function PayoutStatusBadge({ status }) {
  if (status === "paid") {
    return <span className="badge-success">Paid</span>;
  }
  return <span className="badge-warning">Awaiting payout</span>;
}

export function SettlementStatusBadge({ status }) {
  if (status === "accepted") {
    return <span className="badge-success">Accepted</span>;
  }
  return <span className="badge-warning">Awaiting admin</span>;
}
