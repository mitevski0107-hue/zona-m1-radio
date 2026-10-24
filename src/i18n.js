"use strict";

const DEFAULT_LANGUAGE = "mk";

const STRINGS = {
  mk: {
    on: "вклучено",
    off: "исклучено",
    none: "нема",
    minute: "минута",
    minutes: "минути",
    second: "секунда",
    seconds: "секунди",
    languageName: "македонски",
    joined: "Се приклучив и го пуштив Zona M1 Radio.",
    moved: "Се префрлив и продолжувам со Zona M1 Radio.",
    already: "Веќе го пуштам Zona M1 Radio во овој канал.",
    needVoice: "Прво влези во гласовен канал.",
    noPerms: "Не можам да влезам во тој канал. Провери дали имам дозвола за поврзување и зборување.",
    streamRetry: "Не успеав да го пуштам стримот. Ќе продолжам да пробам.",
    joinFailed: "Нешто тргна наопаку при пуштањето. Провери ја конзолата.",
    volumeUsage: "Јачината е {current}. Користи број од {min} до {max}.",
    volumeSet: "Јачината е поставена на {level}.",
    notConnected: "Не сум во гласовен канал.",
    left: "Го напуштив каналот.",
    locked: "Додека заклучувањето е вклучено, тоа можат само луѓе со Mute Members или со избраната улога.",
    guildOnly: "Оваа команда работи само во сервер.",
    failed: "Нешто тргна наопаку. Обиди се повторно за малку.",
    retired: "Таа команда е тргната. Користи /zona. Песната може да оди во канал преку /settings.",
    settingsPrompt: "Одбери language, idle, stay, rejoin, lock, role, channel или songs.",
    idleInvalid: "Празниот канал мора да чека од {min} до {max} минути.",
    idleRestarted: "Одбројувањето почна одново.",
    announceNeedChannel: "Прво одбери канал за песните.",
    announceFailed: "Не можам да пишувам во тој канал. Потребна е дозвола Send Messages.",
    settingsSummary:
      "Празен канал: {idle} {unit}. Заклучување: {lock}. Остани: {stay}. По рестарт: {rejoin}. Јазик: {languageName}. Песни: {songs} ({channel}). Улога: {role}.",
    song: "Сега на Zona M1: {title}",
    songOne: "Сега на Zona M1: {title} ({listeners} слушател)",
    songMany: "Сега на Zona M1: {title} ({listeners} слушатели)",
  },
  en: {
    on: "on",
    off: "off",
    none: "none",
    minute: "minute",
    minutes: "minutes",
    second: "second",
    seconds: "seconds",
    languageName: "English",
    joined: "Joined and started Zona M1 Radio.",
    moved: "Moved and kept Zona M1 Radio playing.",
    already: "Already playing Zona M1 Radio in this channel.",
    needVoice: "You need to be in a voice channel first.",
    noPerms: "I can't join that channel. Check that I have Connect and Speak.",
    streamRetry: "The stream did not start. I'll keep trying.",
    joinFailed: "Something went wrong while starting the radio. Check the console.",
    volumeUsage: "Volume is {current}. Use a number from {min} to {max}.",
    volumeSet: "Volume set to {level}.",
    notConnected: "I'm not in a voice channel.",
    left: "Left the channel.",
    locked: "Only people who can mute members, or who have the chosen role, can use that while the lock is on.",
    guildOnly: "This command only works in a server.",
    failed: "Something went wrong. Try again in a moment.",
    retired: "That command is gone. Use /zona. Songs can be posted to a channel with /settings.",
    settingsPrompt: "Set language, idle, stay, rejoin, lock, role, channel, or songs.",
    idleInvalid: "The empty-channel wait must be from {min} to {max} minutes.",
    idleRestarted: "The empty-channel countdown started over.",
    announceNeedChannel: "Pick a text channel for the songs first.",
    announceFailed: "I can't post in that channel. I need Send Messages there.",
    settingsSummary:
      "Empty channel: {idle} {unit}. Lock: {lock}. Stay: {stay}. After restart: {rejoin}. Language: {languageName}. Songs: {songs} ({channel}). Role: {role}.",
    song: "Now on Zona M1: {title}",
    songOne: "Now on Zona M1: {title} ({listeners} listener)",
    songMany: "Now on Zona M1: {title} ({listeners} listeners)",
  },
};

function normalizeLanguage(value) {
  return value === "en" ? "en" : DEFAULT_LANGUAGE;
}

function t(language, key, vars = {}) {
  const table = STRINGS[normalizeLanguage(language)];
  const template = table[key] ?? STRINGS.mk[key] ?? key;
  return template.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ""));
}

function describeSettings(language, settings) {
  const lang = normalizeLanguage(language);
  const idle = settings.idle;
  return t(lang, "settingsSummary", {
    idle,
    unit: t(lang, idle === 1 ? "minute" : "minutes"),
    lock: t(lang, settings.locked ? "on" : "off"),
    stay: t(lang, settings.stay ? "on" : "off"),
    rejoin: t(lang, settings.rejoin ? "on" : "off"),
    languageName: t(lang, "languageName"),
    songs: t(lang, settings.announce ? "on" : "off"),
    channel: settings.channelId ? `<#${settings.channelId}>` : t(lang, "none"),
    role: settings.roleId ? `<@&${settings.roleId}>` : t(lang, "none"),
  });
}

function songMessage(language, title, listeners) {
  if (listeners == null) return t(language, "song", { title });
  if (listeners === 1) return t(language, "songOne", { title, listeners });
  return t(language, "songMany", { title, listeners });
}

module.exports = {
  DEFAULT_LANGUAGE,
  STRINGS,
  normalizeLanguage,
  t,
  describeSettings,
  songMessage,
};
