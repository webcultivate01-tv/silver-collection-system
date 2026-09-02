# Database Documentation — Silver App

This document describes the MySQL database used by this project: what it's
called, how the app connects to it, every table it has, how those tables
relate to each other, and how the schema evolved over time via migrations.

Source files this is based on:
- `backend/config/db.js` — connection pool
- `backend/config/migrate.js` / `backend/scripts/migrate.js` — migration runner
- `backend/sql/schema.sql` — full schema (fresh-install version)
- `backend/sql/migrations/001_*.sql` … `017_*.sql` — incremental changes
- `backend/models/*.js` — the queries each table is actually used with

---

## 1. Engine, database name, and connection

- **Engine:** MySQL (via the `mysql2/promise` driver)
- **Database name:** `auth_module_db`
- **Connection:** a single shared connection **pool** (not one connection per
  request), created once in `backend/config/db.js`:
  - `waitForConnections: true`
  - `connectionLimit: 10`
  - `dateStrings: ["DATE"]` — `DATE` columns (`date_of_birth`, `rate_date`)
    come back as plain `"YYYY-MM-DD"` strings instead of JS `Date` objects, so
    they can't get shifted by a day during UTC conversion.
  - Credentials (`DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`)
    come from environment variables (`.env`).
- **Setup:** run `backend/sql/schema.sql` once (`mysql -u root -p < sql/schema.sql`)
  to create the database and every table from scratch on a brand-new install.
- **Ongoing changes:** the app does **not** rely solely on that one file after
  the first run — see [Section 4, Migrations](#4-migrations).

---

## 2. How many tables, and why the split

**7 tables**, one per kind of account/data, plus one bookkeeping table the
migration runner manages itself (`schema_migrations`, 8 total on disk).

| # | Table | Purpose |
|---|-------|---------|
| 1 | `admins` | The main admin account(s). Signs in at `/admin`, full access. |
| 2 | `sub_admins` | Sub-admin accounts created by the main admin. Signs in at `/admin`, read-only dashboard. |
| 3 | `users` | Plain customers of the shop. Sign in at `/user`. |
| 4 | `employees` | Staff. Sign in at `/employee`. |
| 5 | `silver_rates` | One row per day: that day's buy/sell rate per gram of silver. |
| 6 | `silver_purchases` | One row per payment a customer makes for silver (the ledger). |
| 7 | `cash_settlements` | Daily cash handovers from an employee to the admin. |

**Design decision — one table per account type, not one `users` table with a
`role` column.** Early on (migrations 001–005) admin, sub-admin, and plain
user all lived in a single `users` table distinguished by a `role` column.
Migration `006_split_users_into_account_tables.sql` broke them apart because:
- a column only sub-admins need (e.g. `created_by`) was landing on admin rows
  too;
- every query had to remember to filter by `role`;
- the three kinds of account don't share a growth path (e.g. only `users`
  needed Aadhaar/PAN document columns later).

The trade-off, called out directly in that migration's comments: an `id` is
now only unique **within its own table** — `admins` row #1 and `users` row #1
both exist and are unrelated. So the app never looks up an account by `id`
alone; the **role travels with the id everywhere**, including inside the JWT
(`{ id, role }`), so the code always knows which table an id belongs to. This
matches an existing project rule (kept in memory): `/admin`, `/employee`, and
`/user` are deliberately kept as separate login surfaces, not merged.

---

## 3. Table structures

### 3.1 `admins`
The main admin. Normally exactly one row, created by `npm run seed`.

| Column | Type | Notes |
|---|---|---|
| `id` | INT, PK, AUTO_INCREMENT | |
| `name` | VARCHAR(100) NOT NULL | |
| `email` | VARCHAR(150) NOT NULL UNIQUE | login identifier |
| `password` | VARCHAR(255) NOT NULL | hashed |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `profile_image` | VARCHAR(255) NULL | |
| `reset_otp` | VARCHAR(10) NULL | "Forgot password" OTP flow |
| `reset_otp_expires` | DATETIME NULL | |
| `created_at` / `updated_at` | TIMESTAMP | auto-managed |

### 3.2 `sub_admins`
Created by the main admin from Admin Management; read-only dashboard access.

| Column | Type | Notes |
|---|---|---|
| `id` | INT, PK, AUTO_INCREMENT | |
| `name` | VARCHAR(100) NOT NULL | |
| `email` | VARCHAR(150) NOT NULL UNIQUE | |
| `password` | VARCHAR(255) NOT NULL | hashed |
| `is_active` | TINYINT(1) DEFAULT 1 | admin can deactivate; token stops working next request |
| `created_by` | INT NULL | → `admins.id` (which admin created this account) |
| `profile_image` | VARCHAR(255) NULL | |
| `reset_otp` / `reset_otp_expires` | VARCHAR(10) / DATETIME NULL | |
| `created_at` / `updated_at` | TIMESTAMP | |

