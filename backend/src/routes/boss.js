"use strict";

// boss.js — /api/boss : Weekend Boss status + summon.
//   GET  /api/boss         → { week, boss|null, canSummon, weakness?, xpReward }
//   POST /api/boss/summon  → generates this week's boss (AI, slow) and returns status

const express = require("express");
const settingsStore = require("../settingsStore");
const boss = require("../boss");
const { asyncHandler } = require("./_util");

const router = express.Router();

router.get("/", asyncHandler(async (req, res) => {
  res.json({ ok: true, ...(await boss.getStatus()) });
}));

router.post("/summon", asyncHandler(async (req, res) => {
  const aiSettings = await settingsStore.getAiSettings();
  const judgeSettings = await settingsStore.getSettings();
  const status = await boss.summon({ aiSettings, judgeSettings });
  res.json({ ok: true, ...status });
}));

module.exports = router;
