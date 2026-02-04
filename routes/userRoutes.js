const express = require("express");
const { protect, adminOnly } = require("../middleware/auth");
const { getUsers, getUserById } = require("../controller/userController");

const router = express.Router();

router.get("/", protect, adminOnly, getUsers);
router.get("/:id", protect, adminOnly, getUserById);

module.exports = router;
