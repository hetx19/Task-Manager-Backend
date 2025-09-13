const User = require("../model/User");
const cloudinary = require("../config/cloudinary");

const uploadImage = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No file uploaded" });
    }

    const result = await cloudinary.uploader.upload(req.file.path, {
      folder: "task-manager",
    });

    return res.status(200).json({ imageUrl: result.secure_url });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const updateProfileImage = async (req, res) => {
  try {
    const user = await User.findById(req.user._id).select("-password");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!req.file) {
      return res.status(200).json({ imageUrl: user.profileImageUrl });
    }

    const array = user.profileImageUrl.split("/");
    const image = array[array.length - 1];
    const imageName = image.split(".")[0];

    await cloudinary.api.delete_resources([`task-manager/${imageName}`], {
      type: "upload",
      resource_type: "image",
    });

    await cloudinary.uploader.upload(
      req.file.path,
      {
        folder: "task-manager",
      },
      (err, result) => {
        if (err) {
          return res
            .status(500)
            .json({ message: "Server error", error: err.message });
        } else {
          return res.status(200).json({ imageUrl: result.secure_url });
        }
      }
    );
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

module.exports = { uploadImage, updateProfileImage };
