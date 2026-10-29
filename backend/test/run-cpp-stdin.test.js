"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const childProcess = require("node:child_process");
const { EventEmitter } = require("node:events");
const { PassThrough, Writable } = require("node:stream");

// Model a process that closes its stdin while the parent is writing. This
// avoids depending on scheduler timing or invoking any compiler or program.
async function runWithStdinError(errorCode) {
  const originalSpawn = childProcess.spawn;
  childProcess.spawn = () => {
    const child = new EventEmitter();
    child.stdout = new PassThrough();
    child.stderr = new PassThrough();
    child.kill = () => true;
    const finish = callback => {
      setImmediate(() => {
        const error = errorCode ? Object.assign(new Error(`synthetic ${errorCode}`), { code: errorCode }) : null;
        callback(error);
        setImmediate(() => {
          child.stdout.end("synthetic output\n");
          child.stderr.end();
          child.emit("close", 0);
        });
      });
    };
    child.stdin = new Writable({ write(_chunk, _encoding, callback) { finish(callback); } });
    return child;
  };
  const modulePath = require.resolve("../src/runCpp");
  delete require.cache[modulePath];
  try {
    const runCpp = require(modulePath);
    return await runCpp.runBinary({ binaryPath: "/tmp/synthetic-program", input: "synthetic input", timeMs: 2000 });
  } finally {
    childProcess.spawn = originalSpawn;
    delete require.cache[modulePath];
  }
}

test("a child that closes stdin early does not crash the runner", async () => {
  const result = await runWithStdinError("EPIPE");
  assert.equal(result.status, "OK");
  assert.equal(result.stdout, "synthetic output\n");
});

test("other stdin errors return a runtime error instead of an uncaught event", async () => {
  const result = await runWithStdinError("EIO");
  assert.equal(result.status, "RE");
  assert.match(result.stderr, /synthetic EIO/);
});

test("a successful stdin write still returns the program output", async () => {
  const result = await runWithStdinError(null);
  assert.equal(result.status, "OK");
  assert.equal(result.stdout, "synthetic output\n");
});
