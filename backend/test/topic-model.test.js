"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const topic = require("../src/topicModel");

test("topic model has one primary topic and normalized aliases", () => {
  const meta = topic.syncTopic({ topic: "Đồ thị", tags: ["Graphs", "DFS"] });
  assert.equal(meta.primaryTopic, "Đồ thị");
  assert.equal(meta.normalizedTopic, "dothi");
  assert.deepEqual(topic.topicAliases(meta), ["dothi", "graphs", "dfs"]);
});

test("first tag is the backward-compatible primary topic fallback", () => {
  const meta = topic.syncTopic({ topic: "", tags: ["Binary Search", "Greedy"] });
  assert.equal(meta.primaryTopic, "Binary Search");
  assert.equal(meta.normalizedTopic, "binarysearch");
});
