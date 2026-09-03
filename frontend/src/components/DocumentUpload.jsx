// Image picker used for the employee's profile photo and their Aadhaar / PAN
// card scans. Shows a live preview of the newly chosen file, falling back to
// whatever is already stored on the server for that employee.

import { useEffect, useState } from "react";
import { fileUrl } from "../api/axios.js";
import { IconCamera, IconUpload } from "./Icons.jsx";

// Every ID document an employee or a user is asked for, in display order.
// Only the front of the PAN card is collected; records created before that
// change may still have a `pan_back` on them, which is no longer shown
// anywhere.
export const DOCUMENT_FIELDS = [
  { field: "aadhaarFront", column: "aadhaar_front", label: "Aadhaar card — Front" },
  { field: "aadhaarBack", column: "aadhaar_back", label: "Aadhaar card — Back" },
  { field: "panFront", column: "pan_front", label: "PAN card — Front" },
];

export const ALL_DOCUMENT_FIELDS = [
  { field: "profilePhoto", column: "profile_photo", label: "Profile photo" },
  ...DOCUMENT_FIELDS,
];

// A stored path ("/uploads/...") needs the API origin and the viewer's token;
// a freshly picked File needs an object URL.
//
// No role is passed: this renders on the admin, employee and customer panels
// alike, so fileUrl works the session out from the current route.
export function documentUrl(path) {
  return path ? fileUrl(path) : "";
}

function usePreview(file, existingPath) {
  const [objectUrl, setObjectUrl] = useState("");

  useEffect(() => {
    if (!file) {
      setObjectUrl("");
      return undefined;
    }

    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  return objectUrl || documentUrl(existingPath);
}

export function DocumentUpload({ label, hint, file, existingPath, error, onPick }) {
  const preview = usePreview(file, existingPath);

  return (
    <div>
      <label className="label">{label}</label>

      <label
        className={`group relative flex h-36 cursor-pointer items-center justify-center overflow-hidden rounded-lg border-2 border-dashed transition-colors ${
          error
            ? "border-red-300 bg-red-50/40 hover:border-red-400"
            : "border-silver-300 bg-silver-50 hover:border-brand-400 hover:bg-brand-50/40"
        }`}
      >
        {preview ? (
          <>
            <img src={preview} alt={label} className="h-full w-full object-contain" />
            <span className="absolute inset-0 hidden items-center justify-center gap-2 bg-silver-900/60 text-xs font-medium text-white group-hover:flex">
              <IconUpload className="h-4 w-4" />
              Replace
            </span>
          </>
        ) : (
          <span className="flex flex-col items-center gap-1.5 text-silver-400">
            <IconUpload className="h-5 w-5" />
            <span className="text-xs font-medium">Click to upload</span>
          </span>
        )}

        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            onPick(event.target.files[0] || null);
            event.target.value = "";
          }}
        />
      </label>

      {error ? (
        <p className="field-error">{error}</p>
      ) : (
        <p className="mt-1.5 text-xs text-silver-500">{hint || "JPG, PNG or WebP · max 50KB"}</p>
      )}
    </div>
  );
}

// The round variant, used for the profile photo. `optional` is set where the
// photo may be left out - registering a user, who can add their own later from
// their profile screen - so the form says so instead of silently accepting it.
export function PhotoUpload({
  file,
  existingPath,
  error,
  onPick,
  fallback = "",
  optional = false,
}) {
  const preview = usePreview(file, existingPath);

  return (
    <div className="flex items-center gap-5">
      <label className="group relative shrink-0 cursor-pointer">
        {preview ? (
          <img
            src={preview}
            alt="Profile"
            className={`h-24 w-24 rounded-full border object-cover ${
              error ? "border-red-300" : "border-silver-200"
            }`}
          />
        ) : (
          <span
            className={`grid h-24 w-24 place-items-center rounded-full border-2 border-dashed text-lg font-semibold ${
              error
                ? "border-red-300 bg-red-50/40 text-red-400"
                : "border-silver-300 bg-silver-50 text-silver-400"
            }`}
          >
            {fallback || <IconCamera className="h-6 w-6" />}
          </span>
        )}

        <span className="absolute inset-0 hidden place-items-center rounded-full bg-silver-900/55 text-white group-hover:grid">
          <IconCamera className="h-5 w-5" />
        </span>

        <input
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(event) => {
            onPick(event.target.files[0] || null);
            event.target.value = "";
          }}
        />
      </label>

      <div>
        <p className="flex items-center gap-2 text-sm font-medium text-silver-900">
          Profile photo
          {optional && <span className="badge-neutral">Optional</span>}
        </p>
        {error ? (
          <p className="field-error">{error}</p>
        ) : (
          <p className="mt-1 text-xs text-silver-500">
            {optional
              ? "Leave this out if you don't have one - the user can add their own later."
              : "Click the circle to choose a photo."}
            <br />
            JPG, PNG or WebP · max 50KB.
          </p>
        )}
      </div>
    </div>
  );
}
