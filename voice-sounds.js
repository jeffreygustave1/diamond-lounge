// Diamond Lounge voice presence WAV sound assets, generated locally in-browser.
function makeWavDataUri(frequencies, duration = 0.28, sampleRate = 22050) {
  const count = Math.floor(sampleRate * duration);
  const pcm = new Uint8Array(count * 2);
  const view = new DataView(pcm.buffer);
  for (let i = 0; i < count; i++) {
    const t = i / sampleRate;
    const envelope = Math.min(1, t / 0.012) * Math.max(0, 1 - t / duration) * Math.exp(-t * 5);
    const value = frequencies.reduce((sum, f) => sum + Math.sin(2 * Math.PI * f * t), 0) / frequencies.length;
    view.setInt16(i * 2, Math.max(-32768, Math.min(32767, Math.round(32767 * 0.22 * envelope * value))), true);
  }
  const header = new ArrayBuffer(44), h = new DataView(header);
  const put = (offset, text) => [...text].forEach((c, i) => h.setUint8(offset + i, c.charCodeAt(0)));
  put(0, "RIFF"); h.setUint32(4, 36 + pcm.length, true); put(8, "WAVE"); put(12, "fmt ");
  h.setUint32(16, 16, true); h.setUint16(20, 1, true); h.setUint16(22, 1, true);
  h.setUint32(24, sampleRate, true); h.setUint32(28, sampleRate * 2, true); h.setUint16(32, 2, true); h.setUint16(34, 16, true);
  put(36, "data"); h.setUint32(40, pcm.length, true);
  let binary = ""; for (const b of new Uint8Array(header)) binary += String.fromCharCode(b);
  for (const b of pcm) binary += String.fromCharCode(b);
  return "data:audio/wav;base64," + btoa(binary);
}
const voiceJoinAsset = [makeWavDataUri([520, 1040]), makeWavDataUri([760, 1520])];
const voiceLeaveAsset = [makeWavDataUri([760, 1520]), makeWavDataUri([520, 1040])];
export function playVoicePresenceSound(type = "join") {
  try {
    const sounds = type === "leave" ? voiceLeaveAsset : voiceJoinAsset;
    sounds.forEach((src, i) => {
      const audio = new Audio(src); audio.volume = 0.7;
      if (i === 0) audio.onended = () => { const next = new Audio(sounds[1]); next.volume = 0.7; next.play().catch(e => console.warn("Voice sound playback blocked:", e)); };
      if (i === 0) audio.play().catch(e => console.warn("Voice sound playback blocked:", e));
    });
  } catch (e) { console.warn("Voice sound playback failed:", e); }
}
window.diamondTestVoicePresenceSound = (type = "join") => playVoicePresenceSound(type);
