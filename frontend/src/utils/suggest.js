// Type-ahead matching for the report filters' suggestion boxes.
//
// Plain `includes()` is unforgiving: one slipped key ("Ramsh", "Sliver") and
// the list the admin was reading empties out, with nothing to say whether the
// name exists at all. So a match is looked for in three widening passes -
// starts-with, contains, and finally a typo-tolerant comparison - and the
// closest matches are listed first.
//
// Everything here runs over a list already in memory (the rows the card just
// fetched), so it costs nothing per keystroke and needs no round trip.

// How far a word may be from what was typed before it stops counting as the
// same word. Short queries get no leeway: at three letters, one wrong
// character makes a genuinely different word.
function typoAllowance(length) {
  if (length <= 3) return 0;
  if (length <= 5) return 1;
  return 2;
}

// Levenshtein distance, abandoned as soon as every route is already too far
// off - the rows are checked on every keystroke, so a hopeless candidate must
// not be walked to the end.
function editDistance(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;

  let previous = Array.from({ length: b.length + 1 }, (_, index) => index);

  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    let best = i;

    for (let j = 1; j <= b.length; j += 1) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      current[j] = Math.min(
        previous[j] + 1, // deletion
        current[j - 1] + 1, // insertion
        previous[j - 1] + cost // substitution
      );
      best = Math.min(best, current[j]);
    }

    if (best > max) return max + 1;
    previous = current;
  }

  return previous[b.length];
}

// Lower is a better match; null means "not a match at all".
function scoreOption(option, needle) {
  const label = String(option.label || "").toLowerCase();
  const hint = String(option.hint || "").toLowerCase();
  const haystack = `${label} ${hint}`.trim();

  if (label.startsWith(needle)) return 0;

  const words = haystack.split(/[\s·,(/-]+/).filter(Boolean);
  if (words.some((word) => word.startsWith(needle))) return 1;
  if (haystack.includes(needle)) return 2;

  // Nothing contains what was typed - so it was probably mistyped. Compare it
  // against each word, and against the same number of characters from the
  // start of the label, which is what a half-typed name looks like.
  const allowance = typoAllowance(needle.length);
  if (allowance === 0) return null;

  const candidates = [...words, label.slice(0, needle.length)];
  let closest = allowance + 1;

  for (const candidate of candidates) {
    closest = Math.min(closest, editDistance(needle, candidate, allowance));
    if (closest === 0) break;
  }

  return closest <= allowance ? 3 + closest : null;
}

// The suggestions to show for what has been typed so far, best match first.
// An empty query lists everything, so clicking the box shows the whole set
// rather than making the admin guess the first letter.
export function rankSuggestions(options, query, limit = 8) {
  const needle = String(query || "").trim().toLowerCase();

  if (!needle) return options.slice(0, limit);

  const scored = [];

  options.forEach((option, index) => {
    const score = scoreOption(option, needle);
    if (score !== null) scored.push({ option, score, index });
  });

  scored.sort((a, b) => a.score - b.score || a.index - b.index);

  return scored.slice(0, limit).map((entry) => entry.option);
}

// Whether the suggestions shown are only near-misses - the box then says so,
// rather than letting a corrected spelling look like an exact hit.
export function isTypoMatch(options, query) {
  const needle = String(query || "").trim().toLowerCase();
  if (!needle || options.length === 0) return false;

  return options.every((option) => (scoreOption(option, needle) ?? 9) >= 3);
}

// Turns rows into suggestion options, dropping repeats and blanks - a customer
// with forty purchases must appear once, not forty times.
export function uniqueOptions(rows, toOption) {
  const seen = new Set();
  const options = [];

  for (const row of rows) {
    const option = toOption(row);
    if (!option?.value || seen.has(option.value)) continue;
    seen.add(option.value);
    options.push(option);
  }

  return options;
}
