// Today's silver rate at the top of every portal: the buying and the selling
// rate per gram, side by side, and nothing else competing with them up there.

import { Link } from "react-router-dom";
import { useDispatch, useSelector } from "react-redux";
import { useEffect } from "react";
import { fetchTodayRate } from "../store/silverRateSlice.js";
import { formatRupees } from "../utils/format.js";

function RateColumn({ label, value }) {
  return (
    <div className="leading-tight">
      <div className="text-[10px] font-semibold uppercase tracking-wider text-silver-500">
        {label}
      </div>
      <div className="text-base font-bold tabular-nums text-silver-900">
        ₹{formatRupees(value)}
      </div>
    </div>
  );
}

export default function SilverRatePill({ manageLink = null }) {
  const dispatch = useDispatch();
  const { rate, loading } = useSelector((state) => state.silverRate);

  useEffect(() => {
    dispatch(fetchTodayRate());
  }, [dispatch]);

  if (loading && !rate) {
    return <div className="h-11 w-64 animate-pulse rounded-xl bg-silver-200" />;
  }

  if (!rate) {
    return (
      <div className="flex items-center gap-3 rounded-xl border border-dashed border-silver-300 bg-white px-4 py-2">
        <span className="text-sm text-silver-500">Today's silver rate is not set</span>
        {manageLink && (
          <Link to={manageLink} className="text-sm font-medium text-brand-600 hover:underline">
            Set it
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-center gap-3 rounded-xl border border-silver-200 bg-gradient-to-r from-white to-silver-50 px-4 py-2 shadow-card">
      <span className="hidden text-[11px] font-semibold uppercase leading-tight tracking-wider text-silver-500 sm:block">
        Silver Rate
        <br />
        (per gm)
      </span>
      <RateColumn label="Buying" value={rate.buyRatePerGram} />
      <span className="h-7 w-px bg-silver-200" />
      <RateColumn label="Selling" value={rate.sellRatePerGram} />
    </div>
  );
}
