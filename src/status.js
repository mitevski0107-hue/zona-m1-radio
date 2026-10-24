"use strict";

function formatRemaining(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatStatus({ channelName, volume, idleMinutes, idleRemainingMs, playing, reconnecting, active, title }) {
  let where;
  if (!active) where = "Not in a voice channel.";
  else if (reconnecting) where = `In ${channelName}, but the audio dropped. Reconnecting.`;
  else if (playing) where = `Streaming in ${channelName}.`;
  else where = `In ${channelName}, starting the stream.`;

  const song = title ? `Now playing: ${title}.` : "No song title yet.";
  const idle =
    active && idleRemainingMs != null
      ? `Channel is empty, leaving in ${formatRemaining(idleRemainingMs)}.`
      : `Leaves after ${idleMinutes} minute${idleMinutes === 1 ? "" : "s"} of an empty channel.`;

  return `${where} Volume is ${volume}. ${song} ${idle}`;
}

module.exports = { formatRemaining, formatStatus };
