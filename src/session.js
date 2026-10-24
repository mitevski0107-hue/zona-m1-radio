"use strict";

const {
  AudioPlayerStatus,
  NoSubscriberBehavior,
  StreamType,
  VoiceConnectionStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  joinVoiceChannel,
} = require("@discordjs/voice");
const { countHumans, reconnectDelayMs } = require("./timing");
const { spawnDecoder, openStation } = require("./ffmpeg");
const { log } = require("./logger");

class RadioError extends Error {
  constructor(message, { retry = false, cause } = {}) {
    super(message);
    this.name = "RadioError";
    this.retry = retry;
    if (cause) this.cause = cause;
  }
}

function killChild(child) {
  if (!child || child.killed) return;
  try {
    child.kill("SIGKILL");
  } catch {
    // Already gone.
  }
}

class RadioSession {
  constructor(guildId, client, options) {
    this.guildId = guildId;
    this.client = client;
    this.streamUrl = options.streamUrl;
    this.idleTimeoutMs = options.idleTimeoutMs;
    this.volume = options.volume;
    this.channelId = null;
    this.connection = null;
    this.boundConnection = null;
    this.player = null;
    this.ffmpeg = null;
    this.resource = null;
    this.shouldPlay = false;
    this.leaving = false;
    this.suppressIdle = false;
    this.playGeneration = 0;
    this.reconnectAttempt = 0;
    this.reconnectTimer = null;
    this.idleTimer = null;
    this.idleUntil = null;
    this.healthyTimer = null;
    this.stationAbort = null;
    this.chain = Promise.resolve();
    this.onEnded = options.onEnded;
  }

  tag() {
    return `[guild:${this.guildId}]`;
  }

  isActive() {
    return this.shouldPlay && !this.leaving;
  }

  isLive() {
    const status = this.player?.state?.status;
    return status === AudioPlayerStatus.Playing || status === AudioPlayerStatus.Buffering;
  }

  enqueue(task) {
    const run = this.chain.then(() => task(), () => task());
    this.chain = run.then(
      () => undefined,
      () => undefined,
    );
    return run;
  }

  applyVolume(level) {
    this.volume = level;
    const transformer = this.resource?.volume;
    if (!transformer) return;
    transformer.setVolumeLogarithmic(level / 100);
  }

  ensurePlayer() {
    if (this.player) return;
    this.player = createAudioPlayer({
      behaviors: {
        noSubscriber: NoSubscriberBehavior.Play,
        maxMissedFrames: 100,
      },
    });

    this.player.on("error", (error) => {
      log.error(`${this.tag()} audio player error`, error);
      if (!this.isActive() || this.suppressIdle) return;
      this.scheduleReconnect(error.message || "player error");
    });

    this.player.on(AudioPlayerStatus.Idle, () => {
      this.clearHealthy();
      if (!this.isActive() || this.suppressIdle) return;
      log.warn(`${this.tag()} stream ended`);
      this.scheduleReconnect("stream ended");
    });

    this.player.on(AudioPlayerStatus.Playing, () => {
      this.suppressIdle = false;
      if (this.healthyTimer) return;
      this.healthyTimer = setTimeout(() => {
        this.healthyTimer = null;
        if (!this.isActive()) return;
        if (this.player?.state?.status !== AudioPlayerStatus.Playing) return;
        if (this.reconnectAttempt !== 0) {
          log.info(`${this.tag()} stream stayed up. Reconnect delay reset.`);
        }
        this.reconnectAttempt = 0;
      }, 8000);
    });
  }

  bindConnection(connection) {
    if (this.boundConnection === connection) return;
    this.boundConnection = connection;

    connection.on("stateChange", (oldState, newState) => {
      log.info(`${this.tag()} voice ${oldState.status} -> ${newState.status}`);
    });

    connection.on(VoiceConnectionStatus.Disconnected, async () => {
      if (!this.isActive()) return;
      try {
        await Promise.race([
          entersState(connection, VoiceConnectionStatus.Signalling, 5_000),
          entersState(connection, VoiceConnectionStatus.Connecting, 5_000),
        ]);
      } catch {
        log.warn(`${this.tag()} voice connection dropped`);
        try {
          connection.destroy();
        } catch {
          // Destroy can throw if it already closed.
        }
        this.scheduleReconnect("voice connection lost");
      }
    });

    connection.on(VoiceConnectionStatus.Destroyed, () => {
      if (this.connection === connection) this.connection = null;
      if (!this.isActive()) return;
      this.scheduleReconnect("voice connection destroyed");
    });
  }

  stopFfmpeg() {
    const child = this.ffmpeg;
    this.ffmpeg = null;
    this.stationAbort?.abort();
    this.stationAbort = null;
    if (child?.stdin) {
      child.stdin.destroy();
    }
    killChild(child);
  }

  clearHealthy() {
    if (!this.healthyTimer) return;
    clearTimeout(this.healthyTimer);
    this.healthyTimer = null;
  }

