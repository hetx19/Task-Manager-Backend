jest.mock("exceljs", () => {
  const addRowMock = jest.fn();
  const addWorksheetMock = jest.fn(() => ({
    columns: [],
    addRow: addRowMock,
  }));

  const workbookMock = {
    addWorksheet: addWorksheetMock,
    xlsx: {
      write: jest.fn().mockResolvedValue(),
    },
  };

  return {
    Workbook: jest.fn(() => workbookMock),
    __mocks: {
      addRowMock,
      addWorksheetMock,
      workbookMock,
    },
  };
});

const request = require("supertest");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const { MongoMemoryServer } = require("mongodb-memory-server");
const excelJS = require("exceljs");

const app = require("../app");
const User = require("../model/User");
const Task = require("../model/Task");

let mongoServer;
let adminToken;
let userToken;
let adminUser;
let normalUser;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  await mongoose.connect(mongoServer.getUri());

  process.env.JWT_SECRET = "testsecret";

  adminUser = await User.create({
    name: "Admin",
    email: "admin@test.com",
    password: "hashedpassword123",
    role: "admin",
  });

  normalUser = await User.create({
    name: "User",
    email: "user@test.com",
    password: "hashedpassword123",
    role: "user",
  });

  adminToken = jwt.sign(
    { _id: adminUser._id, role: "admin" },
    process.env.JWT_SECRET
  );

  userToken = jwt.sign(
    { _id: normalUser._id, role: "user" },
    process.env.JWT_SECRET
  );

  await Task.create([
    {
      title: "Task 1",
      description: "Test task",
      priority: "High",
      status: "Pending",
      dueDate: new Date(),
      assignedTo: [adminUser._id],
    },
    {
      title: "Task 2",
      description: "Unassigned task",
      priority: "Low",
      status: "Completed",
      dueDate: new Date(),
      assignedTo: [],
    },
  ]);
});

beforeEach(async () => {
  await Task.deleteMany({});
  excelJS.__mocks.addRowMock.mockClear();
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const getUserRow = (email) => {
  return excelJS.__mocks.addRowMock.mock.calls
    .map((call) => call[0])
    .find((row) => row.email === email);
};

describe("📊 Export Tasks Report", () => {
  test("✅ Admin can export tasks report", async () => {
    const res = await request(app)
      .get("/api/report/export/tasks")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers["content-disposition"]).toContain("tasks_report.xlsx");
  });

  test("❌ Should fail without token", async () => {
    const res = await request(app).get("/api/report/export/tasks");
    expect(res.statusCode).toBe(401);
  });

  test("❌ Should fail for non-admin user", async () => {
    const res = await request(app)
      .get("/api/report/export/tasks")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Access denied, Only for admin");
  });

  test("✅ Should correctly process assignedTo field and add rows for tasks", async () => {
    const assignedTask = await Task.create({
      title: "Assigned Task",
      description: "This task is assigned",
      priority: "High",
      status: "In Progress",
      dueDate: new Date(),
      assignedTo: [adminUser._id],
    });

    const unassignedTask = await Task.create({
      title: "Unassigned Task",
      description: "This task is not assigned",
      priority: "Low",
      status: "Pending",
      dueDate: new Date(),
      assignedTo: [],
    });

    const res = await request(app)
      .get("/api/report/export/tasks")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);

    const addRowMock = excelJS.__mocks.addRowMock;

    const assignedTaskRow = addRowMock.mock.calls
      .map((call) => call[0])
      .find((row) => row._id.toString() === assignedTask._id.toString());

    const unassignedTaskRow = addRowMock.mock.calls
      .map((call) => call[0])
      .find((row) => row._id.toString() === unassignedTask._id.toString());

    expect(assignedTaskRow).toBeDefined();
    expect(assignedTaskRow.assignedTo).toBe("Admin (admin@test.com)");

    expect(unassignedTaskRow).toBeDefined();
    expect(unassignedTaskRow.assignedTo).toBe("Unassigned");
  });
});

