# Zona M1 Radio bot

A Discord bot that streams [Zona M1 Radio](https://www.zonam1radio.com.mk) into voice channels. It uses discord.js 14 and `@discordjs/voice` (with DAVE end-to-end voice encryption). Each server gets its own connection and volume.

## Commands

Anyone in the server can use these. There is no play, stop, pause, or skip. The station is a live stream.

| Command | What it does |
| --- | --- |
| `/join` | Joins the voice channel you are in and starts the radio. If the bot is already in the server, it moves and keeps streaming. |
| `/volume` | Sets this server's volume from 0 to 100. With no number, or a number outside that range, it replies with the current volume. |
| `/leave` | Disconnects immediately. |
| `/status` | Shows the channel, volume, whether audio is flowing, the current song, and the idle countdown. |
| `/nowplaying` | Shows the song title the station is sending. |
| `/settings` | With no options, shows this server's idle time, lock, stay, and rejoin. `idle` is 1–60 minutes. `lock` limits `/volume`, `/leave`, and `/settings` to people who can mute members. `stay` keeps the bot in an empty channel until `/leave`. `rejoin` comes back to the last channel after a restart. |

If a voice channel empties out, the bot waits that server's idle time (5 minutes until someone changes it), unless stay is on. Anyone joining cancels the timer. If it is still empty when the timer ends, the bot leaves and drops that server's connection. `/leave` always disconnects, even when stay is on.

If rejoin is on, a restart puts the bot back in the last channel. It is off until a server turns it on. Shutting the process down does not forget that channel. `/leave` and the idle timeout do.

`/status` includes how many people are listening to Zona M1, from the station's stats page.

If the stream dies or Discord drops the voice connection while the bot should still be playing, it rejoins with a delay: 2s, 4s, 8s, 16s, then 30s. The delay resets after the audio has stayed up for 8 seconds.

The bot's status starts as **Listening to Zona M1 Radio**, then switches to the current song title when the station sends one.

Volume, idle time, lock, stay, and rejoin are saved per server in `data/guilds.json` on the host. That file is not in git, so a pull or a restart keeps those settings. Servers that have never changed them use volume 50, an idle time of 5 minutes, and leave the lock, stay, and rejoin off.

## PebbleHost

Upload the **contents** of this folder so `index.js` and `package.json` are at the top of the file manager. Do not upload `node_modules`.

1. In the panel, set the Node.js version to **22.12 or newer**. Voice will not connect on older Node.
2. Set the start file to `index.js` (this matches `"main"` in `package.json`).
3. Add environment variables:
   - `DISCORD_TOKEN` — required
   - `STREAM_URL` — optional, defaults to `https://zonam1.ddns.net:8400/;`
   - `DEFAULT_VOLUME` — optional, defaults to `50`
4. Start the server. The panel installs dependencies from `package.json`. The console should show a login line, ffmpeg version, and both a global and a guild command registration.
   - `COMMAND_GUILD_ID` — optional. Defaults to the Zona M1 server so new commands show up there immediately. Set it to `off` to skip that.

Global commands can take up to an hour to show up in every server. The server in `COMMAND_GUILD_ID` gets the same commands immediately. That server may list each command twice once the global copies arrive. Both copies do the same thing.

Invite the bot with the `bot` and `applications.commands` scopes, and grant **View Channel**, **Connect**, and **Speak**. Replace `CLIENT_ID` with the application id:

```text
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=3146752&scope=bot%20applications.commands
```

In the Developer Portal you do **not** need the privileged member, presence, or message-content intents. The bot requests `Guilds` and `GuildVoiceStates` only.

ffmpeg decodes the station to 48 kHz stereo PCM. Node.js opens the stream itself, because the bundled ffmpeg build crashes if it connects to this HTTPS station directly. Song titles are read from the station's `/stats?json=1` page. Reconnects are handled by the bot, not by ffmpeg.

## Local

```bash
cp .env.example .env
# edit DISCORD_TOKEN
npm install
npm start
```

`npm test` checks volume parsing, empty-channel counting, and reconnect delays.
