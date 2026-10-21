"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const proxyaddr = require("proxy-addr");

const peer = "203.0.113.7";
const spoofed = "198.51.100.9";

function request(app, address = peer) {
  return Object.assign(Object.create(express.request), {
    app, socket: { remoteAddress: address },
    headers: { "x-forwarded-for": spoofed }
  });
}

test("proxy-addr tests use the installed version recorded in the backend lockfile", () => {
  const lock = require("../package-lock.json");
  assert.equal(require("proxy-addr/package.json").version, lock.packages["node_modules/proxy-addr"].version);
});

for (const subnet of ["::ffff:10.0.0.0/8", "::/1"]) {
  test(`IPv6 trust subnet ${subnet} does not accidentally trust an IPv4 client`, () => {
    const trust = proxyaddr.compile(subnet);
    assert.equal(trust(peer), false);
    assert.equal(proxyaddr(request(express()), trust), peer);
  });
}

test("plain IPv4 and correctly prefixed mapped IPv6 trust keep equivalent boundaries", () => {
  for (const subnet of ["10.0.0.0/8", "::ffff:10.0.0.0/104"]) {
    const trust = proxyaddr.compile(subnet);
    assert.equal(trust("10.1.2.3"), true);
    assert.equal(trust(peer), false);
  }
});

test("Express default trust-proxy policy ignores a forged forwarded address", () => {
  const app = express();
  assert.equal(app.get("trust proxy"), false);
  assert.equal(request(app).ip, peer);
});

test("Express continues to resolve a client behind an explicitly trusted IPv4 proxy", () => {
  const app = express();
  app.set("trust proxy", "10.0.0.0/8");
  assert.equal(request(app, "10.1.2.3").ip, spoofed);
  assert.equal(request(app).ip, peer);
});
