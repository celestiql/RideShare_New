import { Router, type IRouter, type Request as ExpressRequest, type Response } from "express";
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";
import { and, desc, eq, gt, inArray, lt, or } from "drizzle-orm";
import {
  db,
  ratings,
  recurringSchedules,
  fareNudges,
  rideGroupMembers,
  rideGroups,
  rideRequests,
  sessions,
  students,
} from "@workspace/db";
import {
  AuthResponse,
  CancelRideRequestParams,
  CancelRideRequestResponse,
  CompleteRideGroupParams,
  CompleteRideGroupResponse,
  CreateRecurringScheduleBody,
  CreateRecurringScheduleResponse,
  CreateRideRequestBody,
  CreateRideRequestResponse,
  DeleteRecurringScheduleParams,
  DeleteRecurringScheduleResponse,
  FlagNoShowBody,
  FlagNoShowParams,
  FlagNoShowResponse,
  GetAvailableStudentsResponse,
  GetCurrentStudentResponse,
  GetDashboardResponse,
  GetRecurringSchedulesResponse,
  GetRideGroupParams,
  GetRideGroupResponse,
  GetRideGroupsResponse,
  GetRideRequestParams,
  GetRideRequestResponse,
  GetRideRequestsResponse,
  LoginStudentBody,
  LoginStudentResponse,
  LogoutStudentResponse,
  NudgeFarePayerBody,
  NudgeFarePayerParams,
  NudgeFarePayerResponse,
  RateRiderBody,
  RateRiderParams,
  RateRiderResponse,
  RegisterStudentBody,
  RegisterStudentResponse,
  UpdateRecurringScheduleBody,
  UpdateRecurringScheduleParams,
  UpdateRecurringScheduleResponse,
  UpdateRideRequestBody,
  UpdateRideRequestParams,
  UpdateRideRequestResponse,
} from "@workspace/api-zod";
import type { Student } from "@workspace/api-zod";

const router: IRouter = Router();

const LANDMARKS = [
  "north-gate",
  "library-circle",
  "hostel-block-a",
  "main-market",
  "east-gate",
] as const;
const TIME_SLOTS = [
  "06:00",
  "07:00",
  "08:00",
  "09:00",
  "10:00",
  "11:00",
  "12:00",
  "13:00",
  "14:00",
  "15:00",
  "16:00",
  "17:00",
  "18:00",
  "19:00",
] as const;
const PREFERENCES = ["any", "same-gender-only"] as const;
const FARES: Record<string, { auto: number; cab: number }> = {
  "north-gate": { auto: 90, cab: 180 },
  "library-circle": { auto: 100, cab: 200 },
  "hostel-block-a": { auto: 80, cab: 170 },
  "main-market": { auto: 110, cab: 220 },
  "east-gate": { auto: 95, cab: 190 },
};
const ADJACENT: Record<string, string[]> = {
  "north-gate": ["library-circle"],
  "library-circle": ["north-gate", "main-market"],
  "hostel-block-a": ["east-gate"],
  "main-market": ["library-circle"],
  "east-gate": ["hostel-block-a"],
};

type StudentRow = typeof students.$inferSelect;
type RideRequestRow = typeof rideRequests.$inferSelect;
type RideGroupRow = typeof rideGroups.$inferSelect;

function todayString(): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function kolkataMinutesNow(): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: "Asia/Kolkata",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return Number(values.hour) * 60 + Number(values.minute);
}

function addDays(dateString: string, amount: number): string {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + amount);
  return date.toISOString().slice(0, 10);
}

function isRealFutureDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const isCalendarDate =
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
  return isCalendarDate && value >= todayString();
}

function isRideTimeAvailable(value: string, timeSlot: string): boolean {
  if (!isRealFutureDate(value) || !/^\d{2}:\d{2}$/.test(timeSlot)) return false;
  if (value > todayString()) return true;
  const [hour, minute] = timeSlot.split(":").map(Number);
  return hour * 60 + minute > kolkataMinutesNow();
}

function normalizedDate(value: Date | string): string {
  return value instanceof Date ? value.toISOString().slice(0, 10) : value;
}

function apiDate(value: string): Date {
  return new Date(`${value}T00:00:00.000Z`);
}

function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, expected] = stored.split(":");
  if (!salt || !expected) return false;
  const actual = scryptSync(password, salt, 64);
  const expectedBuffer = Buffer.from(expected, "hex");
  return actual.length === expectedBuffer.length && timingSafeEqual(actual, expectedBuffer);
}

