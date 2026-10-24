"use strict";

function formatRemaining(ms) {
  const seconds = Math.max(1, Math.ceil(ms / 1000));
  if (seconds < 60) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  const minutes = Math.ceil(seconds / 60);
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function formatStatus({
  channelName,
  volume,
  idleMinutes,
  idleRemainingMs,
  playing,
  reconnecting,
  active,
  title,
  stay = false,
  listeners = null,
}) {
  let where;
  if (!active) where = "Not in a voice channel.";
  else if (reconnecting) where = `In ${channelName}, but the audio dropped. Reconnecting.`;
  else if (playing) where = `Streaming in ${channelName}.`;
  else where = `In ${channelName}, starting the stream.`;

  const song = title ? `Now playing: ${title}.` : "No song title yet.";
  const audience =
    listeners == null ? "" : ` Zona M1 has ${listeners} listener${listeners === 1 ? "" : "s"}.`;
  let idle;
  if (stay) idle = "Stays in an empty channel until someone uses /leave.";
  else if (active && idleRemainingMs != null) idle = `Channel is empty, leaving in ${formatRemaining(idleRemainingMs)}.`;
  else idle = `Leaves after ${idleMinutes} minute${idleMinutes === 1 ? "" : "s"} of an empty channel.`;

  return `${where} Volume is ${volume}. ${song}${audience} ${idle}`;
}

module.exports = { formatRemaining, formatStatus };
