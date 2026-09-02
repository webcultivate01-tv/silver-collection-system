// The body of every "Documents" card in the app: a grid of the ID scans held
// against a person, opening in the lightbox over the page.
//
// Every panel used to grow its own DocumentTile that opened the file in a new
// tab. That is the one place a stored scan should never open: the browser's
// bare image viewer costs the reader their place on the page, and it hands the
// raw file to anybody who reaches it. One component instead, so a document is
// looked at the same way from the admin panel, the employee panel and the
// customer's own profile - and so the one question that differs between them,
// whether the file may be saved, is answered in a single place.
//
// `canDownload` is off unless the caller passes it. Admin pages pass
// selectCanDownloadDocuments (true for admin and sub-admin); the employee panel
// and the customer's profile pass nothing and stay view-only.

import { useState } from "react";
import Lightbox from "./Lightbox.jsx";
import { DOCUMENT_FIELDS, documentUrl } from "./DocumentUpload.jsx";
import { IconEye } from "./Icons.jsx";

// "Aadhaar card — Front" for Ravi Kumar, stored as .jpg, becomes
// "ravi-kumar-aadhaar-card-front.jpg" - a name that still says who it belongs
// to once it is sitting in a downloads folder with thirty others.
function slug(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function fileNameFor(owner, label, path) {
  const extension = (String(path).match(/\.[a-z0-9]+$/i) || [".jpg"])[0].toLowerCase();
  const name = [slug(owner), slug(label)].filter(Boolean).join("-");
  return `${name || "document"}${extension}`;
}

function Tile({ label, path, onOpen }) {
  if (!path) {
    return (
      <div className="rounded-lg border border-dashed border-silver-300 bg-silver-50 p-2.5">
        <div className="grid aspect-[4/3] place-items-center text-[11px] text-silver-400">
          Not uploaded
        </div>
        <p className="mt-2 truncate text-[11px] font-medium text-silver-500">{label}</p>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onOpen}
      className="group w-full rounded-lg border border-silver-200 bg-white p-2.5 text-left transition-all hover:border-silver-400 hover:shadow-lift"
    >
      <div className="relative overflow-hidden rounded-md bg-silver-50">
        <img
          src={documentUrl(path)}
          alt={label}
          loading="lazy"
          className="aspect-[4/3] w-full object-contain"
        />
        <span className="absolute inset-0 grid place-items-center bg-silver-900/55 opacity-0 transition-opacity group-hover:opacity-100">
          <span className="badge bg-white/95 text-silver-800">
            <IconEye className="h-3.5 w-3.5" />
            View
          </span>
        </span>
      </div>
      <p className="mt-2 truncate text-[11px] font-medium text-silver-700 group-hover:text-silver-900">
        {label}
      </p>
    </button>
  );
}

// `record` is the row the documents hang off - a user or an employee - and
// `fields` says which of its columns to read. Both default to the shared
// Aadhaar/PAN set, which is what most callers want.
export default function DocumentGallery({
  record = {},
  fields = DOCUMENT_FIELDS,
  owner = "",
  canDownload = false,
  className = "grid grid-cols-2 gap-3",
}) {
  const [index, setIndex] = useState(null);

  // Only the documents that were actually uploaded can be opened, so those are
  // what the lightbox's arrows step through - a missing scan is a gap in the
  // grid, not an empty frame in the middle of the sequence.
  const present = fields.filter((field) => record[field.column || field.field]);

  const items = present.map((field) => {
    const path = record[field.column || field.field];
    return {
      label: field.label,
      src: documentUrl(path),
      filename: fileNameFor(owner, field.label, path),
    };
  });

  return (
    <>
      <div className={className}>
        {fields.map((field) => {
          const key = field.column || field.field;
          return (
            <Tile
              key={field.field || key}
              label={field.label}
              path={record[key]}
              onOpen={() => setIndex(present.indexOf(field))}
            />
          );
        })}
      </div>

      <Lightbox
        items={items}
        index={index}
        onIndex={setIndex}
        onClose={() => setIndex(null)}
        canDownload={canDownload}
      />
    </>
  );
}
