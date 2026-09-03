-- The landing page's enquiry form gets a record, and the panels get a screen.
--
-- Until now an enquiry was an email and nothing else: the controller mailed
-- every active admin and returned. That works right up until the mail is
-- missed, deleted, or lands in a spam folder - and then a person who asked to
-- be called back is gone, with nothing anywhere to say they ever wrote in.
-- There was also no way to tell an enquiry somebody has answered from one
-- nobody has looked at.
--
-- So the enquiry is stored first and mailed second. The mail stays - it is
-- what makes someone go and look - but the row is the record, and the panels
-- read it back on the Enquiries screen.
--
-- `status` is the whole point of the screen: 'new' until a panel account picks
-- it up, 'in_progress' while somebody is dealing with it, 'closed' when it is
-- answered. `handled_by` records who moved it last, as (role, id) rather than
-- an id alone - both panel roles work these, and ids restart at 1 in each
-- account table, exactly as in cash_settlements.
--
-- `emailed` says whether the notification actually went out. An SMTP failure
-- no longer costs us the enquiry, so it must not pass silently either: a row
-- with emailed = 0 is one that only exists here.
--
-- @applied-if: table enquiries

CREATE TABLE IF NOT EXISTS enquiries (
  id INT AUTO_INCREMENT PRIMARY KEY,

  -- The four fields the public form collects, at the lengths the controller
  -- caps them to (see controllers/enquiryController.js LIMITS).
  name VARCHAR(100) NOT NULL,
  email VARCHAR(254) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  message TEXT NOT NULL,

  status ENUM('new', 'in_progress', 'closed') NOT NULL DEFAULT 'new',

  -- What the panel wrote about it: who they called, what was agreed. Only the
  -- panel ever sees this; it is never shown to the person who wrote in.
  admin_note TEXT DEFAULT NULL,

  handled_by INT DEFAULT NULL,
  handled_by_role ENUM('admin', 'subadmin') DEFAULT NULL,
  handled_at DATETIME DEFAULT NULL,

  emailed TINYINT(1) NOT NULL DEFAULT 0,

  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,

  -- The screen's default view is "new, newest first", and its other views are
  -- the same ordering narrowed by status.
  INDEX idx_enquiries_status (status, created_at),
  INDEX idx_enquiries_created (created_at)
);