describe("📊 Export Users Report", () => {
  test("✅ Admin can export users report", async () => {
    const res = await request(app)
      .get("/api/report/export/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    );
    expect(res.headers["content-disposition"]).toContain("users_report.xlsx");
  });

  test("❌ Should fail without token", async () => {
    const res = await request(app).get("/api/report/export/users");
    expect(res.statusCode).toBe(401);
  });

  test("❌ Should fail for non-admin user", async () => {
    const res = await request(app)
      .get("/api/report/export/users")
      .set("Authorization", `Bearer ${userToken}`);

    expect(res.statusCode).toBe(403);
  });
});

describe("🔐 Auth Middleware Edge Cases", () => {
  test("❌ Invalid token", async () => {
    const res = await request(app)
      .get("/api/report/export/tasks")
      .set("Authorization", "Bearer invalidtoken");

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toContain("Invalid token");
  });

  test("❌ Expired token", async () => {
    const expiredToken = jwt.sign(
      { _id: adminUser._id, role: "admin" },
      process.env.JWT_SECRET,
      { expiresIn: "1ms" }
    );

    await new Promise((r) => setTimeout(r, 10));

    const res = await request(app)
      .get("/api/report/export/tasks")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toContain("Token expired");
  });
});

describe("💥 Export Tasks Report - Server Error", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("❌ Should return 500 if Task.find().populate throws error", async () => {
    jest.spyOn(Task, "find").mockReturnValue({
      populate: jest.fn().mockRejectedValue(new Error("Database failure")),
    });

    const res = await request(app)
      .get("/api/report/export/tasks")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("Database failure");
  });
});

describe("💥 Export Users Report - Server Error", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("❌ Should return 500 if User.find().select().lean throws error", async () => {
    jest.spyOn(User, "find").mockReturnValue({
      select: jest.fn().mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error("User DB error")),
      }),
    });

    const res = await request(app)
      .get("/api/report/export/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("User DB error");
  });
});

describe("📊 Export Users Report - Task Aggregation Logic", () => {
  test("✅ Should correctly aggregate task counts per user", async () => {
    await Task.create({
      title: "Task Pending",
      description: "Pending task",
      priority: "High",
      status: "Pending",
      dueDate: new Date(),
      assignedTo: [adminUser._id],
    });

    const res = await request(app)
      .get("/api/report/export/users")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(res.statusCode).toBe(200);

    const adminRow = getUserRow("admin@test.com");

    expect(adminRow).toBeDefined();
    expect(adminRow.taskCount).toBe(1);
    expect(adminRow.pendingTasks).toBe(1);
    expect(adminRow.inProgressTasks).toBe(0);
    expect(adminRow.completedTask).toBe(0);
  });

  test("✅ Should count completed tasks correctly", async () => {
    await Task.create({
      title: "Task Completed",
      description: "Completed task",
      priority: "Medium",
      status: "Completed",
      dueDate: new Date(),
      assignedTo: [adminUser._id],
    });

    const res = await request(app)
      .get("/api/report/export/users")
      .set("Authorization", `Bearer ${adminToken}`);

    const adminRow = getUserRow("admin@test.com");

    expect(adminRow.taskCount).toBe(1);
    expect(adminRow.completedTask).toBe(1);
  });

  test("✅ Should count in-progress tasks correctly", async () => {
    await Task.create({
      title: "Task In Progress",
      description: "In progress task",
      priority: "Medium",
      status: "In Progress",
      dueDate: new Date(),
      assignedTo: [adminUser._id],
    });

    const res = await request(app)
      .get("/api/report/export/users")
      .set("Authorization", `Bearer ${adminToken}`);

    const adminRow = getUserRow("admin@test.com");

    expect(adminRow).toBeDefined();
    expect(adminRow.taskCount).toBe(1);
    expect(adminRow.pendingTasks).toBe(0);
    expect(adminRow.inProgressTasks).toBe(1);
    expect(adminRow.completedTask).toBe(0);
  });
});
