import 'dotenv/config';
import { initSchema } from '../db.js';

// One-time schema bootstrap. Run with `npm run db:init`. Uses the same
// TURSO_DATABASE_URL/TURSO_AUTH_TOKEN env as the app (falls back to the local
// file:./booth.db for development). Safe to re-run — all DDL is IF NOT EXISTS.
try {
  await initSchema();
  console.log(
    `Schema ready on ${process.env.TURSO_DATABASE_URL ?? 'file:./booth.db'}`
  );
  process.exit(0);
} catch (err) {
  console.error('Schema init failed:', err);
  process.exit(1);
}
