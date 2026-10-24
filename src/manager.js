"use strict";

const { RadioSession } = require("./session");
const { songMessage } = require("./i18n");
const { log } = require("./logger");

class RadioManager {
  constructor(client, config, store) {
    this.client = client;
    this.config = config;
    this.store = store;
    this.sessions = new Map();
    this.currentTitle = () => null;
    this.listenerCount = () => null;
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

  isLocked(guildId) {
    return this.store.getLocked(guildId);
  }

  setLocked(guildId, locked) {
    this.store.setLocked(guildId, locked);
  }

  getStay(guildId) {
    return this.store.getStay(guildId);
  }

  setStay(guildId, stay) {
    this.store.setStay(guildId, stay);
    this.sessions.get(guildId)?.setStay(stay);
  }

  getRejoin(guildId) {
    return this.store.getRejoin(guildId);
  }

  setRejoin(guildId, rejoin) {
    this.store.setRejoin(guildId, rejoin);
    if (!rejoin) return;
    const channelId = this.sessions.get(guildId)?.channelId;
    if (channelId) this.store.setChannelId(guildId, channelId);
  }

  getLanguage(guildId) {
    return this.store.getLanguage(guildId);
  }

  setLanguage(guildId, language) {
    this.store.setLanguage(guildId, language);
  }

  getAnnounce(guildId) {
    return this.store.getAnnounce(guildId);
  }

  setAnnounce(guildId, announce) {
    this.store.setAnnounce(guildId, announce);
  }

  getAnnounceChannel(guildId) {
    return this.store.getAnnounceChannel(guildId);
  }

  setAnnounceChannel(guildId, channelId) {
    this.store.setAnnounceChannel(guildId, channelId);
  }

  getControlRole(guildId) {
    return this.store.getControlRole(guildId);
  }

  setControlRole(guildId, roleId) {
    this.store.setControlRole(guildId, roleId);
  }

  rememberChannel(guildId, channelId) {
    if (!this.getRejoin(guildId)) return;
    this.store.setChannelId(guildId, channelId);
  }

  session(guildId) {
    let current = this.sessions.get(guildId);
    if (current) return current;
    current = new RadioSession(guildId, this.client, {
      streamUrl: this.config.streamUrl,
      idleTimeoutMs: this.getIdleMinutes(guildId) * 60 * 1000,
      volume: this.getVolume(guildId),
      stay: this.getStay(guildId),
      onChannel: (id, channelId) => this.rememberChannel(id, channelId),
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

  async announceSong(title, listeners, onlyGuildId = null) {
    if (!title) return { sent: 0, failed: 0 };
    let targets = this.store.announceTargets();
    if (onlyGuildId) targets = targets.filter((target) => target.guildId === onlyGuildId);
    let sent = 0;
    let failed = 0;
    await Promise.all(
      targets.map(async (target) => {
        const ok = await this.postSong(target.guildId, target.channelId, title, listeners);
        if (ok) sent += 1;
        else failed += 1;
      }),
    );
    return { sent, failed };
  }

  async postSong(guildId, channelId, title, listeners) {
    try {
      const channel = await this.client.channels.fetch(channelId);
      if (!channel?.isTextBased?.() || channel.isVoiceBased?.()) return false;
      const me = channel.guild?.members?.me;
      const perms = me ? channel.permissionsFor(me) : null;
      if (perms && !perms.has(["ViewChannel", "SendMessages"])) {
        log.warn(`[guild:${guildId}] cannot post songs in #${channel.name ?? channelId}`);
        return false;
      }
      await channel.send({
        content: songMessage(this.getLanguage(guildId), title, listeners),
        allowedMentions: { parse: [] },
      });
      return true;
    } catch (error) {
      log.warn(`[guild:${guildId}] could not post the song`, error);
      return false;
    }
  }

  async resumeSaved() {
    const targets = this.store.rejoinTargets();
    for (const { guildId, channelId } of targets) {
      try {
        const guild = await this.client.guilds.fetch(guildId);
        const channel = await guild.channels.fetch(channelId);
        if (!channel?.isVoiceBased()) {
          this.store.setChannelId(guildId, null);
          continue;
        }
        await this.session(guildId).join(channel);
      } catch (error) {
        log.error(`[guild:${guildId}] could not rejoin after restart`, error);
      }
    }
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
