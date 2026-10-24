"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeIdleInput } = require("./timing");
const { statsUrl, titleFromStats, listenersFromStats } = require("./station");
const { createStore } = require("./store");
const { formatStatus } = require("./status");

test("idle input accepts only integers 1 through 60", () => {
  assert.deepEqual(normalizeIdleInput(null), { ok: false });
  assert.deepEqual(normalizeIdleInput(0), { ok: false });
  assert.deepEqual(normalizeIdleInput(61), { ok: false });
  assert.deepEqual(normalizeIdleInput(5.5), { ok: false });
  assert.deepEqual(normalizeIdleInput(1), { ok: true, value: 1 });
  assert.deepEqual(normalizeIdleInput(60), { ok: true, value: 60 });
});

test("song titles come from the station stats page", () => {
  assert.equal(statsUrl("https://zonam1.ddns.net:8400/;"), "https://zonam1.ddns.net:8400/stats?json=1");
  assert.equal(titleFromStats('{"songtitle":"  Artist - Song  "}'), "Artist - Song");
  assert.equal(titleFromStats('{"songtitle":"","streams":[{"songtitle":"From the list"}]}'), "From the list");
  assert.equal(titleFromStats('{"songtitle":"   "}'), null);
  assert.equal(listenersFromStats('{"currentlisteners":31}'), 31);
  assert.equal(listenersFromStats('{"songtitle":""}'), null);
});

test("saved volume and idle time survive a new process", () => {
  const file = path.join(os.tmpdir(), `zona-settings-${process.pid}.json`);
  const first = createStore(file);
  first.load();
  assert.equal(first.getVolume("guild", 50), 50);
  assert.equal(first.getIdleMinutes("guild", 5), 5);
  first.setVolume("guild", 70);
  first.setIdleMinutes("guild", 12);
  first.setLocked("guild", true);
  first.setStay("guild", true);
  first.setRejoin("guild", true);
  first.setChannelId("guild", "voice-1");

  const second = createStore(file);
  second.load();
  assert.equal(second.getVolume("guild", 50), 70);
  assert.equal(second.getIdleMinutes("guild", 5), 12);
  assert.equal(second.getLocked("guild"), true);
  assert.equal(second.getStay("guild"), true);
  assert.deepEqual(second.rejoinTargets(), [{ guildId: "guild", channelId: "voice-1" }]);
  second.setRejoin("guild", false);
  assert.deepEqual(second.rejoinTargets(), []);
  assert.equal(second.getVolume("other", 50), 50);

  fs.writeFileSync(file, "{not json");
  const broken = createStore(file);
  broken.load();
  assert.equal(broken.getVolume("guild", 50), 50);
  fs.rmSync(file, { force: true });
});

test("status text covers idle, playing, and disconnected", () => {
  assert.equal(
    formatStatus({
      channelName: "#Studio",
      volume: 60,
      idleMinutes: 10,
      idleRemainingMs: null,
      playing: true,
      reconnecting: false,
      active: true,
      title: "Artist - Song",
    }),
    "Streaming in #Studio. Volume is 60. Now playing: Artist - Song. Leaves after 10 minutes of an empty channel.",
  );
  assert.match(
    formatStatus({
      channelName: "#Studio",
      volume: 60,
      idleMinutes: 10,
      idleRemainingMs: 90_000,
      playing: true,
      reconnecting: false,
      active: true,
      title: null,
      stay: true,
      listeners: 31,
    }),
    /Zona M1 has 31 listeners.*Stays in an empty channel/,
  );
  assert.match(
    formatStatus({
      channelName: "#Studio",
      volume: 60,
      idleMinutes: 10,
      idleRemainingMs: 90_000,
      playing: false,
      reconnecting: true,
      active: true,
      title: null,
    }),
    /audio dropped.*No song title yet.*leaving in 2 minutes/,
  );
  assert.match(
    formatStatus({
      channelName: "#Studio",
      volume: 50,
      idleMinutes: 5,
      idleRemainingMs: null,
      playing: false,
      reconnecting: false,
      active: false,
      title: null,
    }),
    /^Not in a voice channel\./,
  );
});
