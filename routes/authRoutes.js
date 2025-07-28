const express = require("express");
// const upload = require("../middleware/upload");
const { protect } = require("../middleware/auth");
const {
  signUpUser,
  signInUser,
  getUserProfile,
  updateUserProfile,
  deleteUserProfile,
} = require("../controller/authController");
const {
  uploadImage,
  updateProfileImage,
} = require("../controller/imageController");

const router = express.Router();

router.post("/signup", signUpUser);
router.post("/signin", signInUser);
router.get("/profile", protect, getUserProfile);
router.put("/profile", protect, updateUserProfile);
router.delete("/profile", protect, deleteUserProfile);
// router.post("/upload-image", protect, upload.single("image"), uploadImage);
// router.put(
//   "/update-image",
//   protect,
//   upload.single("image"),
//   updateProfileImage
// );

module.exports = router;