### 3.3 `users`
Plain customers, normally registered by an employee via the employee panel's
User Management screen.

| Column | Type | Notes |
|---|---|---|
| `id` | INT, PK, AUTO_INCREMENT | |
| `name` | VARCHAR(100) NOT NULL | |
| `email` | VARCHAR(150) NOT NULL UNIQUE | |
| `password` | VARCHAR(255) NOT NULL | hashed |
| `is_active` | TINYINT(1) DEFAULT 1 | |
| `profile_image` | VARCHAR(255) NULL | doubles as the user's profile photo |
| `created_by_employee_id` | INT NULL | owning employee; NULL = not added by an employee (admin still sees these, no employee does) |
| `first_name` / `last_name` | VARCHAR(80) NULL | |
| `mobile` | VARCHAR(15) NULL | |
| `age` | INT NULL | |
| `address` | TEXT NULL | |
| `aadhaar_number` | VARCHAR(12) NULL, UNIQUE | UNIQUE index allows multiple NULLs |
| `pan_number` | VARCHAR(10) NULL, UNIQUE | `ABCDE1234F`; required on the form, NULL only on rows registered before it was asked for |
| `date_of_birth` | DATE NULL | |
| `folder_name` | VARCHAR(255) NULL | disk folder: `uploads/user/<employee-folder>/<user-folder>/` |
| `aadhaar_front` / `aadhaar_back` / `pan_front` | VARCHAR(255) NULL | public file paths |
| `pan_back` | VARCHAR(255) NULL | legacy - the back of the PAN card is no longer collected; kept so old scans survive |
| `reset_otp` / `reset_otp_expires` | VARCHAR(10) / DATETIME NULL | |
| `created_at` / `updated_at` | TIMESTAMP | |
| **Index** | `idx_users_employee (created_by_employee_id)` | fast "all users this employee added" |

### 3.4 `employees`
Staff, registered by the admin via Employee Management.

| Column | Type | Notes |
|---|---|---|
| `id` | INT, PK, AUTO_INCREMENT | |
| `employee_code` | VARCHAR(20) NULL, UNIQUE | auto-generated, e.g. `EMP0007` |
| `first_name` / `last_name` / `full_name` | VARCHAR NOT NULL | |
| `mobile` | VARCHAR(15) NOT NULL | |
| `alternate_mobile` | VARCHAR(15) NULL | optional second contact number |
| `email` | VARCHAR(150) NOT NULL UNIQUE | |
| `age` | INT NOT NULL | |
| `address` | TEXT NOT NULL | |
| `aadhaar_number` | VARCHAR(12) NOT NULL UNIQUE | |
| `pan_number` | VARCHAR(10) NULL, UNIQUE | `ABCDE1234F`; required on the form, NULL only on rows registered before it was asked for |
| `date_of_birth` | DATE NOT NULL | |
| `folder_name` | VARCHAR(200) NULL | disk folder: `uploads/employees/<folder_name>/` |
| `profile_photo` / `aadhaar_front` / `aadhaar_back` / `pan_front` | VARCHAR(255) NULL | file paths |
| `pan_back` | VARCHAR(255) NULL | legacy - the back of the PAN card is no longer collected; kept so old scans survive |
| `password` | VARCHAR(255) NOT NULL | hashed |
| `must_change_password` | TINYINT(1) DEFAULT 1 | forces reset on first login |
| `reset_otp` / `reset_otp_expires` | VARCHAR(10) / DATETIME NULL | |
| `is_blocked` | TINYINT(1) DEFAULT 0 | |
| `blocked_at` | DATETIME NULL | |
| `created_at` / `updated_at` | TIMESTAMP | |

### 3.5 `silver_rates`
One row per calendar day: that day's published buy/sell rate.

| Column | Type | Notes |
|---|---|---|
| `id` | INT, PK, AUTO_INCREMENT | |
| `rate_date` | DATE NOT NULL, UNIQUE | re-saving today's rate updates the same row |
| `buy_rate_per_gram` | DECIMAL(10,2) DEFAULT 0 | what the shop pays to buy silver |
| `sell_rate_per_gram` | DECIMAL(10,2) DEFAULT 0 | what the shop charges to sell — this is the rate used in `silver_purchases` |
| `updated_by` | INT NULL | → `admins.id`, who last published the rate |
| `created_at` / `updated_at` | TIMESTAMP | |

### 3.6 `silver_purchases`
The purchase ledger — one row per payment a customer makes for silver, taken
by an employee at the counter.