function setSessionCookie(res: Response, token: string): void {
  res.cookie("session_id", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: "/",
  });
}

async function createSession(studentId: number): Promise<string> {
  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
  await db.insert(sessions).values({ token, studentId, expiresAt });
  return token;
}

async function currentStudent(req: ExpressRequest): Promise<StudentRow | null> {
  const token = req.cookies?.session_id as string | undefined;
  if (!token) return null;
  const [session] = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.token, token), gt(sessions.expiresAt, new Date())));
  if (!session) return null;
  const [student] = await db.select().from(students).where(eq(students.id, session.studentId));
  return student ?? null;
}

function publicStudent(student: StudentRow): Student {
  return {
    id: student.id,
    studentId: student.studentId,
    name: student.name,
    email: student.email,
    gender: student.gender as Student["gender"],
    upiPaymentLink: student.upiPaymentLink,
    coRiderPreference: student.coRiderPreference as Student["coRiderPreference"],
    ratingAverage: Number(student.ratingAverage),
    ratingCount: student.ratingCount,
    noShowCount: student.noShowCount,
  };
}

function preferencesCompatible(
  leftPreference: string,
  leftGender: string,
  rightPreference: string,
  rightGender: string,
): boolean {
  if (leftPreference === "any" || rightPreference === "any") return true;
  return (
    leftGender !== "prefer-not-to-say" &&
    rightGender !== "prefer-not-to-say" &&
    leftGender === rightGender
  );
}

function fareFor(landmarks: string[], memberCount: number): {
  vehicleType: "auto" | "cab";
  totalFare: number;
  farePerHead: number;
} {
  const vehicleType = memberCount <= 3 ? "auto" : "cab";
  const totalFare = Math.max(
    ...landmarks.map((landmark) => FARES[landmark]?.[vehicleType] ?? FARES["north-gate"][vehicleType]),
  );
  return {
    vehicleType,
    totalFare,
    farePerHead: Math.round(totalFare / Math.max(memberCount, 1)),
  };
}

function publicRequest(request: RideRequestRow) {
  return {
    id: request.id,
    date: apiDate(request.date),
    timeSlot: request.timeSlot,
    landmark: request.landmark,
    coRiderPreference: request.coRiderPreference,
    creationMode: request.creationMode,
    status: request.status,
    groupId: request.groupId,
    createdAt: request.createdAt,
  };
}

function publicGroup(group: RideGroupRow) {
  return {
    id: group.id,
    date: apiDate(group.date),
    timeSlot: group.timeSlot,
    landmark: group.landmark,
    landmarks: group.landmarks,
    matchType: group.matchType,
    memberCount: 0,
    status: group.status === "completed" || group.date < todayString() ? "completed" : "upcoming",
    vehicleType: group.vehicleType,
    totalFare: group.totalFare,
    farePerHead: group.farePerHead,
    reminderVisible: group.reminderVisible,
  };
}

async function groupMembers(groupId: number) {
  const rows = await db
    .select({
      membership: rideGroupMembers,
      student: students,
    })
    .from(rideGroupMembers)
    .innerJoin(students, eq(rideGroupMembers.studentId, students.id))
    .where(eq(rideGroupMembers.groupId, groupId));
  return rows;
}

async function refreshGroup(groupId: number): Promise<RideGroupRow | null> {
  const [group] = await db.select().from(rideGroups).where(eq(rideGroups.id, groupId));
  if (!group) return null;
  const members = await groupMembers(groupId);
  const landmarks = [...new Set(members.map(({ membership }) => membership.landmark))];
  const fare = fareFor(landmarks.length ? landmarks : group.landmarks, members.length);
  const [updated] = await db
    .update(rideGroups)
    .set({
      landmarks: landmarks.length ? landmarks : group.landmarks,
      vehicleType: fare.vehicleType,
      totalFare: fare.totalFare,
      farePerHead: fare.farePerHead,
    })
    .where(eq(rideGroups.id, groupId))
    .returning();
  return updated ?? group;
}

async function expirePastGroups(): Promise<void> {
  await db
    .update(rideGroups)
    .set({ status: "completed", reminderVisible: true })
    .where(and(eq(rideGroups.status, "upcoming"), lt(rideGroups.date, todayString())));
}

