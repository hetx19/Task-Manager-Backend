const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const app = require("../app");
const User = require("../model/User");

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {});
  process.env.JWT_SECRET = "testsecret";
  process.env.ADMIN_INVITE_TOKEN = "admin123";
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongoServer.stop();
});

afterEach(async () => {
  await User.deleteMany({});
});

describe("POST /api/auth/signup", () => {
  it("should create a new user with role user", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      name: "John Doe",
      email: "john@example.com",
      password: "password123",
      profileImageUrl: "http://example.com/image.jpg",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body).toHaveProperty("_id");
    expect(res.body.name).toBe("John Doe");
    expect(res.body.email).toBe("john@example.com");
    expect(res.body.role).toBe("user");
    expect(res.body).toHaveProperty("token");
  });

  it("should not assign role admin with incorrect adminInviteToken", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      name: "Fake Admin",
      email: "fakeadmin@example.com",
      password: "fakepass",
      profileImageUrl: "http://example.com/image.jpg",
      adminInviteToken: "wrongToken",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.role).toBe("user");
  });

  it("should assign role admin when correct adminInviteToken is provided", async () => {
    const res = await request(app).post("/api/auth/signup").send({
      name: "Admin User",
      email: "admin@example.com",
      password: "adminpass",
      profileImageUrl: "http://example.com/image.jpg",
      adminInviteToken: "admin123",
    });

    expect(res.statusCode).toBe(201);
    expect(res.body.role).toBe("admin");
  });

  it("should not allow duplicate emils", async () => {
    await User.create({
      name: "Existing User",
      email: "existing@example.com",
      password: "hashedpassword",
      profileImageUrl: "",
    });

    const res = await request(app).post("/api/auth/signup").send({
      name: "New User",
      email: "existing@example.com",
      password: "newpassword",
      profileImageUrl: "http://example.com/new.jpg",
    });

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("User already exists");
  });

  it("should return 500 on server error", async () => {
    const originalCreate = User.create;
    User.create = jest.fn(() => {
      throw new Error("Mock DB error");
    });

    const res = await request(app).post("/api/auth/signup").send({
      name: "Error User",
      email: "error@example.com",
      password: "errorpass",
      profileImageUrl: "http://example.com/error.jpg",
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");

    // Restore
    User.create = originalCreate;
  });
});

describe("POST /api/auth/signin", () => {
  beforeEach(async () => {
    const hashedPassword = await require("bcryptjs").hash("password123", 10);
    await User.create({
      name: "Test User",
      email: "test@example.com",
      password: hashedPassword,
      profileImageUrl: "http://example.com/image.jpg",
    });
  });

  it("should return 400 if email or password is missing", async () => {
    const res1 = await request(app).post("/api/auth/signin").send({
      email: "",
      password: "somepass",
    });
    const res2 = await request(app).post("/api/auth/signin").send({
      email: "test@example.com",
      password: "",
    });

    const res3 = await request(app).post("/api/auth/signin").send({
      email: "",
      password: "",
    });

    expect(res1.statusCode).toBe(400);
    expect(res1.body.message).toBe("Email and password are required");

    expect(res2.statusCode).toBe(400);
    expect(res2.body.message).toBe("Email and password are required");

    expect(res3.statusCode).toBe(400);
    expect(res3.body.message).toBe("Email and password are required");
  });

  it("should return 401 if user is not found", async () => {
    const res = await request(app).post("/api/auth/signin").send({
      email: "unknown@example.com",
      password: "password123",
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("should return 401 if password is in correct", async () => {
    const res = await request(app).post("/api/auth/signin").send({
      email: "test@example.com",
      password: "wrongpass",
    });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Invalid credentials");
  });

  it("should return 200 and user data on successful signin", async () => {
    const res = await request(app).post("/api/auth/signin").send({
      email: "test@example.com",
      password: "password123",
    });

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("_id");
    expect(res.body.name).toBe("Test User");
    expect(res.body).toHaveProperty("token");
    expect(res.body.email).toBe("test@example.com");
    expect(res.body.role).toBe("user");
    expect(res.body.profileImageUrl).toBe("http://example.com/image.jpg");
  });

  it("should return 500 on server error", async () => {
    const originalFindOne = User.findOne;
    User.findOne = jest.fn(() => {
      throw new Error("Mock error");
    });

    const res = await request(app).post("/api/auth/signin").send({
      email: "test@example.com",
      password: "password123",
    });

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");

    // Restore
    User.findOne = originalFindOne;
  });
});
