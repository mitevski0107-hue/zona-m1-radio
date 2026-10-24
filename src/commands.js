"use strict";

const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { MAX_VOLUME, MIN_IDLE_MINUTES, MAX_IDLE_MINUTES, MIN_VOLUME, normalizeIdleInput, normalizeVolumeInput } = require("./timing");
const { RadioError } = require("./session");
const { formatStatus } = require("./status");
const { log } = require("./logger");

const JOIN_REPLIES = {
  joined: "Joined and started streaming.",
  moved: "Moved and kept streaming.",
  already: "Already streaming in this channel.",
};

const commandBuilders = [
  new SlashCommandBuilder()
    .setName("join")
    .setDescription("Join your voice channel and start Zona M1 Radio"),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Set this server's radio volume from 0 to 100")
    .addIntegerOption((option) =>
      option.setName("level").setDescription("Volume from 0 to 100").setRequired(false),
    ),
  new SlashCommandBuilder().setName("leave").setDescription("Disconnect the radio from the voice channel"),
  new SlashCommandBuilder()
    .setName("status")
    .setDescription("Show whether the radio is playing in this server"),
  new SlashCommandBuilder()
    .setName("nowplaying")
    .setDescription("Show the song Zona M1 Radio is playing"),
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Set how long the bot stays in an empty voice channel")
    .addIntegerOption((option) =>
      option
        .setName("idle")
        .setDescription("Minutes to wait in an empty channel, from 1 to 60")
        .setRequired(false),
    ),
];

function commandJson() {
  return commandBuilders.map((command) => command.toJSON());
}

async function reply(interaction, content) {
  const payload = { content, allowedMentions: { parse: [] } };
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  await interaction.reply(payload);
}

async function voiceMember(interaction) {
  const member = interaction.member;
  if (member && "voice" in member) return member;
  return interaction.guild.members.fetch(interaction.user.id);
}

async function handleJoin(interaction, manager) {
  await interaction.deferReply();
  const member = await voiceMember(interaction);
  const channel = member.voice?.channel;
  if (!channel || !channel.isVoiceBased()) {
    await reply(interaction, "You need to be in a voice channel before I can join.");
    return;
  }

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    await reply(interaction, "I can't join that channel. Check that I have Connect and Speak permissions.");
    return;
  }

  try {
    const result = await manager.session(interaction.guildId).join(channel);
    await reply(interaction, JOIN_REPLIES[result] ?? JOIN_REPLIES.joined);
  } catch (error) {
    const message =
      error instanceof RadioError
        ? error.message
        : "Something went wrong while starting the radio. Check the console.";
    log.error(`[guild:${interaction.guildId}] /join failed`, error);
    await reply(interaction, message);
  }
}

async function handleVolume(interaction, manager) {
  const supplied = interaction.options.getInteger("level");
  const current = manager.getVolume(interaction.guildId);
  const parsed = normalizeVolumeInput(supplied);
  if (!parsed.ok) {
    await reply(interaction, `Volume is ${current}. Use a number from ${MIN_VOLUME} to ${MAX_VOLUME}.`);
    return;
  }
  manager.setVolume(interaction.guildId, parsed.value);
  await reply(interaction, `Volume set to ${parsed.value}.`);
}

async function handleLeave(interaction, manager) {
  const session = manager.peek(interaction.guildId);
  if (!session?.isActive()) {
    await reply(interaction, "I'm not in a voice channel.");
    return;
  }
  await interaction.deferReply();
  await session.leave("command");
  await reply(interaction, "Left the channel.");
}

async function handleStatus(interaction, manager) {
  const session = manager.peek(interaction.guildId);
  const snapshot = session?.statusSnapshot() ?? {
    channelId: null,
    volume: manager.getVolume(interaction.guildId),
    idleMinutes: manager.getIdleMinutes(interaction.guildId),
    idleRemainingMs: null,
    playing: false,
    reconnecting: false,
    active: false,
  };
  let channelName = "a voice channel";
  if (snapshot.channelId) {
    const channel = interaction.guild.channels.cache.get(snapshot.channelId);
    if (channel) channelName = `#${channel.name}`;
  }
  await reply(
    interaction,
    formatStatus({
      ...snapshot,
      channelName,
      title: manager.currentTitle(),
    }),
  );
}

async function handleNowPlaying(interaction, manager) {
  const title = manager.currentTitle();
  if (!title) {
    await reply(interaction, "Zona M1 Radio is on, but no song title has come through yet.");
    return;
  }
  await reply(interaction, `Now playing: ${title}.`);
}

async function handleSettings(interaction, manager) {
  const supplied = interaction.options.getInteger("idle");
  const current = manager.getIdleMinutes(interaction.guildId);
  const parsed = normalizeIdleInput(supplied);
  if (!parsed.ok) {
    await reply(
      interaction,
      `Idle timeout is ${current} minute${current === 1 ? "" : "s"}. Use a number from ${MIN_IDLE_MINUTES} to ${MAX_IDLE_MINUTES}.`,
    );
    return;
  }
  const restarted = manager.setIdleMinutes(interaction.guildId, parsed.value);
  const noun = parsed.value === 1 ? "minute" : "minutes";
  const extra = restarted ? " The empty-channel countdown started over." : "";
  await reply(interaction, `Idle timeout set to ${parsed.value} ${noun}.${extra}`);
}

async function handleCommand(interaction, manager) {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) {
    await reply(interaction, "This command only works in a server.");
    return;
  }

  if (interaction.commandName === "join") {
    await handleJoin(interaction, manager);
    return;
  }
  if (interaction.commandName === "volume") {
    await handleVolume(interaction, manager);
    return;
  }
  if (interaction.commandName === "leave") {
    await handleLeave(interaction, manager);
    return;
  }
  if (interaction.commandName === "status") {
    await handleStatus(interaction, manager);
    return;
  }
  if (interaction.commandName === "nowplaying") {
    await handleNowPlaying(interaction, manager);
    return;
  }
  if (interaction.commandName === "settings") {
    await handleSettings(interaction, manager);
  }
}

module.exports = { commandJson, handleCommand };
