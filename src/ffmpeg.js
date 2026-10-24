"use strict";

const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
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

// Node opens the station. ffmpeg only decodes MP3 from stdin.
// The static ffmpeg build segfaults (SIGSEGV) when it opens this HTTPS stream itself.
function decoderArgs() {
  return [
    "-hide_banner",
    "-loglevel",
    "warning",
    "-fflags",
    "nobuffer",
    "-probesize",
    "32768",
    "-analyzeduration",
    "0",
    "-f",
    "mp3",
    "-i",
    "pipe:0",
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

function spawnDecoder() {
  const bin = resolveFfmpeg();
  const child = spawn(bin, decoderArgs(), {
    stdio: ["pipe", "pipe", "pipe"],
  });
  return { bin, child };
}

function openStation(url, signal, options = {}) {
  const redirects = options.redirects ?? 0;
  const icy = options.icy === true;
  return new Promise((resolve, reject) => {
    let settled = false;
    const fail = (error) => {
      if (settled) return;
      settled = true;
      reject(error);
    };
    const succeed = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
    };

    const lib = url.startsWith("https:") ? https : http;
    const request = lib.get(
      url,
      {
        signal,
        headers: {
          "User-Agent": "ZonaM1RadioBot/1.0",
          "Icy-MetaData": icy ? "1" : "0",
          Accept: "audio/mpeg,*/*",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        if (status >= 300 && status < 400 && response.headers.location) {
          response.resume();
          if (redirects >= 3) {
            fail(new Error("station redirected too many times"));
            return;
          }
          const next = new URL(response.headers.location, url).href;
          openStation(next, signal, { ...options, redirects: redirects + 1 }).then(succeed, fail);
          return;
        }
        if (status !== 200) {
          response.resume();
          fail(new Error(`station responded ${status}`));
          return;
        }
        succeed({ request, response });
      },
    );
    request.setTimeout(15000, () => {
      request.destroy(new Error("station connection timed out"));
    });
    request.on("error", fail);
  });
}

module.exports = { resolveFfmpeg, decoderArgs, spawnDecoder, openStation };
