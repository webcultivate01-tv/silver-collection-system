// One side of a day's silver rate - buying or selling - as it appears in the
// dark header card on the admin rate page, the rate report and the user portal.
//
// `change` is how much this side moved since the previous published day; pass
// null (or leave it out) when there is nothing to compare against. `hint`
// replaces the "per gram" caption where it is worth saying whose side of the
// trade the figure is - "what a customer pays" rather than just "Buying".

import { formatRupees } from "../utils/format.js";

const SIZES = { lg: "text-4xl", md: "text-3xl", sm: "text-2xl" };

export default function RateFigure({ label, value, change = null, size = "lg", hint = "" }) {
  return (
    <div>
      <div className="text-[11px] font-semibold uppercase tracking-wider text-white/60">
        {label}
      </div>
      <div className={`font-bold tabular-nums ${SIZES[size] || SIZES.lg}`}>
        ₹{formatRupees(value)}
      </div>
      <div className="mt-1 flex items-center gap-2">
        <span className="text-xs text-white/60">{hint || "per gram"}</span>
        {!!change && (
          <span className={`badge ${change > 0 ? "badge-success" : "badge-danger"} tabular-nums`}>
            {change > 0 ? "▲" : "▼"} ₹{formatRupees(Math.abs(change))}
          </span>
        )}
      </div>
    </div>
  );
}
