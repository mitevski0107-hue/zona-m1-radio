"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const { decoderArgs, openStation, resolveFfmpeg, spawnDecoder } = require("./ffmpeg");

const STREAM = process.env.STREAM_URL || "https://zonam1.ddns.net:8400/;";

test("decoder reads MP3 from stdin and does not open the station URL", () => {
  const args = decoderArgs();
  assert.equal(args.includes(STREAM), false);
  assert.ok(args.includes("pipe:0"));
  assert.ok(args.includes("mp3"));
  assert.equal(args.at(-1), "pipe:1");
  for (const flag of ["-f", "s16le", "-ar", "48000", "-ac", "2"]) {
    assert.ok(args.includes(flag), `missing ${flag}`);
  }
});

test("Node fetches the live station and ffmpeg decodes it without crashing", async () => {
  const { child } = spawnDecoder();
  const abort = new AbortController();
  let bytes = 0;
  let stderr = "";
  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });
  child.stdin.on("error", () => {});

  const timer = setTimeout(() => abort.abort(), 4000);
  try {
    const { response } = await openStation(STREAM, abort.signal);
    response.pipe(child.stdin);
    await new Promise((resolve, reject) => {
      const giveUp = setTimeout(() => reject(new Error(`timed out after ${bytes} bytes\n${stderr}`)), 8000);
      child.stdout.on("data", (chunk) => {
        bytes += chunk.length;
        if (bytes >= 48000 * 2) {
          clearTimeout(giveUp);
          resolve();
        }
      });
      child.on("error", (error) => {
        clearTimeout(giveUp);
        reject(error);
      });
      child.on("exit", (code, signal) => {
        if (bytes >= 48000 * 2) return;
        clearTimeout(giveUp);
        reject(new Error(`ffmpeg exited code=${code} signal=${signal} after ${bytes} bytes\n${stderr}`));
      });
    });
  } finally {
    clearTimeout(timer);
    abort.abort();
    child.kill("SIGKILL");
  }

  assert.ok(bytes >= 48000 * 2, `expected PCM, got ${bytes}`);
  assert.equal(resolveFfmpeg().length > 0, true);
});
