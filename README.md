# Admin Authentication Module

A simple admin authentication system built with:

- **Backend:** Node.js, Express, MySQL (MVC pattern), JWT
- **Frontend:** React (Vite), Tailwind CSS

Features: admin login, JWT-protected dashboard, a sidebar with a **Profile**
page (edit name/email, change password), and a **Forgot Password** flow using
an emailed OTP.

## Project structure

```
backend/
  config/db.js           MySQL connection pool
  config/migrate.js      Applies sql/migrations/ on startup, once each
  models/accounts.js     Which account table each role lives in
  models/accountModel.js Shared SQL for admins / sub_admins / users
  controllers/           Request handling (auth, profile, admins, reports, ...)
  routes/                Express routes
  middleware/            JWT auth guard, role guards, error handler
  utils/                 Token/OTP generation, email sending
  seeder/                Creates the default admin and user accounts
  sql/schema.sql         Database + table creation script
  sql/migrations/        Numbered, run-once schema changes
  server.js              App entry point

frontend/
  src/pages/              Login, ForgotPassword, Profile
  src/pages/admin/        Employee management, silver rate, Admin Management
  src/pages/subadmin/     Sub-admin dashboard + the two report screens
  src/components/         Layouts, sidebars, ProtectedRoute, report downloads
  src/store/              Redux slices (auth, employees, admins, reports, ...)
  src/api/axios.js        Shared API client (auto-attaches the right JWT)
```

## 1. Set up MySQL

Make sure MySQL is running locally, then create the database and table:

```bash
mysql -u root -p < backend/sql/schema.sql
```

## 2. Backend setup

```bash
cd backend
copy .env.example .env   # (on Windows PowerShell: Copy-Item .env.example .env)
npm install
```

Open `.env` and fill in your MySQL password and a `JWT_SECRET`. The admin
credentials default to `admin@gmail.com` / `Admin123` — change them in `.env`
if you like, before seeding.

SMTP fields are optional. If left blank, the OTP for "Forgot Password" is
simply printed to the backend console instead of emailed — handy for local
testing.

If you are upgrading an existing database rather than creating a fresh one, you
don't have to do anything: the server applies every file in
`backend/sql/migrations/` once, in order, on startup. Run them by hand with
`npm run migrate`, or see what is outstanding with `npm run migrate:status`.

Seed the accounts (run once each):

```bash
npm run seed        # admin@gmail.com / Admin123 -> signs in at /admin
npm run seed:user   # user@gmail.com  / User123  -> signs in at /user
```

Employees are not seeded — the admin registers them from the dashboard and
hands out a temporary password.

Start the server:

```bash
npm run dev
```

The API runs at `http://localhost:5000/api`.

## 3. Frontend setup

```bash
cd frontend
copy .env.example .env
npm install
npm run dev
```

The app runs at `http://localhost:5173`.

## 4. Sign-in pages

Each role has its own front door, and every one of them shows the same simple
centred login box with the same "Forgot password?" OTP reset behind it.

| URL         | Who signs in | Lands on           |
|-------------|--------------|--------------------|
| `/admin`    | Main admin   | `/dashboard`       |
| `/admin`    | Sub-admin    | `/sub-admin`       |
| `/employee` | Employee     | `/employee/portal` |
| `/user`     | User         | `/user/portal`     |

An account can only sign in through its own page — the server rejects, say, a
user account submitted on the admin login. `/admin` is the one door serving two
roles: the account decides which dashboard opens.

## 4a. Sub-admins

The main admin creates sub-admins from **Admin Management** in the sidebar, and
can edit, activate/deactivate and delete them from the same screen.

**A sub-admin is read + download only.** They sign in at `/admin`, land on their
own simplified dashboard at `/sub-admin`, and can view, filter and download the
employee and silver rate reports as CSV or PDF. They cannot create, edit or
delete anything, cannot open Admin Management, and cannot reach any admin page —
typing the URL redirects them back to their own dashboard.

That is enforced on the server, not just in the UI:

- `blockSubAdminWrites` in `server.js` refuses **every** non-GET request from a
  sub-admin token before it reaches a controller.
- Admin-only routes (`/api/employees`, `/api/admins`, `/api/silver-rate` writes)
  require the `admin` role, so a sub-admin gets 403 even on a read.
- `/api/reports/*` is the only data a sub-admin can reach, and it is GET-only.

Deactivating a sub-admin takes effect immediately: the account row is re-checked
on every request, so a token already in their browser stops working at once.

## 5. Try it out

1. Go to `http://localhost:5173/admin`
2. Log in with `admin@gmail.com` / `Admin123`
3. You'll land on the dashboard with a left sidebar → **Profile**
4. From Profile you can update your name/email or change your password
5. On any login page, click **Forgot password?** to test the OTP flow
   (check the backend console for the OTP if SMTP isn't configured)

## API reference

| Method | Endpoint                          | Auth required | Description               |
|--------|-----------------------------------|:-------------:|----------------------------|
| POST   | `/api/auth/login`                 | No            | Admin/user log in (`role` scopes it), returns JWT + user |
| POST   | `/api/auth/forgot-password`       | No            | Sends OTP to an admin/user email |
| POST   | `/api/auth/reset-password`        | No            | Verifies OTP, sets new password |
| POST   | `/api/employee/login`             | No            | Employee log in, returns JWT + employee |
| POST   | `/api/employee/forgot-password`   | No            | Sends OTP to an employee email |
| POST   | `/api/employee/reset-password`    | No            | Verifies OTP, sets new password |
| GET    | `/api/profile`                    | Yes           | Get the signed-in account's profile |
| PUT    | `/api/profile`                    | Yes           | Update name/email          |
| PUT    | `/api/profile/change-password`    | Yes           | Change password            |
| GET    | `/api/admins`                     | Main admin    | List the admin + sub-admin accounts |
| POST   | `/api/admins`                     | Main admin    | Create a sub-admin         |
| PUT    | `/api/admins/:id`                 | Main admin    | Edit a sub-admin (optional new password) |
| PUT    | `/api/admins/:id/status`          | Main admin    | Activate / deactivate a sub-admin |
| DELETE | `/api/admins/:id`                 | Main admin    | Delete a sub-admin         |
| GET    | `/api/reports/summary`            | Admin or sub-admin | Headline counts + latest rate |
| GET    | `/api/reports/employees`          | Admin or sub-admin | Employee report (search/status filters) |
| GET    | `/api/reports/silver-rates`       | Admin or sub-admin | Silver rate report (day search, or `from`/`to` range) |

Send the JWT as `Authorization: Bearer <token>` on protected routes.

`/api/admins/:id` only ever addresses a row in `sub_admins`, so the main admin's
own account cannot be edited, deactivated or deleted through it.
