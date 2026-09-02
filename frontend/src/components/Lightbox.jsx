// Full-screen viewer for stored document scans.
//
// Somebody looking at an Aadhaar or PAN card wants to see it, not to lose the
// page they were on: opening the file in a new tab dumps them in the browser's
// bare image viewer with no way back except the back button. This puts the scan
// over the page instead - Esc or a click outside brings them straight back, and
// the arrows step through the rest of the documents.
//
// Saving a copy is a separate matter from looking at one. `canDownload` is off
// unless the caller says otherwise, which is how the employee and customer
// panels stay view-only while the admin panel can take the file away - see
// selectCanDownloadDocuments in store/authSlice.js.
//
// The page behind is frozen while the viewer is open, and it renders into
// document.body so no scroll container of the layout can clip it.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { IconArrowLeft, IconArrowRight, IconClose, IconDownload } from "./Icons.jsx";

// The file lives on the API origin, so an <a download> would be treated as a
// cross-origin navigation and open the image instead of saving it. Pulling the
// bytes down first and saving them from a blob URL keeps the filename we chose.
async function saveToDisk(src, filename) {
  const response = await fetch(src, { credentials: "omit" });
  if (!response.ok) throw new Error(`Could not fetch the document (${response.status})`);

  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = filename || "document";
  document.body.appendChild(link);
  link.click();
  link.remove();

  // Give the browser a moment to start the save before the blob goes away.
  setTimeout(() => URL.revokeObjectURL(url), 10000);
}

// items: [{ label, src, filename }]. `index` is the one on show, or null when
// closed.
export default function Lightbox({ items = [], index, onIndex, onClose, canDownload = false }) {
  const open = index !== null && index >= 0 && index < items.length;
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState("");

  useEffect(() => {
    if (!open) return undefined;

    function handleKeyDown(event) {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") onIndex((index - 1 + items.length) % items.length);
      if (event.key === "ArrowRight") onIndex((index + 1) % items.length);
    }

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, index, items.length, onIndex, onClose]);

  // A failed download belongs to the document that failed, not to the next one.
  useEffect(() => setDownloadError(""), [index]);

  if (!open) return null;

  const item = items[index];
  const many = items.length > 1;
  const step = (by) => onIndex((index + by + items.length) % items.length);

  // Anything inside the sheet must not reach the backdrop's close handler.
  const keepOpen = (event) => event.stopPropagation();

  const navButton =
    "grid h-10 w-10 shrink-0 place-items-center rounded-full bg-white/10 text-white " +
    "transition-colors hover:bg-white/20";

  async function handleDownload(event) {
    keepOpen(event);
    setDownloading(true);
    setDownloadError("");

    try {
      await saveToDisk(item.src, item.filename);
    } catch {
      setDownloadError("Could not save this document. Check your connection and try again.");
    } finally {
      setDownloading(false);
    }
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={item.label}
      onClick={onClose}
      className="fixed inset-0 z-50 flex animate-fade-in flex-col bg-silver-900/95 p-4 backdrop-blur-sm sm:p-6"
    >
      <div className="flex items-start justify-between gap-4" onClick={keepOpen}>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-white">{item.label}</p>
          {many && (
            <p className="mt-0.5 text-xs text-white/60">
              {index + 1} of {items.length}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {canDownload && (
            <button
              type="button"
              onClick={handleDownload}
              disabled={downloading}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-white/20 disabled:opacity-60"
            >
              <IconDownload className="h-4 w-4" />
              {downloading ? "Saving..." : "Download"}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Close" className={navButton}>
            <IconClose className="h-5 w-5" />
          </button>
        </div>
      </div>

      {downloadError && (
        <p
          onClick={keepOpen}
          className="mx-auto mt-3 rounded-lg bg-red-500/15 px-3 py-2 text-xs text-red-200 ring-1 ring-inset ring-red-400/30"
        >
          {downloadError}
        </p>
      )}

      <div className="flex min-h-0 flex-1 items-center justify-center gap-3 py-4 sm:gap-6">
        {many && (
          <button
            type="button"
            aria-label="Previous document"
            className={navButton}
            onClick={(event) => {
              keepOpen(event);
              step(-1);
            }}
          >
            <IconArrowLeft className="h-5 w-5" />
          </button>
        )}

        <img
          src={item.src}
          alt={item.label}
          onClick={keepOpen}
          className="max-h-full min-h-0 w-auto max-w-full rounded-lg bg-white object-contain shadow-lift"
        />

        {many && (
          <button
            type="button"
            aria-label="Next document"
            className={navButton}
            onClick={(event) => {
              keepOpen(event);
              step(1);
            }}
          >
            <IconArrowRight className="h-5 w-5" />
          </button>
        )}
      </div>

      <p className="text-center text-xs text-white/50">
        Press Esc or click outside to close{many && " · use ← and → to move between documents"}
      </p>
    </div>,
    document.body
  );
}
