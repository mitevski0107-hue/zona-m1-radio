"use strict";

const { parseDefaultVolume, DEFAULT_IDLE_MINUTES } = require("./timing");

const DEFAULT_STREAM_URL = "https://zonam1.ddns.net:8400/;";
const DEFAULT_COMMAND_GUILD_ID = "1304175357124939776";

function commandGuildId() {
  const raw = process.env.COMMAND_GUILD_ID;
  if (raw === undefined) return DEFAULT_COMMAND_GUILD_ID;
  const trimmed = raw.trim();
  if (!trimmed || trimmed === "0" || trimmed.toLowerCase() === "off") return "";
  return trimmed;
}

function loadConfig() {
  return {
    token: process.env.DISCORD_TOKEN?.trim() || "",
    streamUrl: process.env.STREAM_URL?.trim() || DEFAULT_STREAM_URL,
    defaultVolume: parseDefaultVolume(process.env.DEFAULT_VOLUME),
    idleMinutes: DEFAULT_IDLE_MINUTES,
    idleTimeoutMs: DEFAULT_IDLE_MINUTES * 60 * 1000,
    commandGuildId: commandGuildId(),
  };
}

module.exports = { loadConfig, DEFAULT_STREAM_URL };
