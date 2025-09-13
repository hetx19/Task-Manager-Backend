const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const User = require("../model/User");
const Task = require("../model/Task");
const cloudinary = require("../config/cloudinary");

const generateToken = (userId) => {
  return jwt.sign({ _id: userId }, process.env.JWT_SECRET, { expiresIn: "7d" });
};

const signUpUser = async (req, res) => {
  try {
    const { name, email, password, profileImageUrl, adminInviteToken } =
      req.body;

    const checkUserExists = await User.findOne({ email });

    if (checkUserExists) {
      return res.status(400).json({ message: "User already exists" });
    }

    let role = "user";
    if (
      adminInviteToken &&
      adminInviteToken === process.env.ADMIN_INVITE_TOKEN
    ) {
      role = "admin";
    }

    const salt = await bcrypt.genSalt(10);
    const hassedPassword = await bcrypt.hash(password, salt);

    const user = await User.create({
      name,
      email,
      password: hassedPassword,
      profileImageUrl,
      role,
    });

    return res.status(201).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const signInUser = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ message: "Email and password are required" });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Comparing Password
    const isMatch = await bcrypt.compare(password, user.password);

    if (!isMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    return res.status(200).json({
      _id: user._id,
      name: user.name,
      email: user.email,
      profileImageUrl: user.profileImageUrl,
      role: user.role,
      token: generateToken(user._id),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    return res.status(200).json(user);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const updateUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    user.name = req.body.name || user.name;
    user.profileImageUrl = req.body.profileImageUrl || user.profileImageUrl;

    if (req.body.email && req.body.email !== user.email) {
      const checkUserExists = await User.findOne({ email: req.body.email });

      if (checkUserExists) {
        return res.status(400).json({ message: "User already exists" });
      } else {
        user.email = req.body.email;
      }
    }

    if (req.body.password) {
      const salt = await bcrypt.genSalt(10);
      user.password = await bcrypt.hash(req.body.password, salt);
    }

    if (
      req.body.adminInviteToken &&
      req.body.adminInviteToken === process.env.ADMIN_INVITE_TOKEN &&
      user.role === "user"
    ) {
      user.role = "admin";
    }

    const updatedUser = await user.save();

    return res.status(200).json({
      message: "User updated successfully",
      _id: updatedUser._id,
      name: updatedUser.name,
      email: updatedUser.email,
      profileImageUrl: updatedUser.profileImageUrl,
      role: updatedUser.role,
      token: generateToken(updatedUser._id),
    });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const deleteUserProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (user.role === "admin") {
      await Task.deleteMany({ createdBy: req.user._id });
    } else {
      await Task.updateMany(
        { assignedTo: user._id },
        { $pull: { assignedTo: user._id } }
      );
    }

    if (user.profileImageUrl) {
      const array = user.profileImageUrl.split("/");
      const image = array[array.length - 1];
      const imageName = image.split(".")[0];

      await cloudinary.api.delete_resources([`task-manager/${imageName}`], {
        type: "upload",
        resource_type: "image",
      });
    }

    await User.findByIdAndDelete(req.user._id);

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  signUpUser,
  signInUser,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
};
