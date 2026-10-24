"use strict";

const http = require("node:http");
const https = require("node:https");
const { log } = require("./logger");

function statsUrl(streamUrl) {
  const url = new URL(streamUrl);
  url.pathname = "/stats";
  url.search = "json=1";
  url.hash = "";
  return url.href;
}

function cleanTitle(value) {
  if (typeof value !== "string") return null;
  const title = value.replace(/\s+/g, " ").trim();
  return title || null;
}

function titleFromStats(body) {
  const data = JSON.parse(body);
  const direct = cleanTitle(data?.songtitle);
  if (direct) return direct;
  if (Array.isArray(data?.streams)) {
    for (const stream of data.streams) {
      const title = cleanTitle(stream?.songtitle);
      if (title) return title;
    }
  }
  return null;
}

function fetchText(url, signal) {
  return new Promise((resolve, reject) => {
    const lib = url.startsWith("https:") ? https : http;
    const request = lib.get(
      url,
      {
        signal,
        headers: {
          "User-Agent": "ZonaM1RadioBot/1.0",
          Accept: "application/json",
        },
      },
      (response) => {
        if ((response.statusCode ?? 0) !== 200) {
          response.resume();
          reject(new Error(`stats responded ${response.statusCode}`));
          return;
        }
        const chunks = [];
        response.on("data", (chunk) => chunks.push(chunk));
        response.on("error", reject);
        response.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
      },
    );
    request.setTimeout(8000, () => request.destroy(new Error("stats timed out")));
    request.on("error", reject);
  });
}

class StationMonitor {
  constructor({ url, onTitle }) {
    this.url = statsUrl(url);
    this.onTitle = onTitle;
    this.title = null;
    this.stopped = false;
    this.failing = false;
    this.abort = null;
    this.timer = null;
  }

  start() {
    this.tick();
    this.timer = setInterval(() => this.tick(), 20_000);
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    this.abort?.abort();
  }

  noteTitle(title) {
    const next = title || null;
    if (next === this.title) return;
    this.title = next;
    this.onTitle(next);
  }

  tick() {
    if (this.stopped) return;
    this.abort?.abort();
    const abort = new AbortController();
    this.abort = abort;
    fetchText(this.url, abort.signal)
      .then((body) => {
        if (this.stopped || abort.signal.aborted) return;
        if (this.failing) {
          this.failing = false;
          log.info("Song titles are available again.");
        }
        this.noteTitle(titleFromStats(body));
      })
      .catch((error) => {
        if (this.stopped || abort.signal.aborted) return;
        if (this.failing) return;
        this.failing = true;
        log.warn(`Could not read the song title: ${error instanceof Error ? error.message : error}`);
      });
  }
}

module.exports = { StationMonitor, statsUrl, titleFromStats };