async function addMemberToGroup(
  groupId: number,
  studentId: number,
  requestId: number | null,
  landmark: string,
): Promise<void> {
  const existing = await db
    .select()
    .from(rideGroupMembers)
    .where(and(eq(rideGroupMembers.groupId, groupId), eq(rideGroupMembers.studentId, studentId)));
  if (!existing[0]) {
    await db.insert(rideGroupMembers).values({ groupId, studentId, requestId, landmark });
  }
  if (requestId) {
    await db
      .update(rideRequests)
      .set({ status: "matched", groupId })
      .where(eq(rideRequests.id, requestId));
  }
}

async function createGroup(
  request: RideRequestRow,
  members: Array<{ studentId: number; requestId: number | null; landmark: string }>,
  matchType: "exact" | "nearby",
): Promise<RideGroupRow> {
  const landmarks = [...new Set(members.map((member) => member.landmark))];
  const fare = fareFor(landmarks, members.length);
  const [group] = await db
    .insert(rideGroups)
    .values({
      date: request.date,
      timeSlot: request.timeSlot,
      landmark: request.landmark,
      landmarks,
      matchType,
      status: "upcoming",
      ...fare,
      reminderVisible: false,
    })
    .returning();
  if (!group) throw new Error("Unable to create ride group");
  for (const member of members) {
    await addMemberToGroup(group.id, member.studentId, member.requestId, member.landmark);
  }
  return (await refreshGroup(group.id)) ?? group;
}

async function matchAutomatic(requestId: number): Promise<RideGroupRow | null> {
  const [request] = await db.select().from(rideRequests).where(eq(rideRequests.id, requestId));
  if (!request) return null;
  const [requester] = await db.select().from(students).where(eq(students.id, request.studentId));
  if (!requester) return null;

  const openGroups = await db
    .select()
    .from(rideGroups)
    .where(
      and(
        eq(rideGroups.date, request.date),
        eq(rideGroups.timeSlot, request.timeSlot),
        eq(rideGroups.status, "upcoming"),
      ),
    );
  for (const group of openGroups) {
    const members = await groupMembers(group.id);
    const exactLandmark = group.landmarks.includes(request.landmark);
    const nearbyLandmark = group.landmarks.some(
      (landmark) =>
        ADJACENT[request.landmark]?.includes(landmark) ||
        ADJACENT[landmark]?.includes(request.landmark),
    );
    if (
      (exactLandmark || nearbyLandmark) &&
      members.every(({ student }) =>
        preferencesCompatible(
          request.coRiderPreference,
          requester.gender,
          student.coRiderPreference,
          student.gender,
        ),
      )
    ) {
      await addMemberToGroup(group.id, request.studentId, request.id, request.landmark);
      if (!exactLandmark && group.matchType !== "nearby") {
        await db.update(rideGroups).set({ matchType: "nearby" }).where(eq(rideGroups.id, group.id));
      }
      return refreshGroup(group.id);
    }
  }

  const candidates = await db
    .select({
      request: rideRequests,
      student: students,
    })
    .from(rideRequests)
    .innerJoin(students, eq(rideRequests.studentId, students.id))
    .where(
      and(
        eq(rideRequests.date, request.date),
        eq(rideRequests.timeSlot, request.timeSlot),
        eq(rideRequests.status, "pending"),
      ),
    );
  const exact = candidates.filter(
    ({ request: candidate, student }) =>
      candidate.id === request.id ||
      (candidate.landmark === request.landmark &&
        preferencesCompatible(
          request.coRiderPreference,
          requester.gender,
          student.coRiderPreference,
          student.gender,
        ) &&
        preferencesCompatible(
          candidate.coRiderPreference,
          student.gender,
          requester.coRiderPreference,
          requester.gender,
        )),
  );
  let selected = exact;
  let matchType: "exact" | "nearby" = "exact";
  if (exact.length < 2) {
    const adjacent = candidates.filter(
      ({ request: candidate, student }) =>
        candidate.id !== request.id &&
        ADJACENT[request.landmark]?.includes(candidate.landmark) &&
        preferencesCompatible(
          request.coRiderPreference,
          requester.gender,
          student.coRiderPreference,
          student.gender,
        ) &&
        preferencesCompatible(
          candidate.coRiderPreference,
          student.gender,
          requester.coRiderPreference,
          requester.gender,
        ),
    );
    if (adjacent.length) {
      selected = [...exact, ...adjacent];
      matchType = "nearby";
    }
  }
  if (!selected.some(({ request: candidate }) => candidate.id === request.id)) {
    selected = [{ request, student: requester }, ...selected];
  }
  const unique = new Map<number, (typeof selected)[number]>();
  for (const candidate of selected) unique.set(candidate.request.studentId, candidate);
  return createGroup(
    request,
    [...unique.values()].map(({ request: candidate }) => ({
      studentId: candidate.studentId,
      requestId: candidate.id,
      landmark: candidate.landmark,
    })),
    matchType,
  );
}

