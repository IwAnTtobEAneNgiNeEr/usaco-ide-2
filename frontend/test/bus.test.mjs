import test from "node:test";
import assert from "node:assert/strict";
import { createBus } from "../src/core/bus.js";

test("emit delivers the payload to subscribers", () => {
  const bus = createBus();
  let seen = null;
  bus.on("judge:done", (p) => { seen = p; });
  bus.emit("judge:done", { verdict: "AC" });
  assert.deepEqual(seen, { verdict: "AC" });
});

test("unsubscribe via the returned function stops delivery", () => {
  const bus = createBus();
  let count = 0;
  const off = bus.on("x", () => { count += 1; });
  bus.emit("x");
  off();
  bus.emit("x");
  assert.equal(count, 1);
});

test("a throwing subscriber does not block the others", () => {
  const bus = createBus();
  let reached = false;
  bus.on("x", () => { throw new Error("boom"); });
  bus.on("x", () => { reached = true; });
  bus.emit("x");
  assert.equal(reached, true);
});

test("emit with no subscribers is a no-op", () => {
  const bus = createBus();
  assert.doesNotThrow(() => bus.emit("nobody", { a: 1 }));
});
