# Zona M1 Radio bot

A Discord bot that streams [Zona M1 Radio](https://www.zonam1radio.com.mk) into voice channels. It uses discord.js 14 and `@discordjs/voice` (with DAVE end-to-end voice encryption). Each server gets its own connection and volume.

## Commands

Anyone in the server can use these. There is no play, stop, pause, or skip. The station is a live stream.

| Command | What it does |
| --- | --- |
| `/join` | Joins the voice channel you are in and starts the radio. If the bot is already in the server, it moves and keeps streaming. |
| `/volume` | Sets this server's volume from 0 to 100. With no number, or a number outside that range, it replies with the current volume. |
| `/leave` | Disconnects immediately. |

If a voice channel empties out, the bot waits 5 minutes. Anyone joining cancels that timer. If it is still empty when the timer ends, the bot leaves and drops that server's connection.

If the stream dies or Discord drops the voice connection while the bot should still be playing, it rejoins with a delay: 2s, 4s, 8s, 16s, then 30s. A healthy stream resets the delay.

The bot's status is **Listening to Zona M1 Radio**.

## PebbleHost

Upload the **contents** of this folder so `index.js` and `package.json` are at the top of the file manager. Do not upload `node_modules`.

1. In the panel, set the Node.js version to **22.12 or newer**. Voice will not connect on older Node.
2. Set the start file to `index.js` (this matches `"main"` in `package.json`).
3. Add environment variables:
   - `DISCORD_TOKEN` — required
   - `STREAM_URL` — optional, defaults to `https://zonam1.ddns.net:8400/;`
   - `DEFAULT_VOLUME` — optional, defaults to `50`
4. Start the server. The panel installs dependencies from `package.json`. The console should show a login line, ffmpeg version, and `Registered global slash commands`.

Global commands can take up to an hour to show up in every server the first time.

Invite the bot with the `bot` and `applications.commands` scopes, and grant **View Channel**, **Connect**, and **Speak**. Replace `CLIENT_ID` with the application id:

```text
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=3146752&scope=bot%20applications.commands
```

In the Developer Portal you do **not** need the privileged member, presence, or message-content intents. The bot requests `Guilds` and `GuildVoiceStates` only.

ffmpeg is bundled via `ffmpeg-static`. If the machine already has ffmpeg, set `FFMPEG_PATH` to that binary. The stream is decoded to 48 kHz stereo PCM with ffmpeg reconnect flags, then sent to Discord.

## Local

```bash
cp .env.example .env
# edit DISCORD_TOKEN
npm install
npm start
```

`npm test` checks volume parsing, empty-channel counting, and reconnect delays.