async function materializeRecurringSchedules(): Promise<void> {
  const schedules = await db.select().from(recurringSchedules);
  const start = todayString();
  for (const schedule of schedules) {
    for (let offset = 0; offset < 21; offset += 1) {
      const date = addDays(start, offset);
      const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
      if (!schedule.daysOfWeek.includes(weekday) || !isRideTimeAvailable(date, schedule.timeSlot)) continue;
      const existing = await db
        .select()
        .from(rideRequests)
        .where(
          and(
            eq(rideRequests.studentId, schedule.studentId),
            eq(rideRequests.date, date),
            eq(rideRequests.timeSlot, schedule.timeSlot),
            eq(rideRequests.landmark, schedule.landmark),
          ),
        );
      if (!existing[0]) {
        const [request] = await db
          .insert(rideRequests)
          .values({
            studentId: schedule.studentId,
            date,
            timeSlot: schedule.timeSlot,
            landmark: schedule.landmark,
            coRiderPreference: schedule.coRiderPreference,
            creationMode: "automatic",
            status: "pending",
          })
          .returning();
        if (request) await matchAutomatic(request.id);
      }
    }
  }
}

async function ownedRequest(req: ExpressRequest, requestId: number): Promise<RideRequestRow | null> {
  const student = await currentStudent(req);
  if (!student) return null;
  const [request] = await db
    .select()
    .from(rideRequests)
    .where(and(eq(rideRequests.id, requestId), eq(rideRequests.studentId, student.id)));
  return request ?? null;
}

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const input = parsed.data;
  const [existing] = await db
    .select()
    .from(students)
    .where(or(eq(students.email, input.email.toLowerCase()), eq(students.studentId, input.studentId)));
  if (existing) {
    res.status(400).json({ error: "Email or student ID is already registered." });
    return;
  }
  const [student] = await db
    .insert(students)
    .values({
      studentId: input.studentId,
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash: hashPassword(input.password),
      gender: input.gender,
      upiPaymentLink: input.upiPaymentLink ?? null,
      coRiderPreference: input.coRiderPreference,
    })
    .returning();
  if (!student) {
    res.status(400).json({ error: "Unable to create account." });
    return;
  }
  setSessionCookie(res, await createSession(student.id));
  res.status(201).json(RegisterStudentResponse.parse({ student: publicStudent(student) }));
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginStudentBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [student] = await db
    .select()
    .from(students)
    .where(eq(students.email, parsed.data.email.toLowerCase()));
  if (!student || !verifyPassword(parsed.data.password, student.passwordHash)) {
    res.status(401).json({ error: "Email or password is incorrect." });
    return;
  }
  setSessionCookie(res, await createSession(student.id));
  res.json(LoginStudentResponse.parse({ student: publicStudent(student) }));
});

router.post("/auth/logout", async (req, res): Promise<void> => {
  const token = req.cookies?.session_id as string | undefined;
  if (token) await db.delete(sessions).where(eq(sessions.token, token));
  res.clearCookie("session_id", { path: "/" });
  res.json(LogoutStudentResponse.parse({ message: "Logged out." }));
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  res.json(GetCurrentStudentResponse.parse(publicStudent(student)));
});

