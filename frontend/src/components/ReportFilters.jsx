// Inline filter controls for one report card - narrows what gets fetched,
// built into the report and downloaded, all before a single byte reaches
// disk. So "download" always means "download exactly what these filters
// describe", never "download everything and hope".
//
// Text fields debounce so typing doesn't fire a request per keystroke (same
// pattern as UserList.jsx); selects and dates apply the moment they change
// (same as CashSettlements.jsx).
//
// A "suggest" field is a text field with the names it filters on listed
// underneath it: click it to see who there is, type to narrow, and a slipped
// key still finds the name (see utils/suggest.js). Picking a suggestion
// applies at once rather than waiting out the debounce.

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { isTypoMatch, rankSuggestions } from "../utils/suggest.js";
import { IconClose, IconSearch } from "./Icons.jsx";

const MAX_SUGGESTIONS = 8;

// One filter set for one report card: current values, a setter for a single
// key, a reset back to "no filter", and whether anything is currently
// non-default (so the page knows whether to show "Clear filters").
export function useReportFilterState(defaults) {
  const [values, setValues] = useState(defaults);

  function onChange(key, value) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  function onClear() {
    setValues(defaults);
  }

  const active = Object.keys(defaults).some((key) => values[key] !== defaults[key]);

  return { values, onChange, onClear, active };
}

// A From/To pair belongs on one line. Left loose in the wrap they land on
// separate rows - a report card is only half the grid wide, so the search box
// above them takes the first row and one date box fills the next. Consecutive
// date fields are therefore paired into a single element that wraps as a unit.
function groupDatePairs(fields) {
  const grouped = [];

  for (let index = 0; index < fields.length; index += 1) {
    const field = fields[index];
    const next = fields[index + 1];

    if (field.type === "date" && next && next.type === "date") {
      grouped.push([field, next]);
      index += 1;
    } else {
      grouped.push(field);
    }
  }

  return grouped;
}

export default function ReportFilters({ fields, values, onChange, onClear, active }) {
  // Five cards share this page and every one of them has a "search" and a
  // "from" - so the ids that tie a label to its box are scoped per card, or
  // clicking one card's label would jump to another card's field.
  const uid = useId();
  const idOf = (field) => `${uid}${field.key}`;

  return (
    <div className="flex flex-wrap items-end gap-2.5 border-b border-silver-100 pb-4">
      {groupDatePairs(fields).map((entry) =>
        Array.isArray(entry) ? (
          <div key={entry[0].key} className="flex w-full min-w-0 gap-2.5 sm:w-auto">
            {/* A range can't run backwards, so each end caps the other in the
                picker itself rather than only once the rows come back empty. */}
            <FilterField
              id={idOf(entry[0])}
              field={entry[0]}
              value={values[entry[0].key]}
              onChange={onChange}
              max={values[entry[1].key] || entry[0].max}
            />
            <FilterField
              id={idOf(entry[1])}
              field={entry[1]}
              value={values[entry[1].key]}
              onChange={onChange}
              min={values[entry[0].key]}
              max={entry[1].max}
            />
          </div>
        ) : (
          <FilterField
            key={entry.key}
            id={idOf(entry)}
            field={entry}
            value={values[entry.key]}
            onChange={onChange}
            max={entry.max}
          />
        )
      )}

      {active && (
        <button
          type="button"
          onClick={onClear}
          className="pb-2 text-xs font-medium text-silver-500 hover:text-silver-800"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}

function FieldShell({ id, field, className, children }) {
  return (
    <div className={className}>
      <label className="mb-1 block text-xs font-medium text-silver-500" htmlFor={id}>
        {field.label}
      </label>
      {children}
    </div>
  );
}

function FilterField({ id, field, value, onChange, min, max }) {
  if (field.type === "suggest") {
    return (
      <FieldShell id={id} field={field} className="relative w-full sm:w-52">
        <SuggestField id={id} field={field} value={value} onChange={onChange} />
      </FieldShell>
    );
  }

  if (field.type === "search") {
    return (
      <FieldShell id={id} field={field} className="w-full sm:w-48">
        <SearchField id={id} field={field} value={value} onChange={onChange} />
      </FieldShell>
    );
  }

  if (field.type === "select") {
    return (
      <FieldShell id={id} field={field} className="w-full sm:w-40">
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(field.key, e.target.value)}
          className="input py-1.5 text-xs"
        >
          {field.options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </FieldShell>
    );
  }

  // date - w-full so a paired From/To shrinks to half a row each.
  return (
    <FieldShell id={id} field={field} className="w-full min-w-0 sm:w-36">
      <input
        id={id}
        type="date"
        value={value}
        min={min || undefined}
        max={max || undefined}
        onChange={(e) => onChange(field.key, e.target.value)}
        className="input py-1.5 text-xs"
      />
    </FieldShell>
  );
}

// Typing applies on a pause, not per keystroke.
function useDebouncedDraft(value, onCommit, delay = 300) {
  const [draft, setDraft] = useState(value);

  // Stay in sync when the filter changes from outside this box - e.g. "Clear
  // filters", or another field resetting this one (employee cleared on status
  // change, and so on).
  useEffect(() => setDraft(value), [value]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (draft !== value) onCommit(draft);
    }, delay);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft]);

  return [draft, setDraft];
}

