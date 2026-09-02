// Small confirmation dialog used before destructive employee actions.

import { IconClose } from "./Icons.jsx";

export default function ConfirmModal({
  open,
  title,
  message,
  confirmLabel = "Confirm",
  confirmVariant = "btn-primary",
  loading = false,
  onConfirm,
  onCancel,
}) {
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-silver-900/40 backdrop-blur-sm" onClick={onCancel} />

      <div className="relative w-full max-w-md card shadow-lift animate-fade-in">
        <div className="card-header">
          <h3 className="card-title">{title}</h3>
          <button
            onClick={onCancel}
            className="text-silver-400 hover:text-silver-600"
            aria-label="Close"
          >
            <IconClose />
          </button>
        </div>

        <div className="px-6 py-5 text-sm text-silver-600">{message}</div>

        <div className="px-6 py-4 border-t border-silver-200 flex justify-end gap-3">
          <button className="btn-secondary" onClick={onCancel} disabled={loading}>
            Cancel
          </button>
          <button className={confirmVariant} onClick={onConfirm} disabled={loading}>
            {loading ? "Working..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