router.get("/dashboard", async (req, res): Promise<void> => {
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  await materializeRecurringSchedules();
  await expirePastGroups();
  const groups = await groupsForStudent(student.id);
  const requests = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.studentId, student.id))
    .orderBy(desc(rideRequests.createdAt));
  const schedules = await db
    .select()
    .from(recurringSchedules)
    .where(eq(recurringSchedules.studentId, student.id));
  const completedRequests = requests.filter((request) => request.status === "completed");
  const frequency = new Map<string, number>();
  for (const request of completedRequests) {
    const key = `${request.timeSlot}|${request.landmark}`;
    frequency.set(key, (frequency.get(key) ?? 0) + 1);
  }
  const usual = [...frequency.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]?.split("|");
  const suggestedRide = {
    date: apiDate(addDays(todayString(), 1)),
    timeSlot: usual?.[0] ?? "08:00",
    landmark: usual?.[1] ?? "north-gate",
    coRiderPreference: student.coRiderPreference,
    creationMode: "automatic",
    selectedStudentIds: [],
    label: "Repeat your usual ride",
  };
  const response = {
    student: publicStudent(student),
    upcomingGroups: groups.filter((group) => group.status === "upcoming").map((group) => publicGroup(group)),
    completedGroups: groups.filter((group) => group.status === "completed").map((group) => publicGroup(group)),
    pendingRequests: requests.filter((request) => request.status === "pending").map(publicRequest),
    recurringSchedules: schedules,
    suggestedRide,
    fareNudges: (await db
      .select({ nudge: fareNudges, group: rideGroups, sender: students })
      .from(fareNudges)
      .innerJoin(rideGroups, eq(fareNudges.groupId, rideGroups.id))
      .innerJoin(students, eq(fareNudges.senderStudentId, students.id))
      .where(and(eq(fareNudges.targetStudentId, student.id), eq(rideGroups.status, "completed")))
      .orderBy(desc(fareNudges.createdAt)))
      .map(({ nudge, group, sender }) => ({
        id: nudge.id,
        groupId: group.id,
        senderName: sender.name,
        date: apiDate(group.date),
        farePerHead: group.farePerHead,
        createdAt: nudge.createdAt.toISOString(),
      })),
  };
  res.json(GetDashboardResponse.parse(response));
});

router.get("/students/available", async (req, res): Promise<void> => {
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const available = await db.select().from(students);
  res.json(GetAvailableStudentsResponse.parse(available.filter((candidate) => candidate.id !== student.id).map(publicStudent)));
});

router.get("/ride-requests", async (req, res): Promise<void> => {
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const requests = await db
    .select()
    .from(rideRequests)
    .where(eq(rideRequests.studentId, student.id))
    .orderBy(desc(rideRequests.createdAt));
  res.json(GetRideRequestsResponse.parse(requests.map(publicRequest)));
});

router.post("/ride-requests", async (req, res): Promise<void> => {
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const parsed = CreateRideRequestBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const requestDate = normalizedDate(parsed.data.date);
  if (!isRideTimeAvailable(requestDate, parsed.data.timeSlot)) {
    res.status(400).json({ error: "Ride time must be in the future." });
    return;
  }
  const input = parsed.data;
  const [request] = await db
    .insert(rideRequests)
    .values({
      studentId: student.id,
      date: requestDate,
      timeSlot: input.timeSlot,
      landmark: input.landmark,
      coRiderPreference: input.coRiderPreference,
      creationMode: input.creationMode,
      status: "pending",
    })
    .returning();
  if (!request) {
    res.status(400).json({ error: "Unable to create ride request." });
    return;
  }
  let group: RideGroupRow | null = null;
  if (input.creationMode === "manual") {
    const ids = [...new Set((input.selectedStudentIds ?? []).filter((id) => id !== student.id))];
    if (!ids.length) {
      res.status(400).json({ error: "Choose at least one student for a manual group." });
      return;
    }
    const selectedStudents = await db.select().from(students).where(inArray(students.id, ids));
    if (!selectedStudents.length) {
      res.status(400).json({ error: "No selected students were found." });
      return;
    }
    const pendingSelected = await db
      .select()
      .from(rideRequests)
      .where(
        and(
          inArray(rideRequests.studentId, ids),
          eq(rideRequests.date, requestDate),
          eq(rideRequests.timeSlot, input.timeSlot),
          eq(rideRequests.status, "pending"),
        ),
      );
    group = await createGroup(
      request,
      [
        { studentId: student.id, requestId: request.id, landmark: input.landmark },
        ...selectedStudents.map((selected) => {
          const pending = pendingSelected.find((candidate) => candidate.studentId === selected.id);
          return {
            studentId: selected.id,
            requestId: pending?.id ?? null,
            landmark: pending?.landmark ?? input.landmark,
          };
        }),
      ],
      "exact",
    );
  } else {
    group = await matchAutomatic(request.id);
  }
  const response = publicRequest({
    ...request,
    status: group ? "matched" : "pending",
    groupId: group?.id ?? null,
  });
  res.status(201).json(CreateRideRequestResponse.parse(response));
});

