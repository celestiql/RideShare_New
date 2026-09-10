import * as schema from "./schema";
import pg from "pg";

let dbInstance: any;
let poolInstance: any = null;

if (process.env.DATABASE_URL) {
  try {
    const { drizzle } = await import("drizzle-orm/node-postgres");
    poolInstance = new pg.Pool({ connectionString: process.env.DATABASE_URL });
    dbInstance = drizzle(poolInstance, { schema });
  } catch (err) {
    console.error("[DB] Failed to connect to DATABASE_URL:", err);
  }
}

if (!dbInstance) {
  console.log("[DB] DATABASE_URL not set — initializing in-memory database with PGlite");
  const { PGlite } = await import("@electric-sql/pglite");
  const { drizzle } = await import("drizzle-orm/pglite");
  const client = new PGlite();

  // Create tables in memory
  await client.exec(`
    CREATE TABLE IF NOT EXISTS students (
      id SERIAL PRIMARY KEY,
      student_id TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      gender TEXT NOT NULL DEFAULT 'prefer-not-to-say',
      upi_payment_link TEXT,
      co_rider_preference TEXT NOT NULL,
      rating_average NUMERIC(4, 2) NOT NULL DEFAULT '0',
      rating_count INTEGER NOT NULL DEFAULT 0,
      no_show_count INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      expires_at TIMESTAMPTZ NOT NULL
    );

    CREATE TABLE IF NOT EXISTS recurring_schedules (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      days_of_week INTEGER[] NOT NULL,
      landmark TEXT NOT NULL,
      time_slot TEXT NOT NULL,
      co_rider_preference TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS ride_groups (
      id SERIAL PRIMARY KEY,
      date DATE NOT NULL,
      time_slot TEXT NOT NULL,
      landmark TEXT NOT NULL,
      landmarks TEXT[] NOT NULL,
      match_type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'upcoming',
      vehicle_type TEXT NOT NULL,
      total_fare INTEGER NOT NULL,
      fare_per_head INTEGER NOT NULL,
      reminder_visible BOOLEAN NOT NULL DEFAULT false
    );

    CREATE TABLE IF NOT EXISTS ride_requests (
      id SERIAL PRIMARY KEY,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      date DATE NOT NULL,
      time_slot TEXT NOT NULL,
      landmark TEXT NOT NULL,
      co_rider_preference TEXT NOT NULL,
      creation_mode TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      group_id INTEGER REFERENCES ride_groups(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS ride_group_members (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES ride_groups(id) ON DELETE CASCADE,
      student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      request_id INTEGER REFERENCES ride_requests(id) ON DELETE SET NULL,
      landmark TEXT NOT NULL,
      no_show BOOLEAN NOT NULL DEFAULT false,
      UNIQUE(group_id, student_id)
    );

    CREATE TABLE IF NOT EXISTS fare_nudges (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES ride_groups(id) ON DELETE CASCADE,
      sender_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      target_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE(group_id, sender_student_id, target_student_id)
    );

    CREATE TABLE IF NOT EXISTS ratings (
      id SERIAL PRIMARY KEY,
      group_id INTEGER NOT NULL REFERENCES ride_groups(id) ON DELETE CASCADE,
      rater_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      rated_student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
      rating INTEGER NOT NULL,
      UNIQUE(group_id, rater_student_id, rated_student_id)
    );
  `);

  const salt = "a1b2c3d4e5f60718293a4b5c6d7e8f90";
  const { scryptSync } = await import("node:crypto");
  const hash = scryptSync("password123", salt, 64).toString("hex");
  const passwordHash = `${salt}:${hash}`;

  await client.exec(`
    INSERT INTO students (student_id, name, email, password_hash, gender, upi_payment_link, co_rider_preference, rating_average, rating_count, no_show_count)
    VALUES
      ('STU2024001', 'Aarav Sharma', 'aarav.sharma@campus.edu', '${passwordHash}', 'man', 'https://upi.example.com/pay/aarav', 'any', '4.85', 12, 0),
      ('STU2024002', 'Priya Patel', 'priya.patel@campus.edu', '${passwordHash}', 'woman', 'https://upi.example.com/pay/priya', 'same-gender-only', '4.92', 15, 0),
      ('STU2024003', 'Rohan Gupta', 'rohan.gupta@campus.edu', '${passwordHash}', 'man', 'https://upi.example.com/pay/rohan', 'any', '4.70', 8, 1)
    ON CONFLICT (student_id) DO NOTHING;
  `);

  dbInstance = drizzle(client, { schema });
}

export const pool = poolInstance;
export const db = dbInstance;

export * from "./schema";
