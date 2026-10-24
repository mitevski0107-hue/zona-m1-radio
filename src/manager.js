"use strict";

const { RadioSession } = require("./session");

class RadioManager {
  constructor(client, config) {
    this.client = client;
    this.config = config;
    this.sessions = new Map();
    this.volumes = new Map();
  }

  getVolume(guildId) {
    return this.volumes.has(guildId) ? this.volumes.get(guildId) : this.config.defaultVolume;
  }

  setVolume(guildId, level) {
    this.volumes.set(guildId, level);
    this.sessions.get(guildId)?.applyVolume(level);
  }

  session(guildId) {
    let current = this.sessions.get(guildId);
    if (current) return current;
    current = new RadioSession(guildId, this.client, {
      streamUrl: this.config.streamUrl,
      idleTimeoutMs: this.config.idleTimeoutMs,
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
