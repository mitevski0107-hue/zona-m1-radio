"use strict";

const { PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { MAX_VOLUME, MIN_VOLUME, normalizeVolumeInput } = require("./timing");
const { RadioError } = require("./session");
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
];

function commandJson() {
  return commandBuilders.map((command) => command.toJSON());
}

async function reply(interaction, content) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(content);
    return;
  }
  await interaction.reply(content);
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
  }
}

module.exports = { commandJson, handleCommand };
