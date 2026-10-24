"use strict";

const { REST, Routes } = require("discord.js");
const { commandJson } = require("./commands");
const { log } = require("./logger");

async function registerCommands(token, applicationId, guildId) {
  const rest = new REST({ version: "10" }).setToken(token);
  const body = commandJson();
  await rest.put(Routes.applicationCommands(applicationId), { body });
  log.info("Registered global slash commands. They can take up to an hour to appear in other servers.");
  if (!guildId) return;
  await rest.put(Routes.applicationGuildCommands(applicationId, guildId), { body });
  log.info(`Registered slash commands in guild ${guildId}. They should show up there immediately.`);
}

module.exports = { registerCommands };
