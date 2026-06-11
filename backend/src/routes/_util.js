"use strict";

const fileStore = require("../fileStore");
const problemStore = require("../problemStore");

// Wrap async route handlers so rejected promises hit Express error handling.
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

// Validates :id and attaches it; 404s for unknown/unsafe ids.
const requireProblem = asyncHandler(async (req, res, next) => {
  const id = req.params.id;
  if (!fileStore.isSafeId(id)) {
    return res.status(400).json({ error: "Invalid problem id." });
  }
  if (!(await problemStore.problemExists(id))) {
    return res.status(404).json({ error: "Problem not found." });
  }
  req.problemId = id;
  next();
});

module.exports = { asyncHandler, requireProblem };
