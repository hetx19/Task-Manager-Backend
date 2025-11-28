const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../app");
const Task = require("../model/Task");
const User = require("../model/User");
const jwt = require("jsonwebtoken");

let mongoServer;
let token;
let userId;
let adminToken;
let adminId;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);

  process.env.JWT_SECRET = "testsecret";
  process.env.ADMIN_INVITE_TOKEN = "admin123";

  const admin = await User.create({
    name: "Admin User",
    email: "admin@example.com",
    password: "password123",
    role: "admin",
  });
  adminId = admin._id;
  adminToken = jwt.sign(
    { _id: adminId, role: "admin" },
    process.env.JWT_SECRET
  );

  const user = await User.create({
    name: "Normal User",
    email: "user@example.com",
    password: "password123",
    role: "user",
  });
  userId = user._id;
  token = jwt.sign({ _id: userId, role: "user" }, process.env.JWT_SECRET);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

const createTask = async (overrides = {}) => {
  const defaultTask = {
    title: "Default Task",
    description: "Default Description",
    priority: "Medium",
    dueDate: new Date(),
    assignedTo: [userId],
    createdBy: adminId,
    todoCheckList: [],
  };
  return await Task.create({ ...defaultTask, ...overrides });
};

const authRequest = (method, url, authToken, body) => {
  let req = request(app)
    [method](url)
    .set("Authorization", `Bearer ${authToken}`);
  if (body) req = req.send(body);
  return req;
};

describe("Task Controller Error Handling", () => {
  beforeEach(async () => {
    await Task.deleteMany({});
  });

  it("POST /api/task should return 500 on server error", async () => {
    jest.spyOn(Task, "create").mockImplementation(async () => {
      throw new Error("Database failure");
    });

    const newTask = {
      title: "Failing Task",
      description: "Should fail",
      priority: "Low",
      dueDate: new Date(),
      assignedTo: [userId],
    };

    const res = await authRequest("post", "/api/task", adminToken, newTask);
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("message", "Server error");
    expect(res.body).toHaveProperty("error", "Database failure");

    jest.restoreAllMocks();
  });

  it("GET /api/task/dashboard should return 500 on server error", async () => {
    jest.spyOn(Task, "aggregate").mockImplementation(async () => {
      throw new Error("Database failure");
    });

    const res = await authRequest("get", "/api/task/dashboard", adminToken);
    expect(res.status).toBe(500);
    expect(res.body).toHaveProperty("message", "Server error");
    expect(res.body).toHaveProperty("error", "Database failure");

    jest.restoreAllMocks();
  });
});

