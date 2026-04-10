const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const jwt = require("jsonwebtoken");
const User = require("../models/User");

//protect middlware
exports.protect = asyncHandler(async (req, res, next) => {
  let token;

  const authHeader = req.headers.authorization;

  if (authHeader && authHeader.startsWith("Bearer")) {
    token = authHeader.split(" ")[1];
  }

  if (!token) {
    throw new AppError("Not authorized, no token", 401);
  }

  let decoded;

  try {
    decoded = jwt.verify(token, process.env.JWT_SECRET);
  } catch (err) {
    throw new AppError("Invalid or expired token", 401);
  }

  //find user with that id but make password undefined
  const user = await User.findById(decoded.id).select("-password");

  //If not found
  if (!user) {
    throw new AppError("User no longer exists", 401);
  }

  req.user = user;

  next();
});

//restrict Middleware
exports.restrictTo = (...roles) => {
  return (req, res, next) => {
    if (!roles.includes(req.user.role)) {
      return next(
        new AppError("You don't have permission to perform this action", 403),
      );
    }
    next();
  };
};