| Column | Type | Notes |
|---|---|---|
| `id` | INT, PK, AUTO_INCREMENT | |
| `user_id` | INT NOT NULL | → `users.id`, the customer |
| `employee_id` | INT NULL | → `employees.id`; nullable so deleting a staff member never deletes a customer's record |
| `amount_paid` | DECIMAL(12,2) NOT NULL | rupees paid |
| `rate_per_gram` | DECIMAL(10,2) NOT NULL | **frozen** at the day's sell rate — never re-derived later |
| `grams` | DECIMAL(14,6) NOT NULL | `amount_paid / rate_per_gram`, kept to 6 decimals (a microgram) so small payments don't lose fractions of a milligram to rounding |
| `purchased_on` | DATE NOT NULL | |
| `payment_status` | ENUM('pending','success') DEFAULT 'pending' | flips to `success` when the cash handover carrying it is accepted |
| `settlement_id` | INT NULL | → `cash_settlements.id`; NULL = not yet handed over |
| `created_at` / `updated_at` | TIMESTAMP | |
| **Indexes** | `idx_purchases_user (user_id, purchased_on)`, `idx_purchases_employee (employee_id, purchased_on)`, `idx_purchases_settlement (settlement_id)` | |

### 3.7 `cash_settlements`
The daily cash handover from an employee to the admin.

| Column | Type | Notes |
|---|---|---|
| `id` | INT, PK, AUTO_INCREMENT | |
| `employee_id` | INT NOT NULL | → `employees.id`, who is handing over cash |
| `settlement_date` | DATE NOT NULL | day of the handover (not necessarily the day every bundled purchase happened) |
| `total_amount` | DECIMAL(12,2) NOT NULL | sum of bundled purchases |
| `purchase_count` | INT DEFAULT 0 | how many purchases are bundled in |
| `status` | ENUM('pending','accepted') DEFAULT 'pending' | |
| `accepted_by` | INT NULL | → `admins.id` |
| `accepted_at` | DATETIME NULL | |
| `created_at` / `updated_at` | TIMESTAMP | |
| **Indexes** | `idx_settlements_employee (employee_id, status)`, `idx_settlements_status (status)` | |

### 3.8 `schema_migrations` (bookkeeping only)
Created and managed automatically by `backend/config/migrate.js`. Not part of
`schema.sql` — it appears the first time migrations run.

| Column | Type | Notes |
|---|---|---|
| `name` | VARCHAR(200), PK | migration filename, e.g. `007_replace_silver_rate_with_buy_and_sell.sql` |
| `applied_at` | TIMESTAMP DEFAULT CURRENT_TIMESTAMP | |

---

## 4. How it works: relationships and data flow

```
admins ──< sub_admins.created_by
admins ──< silver_rates.updated_by
admins ──< cash_settlements.accepted_by

employees ──< users.created_by_employee_id      (who registered the customer)
employees ──< silver_purchases.employee_id      (who took the payment)
employees ──< cash_settlements.employee_id      (who is handing over cash)

users ──< silver_purchases.user_id              (the customer being charged)

cash_settlements ──< silver_purchases.settlement_id
```

**Because every account type has its own table, none of the above are true
SQL foreign keys across tables with overlapping id ranges** — they're
enforced in application code (see `backend/models/*.js`), not by
`FOREIGN KEY` constraints, since e.g. `admins.id` and `users.id` sequences
are independent and a naive FK wouldn't distinguish them anyway.

**Typical business flow, end to end:**
1. Admin logs in at `/admin`, publishes today's buy/sell rate → new row in
   `silver_rates`.
2. Admin registers an employee (Employee Management) → row in `employees`,
   with a temp password (`must_change_password = 1`).
3. That employee logs in at `/employee`, registers a customer → row in
   `users` with `created_by_employee_id` set to that employee.
4. The employee takes a cash payment from the customer for silver → row in
   `silver_purchases`, freezing that day's `sell_rate_per_gram` and computing
   `grams`. Status starts `pending`.
5. At day's end, the employee bundles all their still-`pending`,
   not-yet-handed-over purchases into one `cash_settlements` row and hands
   the admin that cash total. Purchases get `settlement_id` set, but stay
   `pending`.
6. The admin accepts the handover → in one transaction (see
   `backend/models/cashSettlementModel.js`), the settlement flips to
   `accepted` and every purchase it carries flips to `success`. This keeps
   the employee's list, the admin panel, and the customer's own purchase
   history from ever disagreeing about whether a payment has settled.

---

## 5. Migrations

