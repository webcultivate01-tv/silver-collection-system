// The company mark, drawn once here and used everywhere else through this
// component.
//
// The artwork in frontend/public/logo.png is a 600x200 wordmark painted in
// white on transparency - it was made to sit on a dark surface. Two things
// follow from that, and every call site used to get both of them wrong:
//
//   - It is three times as wide as it is tall. Dropped into a square box it
//     came out squashed.
//   - On a pale surface, white-on-transparent is white-on-white. The mark was
//     not merely faint in the navbar, it was invisible.
//
// So the mark is only ever sized by its height, never height and width
// together, and `tone` says which way round the surface beneath it is:
//
//   tone="ink"    a light surface - the artwork is inverted, which turns the
//                 white strokes ink-black and leaves the transparency alone
//   tone="white"  a dark surface - the artwork is used exactly as painted
//
// The intrinsic width/height attributes stay on the tag so the browser can
// reserve the right box before the image arrives and the header does not jump.

import { BRAND_NAME, LOGO_URL } from "../utils/brand.js";

export default function BrandLogo({ tone = "ink", className = "h-9", alt = BRAND_NAME }) {
  return (
    <img
      src={LOGO_URL}
      alt={alt}
      width="600"
      height="200"
      className={`w-auto shrink-0 object-contain ${tone === "ink" ? "invert" : ""} ${className}`}
    />
  );
}