router.get("/ride-requests/:requestId", async (req, res): Promise<void> => {
  const params = GetRideRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const request = await ownedRequest(req, params.data.requestId);
  if (!request) {
    res.status(404).json({ error: "Ride request not found." });
    return;
  }
  res.json(GetRideRequestResponse.parse(publicRequest(request)));
});

router.patch("/ride-requests/:requestId", async (req, res): Promise<void> => {
  const params = UpdateRideRequestParams.safeParse(req.params);
  const body = UpdateRideRequestBody.safeParse(req.body);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  if (!body.success) {
    res.status(400).json({ error: body.error?.message ?? "Invalid request." });
    return;
  }
  const updateDate = normalizedDate(body.data.date);
  if (!isRideTimeAvailable(updateDate, body.data.timeSlot)) {
    res.status(400).json({ error: "Ride time must be in the future." });
    return;
  }
  const request = await ownedRequest(req, params.data.requestId);
  if (!request || request.status === "completed") {
    res.status(404).json({ error: "Ride request not found or cannot be edited." });
    return;
  }
  const [updated] = await db
    .update(rideRequests)
    .set({
      date: updateDate,
      timeSlot: body.data.timeSlot,
      landmark: body.data.landmark,
      coRiderPreference: body.data.coRiderPreference,
      status: "pending",
      groupId: null,
    })
    .where(eq(rideRequests.id, request.id))
    .returning();
  if (!updated) {
    res.status(404).json({ error: "Ride request not found." });
    return;
  }
  const group = await matchAutomatic(updated.id);
  res.json(UpdateRideRequestResponse.parse(publicRequest({ ...updated, status: group ? "matched" : "pending", groupId: group?.id ?? null })));
});

router.delete("/ride-requests/:requestId", async (req, res): Promise<void> => {
  const params = CancelRideRequestParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const request = await ownedRequest(req, params.data.requestId);
  if (!request) {
    res.status(404).json({ error: "Ride request not found." });
    return;
  }
  await db.update(rideRequests).set({ status: "cancelled" }).where(eq(rideRequests.id, request.id));
  if (request.groupId) {
    await db
      .delete(rideGroupMembers)
      .where(and(eq(rideGroupMembers.groupId, request.groupId), eq(rideGroupMembers.studentId, request.studentId)));
    await refreshGroup(request.groupId);
  }
  res.json(CancelRideRequestResponse.parse({ message: "Ride request cancelled." }));
});

async function groupsForStudent(studentId: number): Promise<RideGroupRow[]> {
  const memberships = await db
    .select({ groupId: rideGroupMembers.groupId })
    .from(rideGroupMembers)
    .where(eq(rideGroupMembers.studentId, studentId));
  const ids = [...new Set(memberships.map((membership) => membership.groupId))];
  if (!ids.length) return [];
  return db.select().from(rideGroups).where(inArray(rideGroups.id, ids)).orderBy(rideGroups.date, rideGroups.timeSlot);
}

router.get("/ride-groups", async (req, res): Promise<void> => {
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  await materializeRecurringSchedules();
  await expirePastGroups();
  const groups = (await groupsForStudent(student.id)).filter((group) => group.status === "upcoming");
  const responses = await Promise.all(
    groups.map(async (group) => {
      const result = publicGroup(group);
      const members = await groupMembers(group.id);
      return { ...result, memberCount: members.length };
    }),
  );
  res.json(GetRideGroupsResponse.parse(responses));
});

router.get("/ride-groups/:groupId", async (req, res): Promise<void> => {
  const params = GetRideGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const [group] = await db.select().from(rideGroups).where(eq(rideGroups.id, params.data.groupId));
  const members = group ? await groupMembers(group.id) : [];
  if (!group || !members.some(({ membership }) => membership.studentId === student.id)) {
    res.status(404).json({ error: "Ride group not found." });
    return;
  }
  const sentNudges = await db
    .select()
    .from(fareNudges)
    .where(and(eq(fareNudges.groupId, group.id), eq(fareNudges.senderStudentId, student.id)));
  const nudgeByTarget = new Map(sentNudges.map((nudge) => [nudge.targetStudentId, nudge.createdAt.toISOString()]));
  const response = {
    ...publicGroup(group),
    memberCount: members.length,
    members: members.map(({ membership, student: member }) => ({
      id: member.id,
      studentId: member.studentId,
      name: member.name,
      landmark: membership.landmark,
      coRiderPreference: member.coRiderPreference,
      ratingAverage: Number(member.ratingAverage),
      noShowCount: member.noShowCount,
      upiPaymentLink: member.upiPaymentLink,
      fareNudgeSentAt: nudgeByTarget.get(member.id) ?? null,
    })),
  };
  res.json(GetRideGroupResponse.parse(response));
});

