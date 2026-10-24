"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");
const { ffmpegArgs, resolveFfmpeg } = require("./ffmpeg");

const STREAM = process.env.STREAM_URL || "https://zonam1.ddns.net:8400/;";

function downloadSlice(url, destination) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? require("node:https") : require("node:http");
    const file = fs.createWriteStream(destination);
    const request = lib.get(url, (response) => {
      if (response.statusCode !== 200) {
        reject(new Error(`station responded ${response.statusCode}`));
        response.resume();
        return;
      }
      response.pipe(file);
    });
    request.on("error", reject);
    file.on("error", reject);
    setTimeout(() => {
      request.destroy();
      file.close(() => resolve());
    }, 2500);
  });
}

test("ffmpeg args keep the live reconnect flags", () => {
  const args = ffmpegArgs(STREAM);
  for (const flag of ["-reconnect", "1", "-reconnect_streamed", "1", "-reconnect_at_eof", "1", "-f", "s16le", "-ar", "48000", "-ac", "2"]) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
  assert.equal(args.at(-1), "pipe:1");
});

test("ffmpeg decodes a Zona M1 slice to 48 kHz stereo PCM", async () => {
  const slice = path.join(os.tmpdir(), `zona-m1-${process.pid}.mp3`);
  await downloadSlice(STREAM, slice);
  const stat = fs.statSync(slice);
  assert.ok(stat.size > 1000, `slice too small: ${stat.size}`);

  const bin = resolveFfmpeg();
  const child = spawn(
    bin,
    ["-hide_banner", "-loglevel", "error", "-i", slice, "-vn", "-acodec", "pcm_s16le", "-f", "s16le", "-ar", "48000", "-ac", "2", "-t", "1", "pipe:1"],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let bytes = 0;
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  try {
    const code = await new Promise((resolve, reject) => {
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
      });
      child.on("error", reject);
      child.on("exit", (exitCode) => resolve(exitCode));
    });
    assert.equal(code, 0, stderr);
    assert.ok(bytes >= 48000, `expected PCM, got ${bytes} bytes`);
  } finally {
    fs.rmSync(slice, { force: true });
  }
});
