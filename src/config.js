"use strict";

const { parseDefaultVolume } = require("./timing");

const DEFAULT_STREAM_URL = "https://zonam1.ddns.net:8400/;";

function loadConfig() {
  return {
    token: process.env.DISCORD_TOKEN?.trim() || "",
    streamUrl: process.env.STREAM_URL?.trim() || DEFAULT_STREAM_URL,
    defaultVolume: parseDefaultVolume(process.env.DEFAULT_VOLUME),
    idleTimeoutMs: 5 * 60 * 1000,
  };
}

module.exports = { loadConfig, DEFAULT_STREAM_URL };