router.post("/ride-groups/:groupId/complete", async (req, res): Promise<void> => {
  const params = CompleteRideGroupParams.safeParse(req.params);
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [group] = await db
    .update(rideGroups)
    .set({ status: "completed", reminderVisible: true })
    .where(eq(rideGroups.id, params.data.groupId))
    .returning();
  if (!group) {
    res.status(404).json({ error: "Ride group not found." });
    return;
  }
  await db.update(rideRequests).set({ status: "completed" }).where(eq(rideRequests.groupId, group.id));
  res.json(CompleteRideGroupResponse.parse({ ...publicGroup(group), memberCount: (await groupMembers(group.id)).length }));
});

router.post("/ride-groups/:groupId/nudge", async (req, res): Promise<void> => {
  const params = NudgeFarePayerParams.safeParse(req.params);
  const body = NudgeFarePayerBody.safeParse(req.body);
  const sender = await currentStudent(req);
  if (!sender) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request." });
    return;
  }
  await expirePastGroups();
  const [group] = await db.select().from(rideGroups).where(eq(rideGroups.id, params.data.groupId));
  if (!group || group.status !== "completed") {
    res.status(400).json({ error: "Fare reminders are available after a ride is completed." });
    return;
  }
  const members = await groupMembers(group.id);
  if (!members.some(({ membership }) => membership.studentId === sender.id)) {
    res.status(404).json({ error: "Ride group not found." });
    return;
  }
  if (body.data.studentId === sender.id || !members.some(({ membership }) => membership.studentId === body.data.studentId)) {
    res.status(400).json({ error: "Choose another student in this ride group." });
    return;
  }
  await db
    .insert(fareNudges)
    .values({ groupId: group.id, senderStudentId: sender.id, targetStudentId: body.data.studentId })
    .onConflictDoUpdate({
      target: [fareNudges.groupId, fareNudges.senderStudentId, fareNudges.targetStudentId],
      set: { createdAt: new Date() },
    });
  res.json(NudgeFarePayerResponse.parse({ message: "Fare reminder sent." }));
});

router.post("/ride-groups/:groupId/noshow", async (req, res): Promise<void> => {
  const params = FlagNoShowParams.safeParse(req.params);
  const body = FlagNoShowBody.safeParse(req.body);
  const reporter = await currentStudent(req);
  if (!reporter) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request." });
    return;
  }
  const [group] = await db.select().from(rideGroups).where(eq(rideGroups.id, params.data.groupId));
  if (!group || group.date >= todayString()) {
    res.status(400).json({ error: "No-shows can only be recorded after the ride date." });
    return;
  }
  const [reporterMembership] = await db
    .select()
    .from(rideGroupMembers)
    .where(and(eq(rideGroupMembers.groupId, group.id), eq(rideGroupMembers.studentId, reporter.id)));
  if (!reporterMembership) {
    res.status(404).json({ error: "Ride group not found." });
    return;
  }
  if (body.data.studentId === reporter.id) {
    res.status(400).json({ error: "You cannot mark yourself as a no-show." });
    return;
  }
  const [member] = await db
    .select()
    .from(rideGroupMembers)
    .where(and(eq(rideGroupMembers.groupId, group.id), eq(rideGroupMembers.studentId, body.data.studentId)));
  if (!member) {
    res.status(400).json({ error: "That student is not in this group." });
    return;
  }
  if (!member.noShow) {
    await db.update(rideGroupMembers).set({ noShow: true }).where(eq(rideGroupMembers.id, member.id));
    const [target] = await db.select().from(students).where(eq(students.id, body.data.studentId));
    if (target) {
      await db.update(students).set({ noShowCount: target.noShowCount + 1 }).where(eq(students.id, target.id));
    }
  }
  res.json(FlagNoShowResponse.parse({ message: "No-show recorded." }));
});

