const mongoose = require("mongoose");

const connectDb = async () => {
  try {
    await mongoose.connect(
      process.env.MONGO_URI || "mongodb://localhost:27017/Task_Manager",
      {},
    );
    console.log("MongoDB database connected successfully");
  } catch (error) {
    console.error("MongoDB connection error", error);
    process.exit(1);
  }
};

module.exports = connectDb;
