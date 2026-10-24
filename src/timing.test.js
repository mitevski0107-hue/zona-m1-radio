"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  parseDefaultVolume,
  normalizeVolumeInput,
  reconnectDelayMs,
  countHumans,
} = require("./timing");

test("default volume falls back to 50", () => {
  assert.equal(parseDefaultVolume(undefined), 50);
  assert.equal(parseDefaultVolume(""), 50);
  assert.equal(parseDefaultVolume("loud"), 50);
  assert.equal(parseDefaultVolume("101"), 50);
  assert.equal(parseDefaultVolume("-1"), 50);
  assert.equal(parseDefaultVolume("0"), 0);
  assert.equal(parseDefaultVolume("100"), 100);
});

test("volume input accepts only integers 0 through 100", () => {
  assert.deepEqual(normalizeVolumeInput(null), { ok: false });
  assert.deepEqual(normalizeVolumeInput(undefined), { ok: false });
  assert.deepEqual(normalizeVolumeInput(101), { ok: false });
  assert.deepEqual(normalizeVolumeInput(-3), { ok: false });
  assert.deepEqual(normalizeVolumeInput(50.5), { ok: false });
  assert.deepEqual(normalizeVolumeInput(0), { ok: true, value: 0 });
  assert.deepEqual(normalizeVolumeInput(60), { ok: true, value: 60 });
});

test("reconnect delay backs off and caps at 30 seconds", () => {
  assert.equal(reconnectDelayMs(0), 2000);
  assert.equal(reconnectDelayMs(1), 4000);
  assert.equal(reconnectDelayMs(2), 8000);
  assert.equal(reconnectDelayMs(3), 16000);
  assert.equal(reconnectDelayMs(4), 30000);
  assert.equal(reconnectDelayMs(9), 30000);
});

test("only humans count toward an occupied voice channel", () => {
  const members = new Map([
    ["bot", { user: { bot: true } }],
    ["other-bot", { user: { bot: true } }],
  ]);
  assert.equal(countHumans(members), 0);
  members.set("ada", { user: { bot: false } });
  assert.equal(countHumans(members), 1);
  assert.equal(countHumans(null), 0);
});
