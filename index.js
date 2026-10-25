"use strict";

require("dotenv").config();

const { ActivityType, Client, Events, GatewayIntentBits } = require("discord.js");
const { generateDependencyReport } = require("@discordjs/voice");
const { loadConfig } = require("./src/config");
const { log } = require("./src/logger");
const { resolveFfmpeg, openStation } = require("./src/ffmpeg");
const { RadioManager } = require("./src/manager");
const { handleCommand } = require("./src/commands");
const { registerCommands } = require("./src/register");
const { t } = require("./src/i18n");
const { spawn } = require("node:child_process");
const path = require("node:path");
const { createStore } = require("./src/store");

const config = loadConfig();

if (!config.token) {
  log.error("DISCORD_TOKEN is missing. Set it in the host panel or a local .env file, then start again.");
  process.exit(1);
}

function checkVoiceDeps() {
  const missing = [];
  for (const name of ["@snazzah/davey", "opusscript", "libsodium-wrappers"]) {
    try {
      require(name);
    } catch {
      missing.push(name);
    }
  }
  if (missing.length) {
    log.error(`Missing voice libraries: ${missing.join(", ")}. npm install did not finish cleanly.`);
  }
  log.info(generateDependencyReport());
}

function checkFfmpeg() {
  const bin = resolveFfmpeg();
  log.info(`ffmpeg binary: ${bin}`);
  return new Promise((resolve) => {
    const child = spawn(bin, ["-version"], { stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk.toString();
    });
    child.on("error", (error) => {
      log.error("ffmpeg is not runnable. Streaming will fail until ffmpeg works.", error);
      resolve();
    });
    child.on("exit", (code) => {
      const version = output.split("\n")[0] || "unknown";
      if (code === 0) log.info(`ffmpeg ok: ${version}`);
      else log.error(`ffmpeg -version exited ${code}`);
      resolve();
    });
  });
}

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

const store = createStore(path.join(process.cwd(), "data", "guilds.json"));
store.load();
const manager = new RadioManager(client, config, store);
let shuttingDown = false;

client.once(Events.ClientReady, async (readyClient) => {
  log.info(`Logged in as ${readyClient.user.tag}`);
  readyClient.user.setActivity("Zona M1 Radio", { type: ActivityType.Listening });
  try {
    await registerCommands(config.token, readyClient.user.id, config.commandGuildId);
  } catch (error) {
    log.error("Could not register slash commands. Previously registered commands will still work.", error);
  }
  log.info(`Stream URL: ${config.streamUrl}`);
  log.info(`Default volume: ${config.defaultVolume}`);
  log.info(`Default idle timeout: ${config.idleMinutes} minutes`);
  log.info("This build plays the live station only. It does not read song titles.");
  await checkStation(config.streamUrl);
  manager.resumeSaved().catch((error) => {
    log.error("Could not rejoin saved channels", error);
  });
  log.info("Ready. Each server has its own voice connection, volume, and idle timeout.");
});

client.on(Events.InteractionCreate, async (interaction) => {
  try {
    await handleCommand(interaction, manager);
  } catch (error) {
    log.error("Command handler failed", error);
    const content = t(manager.getLanguage(interaction.guildId), "failed");
    try {
      if (interaction.deferred || interaction.replied) await interaction.followUp({ content, allowedMentions: { parse: [] } });
      else await interaction.reply({ content, allowedMentions: { parse: [] } });
    } catch (replyError) {
      log.error("Could not send the error reply", replyError);
    }
  }
});

client.on(Events.VoiceStateUpdate, (oldState, newState) => {
  const guildId = newState.guild?.id ?? oldState.guild?.id;
  if (!guildId) return;
  const session = manager.peek(guildId);
  if (!session?.isActive()) return;

  const botId = client.user?.id;
  if (botId && newState.id === botId) {
    if (!newState.channelId) {
      log.warn(`[guild:${guildId}] removed from voice`);
      session.scheduleReconnect("removed from voice");
      return;
    }
    session.noteMoved(newState.channelId);
  }

  const watchedId = session.channelId;
  if (!watchedId) return;
  if (oldState.channelId !== watchedId && newState.channelId !== watchedId && newState.id !== botId) return;

  const channel = newState.guild.channels.cache.get(watchedId) ?? oldState.guild.channels.cache.get(watchedId);
  if (channel?.isVoiceBased()) session.refreshIdle(channel);
});

client.on(Events.Error, (error) => {
  log.error("Discord client error", error);
});

client.on(Events.ShardDisconnect, (event, shardId) => {
  log.warn(`Gateway shard ${shardId} disconnected (code ${event?.code ?? "unknown"}). The library will reconnect.`);
});

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  log.info(`Received ${signal}. Disconnecting ${manager.activeCount()} server(s).`);
  await manager.leaveAll(signal);
  client.destroy();
  process.exit(0);
}

process.on("SIGINT", () => {
  shutdown("SIGINT").catch((error) => {
    log.error("Shutdown failed", error);
    process.exit(1);
  });
});

process.on("SIGTERM", () => {
  shutdown("SIGTERM").catch((error) => {
    log.error("Shutdown failed", error);
    process.exit(1);
  });
});

process.on("unhandledRejection", (error) => {
  log.error("Unhandled rejection", error);
});

process.on("uncaughtException", (error) => {
  log.error("Uncaught exception. Exiting so the host can restart cleanly.", error);
  process.exit(1);
});

async function checkStation(url) {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 8000);
  try {
    const { request, response } = await openStation(url, abort.signal);
    response.resume();
    request.destroy();
    log.info("Station connection check passed.");
  } catch (error) {
    log.error("Could not open the station during startup. /zona will keep retrying.", error);
  } finally {
    clearTimeout(timer);
  }
}

async function main() {
  checkVoiceDeps();
  await checkFfmpeg();
  log.info("Connecting to Discord...");
  await client.login(config.token);
}

main().catch((error) => {
  log.error("Startup failed", error);
  process.exit(1);
});