  startStream() {
    const generation = ++this.playGeneration;
    this.suppressIdle = true;
    this.clearHealthy();
    this.stopFfmpeg();

    let child;
    try {
      child = spawnDecoder().child;
    } catch (error) {
      this.suppressIdle = false;
      throw new RadioError("ffmpeg could not start. I'll keep trying.", { retry: true, cause: error });
    }

    this.ffmpeg = child;
    const abort = new AbortController();
    this.stationAbort = abort;
    child.stderr.on("data", (chunk) => {
      const line = chunk.toString().trim();
      if (line) log.warn(`${this.tag()} ffmpeg: ${line}`);
    });
    child.stdin.on("error", () => {
      // ffmpeg exiting closes stdin while the station is still writing.
    });
    child.on("error", (error) => {
      if (generation !== this.playGeneration) return;
      log.error(`${this.tag()} ffmpeg failed to start`, error);
      this.suppressIdle = false;
      this.scheduleReconnect("ffmpeg failed to start");
    });
    child.on("close", (code, signal) => {
      if (generation !== this.playGeneration) return;
      if (!this.isActive()) return;
      log.warn(`${this.tag()} ffmpeg closed code=${code} signal=${signal ?? "none"}`);
      this.scheduleReconnect("ffmpeg closed");
    });

    openStation(this.streamUrl, abort.signal)
      .then(({ response }) => {
        if (generation !== this.playGeneration || !this.ffmpeg) {
          response.destroy();
          return;
        }
        response.on("error", (error) => {
          if (generation !== this.playGeneration) return;
          log.warn(`${this.tag()} station connection dropped: ${error.message}`);
        });
        response.pipe(child.stdin);
        log.info(`${this.tag()} station connected, decoding`);
      })
      .catch((error) => {
        if (generation !== this.playGeneration || abort.signal.aborted) return;
        log.error(`${this.tag()} could not open the station`, error);
        this.suppressIdle = false;
        killChild(child);
      });

    try {
      const resource = createAudioResource(child.stdout, {
        inputType: StreamType.Raw,
        inlineVolume: true,
      });
      resource.volume.setVolumeLogarithmic(this.volume / 100);
      this.resource = resource;
      this.player.play(resource);
    } catch (error) {
      killChild(child);
      abort.abort();
      if (this.ffmpeg === child) this.ffmpeg = null;
      this.suppressIdle = false;
      throw new RadioError("The radio stream could not start. I'll keep trying.", {
        retry: true,
        cause: error,
      });
    }

    log.info(`${this.tag()} playing ${this.streamUrl} at volume ${this.volume}`);
  }

  async connect(channel, { forceRestart }) {
    const me = channel.guild.members.me ?? (await channel.guild.members.fetchMe());
    const perms = channel.permissionsFor(me);
    if (!perms?.has(["Connect", "Speak"])) {
      throw new RadioError(
        "I can't join that channel. Check that I have Connect and Speak permissions.",
        { retry: false },
      );
    }

    this.ensurePlayer();
    const connection = joinVoiceChannel({
      channelId: channel.id,
      guildId: channel.guild.id,
      adapterCreator: channel.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });
    this.connection = connection;
    this.bindConnection(connection);

    try {
      await entersState(connection, VoiceConnectionStatus.Ready, 20_000);
    } catch (error) {
      throw new RadioError(
        "I joined, but Discord did not finish the voice connection. I'll keep trying.",
        { retry: true, cause: error },
      );
    }

    connection.subscribe(this.player);
    if (forceRestart || !this.isLive()) this.startStream();
  }

  async fetchChannel() {
    if (!this.channelId) return null;
    const guild = this.client.guilds.cache.get(this.guildId) ?? (await this.client.guilds.fetch(this.guildId).catch(() => null));
    if (!guild) return null;
    const channel = await guild.channels.fetch(this.channelId).catch(() => null);
    if (!channel || !channel.isVoiceBased()) return null;
    return channel;
  }

  clearReconnect() {
    if (!this.reconnectTimer) return;
    clearTimeout(this.reconnectTimer);
    this.reconnectTimer = null;
  }

  clearIdle() {
    if (this.idleTimer) clearTimeout(this.idleTimer);
    this.idleTimer = null;
    this.idleUntil = null;
  }

  armIdle(channelName) {
    if (this.idleTimer) return;
    this.idleUntil = Date.now() + this.idleTimeoutMs;
    log.info(
      `${this.tag()} #${channelName} is empty. Leaving in ${Math.round(this.idleTimeoutMs / 1000)}s if nobody joins.`,
    );
    this.idleTimer = setTimeout(() => {
      this.idleTimer = null;
      this.idleUntil = null;
      this.enqueue(() => this.finishIdle()).catch((error) => {
        log.error(`${this.tag()} idle task failed`, error);
      });
    }, this.idleTimeoutMs);
  }

