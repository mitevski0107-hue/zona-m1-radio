"use strict";

function emit(level, args) {
  const line = `[${new Date().toISOString()}] [${level}]`;
  if (level === "ERROR") console.error(line, ...args);
  else if (level === "WARN") console.warn(line, ...args);
  else console.log(line, ...args);
}

const log = {
  info(...args) {
    emit("INFO", args);
  },
  warn(...args) {
    emit("WARN", args);
  },
  error(...args) {
    emit("ERROR", args);
  },
};

module.exports = { log };
