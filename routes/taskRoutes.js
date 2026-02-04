const express = require("express");
const { protect, adminOnly } = require("../middleware/auth");
const {
  getDashboardData,
  getUserDashboardData,
  getAllTasks,
  getTaskById,
  createNewTask,
  updateTask,
  updateTaskStatus,
  updateTaskCheckList,
  deleteTask,
} = require("../controller/taskController");

const router = express.Router();

router.get("/dashboard", protect, getDashboardData);
router.get("/user-dashboard", protect, getUserDashboardData);
router.get("/", protect, getAllTasks);
router.get("/:id", protect, getTaskById);
router.post("/", protect, adminOnly, createNewTask);
router.put("/:id", protect, updateTask);
router.put("/:id/status", protect, updateTaskStatus);
router.put("/:id/todo", protect, updateTaskCheckList);
router.delete("/:id", protect, adminOnly, deleteTask);

module.exports = router;
