// Mock cloudinary
const mockCloudinary = {
  uploader: {
    upload: jest.fn(),
  },
  api: {
    delete_resources: jest.fn(),
  },
};

jest.mock("../config/cloudinary", () => mockCloudinary);

const request = require("supertest");
const { MongoMemoryServer } = require("mongodb-memory-server");
const mongoose = require("mongoose");
const app = require("../app");
const User = require("../model/User");
const jwt = require("jsonwebtoken");
const path = require("path");
const fs = require("fs");

process.env.JWT_SECRET = "testsecretkey";

let mongoServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri, {});
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

afterEach(async () => {
  await User.deleteMany();
  jest.clearAllMocks();
});

const createUserAndToken = async () => {
  const user = await User.create({
    name: "Test User",
    email: "test@example.com",
    password: "hashedPassword",
    profileImageUrl: "http://example.com/profile.jpg",
  });

  const token = jwt.sign({ id: user._id }, process.env.JWT_SECRET, {
    expiresIn: "2h",
  });

  return { user, token };
};

describe("POST /api/auth/upload-image", () => {
  let token;

  beforeEach(async () => {
    const { token: userToken } = await createUserAndToken();
    token = userToken;
  });

  it("should upload image successfully", async () => {
    const mockResult = {
      secure_url: "https://cloudinary.com/test-image.jpg",
    };

    mockCloudinary.uploader.upload.mockResolvedValue(mockResult);

    const testImagePath = path.join(__dirname, "fixtures", "test-image.jpg");

    const fixturesDir = path.join(__dirname, "fixtures");
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    if (!fs.existsSync(testImagePath)) {
      fs.writeFileSync(testImagePath, "fake image data");
    }

    const res = await request(app)
      .post("/api/auth/upload-image")
      .set("Authorization", `Bearer ${token}`)
      .attach("image", testImagePath);

    expect(res.statusCode).toBe(200);
    expect(res.body.imageUrl).toBe(mockResult.secure_url);
    expect(mockCloudinary.uploader.upload).toHaveBeenCalledWith(
      expect.any(String),
      { folder: "task-manager" }
    );
  });

  it("should return 400 if no file is uploaded", async () => {
    const res = await request(app)
      .post("/api/auth/upload-image")
      .set("Authorization", `Bearer ${token}`);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("No file uploaded");
  });

  it("should return 400 for invalid file type", async () => {
    const testFilePath = path.join(__dirname, "fixtures", "test-file.txt");

    const fixturesDir = path.join(__dirname, "fixtures");
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    fs.writeFileSync(testFilePath, "test content");

    const res = await request(app)
      .post("/api/auth/upload-image")
      .set("Authorization", `Bearer ${token}`)
      .attach("image", testFilePath);

    expect(res.statusCode).toBe(400);
    expect(res.body.message).toBe("No file uploaded");
  });

  it("should handle cloudinary upload error", async () => {
    mockCloudinary.uploader.upload.mockRejectedValue(
      new Error("Cloudinary upload failed")
    );

    const testImagePath = path.join(__dirname, "fixtures", "test-image.jpg");

    const fixturesDir = path.join(__dirname, "fixtures");
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true });
    }
    if (!fs.existsSync(testImagePath)) {
      fs.writeFileSync(testImagePath, "fake image data");
    }

    const res = await request(app)
      .post("/api/auth/upload-image")
      .set("Authorization", `Bearer ${token}`)
      .attach("image", testImagePath);

    expect(res.statusCode).toBe(500);
    expect(res.body.message).toBe("Server error");
  });
});

