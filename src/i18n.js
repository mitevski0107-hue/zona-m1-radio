"use strict";

const DEFAULT_LANGUAGE = "mk";

const STRINGS = {
  mk: {
    on: "вклучено",
    off: "исклучено",
    none: "нема",
    minute: "минута",
    minutes: "минути",
    languageName: "македонски",
    joined: "Се приклучив и пуштив Zona M1 Radio.",
    moved: "Се преместив и продолжувам со Zona M1 Radio.",
    already: "Веќе пуштам Zona M1 Radio во овој канал.",
    needVoice: "Прво влези во гласовен канал.",
    noPerms: "Не можам да влезам во тој канал. Провери дали имам дозвола да се поврзам и да зборувам.",
    streamRetry: "Стримот не тргна. Ќе пробам повторно.",
    joinFailed: "Нешто тргна наопаку при пуштањето. Провери ја конзолата.",
    volumeUsage: "Јачината е {current}. Користи број од {min} до {max}.",
    volumeSet: "Јачината е {level}.",
    notConnected: "Не сум во гласовен канал.",
    left: "Излегов од каналот.",
    locked: "Додека е заклучено, само луѓе со Mute Members или со избраната улога можат да го користат ботот.",
    guildOnly: "Оваа команда работи само во сервер.",
    failed: "Нешто тргна наопаку. Обиди се повторно за момент.",
    retired: "Таа команда повеќе не постои. Користи /zona.",
    settingsPrompt: "Одбери: language, idle, stay, rejoin, lock или role.",
    idleInvalid: "Чекањето во празен канал мора да биде од {min} до {max} минути.",
    idleRestarted: "Одбројувањето почна одново.",
    settingsSummary:
      "Празен канал: {idle} {unit}. Заклучено: {lock}. Остани: {stay}. По рестарт: {rejoin}. Јазик: {languageName}. Улога: {role}.",
  },
  en: {
    on: "on",
    off: "off",
    none: "none",
    minute: "minute",
    minutes: "minutes",
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
    retired: "That command is gone. Use /zona.",
    settingsPrompt: "Set language, idle, stay, rejoin, lock, or role.",
    idleInvalid: "The empty-channel wait must be from {min} to {max} minutes.",
    idleRestarted: "The empty-channel countdown started over.",
    settingsSummary:
      "Empty channel: {idle} {unit}. Lock: {lock}. Stay: {stay}. After restart: {rejoin}. Language: {languageName}. Role: {role}.",
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
    role: settings.roleId ? `<@&${settings.roleId}>` : t(lang, "none"),
  });
}

module.exports = {
  DEFAULT_LANGUAGE,
  STRINGS,
  normalizeLanguage,
  t,
  describeSettings,
};
