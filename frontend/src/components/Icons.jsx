// Inline SVG icons so the app has no icon-font dependency.
// Every icon takes the current text colour and a className for sizing.

const base = {
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
};

export function IconDashboard({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="3" width="7" height="9" rx="1.5" />
      <rect x="14" y="3" width="7" height="5" rx="1.5" />
      <rect x="14" y="12" width="7" height="9" rx="1.5" />
      <rect x="3" y="16" width="7" height="5" rx="1.5" />
    </svg>
  );
}

export function IconUsers({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}

export function IconRate({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 17l5-6 4 3 5-7 4 4" />
      <path d="M3 21h18" />
    </svg>
  );
}

export function IconUser({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21v-1a6 6 0 0 1 6-6h4a6 6 0 0 1 6 6v1" />
    </svg>
  );
}

export function IconLogout({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5M21 12H9" />
    </svg>
  );
}

export function IconBell({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.7 21a2 2 0 0 1-3.4 0" />
    </svg>
  );
}

export function IconSearch({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

export function IconPlus({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconArrowLeft({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M19 12H5M11 18l-6-6 6-6" />
    </svg>
  );
}

export function IconKey({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="8" cy="15" r="4" />
      <path d="m10.9 12.1 8-8M17 5l2 2M15 7l2 2" />
    </svg>
  );
}

export function IconBlock({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="m5.6 5.6 12.8 12.8" />
    </svg>
  );
}

export function IconCheck({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="m20 6-11 11-5-5" />
    </svg>
  );
}

export function IconCopy({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </svg>
  );
}

export function IconMenu({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

export function IconClose({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}

export function IconShield({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l8 3v6c0 5-3.4 8.4-8 9-4.6-.6-8-4-8-9V6l8-3Z" />
    </svg>
  );
}

export function IconTrash({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 7h16M10 11v6M14 11v6" />
      <path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12" />
      <path d="M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
    </svg>
  );
}

export function IconEye({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7-10-7-10-7Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function IconEyeOff({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M10.6 6.2A9.9 9.9 0 0 1 12 6c6.4 0 10 6 10 6a17.6 17.6 0 0 1-3.2 3.9M6.2 6.9A17.4 17.4 0 0 0 2 12s3.6 6 10 6a9.8 9.8 0 0 0 4-.8" />
      <path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" />
      <path d="M3 3l18 18" />
    </svg>
  );
}

export function IconPrint({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M7 8V3h10v5" />
      <path d="M7 18H5a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <rect x="7" y="14" width="10" height="7" rx="1" />
    </svg>
  );
}

export function IconUpload({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 16V4M8 8l4-4 4 4" />
      <path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" />
    </svg>
  );
}

export function IconCamera({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 8a2 2 0 0 1 2-2h2l1.2-2h7.6L17 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8Z" />
      <circle cx="12" cy="12.5" r="3.5" />
    </svg>
  );
}

export function IconIdCard({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <circle cx="8.5" cy="11" r="2" />
      <path d="M5 16c.6-1.5 2-2.2 3.5-2.2S11.4 14.5 12 16M14.5 10h4M14.5 13.5h4" />
    </svg>
  );
}

export function IconMail({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="5" width="19" height="14" rx="2" />
      <path d="m3 7 9 6 9-6" />
    </svg>
  );
}

export function IconPhone({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 3h3l2 5-2.5 1.5a12 12 0 0 0 6 6L16 13l5 2v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4 5.2 2 2 0 0 1 6 3Z" />
    </svg>
  );
}

export function IconEdit({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M4 20h4l10-10a2.8 2.8 0 0 0-4-4L4 16v4Z" />
      <path d="m13.5 6.5 4 4" />
    </svg>
  );
}

export function IconDownload({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 4v12M8 12l4 4 4-4" />
      <path d="M4 18v1a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-1" />
    </svg>
  );
}

export function IconReport({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h4" />
    </svg>
  );
}

export function IconAdmins({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3l6 2.2v4.6c0 3.7-2.5 6.4-6 7.2-3.5-.8-6-3.5-6-7.2V5.2L12 3Z" />
      <circle cx="12" cy="9.5" r="1.9" />
      <path d="M8.9 14.6c.6-1.3 1.8-2 3.1-2s2.5.7 3.1 2" />
    </svg>
  );
}

export function IconCash({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <rect x="2.5" y="6" width="19" height="12" rx="2" />
      <circle cx="12" cy="12" r="3" />
      <path d="M6 9v.01M18 15v.01" />
    </svg>
  );
}

// The app mark: a stylised silver ingot.
export function IconSilver({ className = "w-6 h-6" }) {
  return (
    <svg {...base} className={className}>
      <path d="M6 8h12l3 5-9 8-9-8 3-5Z" />
      <path d="M3 13h18M9 8l-1.5 5L12 21M15 8l1.5 5L12 21" />
    </svg>
  );
}

export function IconTrendUp({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M14 7h7v7" />
    </svg>
  );
}

export function IconTrendDown({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 7l6 6 4-4 8 8" />
      <path d="M14 17h7v-7" />
    </svg>
  );
}

export function IconArrowRight({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

// Rotated to point up when the row it belongs to is expanded.
export function IconChevronDown({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

// The month calendar behind the employee's Monthly Collection screen.
export function IconCalendar({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  );
}

export function IconAlert({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 3.5 2.8 19.5a1 1 0 0 0 .87 1.5h16.66a1 1 0 0 0 .87-1.5L12 3.5Z" />
      <path d="M12 9.5v4.5M12 17.5v.01" />
    </svg>
  );
}

export function IconClock({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  );
}

// Employee Collections: coins dropped into a collection tray.
export function IconCollection({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M3 13h18a9 9 0 0 1-9 6 9 9 0 0 1-9-6Z" />
      <circle cx="9" cy="7" r="3" />
      <circle cx="16" cy="8.5" r="2" />
    </svg>
  );
}

// A map pin, for the branch address on the public landing page.
export function IconPin({ className = "w-5 h-5" }) {
  return (
    <svg {...base} className={className}>
      <path d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z" />
      <circle cx="12" cy="10" r="2.5" />
    </svg>
  );
}
