const asyncHandler = require("../utils/asyncHandler");
const AppError = require("../utils/AppError");
const User = require("../models/User");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const crypto = require("crypto");
const { OAuth2Client } = require("google-auth-library");

const {
  generateAccessToken,
  generateRefreshToken,
} = require("../utils/generateToken");

const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

/*
SIGNUP CONTROLLER
  • Creates a new user
  • Password hashing handled via schema pre-save hook
*/
exports.signUp = asyncHandler(async (req, res) => {
  const { name, email, password } = req.body;

  if (!name || !email || !password) {
    throw new AppError("Name, email and password are required", 400);
  }

  const existingUser = await User.findOne({ email });
  if (existingUser) {
    throw new AppError("User already exists", 409);
  }

  const newUser = await User.create({ name, email, password });

  newUser.password = undefined;

  return res.status(201).json({
    status: "success",
    data: newUser,
  });
});

/*
LOGIN CONTROLLER
  • Verifies credentials
  • Generates access + refresh tokens
  • Stores refresh token in DB and cookie
*/
exports.login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    throw new AppError("Email and password are required", 400);
  }

  const user = await User.findOne({ email }).select("+password");

  if (!user) {
    throw new AppError("Invalid credentials", 401); // don't reveal "user not found"
  }

  // Block login if user is Google-only (no password set)
  if (!user.password) {
    throw new AppError("Please login using Google", 400);
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) {
    throw new AppError("Invalid credentials", 401);
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    status: "success",
    accessToken,
  });
});

/*
GET CURRENT USER
  • Requires protect middleware
*/
exports.getMe = asyncHandler(async (req, res) => {
  return res.status(200).json({
    status: "success",
    data: req.user,
  });
});

/*
REFRESH ACCESS TOKEN
  • Uses refresh token from cookies
  • Verifies and issues new access token
*/
exports.refreshAccessToken = asyncHandler(async (req, res) => {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) {
    throw new AppError("Refresh token required", 401);
  }

  let decoded;

  try {
    decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
  } catch (err) {
    throw new AppError("Invalid or expired refresh token", 401);
  }

  const user = await User.findById(decoded.id);

  if (!user || user.refreshToken !== refreshToken) {
    throw new AppError("Invalid refresh token", 401);
  }

  const newAccessToken = generateAccessToken(user._id);

  return res.status(200).json({
    status: "success",
    accessToken: newAccessToken,
  });
});

/*
GOOGLE AUTH CONTROLLER
  • Handles login/signup via Google
  • Links account if user already exists with same email
*/
exports.googleAuthController = asyncHandler(async (req, res) => {
  const { idToken } = req.body;

  if (!idToken) {
    throw new AppError("Google ID token is required", 400);
  }

  // Verify the token with Google — don't trust client-sent email/googleId directly
  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    throw new AppError("Invalid Google token", 401);
  }

  const { email, name, sub: googleId } = payload;

  let user = await User.findOne({ email });

  if (!user) {
    user = await User.create({ name, email, googleId });
  } else {
    if (!user.googleId) {
      user.googleId = googleId;
      await user.save({ validateBeforeSave: false });
    }
  }

  const accessToken = generateAccessToken(user._id);
  const refreshToken = generateRefreshToken(user._id);

  user.refreshToken = refreshToken;
  await user.save({ validateBeforeSave: false });

  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });

  return res.status(200).json({
    status: "success",
    accessToken,
  });
});

/*
LOGOUT CONTROLLER
  • Clears refresh token from DB and cookie
*/
exports.logout = asyncHandler(async (req, res) => {
  const user = req.user;

  user.refreshToken = null;
  await user.save({ validateBeforeSave: false });

  res.clearCookie("refreshToken");

  return res.status(200).json({
    status: "success",
    message: "Logged out successfully",
  });
});

/*
SET PASSWORD (FOR GOOGLE USERS)
  • Allows Google-authenticated users to add a password to their account
*/
exports.setPassword = asyncHandler(async (req, res) => {
  const { password } = req.body;

  if (!password) {
    throw new AppError("Password is required", 400);
  }

  const user = await User.findById(req.user._id).select("+password");

  if (user.password) {
    throw new AppError("Password already set", 400);
  }

  user.password = password;
  await user.save(); // triggers pre-save hash hook

  return res.status(200).json({
    status: "success",
    message: "Password set successfully",
  });
});

/*
DELETE USER (ADMIN ONLY)
*/
exports.deleteUser = asyncHandler(async (req, res) => {
  const { id } = req.params;

  if (req.user._id.toString() === id) {
    throw new AppError("You cannot delete yourself", 400);
  }

  const user = await User.findById(id);

  if (!user) {
    throw new AppError("User not found", 404);
  }

  await User.findByIdAndDelete(id);

  return res.status(200).json({
    status: "success",
    message: "User deleted successfully",
  });
});

/*
FORGOT PASSWORD
  • Generates a reset token and stores hashed version in DB
  • NOTE: In production, send resetURL via email — never expose it in the response
*/
exports.forgotPassword = asyncHandler(async (req, res) => {
  const { email } = req.body;

  if (!email) {
    throw new AppError("Email is required", 400);
  }

  const user = await User.findOne({ email });
  if (!user) {
    throw new AppError("User not found", 404);
  }

  const resetToken = user.createPasswordResetToken();
  await user.save({ validateBeforeSave: false });

  const resetURL = `${process.env.CLIENT_URL || "http://localhost:3000"}/reset-password/${resetToken}`;

  // TODO: Send resetURL via email (e.g. using Nodemailer/Resend)
  // For dev only — remove before production
  return res.status(200).json({
    status: "success",
    message: "Reset token generated. Send this via email in production.",
    resetURL,
  });
});

/*
RESET PASSWORD
  • Verifies token
  • Updates password and clears reset fields
*/
exports.resetPassword = asyncHandler(async (req, res) => {
  const { token } = req.params;
  const { password } = req.body;

  if (!password) {
    throw new AppError("New password is required", 400);
  }

  const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

  const user = await User.findOne({
    passwordResetToken: hashedToken,
    passwordResetExpires: { $gt: Date.now() },
  });

  if (!user) {
    throw new AppError("Token is invalid or expired", 400);
  }

  user.password = password;
  user.passwordResetToken = undefined;
  user.passwordResetExpires = undefined;

  await user.save(); // triggers pre-save hash hook

  return res.status(200).json({
    status: "success",
    message: "Password reset successfully",
  });
});
