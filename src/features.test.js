"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { normalizeIdleInput } = require("./timing");
const { createStore } = require("./store");
const { commandJson } = require("./commands");
const { STRINGS, describeSettings, t } = require("./i18n");

test("idle input accepts only integers 1 through 60", () => {
  assert.deepEqual(normalizeIdleInput(null), { ok: false });
  assert.deepEqual(normalizeIdleInput(0), { ok: false });
  assert.deepEqual(normalizeIdleInput(61), { ok: false });
  assert.deepEqual(normalizeIdleInput(5.5), { ok: false });
  assert.deepEqual(normalizeIdleInput(1), { ok: true, value: 1 });
  assert.deepEqual(normalizeIdleInput(60), { ok: true, value: 60 });
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
  assert.equal(first.getLanguage("guild"), "mk");
  first.setLanguage("guild", "en");
  first.setControlRole("guild", "role-1");

  const second = createStore(file);
  second.load();
  assert.equal(second.getVolume("guild", 50), 70);
  assert.equal(second.getIdleMinutes("guild", 5), 12);
  assert.equal(second.getLocked("guild"), true);
  assert.equal(second.getStay("guild"), true);
  assert.equal(second.getLanguage("guild"), "en");
  assert.equal(second.getControlRole("guild"), "role-1");
  assert.deepEqual(second.rejoinTargets(), [{ guildId: "guild", channelId: "voice-1" }]);
  second.setRejoin("guild", false);
  assert.deepEqual(second.rejoinTargets(), []);
  assert.equal(second.getLanguage("guild"), "en");
  second.setControlRole("guild", null);
  assert.equal(second.getControlRole("guild"), null);
  second.setLanguage("guild", "nope");
  assert.equal(second.getLanguage("guild"), "mk");
  assert.equal(second.getVolume("other", 50), 50);

  fs.writeFileSync(file, "{not json");
  const broken = createStore(file);
  broken.load();
  assert.equal(broken.getVolume("guild", 50), 50);
  fs.rmSync(file, { force: true });
});

test("replies default to Macedonian and cover the same keys in English", () => {
  assert.deepEqual(Object.keys(STRINGS.mk).sort(), Object.keys(STRINGS.en).sort());
  const mk = describeSettings("mk", {
    idle: 5,
    locked: false,
    stay: true,
    rejoin: false,
    roleId: null,
  });
  assert.match(mk, /Празен канал: 5 минути/);
  assert.match(mk, /Остани: вклучено/);
  assert.match(mk, /Јазик: македонски/);
  assert.match(mk, /Улога: нема/);
  const en = describeSettings("en", {
    idle: 1,
    locked: true,
    stay: false,
    rejoin: true,
    roleId: "9",
  });
  assert.match(en, /Empty channel: 1 minute/);
  assert.match(en, /Lock: on/);
  assert.match(en, /Language: English/);
  assert.match(en, /<@&9>/);
  assert.equal(t("mk", "joined"), "Се приклучив и пуштив Zona M1 Radio.");
  assert.equal(t("mk", "retired").includes("/zona"), true);
});

test("slash commands are zona, volume, leave, and settings", () => {
  const commands = commandJson();
  assert.deepEqual(
    commands.map((command) => command.name).sort(),
    ["leave", "settings", "volume", "zona"],
  );
  const settings = commands.find((command) => command.name === "settings");
  assert.deepEqual(
    settings.options.map((option) => option.name),
    ["language", "idle", "stay", "rejoin", "lock", "role"],
  );
  for (const command of commands) {
    assert.ok(command.description.length <= 100, command.name);
    for (const option of command.options ?? []) {
      assert.ok(option.description.length >= 1 && option.description.length <= 100, option.name);
    }
  }
});
