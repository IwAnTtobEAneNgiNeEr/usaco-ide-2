"use strict";

function normalizeTopic(value) {
  return String(value || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function primaryTopic(meta = {}) {
  const explicit = String(meta.topic || "").trim();
  if (explicit) return explicit;
  const firstTag = Array.isArray(meta.tags) ? meta.tags.find((tag) => String(tag || "").trim()) : null;
  return firstTag ? String(firstTag).trim() : "";
}

function topicAliases(meta = {}) {
  return [...new Set([primaryTopic(meta), ...(Array.isArray(meta.tags) ? meta.tags : [])]
    .map(normalizeTopic)
    .filter(Boolean))];
}

function syncTopic(meta) {
  meta.primaryTopic = primaryTopic(meta);
  meta.normalizedTopic = normalizeTopic(meta.primaryTopic);
  return meta;
}

module.exports = { normalizeTopic, primaryTopic, topicAliases, syncTopic };
