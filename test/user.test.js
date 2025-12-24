const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const jwt = require("jsonwebtoken");
const app = require("../app");
const User = require("../model/User");
const Task = require("../model/Task");

let mongoSever;
let userToken, adminToken;
let userId, adminId;

const generateToken = (userId, userRole) => {
  return jwt.sign({ _id: userId, role: userRole }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
};

beforeAll(async () => {
  // Start MongoDB in-memory server
  mongoSever = await MongoMemoryServer.create();
  const uri = mongoSever.getUri();

  // Connect mongoose to the in-memory MongoDB instance'
  mongoose.connect(uri, {});

  process.env.JWT_SECRET = "testsecret";

  // Create sample users
  const adminUser = await User.create({
    name: "Admin User",
    email: "admin@example.com",
    password: "admin123",
    profileImageURL: "https://example.com/admin.png",
    role: "admin",
  });

  const user = await User.create({
    name: "John Doe",
    email: "user@example.com",
    password: "user123",
    profileImageURL: "https://example.com/user.png",
    role: "user",
  });

  userId = user._id;
  adminId = adminUser._id;

  // Generate JWT tokens
  adminToken = generateToken(adminId, "admin");
  userToken = generateToken(userId, "user");

  // Create some tasks for the user
  const now = new Date();
  await Task.create([
    {
      title: "Complete API Documentation",
      description: "Write detailed API docs for all routes",
      priority: "High",
      status: "Pending",
      dueDate: new Date(now.getTime() + 2 * 24 * 60 * 60 * 1000), // due in 2 days
      assignedTo: [userId],
      createdBy: adminId,
      attachments: ["https://example.com/api-docs.pdf"],
      todoCheckList: [
        { text: "Outline endpoints", completed: true },
        { text: "Write responses", completed: false },
      ],
      progress: 40,
    },
    {
      title: "Frontend Integration",
      description: "Integrate task dashboard with backend",
      priority: "Medium",
      status: "In Progress",
      dueDate: new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000),
      assignedTo: [userId],
      createdBy: adminId,
      attachments: [],
      todoCheckList: [{ text: "Setup API calls", completed: false }],
      progress: 20,
    },
    {
      title: "Fix Login Bug",
      description: "Resolve JWT token issue",
      priority: "Low",
      status: "Completed",
      dueDate: new Date(now.getTime() - 1 * 24 * 60 * 60 * 1000), // past due
      assignedTo: [userId],
      createdBy: adminId,
      attachments: [],
      todoCheckList: [
        { text: "Reproduce bug", completed: true },
        { text: "Fix backend auth", completed: true },
      ],
      progress: 100,
    },
  ]);
});

afterAll(async () => {
  // Clean up and close the database connection
  await mongoose.disconnect();
  await mongoSever.stop();
});

// Get All Users Testing
describe("GET /api/user/", () => {
  afterEach(() => {
    jest.restoreAllMocks(); // Restore original implementations after each test
  });

  it("should return 401 if no token is provided", async () => {
    const response = await request(app).get("/api/user");

    expect(response.status).toBe(401);
    expect(response.body.message).toBe(
      "Not authorized, token missing or token is invalid"
    );
  });

  it("should return 403 if user is not admin", async () => {
    const response = await request(app)
      .get("/api/user")
      .set("Authorization", `Bearer ${userToken}`);

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Access denied, Only for admin");
  });

  it("should return users with task counts for admin", async () => {
    const response = await request(app)
      .get("/api/user")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(Array.isArray(response.body)).toBe(true);

    const user = response.body.find((u) => u.email === "user@example.com");

    expect(user).toBeDefined();
    expect(user).toHaveProperty("pendingTasks", 1);
    expect(user).toHaveProperty("inProgressTasks", 1);
    expect(user).toHaveProperty("completedTasks", 1);
  });

  it("should return 401 for expired token", async () => {
    const expiredToken = jwt.sign(
      { _id: adminId, role: "admin" },
      process.env.JWT_SECRET || "testsecret",
      { expiresIn: "0s" }
    );

    const response = await request(app)
      .get("/api/user")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(response.status).toBe(401);
    expect(response.body.message).toBe("Token expired. Please log in again.");
  });

  it("should handle server error", async () => {
    // Mock User.find to throw an error
    jest.spyOn(User, "find").mockImplementationOnce(() => {
      throw new Error("Database failure");
    });

    const response = await request(app)
      .get("/api/user")
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("message", "Server error");
    expect(response.body.error).toBe("Database failure");
  });
});

// Get User By Id Testing
describe("GET /api/user/:id", () => {
  afterEach(() => {
    jest.restoreAllMocks(); // Restore original implementations after each test
  });

  it("should return 404 if user not found", async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const response = await request(app)
      .get(`/api/user/${fakeId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(404);
    expect(response.body.message).toBe("User not found");
  });

  it("should return user data without password", async () => {
    const response = await request(app)
      .get(`/api/user/${userId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(200);
    expect(response.body).toHaveProperty("name", "John Doe");
    expect(response.body).toHaveProperty("email", "user@example.com");
    expect(response.body).not.toHaveProperty("password");
  });

  it("should handle server error", async () => {
    // Mock User.findById to throw an error
    jest.spyOn(User, "findById").mockImplementationOnce(() => {
      throw new Error("Unexpected DB error");
    });

    const response = await request(app)
      .get(`/api/user/${userId}`)
      .set("Authorization", `Bearer ${adminToken}`);

    expect(response.status).toBe(500);
    expect(response.body).toHaveProperty("message", "Server error");
    expect(response.body.error).toBe("Unexpected DB error");
  });
});

describe("Middleware", () => {
  it("should reject invalid token", async () => {
    const response = await request(app)
      .get("/api/user")
      .set("Authorization", "Bearer invalidtoken");

    expect(response.status).toBe(403);
    expect(response.body.message).toBe("Invalid token. Please log in again.");
  });
});
