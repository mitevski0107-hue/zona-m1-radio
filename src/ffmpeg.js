"use strict";

const fs = require("node:fs");
const { spawn } = require("node:child_process");

function resolveFfmpeg() {
  const fromEnv = process.env.FFMPEG_PATH?.trim();
  if (fromEnv && fs.existsSync(fromEnv)) return fromEnv;

  try {
    const staticPath = require("ffmpeg-static");
    if (typeof staticPath === "string" && fs.existsSync(staticPath)) return staticPath;
  } catch {
    // System ffmpeg may still be on PATH.
  }

  return "ffmpeg";
}

function ffmpegArgs(streamUrl) {
  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-nostdin",
    "-reconnect",
    "1",
    "-reconnect_streamed",
    "1",
    "-reconnect_at_eof",
    "1",
    "-reconnect_delay_max",
    "5",
    "-analyzeduration",
    "0",
    "-probesize",
    "32768",
    "-i",
    streamUrl,
    "-vn",
    "-acodec",
    "pcm_s16le",
    "-f",
    "s16le",
    "-ar",
    "48000",
    "-ac",
    "2",
    "pipe:1",
  ];
}

function spawnFfmpeg(streamUrl) {
  const bin = resolveFfmpeg();
  const child = spawn(bin, ffmpegArgs(streamUrl), {
    stdio: ["ignore", "pipe", "pipe"],
  });
  return { bin, child };
}

module.exports = { resolveFfmpeg, ffmpegArgs, spawnFfmpeg };
