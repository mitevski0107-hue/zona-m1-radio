"use strict";

const MIN_IDLE_MINUTES = 1;
const MAX_IDLE_MINUTES = 60;
const DEFAULT_IDLE_MINUTES = 5;
const MIN_VOLUME = 0;
const MAX_VOLUME = 100;
const RECONNECT_BASE_MS = 2000;
const RECONNECT_MAX_MS = 30000;

function parseDefaultVolume(raw) {
  if (raw === undefined || raw === null || raw === "") return 50;
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < MIN_VOLUME || value > MAX_VOLUME) return 50;
  return value;
}

function normalizeVolumeInput(raw) {
  if (raw === undefined || raw === null || raw === "") return { ok: false };
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < MIN_VOLUME || value > MAX_VOLUME) return { ok: false };
  return { ok: true, value };
}

function normalizeIdleInput(raw) {
  if (raw === undefined || raw === null || raw === "") return { ok: false };
  const value = typeof raw === "number" ? raw : Number(raw);
  if (!Number.isInteger(value) || value < MIN_IDLE_MINUTES || value > MAX_IDLE_MINUTES) return { ok: false };
  return { ok: true, value };
}

function reconnectDelayMs(attempt) {
  const step = Number.isInteger(attempt) && attempt > 0 ? attempt : 0;
  return Math.min(RECONNECT_MAX_MS, RECONNECT_BASE_MS * 2 ** Math.min(step, 4));
}

function countHumans(members) {
  if (!members) return 0;
  let count = 0;
  for (const member of members.values()) {
    if (!member?.user?.bot) count += 1;
  }
  return count;
}

module.exports = {
  MIN_VOLUME,
  MAX_VOLUME,
  MIN_IDLE_MINUTES,
  MAX_IDLE_MINUTES,
  DEFAULT_IDLE_MINUTES,
  parseDefaultVolume,
  normalizeVolumeInput,
  normalizeIdleInput,
  reconnectDelayMs,
  countHumans,
};
