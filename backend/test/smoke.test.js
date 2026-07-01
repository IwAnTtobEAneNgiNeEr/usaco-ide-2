"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");
const { buildApp } = require("../server");

test("application boots and serves health", async () => {
  const server = http.createServer(buildApp());
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/health`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
