const express = require("express");
const AppError = require("./utils/AppError");
const cookieParser = require("cookie-parser");

//Routes -> import
const authRoutes = require("./routes/authRoutes");

//Instance
const app = express();

//Trust Proxy
app.set("trust proxy", true);

//Body Parser
app.use(express.json());
app.use(cookieParser());

//Routes (use here)
app.use("/api/auth", authRoutes);

//404 fallback
app.use((req, res, next) => {
  next(new AppError(`Can't find ${req.originalUrl}`, 404));
});

//Error middleware
app.use((err, req, res, next) => {
  //statuscode
  err.statusCode = err.statusCode || 500;
  //error
  err.status = err.status || "error";

  //development
  if (process.env.NODE_ENV == "development") {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
      stack: err.stack,
    });
  }

  // production -> operational
  if (err.isOperational) {
    return res.status(err.statusCode).json({
      status: err.status,
      message: err.message,
    });
  }

  //production -> unknown error
  return res.status(500).json({
    status: "error",
    message: "Something went wrong",
  });
});

module.exports = app;
