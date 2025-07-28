// Configure Enviroment Variables
require("dotenv").config();
const app = require("./app");
const connectDb = require("./config/db");

// Connecting to database
connectDb();

const Port = process.env.PORT || 5000;
app.listen(Port, () => {
  console.log(
    `Task manager server is successfully running at http://localhost:${Port}`
  );
});
