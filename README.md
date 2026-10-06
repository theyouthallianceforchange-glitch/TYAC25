# TYAC upgraded website

This version keeps the supplied TYAC visual design and adds:

- Live Liberia date/time in the header and footer.
- Secure membership registration stored in PostgreSQL.
- Contact-message API stored in PostgreSQL.
- Protected administrator portal at `/admin.html`.
- Password hashing with bcrypt.
- Server-side sessions stored in PostgreSQL.
- CSRF protection for authenticated admin actions.
- Helmet security headers and Content Security Policy.
- Rate limiting on login and public submissions.
- Parameterized SQL queries to reduce SQL injection risk.
- Audit log for administrator login/logout and status changes.
- Environment variables for secrets; no credentials are hard-coded.

## Local Docker setup

1. Copy `.env.example` to `.env`.
2. Set strong `POSTGRES_PASSWORD` and `SESSION_SECRET` values.
3. Start:
   `docker compose up -d --build`
4. Create the first administrator from a shell inside the web container:
   `docker compose exec web npm run create-admin`
   Example: `docker compose exec -e ADMIN_EMAIL=admin@example.org -e ADMIN_PASSWORD='your-strong-password' web npm run create-admin`.
5. Open `http://localhost:3000/`.
6. Open `http://localhost:3000/admin.html` for the secure admin portal.

For production, serve the site behind HTTPS, use a strong randomly generated session secret, rotate credentials, restrict database network access, and back up PostgreSQL.
