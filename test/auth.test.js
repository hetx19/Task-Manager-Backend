const request = require("supertest");
const mongoose = require("mongoose");
const { MongoMemoryServer } = require("mongodb-memory-server");
const bcrypt = require("bcryptjs");
const app = require("../app");
const User = require("../model/User");
const Task = require("../model/Task");
const jwt = require("jsonwebtoken");

// Mock Cloudinary delete_resources in tests
jest.mock("../config/cloudinary", () => ({
  api: {
    delete_resources: jest.fn().mockResolvedValue({}),
  },
}));

let mongoServer;

const generateToken = (userId) => {
  return jwt.sign({ _id: userId }, process.env.JWT_SECRET, { expiresIn: "1h" });
};

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
  await User.deleteMany();
});

// SignUp Testing
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

// Signin Test
describe("POST /api/auth/signin", () => {
  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash("password123", 10);
    await User.create({
      name: "Test User",
      email: "test@example.com",
      password: hashedPassword,
      profileImageUrl: "http://example.com/image.jpg",
    });
  });

  it("should return 400 if email or password is missing", async () => {
    const cases = [
      { email: "", password: "pass" },
      { email: "test@example.com", password: "" },
      { email: "", password: "" },
    ];

    for (const body of cases) {
      const res = await request(app).post("/api/auth/signin").send(body);

      expect(res.statusCode).toBe(400);
      expect(res.body.message).toBe("Email and password are required");
    }
  });

  it("should return 401 if user is not found", async () => {
    const res = await request(app).post("/api/auth/signin").send({
      email: "notfound@example.com",
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

// Get User Profile Test
describe("GET /api/auth/profile", () => {
  let user, token;

  beforeEach(async () => {
    user = await User.create({
      name: "Profile User",
      email: "profile@example.com",
      password: "hashedpass",
      profileImageUrl: "http://example.com/image.jpg",
      role: "user",
    });

    token = generateToken(user._id);
  });

  it("should return 200 and user profile with valid token", async () => {
    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body).toHaveProperty("_id", user._id.toString());
    expect(res.body).toHaveProperty("name", user.name);
    expect(res.body).toHaveProperty("email", user.email);
    expect(res.body).not.toHaveProperty("password");
  });

  it("should return 401 if token is missing", async () => {
    const res = await request(app).get("/api/auth/profile");

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe(
      "Not authorized, token missing or token is invalid"
    );
  });

  it("should return 403 if token is invalid", async () => {
    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", "Bearer invalidtoken");

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Invalid token. Please log in again.");
  });

  it("should return 401 if token is expired", async () => {
    const expiredToken = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1ms",
    });

    // waiting so that token get expires
    await new Promise((r) => setTimeout(r, 10));

    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Token expired. Please log in again.");
  });

  it("should return 404 if user is not found", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const fakeToken = generateToken(fakeId);

    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${fakeToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("User not found");
  });

  it("should return 401 with 'Not authorized' for unexpected JWT error", async () => {
    const originalVerify = jwt.verify;
    jwt.verify = jest.fn(() => {
      const error = new Error("Something went wrong");
      error.name = "CustomError";
      throw error;
    });

    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Not authorized");

    // Restore
    jwt.verify = originalVerify;
  });

  it("should return 500 on server error", async () => {
    const spy = jest.spyOn(User, "findById").mockImplementation(() => {
      throw new Error("Database failure");
    });

    const res = await request(app)
      .get("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("Database failure");

    // Clear mock
    spy.mockRestore();
  });
});

// Update User Profile Test
describe("PUT /api/auth/profile", () => {
  let user, token;

  beforeEach(async () => {
    user = await User.create({
      name: "Old Name",
      email: "update@example.com",
      password: "hashedpass",
      profileImageUrl: "http://example.com/oldimage.jpg",
      role: "user",
    });
    token = generateToken(user._id);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should return 200 and update the name when only name is provided", async () => {
    const updatedUserProfile = { name: "New Name" };

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(updatedUserProfile);

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe(updatedUserProfile.name);
    expect(res.body.email).toBe(user.email);
    expect(res.body.role).toBe(user.role);
    expect(res.body.profileImageUrl).toBe(user.profileImageUrl);
    expect(res.body).toHaveProperty("token");
  });

  it("should return 200 and update the profileImageUrl when only profileImageUrl is provided", async () => {
    const updatedUserProfile = {
      profileImageUrl: "http://example.com/newimage.jpg",
    };

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(updatedUserProfile);

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe(user.name);
    expect(res.body.email).toBe(user.email);
    expect(res.body.role).toBe(user.role);
    expect(res.body.profileImageUrl).toBe(updatedUserProfile.profileImageUrl);
    expect(res.body).toHaveProperty("token");
  });

  it("should return 200 and update both name and profileImageUrl when both are provided", async () => {
    const updatedUserProfile = {
      name: "Updated Name",
      profileImageUrl: "http://example.com/updatedimage.jpg",
    };

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(updatedUserProfile);

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe(updatedUserProfile.name);
    expect(res.body.email).toBe(user.email);
    expect(res.body.role).toBe(user.role);
    expect(res.body.profileImageUrl).toBe(updatedUserProfile.profileImageUrl);
    expect(res.body).toHaveProperty("token");
  });

  it("should return 200 and only update the password when only password is provided", async () => {
    const updatedUserProfile = { password: "newpassword123" };

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(updatedUserProfile);

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe(user.name);
    expect(res.body.email).toBe(user.email);
    expect(res.body.profileImageUrl).toBe(user.profileImageUrl);
    expect(res.body.role).toBe(user.role);
    expect(res.body.password).not.toBe(user.password);
    expect(res.body).toHaveProperty("token");
  });

  it("should return 404 if user not found", async () => {
    const fakeId = new mongoose.Types.ObjectId();

    // Mock JWT verification
    const token = generateToken(fakeId);

    // Mock User.findById to return null
    jest.spyOn(User, "findById").mockResolvedValue(null);

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name" });

    expect(res.status).toBe(404);
    expect(res.body.message).toBe("User not found");
  });

  it("should return 400 if email is already taken by another user", async () => {
    await User.create({
      name: "Existing User",
      email: "existing@example.com",
      password: "hashedpass",
      profileImageUrl: "http://example.com/oldimage.jpg",
      role: "user",
    });

    const updatedUserProfile = { email: "existing@example.com" };

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(updatedUserProfile);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("User already exists");
  });

  it("should return 200 and update the email if provided and not already taken", async () => {
    const updatedUserProfile = { email: "newemail@example.com" };

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(updatedUserProfile);

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe(user.name);
    expect(res.body.email).toBe(updatedUserProfile.email);
    expect(res.body.profileImageUrl).toBe(user.profileImageUrl);
    expect(res.body.role).toBe(user.role);
    expect(res.body).toHaveProperty("token");
  });

  it("should return 200 and update role to admin with valid adminInviteToken", async () => {
    const updatedProfile = { adminInviteToken: "admin123" };

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send(updatedProfile);

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe(user.name);
    expect(res.body.email).toBe(user.email);
    expect(res.body.profileImageUrl).toBe(user.profileImageUrl);
    expect(res.body.role).toBe("admin");
    expect(res.body).toHaveProperty("token");
  });

  it("should return 200 when no fields are provided (nothing to update)", async () => {
    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({});

    expect(res.statusCode).toBe(200);
    expect(res.body.name).toBe(user.name);
    expect(res.body.email).toBe(user.email);
    expect(res.body.profileImageUrl).toBe(user.profileImageUrl);
    expect(res.body.role).toBe(user.role);
    expect(res.body).toHaveProperty("token");
  });

  // Token Error
  it("should return 401 if token is missing", async () => {
    const res = await request(app)
      .put("/api/auth/profile")
      .send({ name: "New Name" });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe(
      "Not authorized, token missing or token is invalid"
    );
  });

  it("should return 403 if token is invalid", async () => {
    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", "Bearer invalidtoken")
      .send({ name: "New Name" });

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Invalid token. Please log in again.");
  });

  it("should return 401 if token is expired", async () => {
    const expiredToken = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1ms",
    });

    // waiting so that token gets expired
    await new Promise((r) => setTimeout(r, 10));

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${expiredToken}`)
      .send({ name: "New Name" });

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Token expired. Please log in again.");
  });

  it("should return 401 if unknown JWT error occurs", async () => {
    // Simulate an unknown JWT error
    jest.spyOn(jwt, "verify").mockImplementation(() => {
      const error = new Error("Something went wrong");
      error.name = "SomeOtherError";
      throw error;
    });

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", "Bearer fake.token.here")
      .send({ name: "Test User" });

    expect(res.status).toBe(401);
    expect(res.body.message).toBe("Not authorized");
  });

  it("should return 500 if there's a server error during update", async () => {
    const originalSave = User.prototype.save;
    User.prototype.save = jest.fn(() => {
      throw new Error("Mock error during save");
    });

    const res = await request(app)
      .put("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`)
      .send({ name: "New Name" });

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");

    // Restore the original method
    User.prototype.save = originalSave;
  });
});

