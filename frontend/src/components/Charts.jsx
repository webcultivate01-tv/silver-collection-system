// Charts for the portals, drawn as plain SVG - the app ships no charting
// library and these shapes are small enough to draw by hand.
//
// Indigo is the "silver you hold" series everywhere it appears. The hue was
// picked for contrast against the card surface and checked for colour-blind
// separation against the amber used for sell-backs, so swap it only with a
// fresh check.

import { useState } from "react";
import { dayKeyOf, formatDayShort, toLocalDate } from "../utils/format.js";
import { formatGrams } from "../utils/silverMath.js";

export const SERIES = {
  held: { color: "#4f46e5", label: "Silver held" },
  soldBack: { color: "#d97706", label: "Sold back" },
};

const W = 720;
const H = 220;
const PAD = { top: 16, right: 18, bottom: 26, left: 56 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;
const DAY = 24 * 60 * 60 * 1000;
const AXIS = "#e2e8f0"; // silver-200 - the grid stays recessive
const TICK_TEXT = "#94a3b8"; // silver-400

// Axis ticks read as round numbers or they read as noise: widen the domain to
// the nearest 1/2/5 x 10^n step instead of slicing up the raw range.
function niceDomain(rawMin, rawMax, count = 4) {
  let min = Number(rawMin);
  let max = Number(rawMax);

  if (!Number.isFinite(min) || !Number.isFinite(max)) return { min: 0, max: 1, ticks: [0, 1] };
  if (max === min) max = min + 1;

  const raw = (max - min) / count;
  const magnitude = Math.pow(10, Math.floor(Math.log10(raw)));
  const normalised = raw / magnitude;
  const step = (normalised >= 5 ? 10 : normalised >= 2 ? 5 : normalised >= 1 ? 2 : 1) * magnitude;

  const low = Math.floor(min / step) * step;
  const high = Math.ceil(max / step) * step;

  const ticks = [];
  for (let value = low; value <= high + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  return { min: low, max: high, ticks };
}

function shortGrams(value) {
  const grams = Number(value) || 0;
  if (grams >= 1000) return `${(grams / 1000).toFixed(grams >= 10000 ? 0 : 1)} kg`;
  if (grams >= 10) return `${Math.round(grams)} g`;
  return `${grams.toFixed(1)} g`;
}

function clientXOf(event) {
  if (event.touches && event.touches.length) return event.touches[0].clientX;
  return event.clientX;
}

function midnightOf(value) {
  const date = toLocalDate(value);
  date.setHours(0, 0, 0, 0);
  return date.getTime();
}

// Shared chrome: header, the plot, and a table fallback so every number on the
// chart is also reachable as text.
function ChartCard({ title, subtitle, action, children, table }) {
  return (
    <div className="card flex flex-col">
      <div className="card-header flex-wrap">
        <div className="min-w-0">
          <h2 className="card-title">{title}</h2>
          {subtitle && <p className="mt-0.5 text-xs text-silver-500">{subtitle}</p>}
        </div>
        {action}
      </div>

      <div className="p-4 sm:p-5">{children}</div>

      {table && (
        <details className="border-t border-silver-200 px-5 py-3">
          <summary className="cursor-pointer select-none text-xs font-medium text-silver-500 hover:text-silver-900">
            View as table
          </summary>
          <div className="mt-3 max-h-60 overflow-y-auto">{table}</div>
        </details>
      )}
    </div>
  );
}

function ChartEmpty({ message }) {
  return (
    <div className="grid h-48 place-items-center rounded-lg border border-dashed border-silver-300 bg-silver-50 px-6 text-center text-sm text-silver-500">
      {message}
    </div>
  );
}

function Tooltip({ x, children }) {
  // x arrives in SVG units; the SVG always fills its wrapper, so the same
  // fraction of the width puts the card over the right column.
  const percent = (x / W) * 100;
  const shift = percent < 18 ? "0%" : percent > 82 ? "-100%" : "-50%";

  return (
    <div
      className="pointer-events-none absolute top-2 z-10 rounded-lg border border-silver-200 bg-white px-3 py-2 shadow-lift"
      style={{ left: `${percent}%`, transform: `translateX(${shift})` }}
    >
      {children}
    </div>
  );
}

function TooltipRow({ color, label, value }) {
  return (
    <div className="flex items-center gap-2 whitespace-nowrap text-xs">
      <span className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-silver-500">{label}</span>
      <span className="ml-auto pl-3 font-semibold tabular-nums text-silver-900">{value}</span>
    </div>
  );
}

// One point per day the customer actually traded on, carrying the balance that
// day closed at. A balance only moves when something happens, so the line
// between two points is flat - it is drawn as a step, not a slope.
function dailyBalances(purchases, sales) {
  const days = new Map();

  function touch(value) {
    const key = dayKeyOf(value);
    if (!key) return null;

    let day = days.get(key);
    if (!day) {
      day = { key, time: midnightOf(value), bought: 0, soldBack: 0, balance: 0 };
      days.set(key, day);
    }
    return day;
  }

  purchases.forEach((row) => {
    const day = touch(row.purchasedOn || row.createdAt);
    if (day) day.bought += Number(row.grams) || 0;
  });

  sales.forEach((row) => {
    const day = touch(row.soldOn || row.createdAt);
    if (day) day.soldBack += Number(row.grams) || 0;
  });

  const ordered = [...days.values()].sort((a, b) => a.time - b.time);

  let running = 0;
  ordered.forEach((day) => {
    running += day.bought - day.soldBack;
    day.balance = Math.max(0, Number(running.toFixed(6)));
  });

  return ordered;
}

// ---------------------------------------------------------------------------
// How much silver the customer has held, from their first purchase to today.

// `title`/`subtitle` default to the customer's own wording, since that is
// where this chart started; the admin passes the third-person version when
// they are reading someone else's holding.
export function HoldingChart({
  purchases = [],
  sales = [],
  loading = false,
  action = null,
  title = "Your silver over time",
  subtitle = "Grams held, from your first purchase to today",
  emptyMessage = "Once your first purchase is recorded at the counter, your balance is charted here.",
}) {
  const [hover, setHover] = useState(null);

  const days = dailyBalances(purchases, sales);

  if (loading && days.length === 0) {
    return (
      <ChartCard title={title} subtitle={subtitle} action={action}>
        <div className="skeleton h-48 w-full" />
      </ChartCard>
    );
  }

  if (days.length === 0) {
    return (
      <ChartCard title={title} subtitle={subtitle} action={action}>
        <ChartEmpty message={emptyMessage} />
      </ChartCard>
    );
  }

  // Two synthetic points bracket the real ones: a zero balance the day before
  // the first purchase, so the line rises from the floor, and the balance
  // carried forward to today, so it ends at "now" rather than at whenever the
  // customer last traded. They also guarantee two points - one lone purchase
  // would otherwise have no line to draw.
  const today = midnightOf(new Date());
  const points = [
    { key: "start", time: days[0].time - DAY, bought: 0, soldBack: 0, balance: 0, isNow: false },
    ...days.map((day) => ({ ...day, isNow: false })),
  ];

  const startTime = points[0].time;
  const endTime = Math.max(points[points.length - 1].time, today, startTime + DAY);

  if (points[points.length - 1].time < endTime) {
    points.push({
      ...points[points.length - 1],
      key: "now",
      time: endTime,
      bought: 0,
      soldBack: 0,
      isNow: true,
    });
  }
  const domain = niceDomain(0, Math.max(...points.map((point) => point.balance)));

  const xOf = (time) => PAD.left + ((time - startTime) / (endTime - startTime)) * PLOT_W;
  const yOf = (grams) => PAD.top + (1 - Number(grams) / domain.max) * PLOT_H;
  const baseline = PAD.top + PLOT_H;

  // A balance holds flat until the next trade: go across first, then up.
  const steps = points.map((point, index) => {
    const x = xOf(point.time);
    const y = yOf(point.balance);
    if (index === 0) return `M${x},${y}`;
    return `L${x},${yOf(points[index - 1].balance)} L${x},${y}`;
  });

  const linePath = steps.join(" ");
  const areaPath = `${linePath} L${xOf(endTime)},${baseline} L${xOf(startTime)},${baseline} Z`;
  const active = hover === null ? null : points[hover];

  function handleMove(event) {
    const box = event.currentTarget.getBoundingClientRect();
    if (!box.width) return;

    const time = startTime + ((clientXOf(event) - box.left) / box.width) * (endTime - startTime);
    let nearest = 0;
    points.forEach((point, index) => {
      if (Math.abs(point.time - time) < Math.abs(points[nearest].time - time)) nearest = index;
    });
    setHover(nearest);
  }

  const table = (
    <table className="w-full text-xs">
      <thead className="text-left text-silver-500">
        <tr>
          <th className="py-1 pr-3 font-medium">Date</th>
          <th className="py-1 pr-3 text-right font-medium">Bought</th>
          <th className="py-1 pr-3 text-right font-medium">Sold back</th>
          <th className="py-1 text-right font-medium">Balance</th>
        </tr>
      </thead>
      <tbody className="tabular-nums text-silver-700">
        {[...days].reverse().map((day) => (
          <tr key={day.key} className="border-t border-silver-100">
            <td className="py-1 pr-3">{formatDayShort(day.time)}</td>
            <td className="py-1 pr-3 text-right">{day.bought ? formatGrams(day.bought) : "—"}</td>
            <td className="py-1 pr-3 text-right">{day.soldBack ? formatGrams(day.soldBack) : "—"}</td>
            <td className="py-1 text-right font-medium text-silver-900">{formatGrams(day.balance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );

  return (
    <ChartCard title={title} subtitle={subtitle} action={action} table={table}>
      <div className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label="Grams of silver held over time, from the first purchase to today"
        >
          {domain.ticks.map((tick) => (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={W - PAD.right}
                y1={yOf(tick)}
                y2={yOf(tick)}
                stroke={AXIS}
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <text x={PAD.left - 8} y={yOf(tick) + 3.5} textAnchor="end" fontSize="10.5" fill={TICK_TEXT}>
                {shortGrams(tick)}
              </text>
            </g>
          ))}

          <path d={areaPath} fill={SERIES.held.color} fillOpacity="0.1" />
          <path
            d={linePath}
            fill="none"
            stroke={SERIES.held.color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />

          <circle
            cx={xOf(points[points.length - 1].time)}
            cy={yOf(points[points.length - 1].balance)}
            r="4.5"
            fill={SERIES.held.color}
            stroke="#ffffff"
            strokeWidth="2"
          />

          <text x={PAD.left} y={H - 8} textAnchor="start" fontSize="10.5" fill={TICK_TEXT}>
            {formatDayShort(startTime)}
          </text>
          <text x={W - PAD.right} y={H - 8} textAnchor="end" fontSize="10.5" fill={TICK_TEXT}>
            Today
          </text>

          {hover !== null && (
            <g>
              <line
                x1={xOf(active.time)}
                x2={xOf(active.time)}
                y1={PAD.top}
                y2={baseline}
                stroke="#cbd5e1"
                strokeWidth="1"
                vectorEffect="non-scaling-stroke"
              />
              <circle
                cx={xOf(active.time)}
                cy={yOf(active.balance)}
                r="4.5"
                fill={SERIES.held.color}
                stroke="#ffffff"
                strokeWidth="2"
              />
            </g>
          )}

          <rect
            x={PAD.left}
            y={PAD.top}
            width={PLOT_W}
            height={PLOT_H}
            fill="transparent"
            onMouseMove={handleMove}
            onMouseLeave={() => setHover(null)}
            onTouchStart={handleMove}
            onTouchMove={handleMove}
            onTouchEnd={() => setHover(null)}
          />
        </svg>

        {active && (
          <Tooltip x={xOf(active.time)}>
            <div className="mb-1 text-[11px] font-semibold text-silver-900">
              {active.isNow ? "Today" : formatDayShort(active.time)}
            </div>
            <TooltipRow color={SERIES.held.color} label="Held" value={formatGrams(active.balance)} />
            {active.bought > 0 && (
              <TooltipRow color={SERIES.held.color} label="Bought" value={`+${formatGrams(active.bought)}`} />
            )}
            {active.soldBack > 0 && (
              <TooltipRow
                color={SERIES.soldBack.color}
                label="Sold back"
                value={`-${formatGrams(active.soldBack)}`}
              />
            )}
          </Tooltip>
        )}
      </div>
    </ChartCard>
  );
}
