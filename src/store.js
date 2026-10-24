"use strict";

const fs = require("node:fs");
const path = require("node:path");
const { log } = require("./logger");

function createStore(filePath) {
  let data = { guilds: {} };

  function load() {
    try {
      const parsed = JSON.parse(fs.readFileSync(filePath, "utf8"));
      if (!parsed || typeof parsed !== "object" || !parsed.guilds || typeof parsed.guilds !== "object") {
        throw new Error("settings file has no guilds");
      }
      data = parsed;
    } catch (error) {
      data = { guilds: {} };
      if (error.code !== "ENOENT") {
        log.warn(`Could not read saved settings at ${filePath}. Starting with defaults.`);
      }
    }
  }

  function save() {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    const temporary = `${filePath}.tmp`;
    fs.writeFileSync(temporary, `${JSON.stringify(data, null, 2)}\n`);
    fs.renameSync(temporary, filePath);
  }

  function entry(guildId) {
    if (!data.guilds[guildId]) data.guilds[guildId] = {};
    return data.guilds[guildId];
  }

  return {
    load,
    getVolume(guildId, fallback) {
      const value = data.guilds[guildId]?.volume;
      return Number.isInteger(value) ? value : fallback;
    },
    setVolume(guildId, volume) {
      entry(guildId).volume = volume;
      save();
    },
    getIdleMinutes(guildId, fallback) {
      const value = data.guilds[guildId]?.idleMinutes;
      return Number.isInteger(value) ? value : fallback;
    },
    setIdleMinutes(guildId, minutes) {
      entry(guildId).idleMinutes = minutes;
      save();
    },
  };
}

module.exports = { createStore };
