import {
  boolean,
  date,
  integer,
  numeric,
  pgTable,
  serial,
  text,
  timestamp,
  unique,
} from "drizzle-orm/pg-core";

export const students = pgTable("students", {
  id: serial("id").primaryKey(),
  studentId: text("student_id").notNull().unique(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  gender: text("gender").notNull().default("prefer-not-to-say"),
  upiPaymentLink: text("upi_payment_link"),
  coRiderPreference: text("co_rider_preference").notNull(),
  ratingAverage: numeric("rating_average", { precision: 4, scale: 2 })
    .notNull()
    .default("0"),
  ratingCount: integer("rating_count").notNull().default(0),
  noShowCount: integer("no_show_count").notNull().default(0),
});

export const sessions = pgTable("sessions", {
  token: text("token").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});

export const recurringSchedules = pgTable("recurring_schedules", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  daysOfWeek: integer("days_of_week").array().notNull(),
  landmark: text("landmark").notNull(),
  timeSlot: text("time_slot").notNull(),
  coRiderPreference: text("co_rider_preference").notNull(),
});

export const rideGroups = pgTable("ride_groups", {
  id: serial("id").primaryKey(),
  date: date("date").notNull(),
  timeSlot: text("time_slot").notNull(),
  landmark: text("landmark").notNull(),
  landmarks: text("landmarks").array().notNull(),
  matchType: text("match_type").notNull(),
  status: text("status").notNull().default("upcoming"),
  vehicleType: text("vehicle_type").notNull(),
  totalFare: integer("total_fare").notNull(),
  farePerHead: integer("fare_per_head").notNull(),
  reminderVisible: boolean("reminder_visible").notNull().default(false),
});

export const rideRequests = pgTable("ride_requests", {
  id: serial("id").primaryKey(),
  studentId: integer("student_id")
    .notNull()
    .references(() => students.id, { onDelete: "cascade" }),
  date: date("date").notNull(),
  timeSlot: text("time_slot").notNull(),
  landmark: text("landmark").notNull(),
  coRiderPreference: text("co_rider_preference").notNull(),
  creationMode: text("creation_mode").notNull(),
  status: text("status").notNull().default("pending"),
  groupId: integer("group_id").references(() => rideGroups.id, {
    onDelete: "set null",
  }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const rideGroupMembers = pgTable(
  "ride_group_members",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => rideGroups.id, { onDelete: "cascade" }),
    studentId: integer("student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    requestId: integer("request_id").references(() => rideRequests.id, {
      onDelete: "set null",
    }),
    landmark: text("landmark").notNull(),
    noShow: boolean("no_show").notNull().default(false),
  },
  (table) => ({
    groupStudentUnique: unique().on(table.groupId, table.studentId),
  }),
);

export const fareNudges = pgTable(
  "fare_nudges",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => rideGroups.id, { onDelete: "cascade" }),
    senderStudentId: integer("sender_student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    targetStudentId: integer("target_student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    senderTargetUnique: unique().on(table.groupId, table.senderStudentId, table.targetStudentId),
  }),
);

export const ratings = pgTable(
  "ratings",
  {
    id: serial("id").primaryKey(),
    groupId: integer("group_id")
      .notNull()
      .references(() => rideGroups.id, { onDelete: "cascade" }),
    raterStudentId: integer("rater_student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    ratedStudentId: integer("rated_student_id")
      .notNull()
      .references(() => students.id, { onDelete: "cascade" }),
    rating: integer("rating").notNull(),
  },
  (table) => ({
    raterTargetUnique: unique().on(
      table.groupId,
      table.raterStudentId,
      table.ratedStudentId,
    ),
  }),
);