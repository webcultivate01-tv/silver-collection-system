// Everything the public landing page says about the company, in one place.
//
// The dashboards get their identity from the signed-in account; the landing
// page has no account to ask, so the name, the contact details and the logo
// live here. This is the file to edit when any of them change - nothing else
// hard-codes them.

import { API_ORIGIN } from "../api/axios.js";

export const BRAND_NAME = "Shiv Shakti Silver";
export const BRAND_TAGLINE = "Daily silver savings, kept simple";

// Served by the backend out of backend/uploads/logo.png. That directory is
// otherwise behind an authentication guard - this one file is published
// deliberately, see the route in backend/app.js.
export const LOGO_URL = `${API_ORIGIN}/uploads/logo.png`;

export const CONTACT = {
  // Spaces are for reading only - Landing.jsx strips them back out to build
  // the tel: link, so group the digits however reads best.
  phone: "+91 91481 03103",

  // TODO: still placeholders - the shop has not given us either of these yet.
  email: "hello@silvercollection.in",
  hours: "Monday - Saturday, 10:00 AM - 8:00 PM",

  // One array entry per line, rendered as written in the contact card and the
  // footer. The shop name is not repeated here - it already sits above both.
  address: [
    "Third Floor, Shivpratap Gold Tower",
    "Saraf Peth, Hanmant Bazar",
    "Vita, Maharashtra 415311",
  ],
};