// Delete User Profile Test
describe("DELETE /api/auth/profile", () => {
  let token, user;

  beforeEach(async () => {
    const hashedPassword = await bcrypt.hash("testPassword", 10);
    user = await User.create({
      name: "Test User",
      email: "testuser@example.com",
      password: hashedPassword,
      profileImageUrl: "http://example.com/profile.jpg",
      role: "user",
    });
    token = generateToken(user._id);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it("should delete user successfully with valid token", async () => {
    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("User deleted successfully");

    // Verify user is actually deleted from database
    const deletedUser = await User.findById(user._id);
    expect(deletedUser).toBeNull();
  });

  it("should return 401 if no token provided", async () => {
    const res = await request(app).delete("/api/auth/profile");

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe(
      "Not authorized, token missing or token is invalid"
    );
  });

  it("should return 401 for invalid token", async () => {
    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", "Bearer invalidtoken");

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Invalid token. Please log in again.");
  });

  it("should return 404 if user not found", async () => {
    const fakeId = new mongoose.Types.ObjectId();
    const fakeToken = generateToken(fakeId);

    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", `Bearer ${fakeToken}`);

    expect(res.statusCode).toBe(404);
    expect(res.body.message).toBe("User not found");
  });

  it("should return 500 if an error occurs during deletion", async () => {
    // Simulating an error in User.findById method
    jest.spyOn(User, "findById").mockImplementation(() => {
      throw new Error("Simulated error during findById");
    });

    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("Simulated error during findById");

    User.findById.mockRestore();
  });

  it("should handle cloudinary deletion error gracefully", async () => {
    const mockCloudinaryError = new Error("Cloudinary deletion failed");

    // Mock the Cloudinary API method to simulate failure
    require("../config/cloudinary").api.delete_resources.mockRejectedValueOnce(
      mockCloudinaryError
    );

    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("Cloudinary deletion failed");

    // Restore mocks after the test
    require("../config/cloudinary").api.delete_resources.mockRestore();
  });

  it("should delete all tasks created by admin users", async () => {
    // Make user an admin and create tasks
    user.role = "admin";
    await user.save();

    const task = await Task.create({
      title: "Admin Task",
      createdBy: user._id,
      dueDate: new Date(),
    });

    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("User deleted successfully");

    // Verify that tasks created by the admin are deleted
    const deletedTask = await Task.findById(task._id);
    expect(deletedTask).toBeNull();
  });

  it("should remove user assignments when user is deleted", async () => {
    const assignedTask = await Task.create({
      title: "Assigned Task",
      assignedTo: user._id,
      dueDate: new Date(),
    });

    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(200);
    expect(res.body.message).toBe("User deleted successfully");

    // Verify that the task no longer has the user assigned to it
    const updatedTask = await Task.findById(assignedTask._id);
    expect(updatedTask.assignedTo).not.toContain(user._id);
  });

  it("should return 401 if token is expired", async () => {
    const expiredToken = jwt.sign({ _id: user._id }, process.env.JWT_SECRET, {
      expiresIn: "1ms",
    });

    // Wait for the token to expire
    await new Promise((resolve) => setTimeout(resolve, 10));

    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", `Bearer ${expiredToken}`);

    expect(res.statusCode).toBe(401);
    expect(res.body.message).toBe("Token expired. Please log in again.");
  });

  it("should return 403 if token is invalid", async () => {
    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", "Bearer invalidtoken");

    expect(res.statusCode).toBe(403);
    expect(res.body.message).toBe("Invalid token. Please log in again.");
  });

  it("should return 500 if a server error occurs during user deletion", async () => {
    const originalDelete = User.findByIdAndDelete;
    User.findByIdAndDelete = jest.fn(() => {
      throw new Error("Simulated deletion error");
    });

    const res = await request(app)
      .delete("/api/auth/profile")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");
    expect(res.body.error).toBe("Simulated deletion error");

    // Restore the original method
    User.findByIdAndDelete = originalDelete;
  });
});
