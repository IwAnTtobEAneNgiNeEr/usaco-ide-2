"use strict";

const express = require("express");
const settingsStore = require("../settingsStore");
const runCpp = require("../runCpp");
const { asyncHandler } = require("./_util");

const router = express.Router();

// GET /api/settings
router.get("/", asyncHandler(async (req, res) => {
  res.json({ settings: await settingsStore.getSettings() });
}));

// PUT /api/settings
router.put("/", asyncHandler(async (req, res) => {
  res.json({ settings: await settingsStore.saveSettings(req.body || {}) });
}));

// GET /api/settings/template — the C++ starter for new problems.
// `custom` says whether data/template.cpp overrides the built-in one.
router.get("/template", asyncHandler(async (req, res) => {
  res.json(await settingsStore.readTemplateState());
}));

// PUT /api/settings/template — blank template resets to the built-in starter.
router.put("/template", asyncHandler(async (req, res) => {
  const template = req.body && typeof req.body.template === "string" ? req.body.template : "";
  res.json(await settingsStore.saveCodeTemplate(template));
}));

// GET /api/settings/compiler — probe whether the configured compiler exists
router.get("/compiler", asyncHandler(async (req, res) => {
  const settings = await settingsStore.getSettings();
  res.json({ compiler: await runCpp.checkCompiler(settings) });
}));

// GET /api/settings/ai — returns AI config WITHOUT the key (only hasKey flag)
router.get("/ai", asyncHandler(async (req, res) => {
  const ai = await settingsStore.getAiSettings();
  res.json({ ai: settingsStore.redactAi(ai) });
}));

// PUT /api/settings/ai
router.put("/ai", asyncHandler(async (req, res) => {
  const ai = await settingsStore.saveAiSettings(req.body || {});
  res.json({ ai: settingsStore.redactAi(ai) });
}));

module.exports = router;
