//Uncaught exception -> Basicaly sync errors that are not catched using try catch block
process.on("uncaughtException", (err) => {
  console.log("uncaughtException shutting down...");
  console.log(err.name, err.message);
  process.exit(1);
});

//Require dotenv
require("dotenv").config();
const app = require("./src/app");
const connectDB = require("./src/config/db");

//Port
const PORT = process.env.PORT || 5000;

//connect db
let server;
connectDB().then(() => {
  server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server is running on ${PORT}`);
  });
});

//unhandled rejection ->promise errors that are not catched
process.on("unhandledRejection", (err) => {
  console.log("unhandled rejection shutting down ...");
  console.log(err.name, err.message);
  if (server) {
    server.close(() => {
      process.exit(1);
    });
  } else process.exit(1);
});