describe("POST /api/auth/update-image", () => {
  it("should return 400 if no file uploaded", async () => {
    const { uploadImage } = require("../controller/imageController");

    const req = { file: null };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ message: "No file uploaded" });
  });

  it("should upload image successfully", async () => {
    const { uploadImage } = require("../controller/imageController");

    const mockResult = {
      secure_url: "https://cloudinary.com/test-image.jpg",
    };

    mockCloudinary.uploader.upload.mockResolvedValue(mockResult);

    const req = { file: { path: "/tmp/test-image.jpg" } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ imageUrl: mockResult.secure_url });
    expect(mockCloudinary.uploader.upload).toHaveBeenCalledWith(
      "/tmp/test-image.jpg",
      { folder: "task-manager" }
    );
  });

  it("should handle server error during upload", async () => {
    const { uploadImage } = require("../controller/imageController");

    mockCloudinary.uploader.upload.mockRejectedValue(
      new Error("Upload failed")
    );

    const req = { file: { path: "/tmp/test-image.jpg" } };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await uploadImage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
      error: "Upload failed",
    });
  });
});

describe("PUT /api/auth/update-image", () => {
  let user;

  beforeEach(async () => {
    const userData = await createUserAndToken();
    user = userData.user;
    token = userData.token;
  });

  it("should return existing image URL if no file provided", async () => {
    const { updateProfileImage } = require("../controller/imageController");

    const req = {
      user: { _id: user._id },
      file: null,
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await updateProfileImage(req, res);

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      imageUrl: "http://example.com/profile.jpg",
    });
  });

  it("should handle error in cloudinary upload callback", async () => {
    const error = new Error("Upload callback failed");

    mockCloudinary.api.delete_resources.mockResolvedValue({});

    mockCloudinary.uploader.upload.mockImplementation(
      (filePath, options, callback) => {
        callback(error, null);
      }
    );

    const { updateProfileImage } = require("../controller/imageController");

    const req = {
      user: { _id: user._id },
      file: { path: "/tmp/failing-upload.jpg" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await updateProfileImage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
      error: "Upload callback failed",
    });
  });

  it("should update image successfully when file is provided", async () => {
    const mockResult = {
      secure_url: "https://cloudinary.com/new-image.jpg",
    };

    mockCloudinary.api.delete_resources.mockResolvedValue({});
    mockCloudinary.uploader.upload.mockImplementation(
      (filePath, options, callback) => {
        if (callback) {
          callback(null, mockResult);
        } else {
          return Promise.resolve(mockResult);
        }
      }
    );

    const { updateProfileImage } = require("../controller/imageController");

    const req = {
      user: { _id: user._id },
      file: { path: "/tmp/new-image.jpg" },
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await updateProfileImage(req, res);

    expect(mockCloudinary.api.delete_resources).toHaveBeenCalledWith(
      ["task-manager/profile"],
      {
        type: "upload",
        resource_type: "image",
      }
    );
    expect(mockCloudinary.uploader.upload).toHaveBeenCalledWith(
      "/tmp/new-image.jpg",
      { folder: "task-manager" },
      expect.any(Function)
    );
  });

  it("should handle user not found error", async () => {
    const fakeId = new mongoose.Types.ObjectId();

    const { updateProfileImage } = require("../controller/imageController");

    const req = {
      user: { _id: fakeId },
      file: null,
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await updateProfileImage(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({ message: "User not found" });
  });

  it("should handle server error during image update", async () => {
    jest.spyOn(User, "findById").mockImplementation(() => {
      throw new Error("Database error");
    });

    const { updateProfileImage } = require("../controller/imageController");

    const req = {
      user: { _id: user._id },
      file: null,
    };
    const res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    await updateProfileImage(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      message: "Server error",
      error: "Database error",
    });

    User.findById.mockRestore();
  });
});

describe("Upload middleware tests", () => {
  it("should allow valid image file types", () => {
    const upload = require("../middleware/upload");

    const req = {};
    const file = { mimetype: "image/jpeg" };
    const cb = jest.fn();

    const multerOptions = upload.options || upload;
    if (multerOptions.fileFilter) {
      multerOptions.fileFilter(req, file, cb);
      expect(cb).toHaveBeenCalledWith(null, true);
    }
  });
});