describe("GET /api/task/dashboard", () => {
  beforeEach(async () => {
    await Task.deleteMany({});
  });

  it("should return dashboard data for admin users", async () => {
    await createTask({ status: "Pending" });
    await createTask({ status: "Completed" });
    const res = await authRequest("get", "/api/task/dashboard", adminToken);
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("statistics");
    expect(res.body).toHaveProperty("charts");
  });

  it("should correctly map taskDistribution including fallback to 0", async () => {
    await Task.create([
      {
        title: "T1",
        status: "Pending",
        priority: "Low",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
      {
        title: "T2",
        status: "Completed",
        priority: "Medium",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
      {
        title: "T3",
        status: "In Progress",
        priority: "High",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
    ]);

    const res = await authRequest("get", "/api/task/dashboard", adminToken);
    expect(res.status).toBe(200);
    expect(res.body.charts.taskDistribution).toEqual({
      Pending: 1,
      InProgress: 1,
      Completed: 1,
      All: 3,
    });
  });
});

describe("GET /api/task/user-dashboard", () => {
  beforeEach(async () => {
    await Task.deleteMany({});
  });

  it("should return correct statistics", async () => {
    await Task.create([
      {
        title: "Task 1",
        status: "Pending",
        priority: "Low",
        assignedTo: [userId],
        dueDate: new Date(Date.now() + 86400000),
      },
      {
        title: "Task 2",
        status: "Completed",
        priority: "High",
        assignedTo: [userId],
        dueDate: new Date(Date.now() + 86400000),
      },
      {
        title: "Task 3",
        status: "Pending",
        priority: "Medium",
        assignedTo: [userId],
        dueDate: new Date(Date.now() - 86400000),
      },
    ]);

    const res = await request(app)
      .get("/api/task/user-dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    expect(res.body.statistics.totalTasks).toBe(3);
    expect(res.body.statistics.pendingTasks).toBe(2);
    expect(res.body.statistics.completedTasks).toBe(1);
    expect(res.body.statistics.overDueTasks).toBe(1);
  });

  it("should return taskDistribution for user", async () => {
    await Task.create([
      {
        title: "T1",
        status: "Pending",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
      {
        title: "T2",
        status: "Completed",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
      {
        title: "T3",
        status: "In Progress",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
    ]);

    const res = await request(app)
      .get("/api/task/user-dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.charts.taskDistribution).toEqual({
      All: 3,
      Pending: 1,
      InProgress: 1,
      Completed: 1,
    });
  });

  it("should return taskPriorityLevels correctly", async () => {
    await Task.create([
      {
        title: "T1",
        priority: "Low",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
      {
        title: "T2",
        priority: "Medium",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
      {
        title: "T3",
        priority: "High",
        assignedTo: [userId],
        createdBy: adminId,
        dueDate: new Date(),
      },
    ]);

    const res = await request(app)
      .get("/api/task/user-dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    expect(res.body.charts.taskPriorityLevels).toEqual({
      Low: 1,
      Medium: 1,
      High: 1,
    });
  });

  it("should return recentTasks sorted by createdAt", async () => {
    await Task.create([
      {
        title: "Old Task",
        assignedTo: [userId],
        createdAt: new Date(Date.now() - 20000),
        dueDate: new Date(),
      },
      {
        title: "New Task",
        assignedTo: [userId],
        createdAt: new Date(Date.now() - 1000),
        dueDate: new Date(),
      },
    ]);

    const res = await request(app)
      .get("/api/task/user-dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(200);

    expect(res.body.recentTasks.length).toBe(2);
    expect(res.body.recentTasks[0].title).toBe("New Task");
  });

  it("should return 500 and error message if aggregation fails", async () => {
    jest.spyOn(Task, "aggregate").mockImplementation(() => {
      throw new Error("Aggregation failure");
    });

    const res = await request(app)
      .get("/api/task/user-dashboard")
      .set("Authorization", `Bearer ${token}`);

    expect(res.status).toBe(500);
    expect(res.body.error).toBe("Aggregation failure");

    jest.restoreAllMocks();
  });
});

describe("GET /api/task", () => {
  beforeEach(async () => await Task.deleteMany({}));

  it("should return tasks for authorized user", async () => {
    await createTask({ title: "Test Task 1" });
    const res = await authRequest("get", "/api/task", token);
    expect(res.status).toBe(200);
    expect(res.body.tasks.length).toBeGreaterThan(0);
  });

  it("should return 403 for unauthorized user", async () => {
    const res = await request(app)
      .get("/api/task")
      .set("Authorization", "Bearer invalidtoken");
    expect(res.status).toBe(403);
  });
});

describe("POST /api/task", () => {
  beforeEach(async () => await Task.deleteMany({}));

  it("should create a new task with valid data", async () => {
    const newTask = {
      title: "New Task",
      description: "New task description",
      priority: "Low",
      dueDate: new Date(),
      assignedTo: [userId],
      todoCheckList: [],
    };
    const res = await authRequest("post", "/api/task", adminToken, newTask);
    expect(res.status).toBe(201);
    expect(res.body.message).toBe("Task created successfully");
    expect(res.body.task).toHaveProperty("title", "New Task");
  });

  it("should return 400 if assignedTo is not an array", async () => {
    const invalidTask = {
      title: "Invalid Task",
      description: "Invalid task description",
      priority: "High",
      dueDate: new Date(),
      assignedTo: "invalidUserId",
      todoCheckList: [],
    };
    const res = await authRequest("post", "/api/task", adminToken, invalidTask);
    expect(res.status).toBe(400);
    expect(res.body.message).toBe("assignedTo must be an array of user IDs");
  });
});

describe("PUT /api/task/:id", () => {
  beforeEach(async () => await Task.deleteMany({}));

  it("should update task successfully", async () => {
    const task = await createTask({ title: "Task to Update" });
    const res = await authRequest("put", `/api/task/${task._id}`, adminToken, {
      title: "Updated Task Title",
      description: "Updated description",
    });
    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Task updated successfully");
    expect(res.body.task).toHaveProperty("title", "Updated Task Title");
  });

  it("should return 404 if task not found", async () => {
    const res = await authRequest(
      "put",
      "/api/task/invalidTaskId",
      adminToken,
      { title: "Non-Existing Task" }
    );
    expect(res.status).toBe(404);
  });
});

describe("PUT /api/task/:id/status", () => {
  let admin;
  let adminToken;
  let user;
  let userToken;
  let invalidToken;

  beforeAll(async () => {
    admin = await User.create({
      name: "Admin",
      email: "admin@test.com",
      password: "pass123",
      role: "admin",
    });

    adminToken = jwt.sign(
      { _id: admin._id, role: "admin" },
      process.env.JWT_SECRET
    );

    user = await User.create({
      name: "User",
      email: "user@test.com",
      password: "pass123",
      role: "user",
    });

    userToken = jwt.sign(
      { _id: user._id, role: "user" },
      process.env.JWT_SECRET
    );

    invalidToken = adminToken + "123INVALID";
  });

  afterEach(async () => {
    await Task.deleteMany({});
    await User.deleteMany({});
  });

  it("should return 401 if token is missing", async () => {
    const res = await request(app).put("/api/task/123/status");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(
      "Not authorized, token missing or token is invalid"
    );
  });

  it("should return 401 if token does not start with Bearer", async () => {
    const res = await request(app)
      .put("/api/task/123/status")
      .set("Authorization", "InvalidTokenHere");

    expect(res.status).toBe(401);
  });

  it("should return 401 if token is expired", async () => {
    const expiredToken = jwt.sign(
      { _id: user._id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1ms" }
    );

    await new Promise((r) => setTimeout(r, 20));

    const res = await request(app)
      .put("/api/task/123/status")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Token expired. Please log in again.");
  });

  it("should return 403 if token is invalid", async () => {
    const res = await request(app)
      .put("/api/task/123/status")
      .set("Authorization", `Bearer ${invalidToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Invalid token. Please log in again.");
  });

  it("should return 404 for invalid ObjectId", async () => {
    const res = await authRequest(
      "put",
      "/api/task/invalidId/status",
      adminToken,
      { status: "In Progress" }
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Task not found");
  });

  it("should return 404 if task does not exist", async () => {
    const id = new mongoose.Types.ObjectId();

    const res = await authRequest("put", `/api/task/${id}/status`, adminToken, {
      status: "Pending",
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Task not found");
  });

  it("should return 403 if user is not assigned and not admin", async () => {
    const task = await Task.create({
      title: "Task",
      assignedTo: [admin._id],
      createdBy: admin._id,
      todoCheckList: [],
      dueDate: new Date(),
    });

    const res = await authRequest(
      "put",
      `/api/task/${task._id}/status`,
      userToken,
      { status: "Completed" }
    );

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Not authorized");
  });

  it("should allow update if user is assigned to the task", async () => {
    const task = await Task.create({
      title: "Test Task",
      assignedTo: [user._id],
      createdBy: admin._id,
      todoCheckList: [],
      dueDate: new Date(),
    });

    const res = await authRequest(
      "put",
      `/api/task/${task._id}/status`,
      userToken,
      { status: "In Progress" }
    );

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe("In Progress");
  });

  it("should allow admin to update any task", async () => {
    const task = await Task.create({
      title: "Admin Override Task",
      assignedTo: [user._id],
      createdBy: user._id,
      todoCheckList: [],
      dueDate: new Date(),
    });

    const res = await authRequest(
      "put",
      `/api/task/${task._id}/status`,
      adminToken,
      { status: "Pending" }
    );

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe("Pending");
  });

  it("should set progress to 100 and complete all checklist items if status = Completed", async () => {
    const task = await Task.create({
      title: "Checklist Task",
      assignedTo: [user._id],
      createdBy: admin._id,
      todoCheckList: [
        { text: "A", completed: false },
        { text: "B", completed: false },
      ],
      dueDate: new Date(),
    });

    const res = await authRequest(
      "put",
      `/api/task/${task._id}/status`,
      userToken,
      { status: "Completed" }
    );

    expect(res.status).toBe(200);
    expect(res.body.task.status).toBe("Completed");
    expect(res.body.task.progress).toBe(100);

    res.body.task.todoCheckList.forEach((item) =>
      expect(item.completed).toBe(true)
    );
  });

  it("should return 500 on database error", async () => {
    jest.spyOn(Task, "findById").mockRejectedValueOnce(new Error("DB Error"));

    const id = new mongoose.Types.ObjectId();

    const res = await authRequest("put", `/api/task/${id}/status`, adminToken, {
      status: "Pending",
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("DB Error");

    Task.findById.mockRestore();
  });
});

describe("PUT /api/task/:id/todo", () => {
  let admin;
  let adminToken;
  let user;
  let userToken;
  let invalidToken;

  beforeAll(async () => {
    admin = await User.create({
      name: "Admin",
      email: "admin@test.com",
      password: "pass123",
      role: "admin",
    });
    adminToken = jwt.sign(
      { _id: admin._id, role: "admin" },
      process.env.JWT_SECRET
    );

    user = await User.create({
      name: "User",
      email: "user@test.com",
      password: "pass123",
      role: "user",
    });
    userToken = jwt.sign(
      { _id: user._id, role: "user" },
      process.env.JWT_SECRET
    );

    invalidToken = adminToken + "123INVALID";
  });

  beforeEach(async () => {
    await Task.deleteMany({});
  });

  it("should return 401 if token is missing", async () => {
    const res = await request(app).put("/api/task/123/todo");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(
      "Not authorized, token missing or token is invalid"
    );
  });

  it("should return 401 if token does not start with Bearer", async () => {
    const res = await request(app)
      .put("/api/task/123/todo")
      .set("Authorization", "InvalidTokenHere");

    expect(res.status).toBe(401);
  });

  it("should return 401 if token is expired", async () => {
    const expiredToken = jwt.sign(
      { _id: user._id, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1ms" }
    );

    await new Promise((r) => setTimeout(r, 20));

    const res = await request(app)
      .put("/api/task/123/todo")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Token expired. Please log in again.");
  });

  it("should return 403 if token is invalid", async () => {
    const res = await request(app)
      .put("/api/task/123/todo")
      .set("Authorization", `Bearer ${invalidToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Invalid token. Please log in again.");
  });

  it("should return 404 for invalid ObjectId", async () => {
    const res = await authRequest(
      "put",
      "/api/task/invalidId/todo",
      adminToken,
      { todoCheckList: [] }
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Task not found");
  });

  it("should return 404 if task does not exist", async () => {
    const id = new mongoose.Types.ObjectId();

    const res = await authRequest("put", `/api/task/${id}/todo`, adminToken, {
      todoCheckList: [],
    });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Task not found");
  });

  it("should return 403 if user is not assigned and not admin", async () => {
    const task = await Task.create({
      title: "Task",
      assignedTo: [admin._id],
      createdBy: admin._id,
      todoCheckList: [],
      dueDate: new Date(),
    });

    const res = await authRequest(
      "put",
      `/api/task/${task._id}/todo`,
      userToken,
      { todoCheckList: [] }
    );

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Not authorized");
  });

  it("should allow update if user is assigned to the task", async () => {
    const task = await Task.create({
      title: "Test",
      assignedTo: [user._id],
      createdBy: admin._id,
      todoCheckList: [],
      dueDate: new Date(),
    });

    const newChecklist = [
      { text: "Item 1", completed: true },
      { text: "Item 2", completed: false },
    ];

    const res = await authRequest(
      "put",
      `/api/task/${task._id}/todo`,
      userToken,
      { todoCheckList: newChecklist }
    );

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Task checklist updated successfully");
    expect(res.body.task.todoCheckList.length).toBe(2);
    expect(res.body.task.progress).toBe(50);
    expect(res.body.task.status).toBe("In Progress");
  });

  it("should allow admin to update any task", async () => {
    const task = await Task.create({
      title: "Admin Task",
      assignedTo: [user._id],
      createdBy: user._id,
      todoCheckList: [],
      dueDate: new Date(),
    });

    const checklist = [{ text: "Done", completed: true }];

    const res = await authRequest(
      "put",
      `/api/task/${task._id}/todo`,
      adminToken,
      { todoCheckList: checklist }
    );

    expect(res.status).toBe(200);
    expect(res.body.task.progress).toBe(100);
    expect(res.body.task.status).toBe("Completed");
  });

  it("should correctly set status to Pending, In Progress, Completed", async () => {
    const task = await Task.create({
      title: "Task",
      assignedTo: [user._id],
      createdBy: admin._id,
      todoCheckList: [],
      dueDate: new Date(),
    });

    let res = await authRequest(
      "put",
      `/api/task/${task._id}/todo`,
      userToken,
      { todoCheckList: [] }
    );
    expect(res.body.task.status).toBe("Pending");

    res = await authRequest("put", `/api/task/${task._id}/todo`, userToken, {
      todoCheckList: [
        { text: "A", completed: true },
        { text: "B", completed: false },
      ],
    });
    expect(res.body.task.status).toBe("In Progress");

    res = await authRequest("put", `/api/task/${task._id}/todo`, userToken, {
      todoCheckList: [
        { text: "A", completed: true },
        { text: "B", completed: true },
      ],
    });
    expect(res.body.task.status).toBe("Completed");
  });

  it("should return 500 if database error occurs", async () => {
    jest.spyOn(Task, "findById").mockRejectedValueOnce(new Error("DB Error"));

    const id = new mongoose.Types.ObjectId();

    const res = await authRequest("put", `/api/task/${id}/todo`, adminToken, {
      todoCheckList: [],
    });

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("DB Error");

    Task.findById.mockRestore();
  });
});

describe("DELETE /api/task/:id", () => {
  let invalidToken;

  beforeAll(() => {
    invalidToken = adminToken + "123INVALID";
  });

  beforeEach(async () => {
    await Task.deleteMany({});
  });

  it("should return 401 if token is missing", async () => {
    const res = await request(app).delete("/api/task/123456789012");

    expect(res.status).toBe(401);
    expect(res.body.message).toBe(
      "Not authorized, token missing or token is invalid"
    );
  });

  it("should return 401 if token does not start with Bearer", async () => {
    const res = await request(app)
      .delete("/api/task/123456789012")
      .set("Authorization", "InvalidTokenHere");

    expect(res.status).toBe(401);
  });

  it("should return 401 if token is expired", async () => {
    const expiredToken = jwt.sign(
      { _id: userId, role: "user" },
      process.env.JWT_SECRET,
      { expiresIn: "1ms" }
    );

    await new Promise((resolve) => setTimeout(resolve, 20));

    const res = await request(app)
      .delete("/api/task/123456789012")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Token expired. Please log in again.");
  });

  it("should return 403 if token is invalid", async () => {
    const res = await request(app)
      .delete("/api/task/123456789012")
      .set("Authorization", `Bearer ${invalidToken}`);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Invalid token. Please log in again.");
  });

  it("should return 403 if user is not an admin", async () => {
    const task = await createTask({ title: "User Cannot Delete" });

    const res = await authRequest("delete", `/api/task/${task._id}`, token);

    expect(res.status).toBe(403);
    expect(res.body.message).toBe("Access denied, Only for admin");
  });

  it("should return 404 for invalid ObjectId", async () => {
    const res = await authRequest(
      "delete",
      "/api/task/invalidTaskId",
      adminToken
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Task not found");
  });

  it("should return 404 if task does not exist", async () => {
    const validNotExistingId = new mongoose.Types.ObjectId();

    const res = await authRequest(
      "delete",
      `/api/task/${validNotExistingId}`,
      adminToken
    );

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("Task not found");
  });

  it("should delete the task successfully", async () => {
    const task = await createTask({ title: "Task to Delete" });

    const res = await authRequest(
      "delete",
      `/api/task/${task._id}`,
      adminToken
    );

    expect(res.status).toBe(200);
    expect(res.body.message).toBe("Task deleted successfully");

    const check = await Task.findById(task._id);
    expect(check).toBeNull();
  });

  it("should return 500 on database error", async () => {
    jest.spyOn(Task, "findById").mockRejectedValueOnce(new Error("DB Error"));

    const id = new mongoose.Types.ObjectId();

    const res = await authRequest("delete", `/api/task/${id}`, adminToken);

    expect(res.status).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("DB Error");

    Task.findById.mockRestore();
  });
});