function SearchField({ id, field, value, onChange }) {
  const [draft, setDraft] = useDebouncedDraft(value, (next) => onChange(field.key, next));

  return (
    <div className="relative">
      <IconSearch className="absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-silver-400" />
      <input
        id={id}
        type="search"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        placeholder={field.placeholder}
        className="input py-1.5 pl-8 text-xs"
      />
    </div>
  );
}

// The same search box, with the names it searches listed underneath.
//
// The list is built from the card's own rows, so it offers exactly what the
// filter can find - and because rankSuggestions forgives a slipped key, a
// mistyped name still offers the right one to click instead of emptying the
// card and leaving the admin to spot the typo themselves.
function SuggestField({ id, field, value, onChange }) {
  const [draft, setDraft] = useDebouncedDraft(value, (next) => onChange(field.key, next));
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const options = field.options || [];

  const matches = useMemo(() => rankSuggestions(options, draft, MAX_SUGGESTIONS), [options, draft]);
  const correcting = useMemo(() => isTypoMatch(matches, draft), [matches, draft]);

  // A fresh query means a fresh list, so the highlight goes back to the top
  // rather than staying on whatever row now sits at that index.
  useEffect(() => setActive(0), [draft]);

  function choose(option) {
    setDraft(option.value);
    // Picking is a decision, not a keystroke - it applies at once, without the
    // pause typing gets.
    onChange(field.key, option.value);
    setOpen(false);
  }

  function handleKeyDown(e) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }

    if (!open || matches.length === 0) return;

    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((index) => (index + 1) % matches.length);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((index) => (index - 1 + matches.length) % matches.length);
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(matches[Math.min(active, matches.length - 1)]);
    }
  }

  return (
    <div className="relative">
      <IconSearch className="absolute left-2.5 top-1/2 w-3.5 h-3.5 -translate-y-1/2 text-silver-400" />
      <input
        id={id}
        type="text"
        value={draft}
        onChange={(e) => {
          setDraft(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        // Closing on blur would beat the click on a suggestion, so the rows
        // below commit on mousedown instead and this only tidies up after.
        onBlur={() => setOpen(false)}
        onKeyDown={handleKeyDown}
        placeholder={field.placeholder}
        className="input py-1.5 pl-8 pr-7 text-xs"
        autoComplete="off"
        role="combobox"
        aria-expanded={open && matches.length > 0}
        aria-autocomplete="list"
      />

      {draft && (
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => {
            setDraft("");
            onChange(field.key, "");
          }}
          className="absolute right-2.5 top-1/2 -translate-y-1/2 text-silver-400 hover:text-silver-600"
          aria-label={`Clear ${field.label.toLowerCase()}`}
        >
          <IconClose className="h-3 w-3" />
        </button>
      )}

      {open && (
        <div className="absolute z-30 mt-1 w-full min-w-[15rem] overflow-hidden rounded-lg border border-silver-200 bg-white shadow-lg">
          {correcting && (
            <p className="border-b border-silver-100 bg-amber-50 px-3 py-1.5 text-[11px] font-medium text-amber-700">
              No exact match — did you mean:
            </p>
          )}

          {matches.length === 0 ? (
            <p className="px-3 py-2.5 text-xs text-silver-500">
              {options.length === 0 ? "Nothing to suggest yet." : "Nothing here matches that."}
            </p>
          ) : (
            <ul className="max-h-60 overflow-y-auto py-1">
              {matches.map((option, index) => (
                <li key={option.value}>
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.preventDefault();
                      choose(option);
                    }}
                    onMouseEnter={() => setActive(index)}
                    className={`flex w-full items-center justify-between gap-3 px-3 py-1.5 text-left ${
                      index === active ? "bg-silver-100" : "hover:bg-silver-50"
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-medium text-silver-900">
                        {option.label}
                      </span>
                      {option.hint && (
                        <span className="block truncate text-[11px] text-silver-500">
                          {option.hint}
                        </span>
                      )}
                    </span>
                    {option.trailing && (
                      <span className="shrink-0 text-[11px] font-semibold tabular-nums text-silver-600">
                        {option.trailing}
                      </span>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

// Suggestions come from the rows the card has already fetched - but those rows
// narrow as the search narrows, so the list would shrink away under the cursor
// and a mistyped name would have nothing left to correct itself against. Hold
// the last unfiltered fetch instead: the full set, as it stood before typing.
export function useUnfilteredRows(rows, unfiltered) {
  const snapshot = useRef(rows);

  useEffect(() => {
    if (unfiltered) snapshot.current = rows;
  }, [rows, unfiltered]);

  return unfiltered ? rows : snapshot.current;
}
