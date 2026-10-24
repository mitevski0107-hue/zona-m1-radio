"use strict";

const { REST, Routes } = require("discord.js");
const { commandJson } = require("./commands");
const { log } = require("./logger");

async function registerCommands(token, applicationId) {
  const rest = new REST({ version: "10" }).setToken(token);
  await rest.put(Routes.applicationCommands(applicationId), { body: commandJson() });
  log.info("Registered global slash commands: /join, /volume, /leave. They can take up to an hour to appear everywhere.");
}

module.exports = { registerCommands };
