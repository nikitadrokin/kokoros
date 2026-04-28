export const SPEECH_STREAM_CHUNK_EVENT = 'speech-stream-chunk';
export const FLOAT_SAMPLE_BYTES = 4;
export const WAV_HEADER_BYTES = 44;

export const base64ToBytes = (base64: string) => {
  const decoded = window.atob(base64);
  return Uint8Array.from(decoded, (char) => char.charCodeAt(0));
};

const writeAscii = (view: DataView, offset: number, value: string) => {
  for (let index = 0; index < value.length; index += 1) {
    view.setUint8(offset + index, value.charCodeAt(index));
  }
};

export const createFloatWavBlobUrl = (
  audioChunks: Uint8Array[],
  sampleRate: number,
  channels: number,
) => {
  const dataBytes = audioChunks.reduce(
    (totalBytes, chunk) => totalBytes + chunk.byteLength,
    0,
  );
  const wavBytes = new Uint8Array(WAV_HEADER_BYTES + dataBytes);
  const view = new DataView(wavBytes.buffer);
  const blockAlign = channels * FLOAT_SAMPLE_BYTES;
  const byteRate = sampleRate * blockAlign;

  writeAscii(view, 0, 'RIFF');
  view.setUint32(4, 36 + dataBytes, true);
  writeAscii(view, 8, 'WAVE');
  writeAscii(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 3, true);
  view.setUint16(22, channels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 32, true);
  writeAscii(view, 36, 'data');
  view.setUint32(40, dataBytes, true);

  let offset = WAV_HEADER_BYTES;
  for (const chunk of audioChunks) {
    wavBytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  return URL.createObjectURL(new Blob([wavBytes], { type: 'audio/wav' }));
};

/**
 * Estimates the total audio duration in seconds for a given text and TTS speed.
 * Uses ~2.5 words/second at 1x as the baseline (≈150 wpm), scaled by `speed`.
 */
export function estimateAudioDurationSec(text: string, speed = 1): number {
  const wordCount = text.trim().split(/\s+/).filter(Boolean).length;
  const wordsPerSecond = 2.5 * Math.max(speed, 0.1);
  return Math.max(wordCount / wordsPerSecond, 0.1);
}

/** Formats a duration in seconds as `m:ss`. */
export function formatDuration(sec: number): string {
  const s = Math.max(Math.floor(sec), 0);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export const createStreamId = () =>
  globalThis.crypto?.randomUUID?.() ??
  `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;

export const revokeBlobUrl = (url: string) => {
  if (url.startsWith('blob:')) {
    URL.revokeObjectURL(url);
  }
};