The schema isn't just `schema.sql` run once — it evolves through
timestamped, numbered SQL files in `backend/sql/migrations/`, applied
automatically on every server boot by `backend/config/migrate.js`
(`migrateOnStartup()`, called from `backend/server.js`).

**How the runner works:**
- Each `NNN_description.sql` file runs **exactly once**, in filename order.
- Names say what the file does to which table, so the folder listing reads as
  a changelog: `create_<table>` for a new table, `add_<column>_to_<table>`
  for a new column, and a verb phrase (`split_`, `replace_`, `hash_`) for a
  reshape. Never rename a file once teammates have run it unless it carries
  an `@applied-if` marker (see below) — the runner tracks migrations by
  filename.
- After running, its filename is recorded in `schema_migrations` so it's
  never replayed.
- A `GET_LOCK` prevents two processes (e.g. `npm run dev` restarting while
  `npm run migrate` runs) from migrating at the same time.
- A file can declare `-- @applied-if: table X` or
  `-- @applied-if: column X.Y` near the top. Before running it, the runner
  checks whether that table/column already exists — if so, it just records
  the migration as applied instead of re-running it. This lets a **fresh
  database** built straight from `schema.sql` (which already has every
  column) skip all the old incremental migrations without erroring, while a
  database migrated by hand also gets adopted correctly.

**The 17 migrations, in order, and what each did:**

| File | Change |
|---|---|
| `001_add_profile_image_to_users.sql` | Added `users.profile_image`. |
| `002_create_employees_and_silver_rates.sql` | Created `employees` and `silver_rates` (single rate + per-10g + per-kg + note). |
| `003_add_employee_documents_and_10g_rate.sql` | Split employee name into first/last, added `employee_code`, added the 5 document columns + `folder_name`, added `rate_per_10gram`. |
| `004_add_reset_otp_to_employees.sql` | Added OTP columns to `employees`; documented `users.role` values (`admin`/`user`). |
| `005_add_subadmin_role_to_users.sql` | Added sub-admin support: `users.is_active`, `users.created_by`, `role = 'subadmin'`. |
| `006_split_users_into_account_tables.sql` | **The big one** — created separate `admins` and `sub_admins` tables, migrated rows out of `users` by role, dropped `users.role` and `users.created_by`. |
| `007_replace_silver_rate_with_buy_and_sell.sql` | Replaced the single `rate_per_gram` with `buy_rate_per_gram` + `sell_rate_per_gram`; dropped the per-10g/per-kg/note columns. |
| `008_create_silver_purchases.sql` | Created `silver_purchases` (the ledger). |
| `009_add_details_and_employee_owner_to_users.sql` | Gave `users` the same detail/document columns as `employees`, plus `created_by_employee_id` to scope customers to the employee who registered them. |
| `010_create_cash_settlements.sql` | Created `cash_settlements`; added `payment_status` and `settlement_id` to `silver_purchases`. |
| `011_create_silver_sales.sql` | Created `silver_sales` — the sell-back ledger (grams leave the holding immediately, payout waits on approval). |
| `012_add_pan_and_alternate_mobile_to_employees.sql` | Added `employees.pan_number` (UNIQUE) and `employees.alternate_mobile`; stopped collecting the PAN back side. |
| `013_add_pan_number_to_users.sql` | Added `users.pan_number` (UNIQUE) — the same change on the employee's Add User form. |
| `014_add_admin_payout_columns_to_silver_sales.sql` | Added `recorded_by_admin_id` and the `request_id` idempotency key, so the admin panel can pay a customer out directly. |
| `015_add_payout_kind_to_silver_sales.sql` | Added `payout_kind` (`cash` / `silver_coin`) — what the customer actually walked away with. |
| `016_add_accepted_by_role_to_cash_settlements.sql` | Added `accepted_by_role`, so a handover accepted by sub-admin #3 isn't shown as accepted by admin #3. |
| `017_hash_reset_otp_and_add_attempt_limit.sql` | Store the reset OTP as a SHA-256 hash and add `reset_otp_attempts` (dies after 5 wrong guesses). |

Running `sql/schema.sql` fresh produces the same end state as running all 17
migrations in order — `schema.sql` is kept in sync with where the migrations
land, not a separate source of truth.

**Commands:**
- `mysql -u root -p < backend/sql/schema.sql` — one-time fresh install.
- `npm run migrate` (`backend/scripts/migrate.js`) — apply any pending
  migrations by hand.
- Migrations also run automatically every time the server starts.

---

## 6. Seed scripts

`backend/seeder/`:
- `adminSeeder.js` (`npm run seed`) — creates the one `admins` row.
- `userSeeder.js` (`npm run seed:user`) — creates a sample `users` row by hand.
- `employeeUsersSeeder.js` — seeds sample employee-owned users.
