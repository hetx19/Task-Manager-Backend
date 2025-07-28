const express = require("express");
const cors = require("cors");
const path = require("path");

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const taskRoutes = require("./routes/taskRoutes");
const reportRoutes = require("./routes/reportRoutes");

const app = express();

// Middlewares
app.use(express.json());
app.use(
  cors({
    origin: process.env.CLIENT_URL || "*",
    methods: ["GET", "POST", "PUT", "DELETE"],
    allowedHeaders: ["Content-Type", "Authorization"],
  })
);

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/user", userRoutes);
app.use("/api/task", taskRoutes);
app.use("/api/report", reportRoutes);

app.get("/", (req, res) => {
  const filePath = path.join(__dirname, "index.html");

  res.sendFile(filePath, (error) => {
    if (error) {
      console.error("Error sending file:", error);

      // Avoid sending headers twice
      if (!res.headersSent) {
        res.status(error.statusCode || 500).send("Internal Server Error");
      }
    }
  });
});

module.exports = app;
