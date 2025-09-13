const uploadImage = async (req, res) => {
  try {
    return res.status(200).json({ message: "Hi From Upload Image" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const updateProfileImage = async (req, res) => {
  try {
    return res.status(200).json({ message: "Hi From Update Image" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

module.exports = { uploadImage, updateProfileImage };