router.post("/ride-groups/:groupId/ratings", async (req, res): Promise<void> => {
  const params = RateRiderParams.safeParse(req.params);
  const body = RateRiderBody.safeParse(req.body);
  const rater = await currentStudent(req);
  if (!rater) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request." });
    return;
  }
  const [group] = await db.select().from(rideGroups).where(eq(rideGroups.id, params.data.groupId));
  if (!group || group.status !== "completed") {
    res.status(400).json({ error: "Ratings are available after a completed ride." });
    return;
  }
  const [targetMembership] = await db
    .select()
    .from(rideGroupMembers)
    .where(and(eq(rideGroupMembers.groupId, group.id), eq(rideGroupMembers.studentId, body.data.studentId)));
  if (!targetMembership || targetMembership.studentId === rater.id) {
    res.status(400).json({ error: "Choose another rider from this group." });
    return;
  }
  const [alreadyRated] = await db
    .select()
    .from(ratings)
    .where(
      and(
        eq(ratings.groupId, group.id),
        eq(ratings.raterStudentId, rater.id),
        eq(ratings.ratedStudentId, body.data.studentId),
      ),
    );
  if (alreadyRated) {
    res.status(400).json({ error: "You already rated this rider." });
    return;
  }
  await db.insert(ratings).values({
    groupId: group.id,
    raterStudentId: rater.id,
    ratedStudentId: body.data.studentId,
    rating: body.data.rating,
  });
  const [target] = await db.select().from(students).where(eq(students.id, body.data.studentId));
  if (target) {
    const nextCount = target.ratingCount + 1;
    const nextAverage = (Number(target.ratingAverage) * target.ratingCount + body.data.rating) / nextCount;
    await db
      .update(students)
      .set({ ratingAverage: nextAverage.toFixed(2), ratingCount: nextCount })
      .where(eq(students.id, target.id));
  }
  res.status(201).json(RateRiderResponse.parse({ message: "Rating saved." }));
});

router.get("/recurring-schedules", async (req, res): Promise<void> => {
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  const schedules = await db.select().from(recurringSchedules).where(eq(recurringSchedules.studentId, student.id));
  res.json(GetRecurringSchedulesResponse.parse(schedules));
});

router.post("/recurring-schedules", async (req, res): Promise<void> => {
  const student = await currentStudent(req);
  const parsed = CreateRecurringScheduleBody.safeParse(req.body);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [schedule] = await db
    .insert(recurringSchedules)
    .values({ studentId: student.id, ...parsed.data })
    .returning();
  if (!schedule) {
    res.status(400).json({ error: "Unable to create recurring schedule." });
    return;
  }
  res.status(201).json(CreateRecurringScheduleResponse.parse(schedule));
});

router.patch("/recurring-schedules/:scheduleId", async (req, res): Promise<void> => {
  const params = UpdateRecurringScheduleParams.safeParse(req.params);
  const body = UpdateRecurringScheduleBody.safeParse(req.body);
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!params.success || !body.success) {
    res.status(400).json({ error: !params.success ? params.error.message : body.error?.message ?? "Invalid request." });
    return;
  }
  const [schedule] = await db
    .update(recurringSchedules)
    .set(body.data)
    .where(and(eq(recurringSchedules.id, params.data.scheduleId), eq(recurringSchedules.studentId, student.id)))
    .returning();
  if (!schedule) {
    res.status(404).json({ error: "Recurring schedule not found." });
    return;
  }
  res.json(UpdateRecurringScheduleResponse.parse(schedule));
});

router.delete("/recurring-schedules/:scheduleId", async (req, res): Promise<void> => {
  const params = DeleteRecurringScheduleParams.safeParse(req.params);
  const student = await currentStudent(req);
  if (!student) {
    res.status(401).json({ error: "Authentication required." });
    return;
  }
  if (!params.success) {
    res.status(400).json({ error: params.error.message });
    return;
  }
  const [deleted] = await db
    .delete(recurringSchedules)
    .where(and(eq(recurringSchedules.id, params.data.scheduleId), eq(recurringSchedules.studentId, student.id)))
    .returning();
  if (!deleted) {
    res.status(404).json({ error: "Recurring schedule not found." });
    return;
  }
  res.json(DeleteRecurringScheduleResponse.parse({ message: "Recurring schedule deleted." }));
});

export default router;