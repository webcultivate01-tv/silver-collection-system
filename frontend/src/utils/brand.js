// Everything the public landing page says about the company, in one place.
//
// The dashboards get their identity from the signed-in account; the landing
// page has no account to ask, so the name, the contact details and the logo
// live here. This is the file to edit when any of them change - nothing else
// hard-codes them.

import { API_ORIGIN } from "../api/axios.js";

export const BRAND_NAME = "Shiv Shakti Silver";
export const BRAND_TAGLINE = "Daily silver savings, kept simple";

// Served by the backend out of backend/uploads/. That directory is otherwise
// behind an authentication guard - these two files are published deliberately,
// see PUBLIC_BRAND_FILES in backend/app.js. Rename either one and the landing
// page loses its artwork, so the names have to change in both places together.
export const LOGO_URL = `${API_ORIGIN}/uploads/logo.png`;
export const HERO_BG_URL = `${API_ORIGIN}/uploads/Hero-Bg.png`;

// The authorised signatory's signature, printed above the signature line of
// every tax invoice. Published alongside the two above - see PUBLIC_BRAND_FILES.
export const SIGNATURE_URL = `${API_ORIGIN}/uploads/signiture.png`;

// What the printed tax invoice puts in its header, and what it charges tax at.
//
// The landing page's CONTACT block below is marketing copy - hours, a contact
// address, a mailbox we can change at will. This is not: it is what a customer
// reads off a bill and what a GST officer checks it against, so it is kept
// apart and only changed on the shop's say-so.
export const BILL = {
  // TODO: placeholder carried over from the sample bill - the shop has not
  // given us the real registration number yet. It PRINTS ON EVERY INVOICE, so
  // it has to be replaced before this goes anywhere near a real customer.
  gstin: "27ABCDE1234F1Z5",

  email: "shivshaktisilver12@gmail.com",
  phone: "9148103103",

  // One line per row of the header, written as it should read on paper.
  addressLines: ["Third Floor, Shivpratap Gold Tower, Saraf Peth,", "Vita, 415311"],

  // What the line item is called and classified as. Silver is HSN 7106; the
  // matching tax rates live server-side in backend/utils/gst.js, because the
  // amounts they produce are the ones the customer signs for.
  itemTitle: "Silver",
  hsn: "7106",
};

export const CONTACT = {
  // Spaces are for reading only - PHONE_HREF below strips them back out to
  // build the tel: link, so group the digits however reads best.
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

// The number as typed above reads well but is not dialable; tel: wants it
// without the spaces. Lives here rather than in a component because the
// contact block and the footer both link it and must not drift apart.
export const PHONE_HREF = `tel:${CONTACT.phone.replace(/\s/g, "")}`;
