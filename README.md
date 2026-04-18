# Authentication System — Node.js + JWT

A production-style authentication REST API built with Node.js, Express, MongoDB, and JWT. Covers the full auth lifecycle including local credentials, Google OAuth, refresh token rotation, and password reset.

---

## Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express v5 |
| Database | MongoDB + Mongoose |
| Auth | JWT (jsonwebtoken) |
| Password Hashing | bcryptjs |
| Google OAuth | google-auth-library |
| Security Headers | Helmet |
| CORS | cors |
| Rate Limiting | express-rate-limit |
| Dev Server | nodemon |

---

## Project Structure

```
├── server.js
└── src/
    ├── app.js
    ├── config/
    │   └── db.js
    ├── controllers/
    │   └── authController.js
    ├── middlewares/
    │   └── authMiddleware.js
    ├── models/
    │   └── User.js
    ├── routes/
    │   └── authRoutes.js
    └── utils/
        ├── AppError.js
        ├── asyncHandler.js
        └── generateToken.js
```

---

## Environment Variables

Create a `.env` file in the root:

```env
NODE_ENV=development
PORT=5000

MONGO_URI=your_mongodb_connection_string

JWT_SECRET=your_access_token_secret
JWT_EXPIRES_IN=15m

JWT_REFRESH_SECRET=your_refresh_token_secret
JWT_REFRESH_EXPIRES_IN=30d

GOOGLE_CLIENT_ID=your_google_oauth_client_id

CLIENT_URL=http://localhost:3000
```

---

## Getting Started

```bash
# Install dependencies
npm install

# Start dev server
npm run dev

# Start production server
npm start
```

---

## API Reference

Base URL: `/api/auth`

### Public Routes

| Method | Endpoint | Body | Description |
|---|---|---|---|
| POST | `/signup` | `{ name, email, password }` | Register a new user |
| POST | `/login` | `{ email, password }` | Login, returns access token + sets cookie |
| POST | `/refresh` | none (uses cookie) | Get new access token + rotated refresh token |
| POST | `/forgot-password` | `{ email }` | Generate password reset token |
| POST | `/reset-password/:token` | `{ password }` | Reset password, invalidates all sessions |
| POST | `/google` | `{ idToken }` | Login or signup via Google |

### Protected Routes

Require `Authorization: Bearer <accessToken>` header.

| Method | Endpoint | Role | Description |
|---|---|---|---|
| GET | `/me` | any | Get current logged-in user |
| POST | `/logout` | any | Logout, clears refresh token |
| POST | `/set-password` | any | Set password for Google-only accounts |
| DELETE | `/delete-user/:id` | admin | Delete a user by ID |

---

## How Key Flows Work

**Signup / Login**
User sends credentials → password verified against bcrypt hash → access token returned in response body → refresh token stored in DB and set as `httpOnly` cookie.

**Token Refresh**
Client sends request to `/refresh` with no body — refresh token is read from cookie automatically → verified against DB → new access token issued → refresh token rotated (old one invalidated, new one stored and set in cookie).

**Google OAuth**
Frontend gets an `idToken` from Google's SDK → sends it to `/google` → server verifies it with `google-auth-library` before trusting any user data → account created or linked → tokens issued same as normal login.

**Password Reset**
`/forgot-password` generates a random token via `crypto.randomBytes`, stores only the SHA-256 hash in DB, sends plain token via email in production. `/reset-password/:token` hashes the incoming token, matches against DB, updates password, clears reset fields, and invalidates all active refresh tokens — forcing a fresh login.

**Error Handling**
All async controllers use `asyncHandler` wrapper — no repetitive try/catch. Known errors use `AppError` class (marked `isOperational`). In development, full stack trace is returned. In production, only message is sent for operational errors; unknown errors return a generic 500.

---

## Security Notes

- Passwords stored as bcrypt hashes (10 salt rounds) via Mongoose pre-save hook
- Refresh tokens stored in DB — invalidated on logout
- **Refresh token rotation** — every `/refresh` call issues a new refresh token and invalidates the old one, limiting the damage window of a stolen token
- **Session invalidation on password reset** — all active refresh tokens are cleared when password is reset, forcing re-authentication
- Google `idToken` verified server-side using `google-auth-library` — raw email/googleId from client is never trusted
- `httpOnly` cookie prevents JavaScript access to refresh token
- Reset tokens stored as SHA-256 hashes — plain token never touches the DB
- JWT secrets should be long random strings, never committed to version control
- **Helmet** sets secure HTTP headers on every response
- **CORS** configured with explicit allowed origin and credentials support
- **Rate limiting** — login/signup/google capped at 10 requests per 15 minutes, forgot-password capped at 5 per hour per IP

---

## Rate Limits

| Route | Limit |
|---|---|
| `/signup`, `/login`, `/google`, `/reset-password` | 10 requests / 15 minutes |
| `/forgot-password` | 5 requests / 1 hour |

---

## Testing in Postman

**Recommended test order:**

```
1. POST /signup                   → create user
2. POST /login                    → get accessToken, cookie auto-set
3. GET  /me                       → paste accessToken in Authorization header
4. POST /refresh                  → new accessToken + rotated refresh cookie
5. POST /forgot-password          → get resetURL from response (dev only)
6. POST /reset-password/:token    → reset password, all sessions cleared
7. POST /login                    → login again with new password
8. POST /logout                   → clears cookie and DB token
```

**Cookie note:** Postman handles `httpOnly` cookies automatically. After login, the `refreshToken` cookie is saved and sent on `/refresh` without any manual setup.

**Google auth in Postman:**
Get an `idToken` by clicking a real Google sign-in button in a browser (create a small HTML file with Google's GSI script), copy the token from the console, then send it to `/google` in Postman.

---

## Known Limitations

- `forgotPassword` returns `resetURL` in development only — wire Nodemailer/Resend before deploying to production
- Refresh tokens stored in plain text in DB — should be hashed for a fully hardened production setup
- No request validation library — only basic manual checks and Mongoose schema validation (Zod/Joi recommended)

---

## License

ISC
