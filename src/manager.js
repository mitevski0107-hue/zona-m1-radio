"use strict";

const { RadioSession } = require("./session");

class RadioManager {
  constructor(client, config, store) {
    this.client = client;
    this.config = config;
    this.store = store;
    this.sessions = new Map();
    this.currentTitle = () => null;
  }

  getVolume(guildId) {
    return this.store.getVolume(guildId, this.config.defaultVolume);
  }

  setVolume(guildId, level) {
    this.store.setVolume(guildId, level);
    this.sessions.get(guildId)?.applyVolume(level);
  }

  getIdleMinutes(guildId) {
    return this.store.getIdleMinutes(guildId, this.config.idleMinutes);
  }

  setIdleMinutes(guildId, minutes) {
    this.store.setIdleMinutes(guildId, minutes);
    return this.sessions.get(guildId)?.setIdleTimeout(minutes * 60 * 1000) === true;
  }

  session(guildId) {
    let current = this.sessions.get(guildId);
    if (current) return current;
    current = new RadioSession(guildId, this.client, {
      streamUrl: this.config.streamUrl,
      idleTimeoutMs: this.getIdleMinutes(guildId) * 60 * 1000,
      volume: this.getVolume(guildId),
      onEnded: (id) => {
        if (this.sessions.get(id) === current) this.sessions.delete(id);
      },
    });
    this.sessions.set(guildId, current);
    return current;
  }

  peek(guildId) {
    return this.sessions.get(guildId) ?? null;
  }

  activeCount() {
    let count = 0;
    for (const session of this.sessions.values()) {
      if (session.isActive()) count += 1;
    }
    return count;
  }

  async leaveAll(reason) {
    const jobs = [];
    for (const session of this.sessions.values()) {
      jobs.push(session.leave(reason));
    }
    await Promise.allSettled(jobs);
    this.sessions.clear();
  }
}

module.exports = { RadioManager };
