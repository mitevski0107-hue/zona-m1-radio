"use strict";

const { ChannelType, PermissionFlagsBits, SlashCommandBuilder } = require("discord.js");
const { MAX_VOLUME, MIN_IDLE_MINUTES, MAX_IDLE_MINUTES, MIN_VOLUME, normalizeIdleInput, normalizeVolumeInput } = require("./timing");
const { RadioError } = require("./session");
const { describeSettings, t } = require("./i18n");
const { log } = require("./logger");

const JOIN_KEYS = {
  joined: "joined",
  moved: "moved",
  already: "already",
};

const RADIO_ERROR_KEY = {
  perms: "noPerms",
  ffmpeg: "streamRetry",
  stream: "streamRetry",
  voice: "streamRetry",
};

const commandBuilders = [
  new SlashCommandBuilder()
    .setName("zona")
    .setDescription("Влези во гласовниот канал и пушти го Zona M1 Radio"),
  new SlashCommandBuilder()
    .setName("volume")
    .setDescription("Постави ја јачината на радиото за овој сервер")
    .addIntegerOption((option) =>
      option
        .setName("level")
        .setDescription("Јачина од 0 до 100")
        .setMinValue(MIN_VOLUME)
        .setMaxValue(MAX_VOLUME)
        .setRequired(false),
    ),
  new SlashCommandBuilder().setName("leave").setDescription("Исклучи го радиото од гласовниот канал"),
  new SlashCommandBuilder()
    .setName("settings")
    .setDescription("Промени ги подесувањата на радиото за овој сервер")
    .addStringOption((option) =>
      option
        .setName("language")
        .setDescription("Јазик на пораките од ботот")
        .setRequired(false)
        .addChoices(
          { name: "Македонски", value: "mk" },
          { name: "English", value: "en" },
        ),
    )
    .addIntegerOption((option) =>
      option
        .setName("idle")
        .setDescription("Колку минути да чека во празен канал (1-60)")
        .setMinValue(MIN_IDLE_MINUTES)
        .setMaxValue(MAX_IDLE_MINUTES)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option.setName("stay").setDescription("Остани во каналот и кога е празен").setRequired(false),
    )
    .addBooleanOption((option) =>
      option.setName("rejoin").setDescription("Врати се во последниот канал по рестарт").setRequired(false),
    )
    .addBooleanOption((option) =>
      option
        .setName("lock")
        .setDescription("Само Mute Members или избраната улога можат да го управуваат ботот")
        .setRequired(false),
    )
    .addRoleOption((option) =>
      option
        .setName("role")
        .setDescription("Улога што може да го управува ботот. @everyone ја трга.")
        .setRequired(false),
    )
    .addChannelOption((option) =>
      option
        .setName("channel")
        .setDescription("Текстуален канал каде што ќе се јавува новата песна")
        .addChannelTypes(ChannelType.GuildText, ChannelType.GuildAnnouncement)
        .setRequired(false),
    )
    .addBooleanOption((option) =>
      option.setName("songs").setDescription("Праќај ја песната во избраниот канал").setRequired(false),
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

function settingsSnapshot(manager, guildId) {
  return {
    idle: manager.getIdleMinutes(guildId),
    locked: manager.isLocked(guildId),
    stay: manager.getStay(guildId),
    rejoin: manager.getRejoin(guildId),
    announce: manager.getAnnounce(guildId),
    channelId: manager.getAnnounceChannel(guildId),
    roleId: manager.getControlRole(guildId),
  };
}

function hasControlRole(interaction, roleId) {
  if (!roleId) return false;
  const roles = interaction.member?.roles;
  if (!roles) return false;
  if (typeof roles.cache?.has === "function") return roles.cache.has(roleId);
  if (Array.isArray(roles)) return roles.includes(roleId);
  return false;
}

function lockedOut(interaction, manager) {
  if (!manager.isLocked(interaction.guildId)) return false;
  if (interaction.memberPermissions?.has(PermissionFlagsBits.MuteMembers)) return false;
  return !hasControlRole(interaction, manager.getControlRole(interaction.guildId));
}

async function voiceMember(interaction) {
  const member = interaction.member;
  if (member && "voice" in member) return member;
  return interaction.guild.members.fetch(interaction.user.id);
}

async function handleZona(interaction, manager) {
  const lang = manager.getLanguage(interaction.guildId);
  await interaction.deferReply();
  const member = await voiceMember(interaction);
  const channel = member.voice?.channel;
  if (!channel || !channel.isVoiceBased()) {
    await reply(interaction, t(lang, "needVoice"));
    return;
  }

  const me = interaction.guild.members.me ?? (await interaction.guild.members.fetchMe());
  const perms = channel.permissionsFor(me);
  if (!perms?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    await reply(interaction, t(lang, "noPerms"));
    return;
  }

  try {
    const result = await manager.session(interaction.guildId).join(channel);
    await reply(interaction, t(lang, JOIN_KEYS[result] ?? "joined"));
  } catch (error) {
    const key = error instanceof RadioError ? RADIO_ERROR_KEY[error.code] ?? "joinFailed" : "joinFailed";
    log.error(`[guild:${interaction.guildId}] /zona failed`, error);
    await reply(interaction, t(lang, key));
  }
}

async function handleVolume(interaction, manager) {
  const lang = manager.getLanguage(interaction.guildId);
  const supplied = interaction.options.getInteger("level");
  const current = manager.getVolume(interaction.guildId);
  const parsed = normalizeVolumeInput(supplied);
  if (!parsed.ok) {
    await reply(interaction, t(lang, "volumeUsage", { current, min: MIN_VOLUME, max: MAX_VOLUME }));
    return;
  }
  manager.setVolume(interaction.guildId, parsed.value);
  await reply(interaction, t(lang, "volumeSet", { level: parsed.value }));
}

async function handleLeave(interaction, manager) {
  const lang = manager.getLanguage(interaction.guildId);
  const session = manager.peek(interaction.guildId);
  if (!session?.isActive()) {
    await reply(interaction, t(lang, "notConnected"));
    return;
  }
  await interaction.deferReply();
  await session.leave("command");
  await reply(interaction, t(lang, "left"));
}

async function handleSettings(interaction, manager) {
  const guildId = interaction.guildId;
  const suppliedIdle = interaction.options.getInteger("idle");
  const lock = interaction.options.getBoolean("lock");
  const stay = interaction.options.getBoolean("stay");
  const rejoin = interaction.options.getBoolean("rejoin");
  const language = interaction.options.getString("language");
  const songs = interaction.options.getBoolean("songs");
  const channel = interaction.options.getChannel("channel");
  const role = interaction.options.getRole("role");
  const parsedIdle = suppliedIdle == null ? null : normalizeIdleInput(suppliedIdle);
  const nothing =
    parsedIdle == null &&
    lock == null &&
    stay == null &&
    rejoin == null &&
    language == null &&
    songs == null &&
    !channel &&
    !role;

  if (parsedIdle && !parsedIdle.ok) {
    const lang = manager.getLanguage(guildId);
    await reply(
      interaction,
      `${describeSettings(lang, settingsSnapshot(manager, guildId))} ${t(lang, "idleInvalid", { min: MIN_IDLE_MINUTES, max: MAX_IDLE_MINUTES })}`,
    );
    return;
  }

  if (nothing) {
    const lang = manager.getLanguage(guildId);
    await reply(interaction, `${describeSettings(lang, settingsSnapshot(manager, guildId))} ${t(lang, "settingsPrompt")}`);
    return;
  }

  let restarted = false;
  if (parsedIdle?.ok) restarted = manager.setIdleMinutes(guildId, parsedIdle.value);
  if (lock != null) manager.setLocked(guildId, lock);
  if (stay != null) manager.setStay(guildId, stay);
  if (rejoin != null) manager.setRejoin(guildId, rejoin);
  if (language === "mk" || language === "en") manager.setLanguage(guildId, language);
  if (role) manager.setControlRole(guildId, role.id === interaction.guildId ? null : role.id);
  if (channel) manager.setAnnounceChannel(guildId, channel.id);

  const enabling = songs === true || (songs == null && channel);
  let announceNote = "";
  if (enabling) {
    if (!manager.getAnnounceChannel(guildId)) {
      announceNote = ` ${t(manager.getLanguage(guildId), "announceNeedChannel")}`;
    } else {
      manager.setAnnounce(guildId, true);
      const title = manager.currentTitle();
      if (title) {
        await interaction.deferReply();
        const result = await manager.announceSong(title, manager.listenerCount(), guildId);
        if (result.failed) announceNote = ` ${t(manager.getLanguage(guildId), "announceFailed")}`;
      }
    }
  } else if (songs === false) {
    manager.setAnnounce(guildId, false);
  }

  const lang = manager.getLanguage(guildId);
  const extra = restarted ? ` ${t(lang, "idleRestarted")}` : "";
  await reply(interaction, `${describeSettings(lang, settingsSnapshot(manager, guildId))}${extra}${announceNote}`);
}

async function handleCommand(interaction, manager) {
  if (!interaction.isChatInputCommand()) return;
  if (!interaction.inGuild()) {
    await reply(interaction, t("mk", "guildOnly"));
    return;
  }

  if (["join", "status", "nowplaying"].includes(interaction.commandName)) {
    await reply(interaction, t(manager.getLanguage(interaction.guildId), "retired"));
    return;
  }

  if (["volume", "leave", "settings"].includes(interaction.commandName) && lockedOut(interaction, manager)) {
    await reply(interaction, t(manager.getLanguage(interaction.guildId), "locked"));
    return;
  }

  if (interaction.commandName === "zona") {
    await handleZona(interaction, manager);
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
  if (interaction.commandName === "settings") {
    await handleSettings(interaction, manager);
  }
}

module.exports = { commandJson, handleCommand };
