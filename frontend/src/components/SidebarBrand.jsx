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
// The block is centred in the header, so the mobile close button is pinned to
// the right edge instead of sharing the row - otherwise it would pull the mark
// off centre. The extra padding on small screens keeps the two from touching.
//
// The sidebar is white, so the mark is drawn with tone="ink": the artwork is
// white-on-transparent and would otherwise be invisible here. See BrandLogo.jsx
// for why it is only ever sized by height.

import BrandLogo from "./BrandLogo.jsx";
import { BRAND_NAME } from "../utils/brand.js";
import { IconClose } from "./Icons.jsx";

export default function SidebarBrand({ panel, onClose }) {
  return (
    <div className="relative flex items-center justify-center px-12 lg:px-5 h-16 border-b border-silver-200">
      <div className="flex min-w-0 flex-col items-center justify-center gap-1">
        <BrandLogo tone="ink" className="h-6" alt={BRAND_NAME} />
        <div className="text-[11px] font-medium text-silver-500">{panel}</div>
      </div>

      <button
        type="button"
        className="lg:hidden absolute right-5 top-1/2 -translate-y-1/2 text-silver-400 hover:text-silver-600"
        onClick={onClose}
        aria-label="Close menu"
      >
        <IconClose />
      </button>
    </div>
  );
}
