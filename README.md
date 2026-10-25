# Zona M1 Radio bot

A Discord bot that streams [Zona M1 Radio](https://www.zonam1radio.com.mk) into voice channels. It uses discord.js 14 and `@discordjs/voice` (with DAVE end-to-end voice encryption). Each server gets its own connection, volume, and language.

Replies are **Macedonian** until a server switches with `/settings language:English`. The station name stays Zona M1. Discord has no Macedonian client language, so the slash-command descriptions are written in Macedonian for everyone. The activity type ("Listening to") is translated by Discord itself. The song title, when the station sends one, is shown as the bot's status.

## Commands

Anyone in the server can use these, unless the lock is on. There is no play, stop, pause, or skip. The station is a live stream. `/status` and `/nowplaying` are no longer registered.

| Command | What it does |
| --- | --- |
| `/zona` | Joins the voice channel you are in and starts the radio. If the bot is already in the server, it moves and keeps streaming. This replaced `/join`. |
| `/volume` | Sets this server's volume from 0 to 100. With no number, it replies with the current volume. |
| `/leave` | Disconnects immediately. |
| `/settings` | With no options, shows this server's settings. Options below. |

`/settings` options:

| Option | What it does |
| --- | --- |
| `language` | `\u041c\u0430\u043a\u0435\u0434\u043e\u043d\u0441\u043a\u0438` (default) or `English`. |
| `idle` | Minutes to wait in an empty channel, from 1 to 60. Default 5. |
| `stay` | Stay in an empty channel until `/leave`. |
| `rejoin` | Come back to the last channel after a restart. Off until a server turns it on. |
| `lock` | Only people with Mute Members, or the chosen role, can use `/volume`, `/leave`, and `/settings`. `/zona` stays open. |
| `role` | Extra role that can manage the bot while the lock is on. Pick `@everyone` to remove it. |
| `channel` | Text channel for the current song. Choosing one turns song posts on. |
| `songs` | Turn those posts on or off. The channel is remembered when you turn them off. |

Song posts look like `Сега на Zona M1: Artist - Song (31 слушатели)`. They are sent only when the title changes, and only in servers that turned them on. The bot needs **View Channel** and **Send Messages** in that channel.

If a voice channel empties out, the bot waits that server's idle time, unless stay is on. Anyone joining cancels the timer. If it is still empty when the timer ends, the bot leaves. `/leave` always disconnects, even when stay is on.

If rejoin is on, a restart puts the bot back in the last channel. Shutting the process down does not forget that channel. `/leave` and the idle timeout do.

If the stream dies or Discord drops the voice connection while the bot should still be playing, it rejoins with a delay: 2s, 4s, 8s, 16s, then 30s. The delay resets after the audio has stayed up for 8 seconds.

Volume, idle time, lock, stay, rejoin, language, the song channel, and the control role are saved per server in `data/guilds.json` on the host. That file is not in git. Servers that have never changed anything use volume 50, an idle time of 5 minutes, Macedonian, and leave the lock, stay, rejoin, and song posts off.

An old global `/join`, `/status`, or `/nowplaying` can linger for up to an hour after an update. Using one replies that it is gone and to use `/zona`.

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

Invite the bot with the `bot` and `applications.commands` scopes, and grant **View Channel**, **Send Messages**, **Connect**, and **Speak**. Replace `CLIENT_ID` with the application id:

```text
https://discord.com/oauth2/authorize?client_id=CLIENT_ID&permissions=3148800&scope=bot%20applications.commands
```

If the bot is already in the server, you do not have to re-invite it. Give it Send Messages in the song channel when you want those posts. In the Developer Portal you do **not** need the privileged member, presence, or message-content intents. The bot requests `Guilds` and `GuildVoiceStates` only.

ffmpeg decodes the station to 48 kHz stereo PCM. Node.js opens the stream itself, because the bundled ffmpeg build crashes if it connects to this HTTPS station directly. No-IP renewed the station certificate and the server sends only the leaf, so the bot also trusts the No-IP intermediate in `src/certs/noip-tls-ica.pem`. The hostname and expiry are still checked. Song titles and the listener count are read from the station's `/stats?json=1` page. Titles stay empty until the station fills in `songtitle`. Reconnects are handled by the bot, not by ffmpeg.

## Local

```bash
cp .env.example .env
# edit DISCORD_TOKEN
npm install
npm start
```

`npm test` checks volume parsing, saved settings, Macedonian replies, and the slash-command list.
