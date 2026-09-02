// The header block at the top of every sidebar: the company mark, and under it
// the name of the panel you are signed in to.
//
// All four sidebars (admin, sub-admin, employee, customer) carried an
// identical copy of this markup, differing only in that one label, so it lives
// here once. `panel` is what changes - "Admin Panel", "Employee Panel" and so
// on - and it is the only thing that tells the four dashboards apart at a
// glance, which is why it sits directly under the mark rather than off in a
// corner.
//
// The sidebar is white, so the mark is drawn with tone="ink": the artwork is
// white-on-transparent and would otherwise be invisible here. See BrandLogo.jsx
// for why it is only ever sized by height.

import BrandLogo from "./BrandLogo.jsx";
import { BRAND_NAME } from "../utils/brand.js";
import { IconClose } from "./Icons.jsx";

export default function SidebarBrand({ panel, onClose }) {
  return (
    <div className="flex items-center justify-between gap-3 px-5 h-16 border-b border-silver-200">
      <div className="flex min-w-0 flex-col justify-center gap-1">
        <BrandLogo tone="ink" className="h-6" alt={BRAND_NAME} />
        <div className="text-[11px] font-medium text-silver-500">{panel}</div>
      </div>

      <button
        type="button"
        className="lg:hidden shrink-0 text-silver-400 hover:text-silver-600"
        onClick={onClose}
        aria-label="Close menu"
      >
        <IconClose />
      </button>
    </div>
  );
}