  setIdleTimeout(ms) {
    this.idleTimeoutMs = ms;
    if (!this.idleTimer) return false;
    this.clearIdle();
    this.armIdle("voice");
    return true;
  }

  statusSnapshot() {
    return {
      channelId: this.channelId,
      volume: this.volume,
      idleMinutes: Math.round(this.idleTimeoutMs / 60000),
      idleRemainingMs: this.idleUntil == null ? null : Math.max(0, this.idleUntil - Date.now()),
      playing: this.isLive(),
      reconnecting: this.isActive() && !this.isLive() && this.reconnectAttempt > 0,
      active: this.isActive(),
    };
  }

  scheduleReconnect(reason) {
    if (!this.isActive() || this.reconnectTimer) return;
    const delay = reconnectDelayMs(this.reconnectAttempt);
    this.reconnectAttempt += 1;
    log.warn(`${this.tag()} reconnect in ${delay}ms (attempt ${this.reconnectAttempt}): ${reason}`);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.enqueue(() => this.reconnect(reason)).catch((error) => {
        log.error(`${this.tag()} reconnect task failed`, error);
      });
    }, delay);
  }

  async reconnect(reason) {
    if (!this.isActive()) return;
    log.info(`${this.tag()} reconnecting because: ${reason}`);
    try {
      const channel = await this.fetchChannel();
      if (!channel) {
        log.warn(`${this.tag()} voice channel is gone. Stopping.`);
        await this.stop("channel missing");
        this.onEnded?.(this.guildId);
        return;
      }
      await this.connect(channel, { forceRestart: !this.isLive() });
      this.refreshIdle(channel);
      log.info(`${this.tag()} reconnected in #${channel.name}`);
    } catch (error) {
      if (error instanceof RadioError && error.retry === false) {
        log.error(`${this.tag()} giving up: ${error.message}`);
        await this.stop("cannot rejoin");
        this.onEnded?.(this.guildId);
        return;
      }
      log.error(`${this.tag()} reconnect failed`, error);
      this.scheduleReconnect(error instanceof Error ? error.message : reason);
    }
  }

  refreshIdle(channel) {
    if (!this.isActive() || !channel) return;
    const humans = countHumans(channel.members);
    if (humans === 0) {
      this.armIdle(channel.name);
      return;
    }

    if (!this.idleTimer) return;
    this.clearIdle();
    log.info(`${this.tag()} someone joined #${channel.name}. Cancelled the idle timer.`);
  }

  async finishIdle() {
    if (!this.isActive()) return;
    const channel = await this.fetchChannel();
    if (channel && countHumans(channel.members) > 0) {
      log.info(`${this.tag()} channel is occupied again. Staying.`);
      return;
    }
    log.info(`${this.tag()} idle timeout elapsed. Leaving.`);
    await this.stop("idle timeout");
    this.onEnded?.(this.guildId);
  }

  noteMoved(channelId) {
    if (!channelId || channelId === this.channelId) return;
    log.info(`${this.tag()} moved to channel ${channelId}`);
    this.channelId = channelId;
  }

  async join(channel) {
    return this.enqueue(async () => {
      const sameChannel = this.channelId === channel.id && this.isLive();
      const moving = this.isLive() && Boolean(this.channelId) && this.channelId !== channel.id;
      this.leaving = false;
      this.shouldPlay = true;
      this.clearReconnect();
      this.channelId = channel.id;

      try {
        await this.connect(channel, { forceRestart: !this.isLive() });
      } catch (error) {
        if (error instanceof RadioError && error.retry === false) {
          await this.stop("join rejected");
          this.onEnded?.(this.guildId);
        } else {
          this.scheduleReconnect(error instanceof Error ? error.message : "join failed");
        }
        throw error;
      }

      this.refreshIdle(channel);
      if (sameChannel) return "already";
      if (moving) return "moved";
      return "joined";
    });
  }

  async leave(reason) {
    return this.enqueue(async () => {
      const active = this.isActive() || Boolean(this.connection) || Boolean(this.channelId);
      await this.stop(reason);
      this.onEnded?.(this.guildId);
      return active;
    });
  }

  async stop(reason) {
    this.leaving = true;
    this.shouldPlay = false;
    this.clearReconnect();
    this.clearIdle();
    this.clearHealthy();
    this.playGeneration += 1;
    this.suppressIdle = true;
    this.stopFfmpeg();
    try {
      this.player?.stop(true);
    } catch {
      // Player may already be destroyed.
    }
    try {
      this.connection?.destroy();
    } catch {
      // Connection may already be destroyed.
    }
    this.connection = null;
    this.boundConnection = null;
    this.player = null;
    this.resource = null;
    this.channelId = null;
    this.reconnectAttempt = 0;
    log.info(`${this.tag()} left (${reason})`);
  }
}

module.exports = { RadioSession, RadioError };
