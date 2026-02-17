
/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
*/

/**
 * Decodes Base64 string to an ArrayBuffer.
 */
export function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binaryString = window.atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

/**
 * Helper to write a string to a DataView.
 */
function writeString(view: DataView, offset: number, string: string): void {
  for (let i = 0; i < string.length; i++) {
    view.setUint8(offset + i, string.charCodeAt(i));
  }
}

/**
 * Converts raw PCM16 data to a WAV file Blob.
 * Necessary because standard Web Audio API decodeAudioData often fails on raw PCM without headers.
 */
export function pcmToWav(pcmData: ArrayBuffer, sampleRate: number = 24000): Blob {
  const pcm16 = new Int16Array(pcmData);
  const numSamples = pcm16.length;
  const numChannels = 1;
  const bytesPerSample = 2; // 16-bit PCM
  const blockAlign = numChannels * bytesPerSample;
  const byteRate = sampleRate * blockAlign;
  const dataSize = numSamples * blockAlign;
  const wavHeaderSize = 44;
  const totalSize = wavHeaderSize + dataSize;

  const buffer = new ArrayBuffer(totalSize);
  const view = new DataView(buffer);

  // RIFF chunk descriptor
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true); // totalSize - 8
  writeString(view, 8, 'WAVE');

  // fmt sub-chunk
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true); // Subchunk1Size (16 for PCM)
  view.setUint16(20, 1, true); // AudioFormat (1 for PCM)
  view.setUint16(22, numChannels, true); // NumChannels
  view.setUint32(24, sampleRate, true); // SampleRate
  view.setUint32(28, byteRate, true); // ByteRate
  view.setUint16(32, blockAlign, true); // BlockAlign
  view.setUint16(34, 16, true); // BitsPerSample

  // data sub-chunk
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true); // Subchunk2Size

  // Write PCM data
  let offset = 44;
  for (let i = 0; i < numSamples; i++, offset += 2) {
    view.setInt16(offset, pcm16[i], true);
  }

  return new Blob([view], { type: 'audio/wav' });
}

/**
 * Concatenates an array of AudioBuffers into a single AudioBuffer.
 */
export function concatenateAudioBuffers(buffers: AudioBuffer[], context: AudioContext): AudioBuffer {
  if (buffers.length === 0) {
    return context.createBuffer(1, 1, 24000);
  }
  
  const totalLength = buffers.reduce((acc, buf) => acc + buf.length, 0);
  const result = context.createBuffer(
    buffers[0].numberOfChannels,
    totalLength,
    buffers[0].sampleRate
  );

  for (let i = 0; i < buffers[0].numberOfChannels; i++) {
    const channelData = result.getChannelData(i);
    let offset = 0;
    for (const buffer of buffers) {
      channelData.set(buffer.getChannelData(i), offset);
      offset += buffer.length;
    }
  }

  return result;
}

/**
 * Converts an AudioBuffer to a WAV Blob.
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  
  const blockAlign = numChannels * (bitDepth / 8);
  const byteRate = sampleRate * blockAlign;
  const dataSize = buffer.length * blockAlign;
  const headerSize = 44;
  const totalSize = headerSize + dataSize;
  
  const arrayBuffer = new ArrayBuffer(totalSize);
  const view = new DataView(arrayBuffer);
  
  writeString(view, 0, 'RIFF');
  view.setUint32(4, totalSize - 8, true);
  writeString(view, 8, 'WAVE');
  writeString(view, 12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(view, 36, 'data');
  view.setUint32(40, dataSize, true);
  
  const offset = 44;
  if (numChannels === 1) {
    const channelData = buffer.getChannelData(0);
    for (let i = 0; i < channelData.length; i++) {
      const sample = Math.max(-1, Math.min(1, channelData[i]));
      view.setInt16(offset + i * 2, sample < 0 ? sample * 32768 : sample * 32767, true);
    }
  } else {
    // Interleave channels if stereo
    const channels = [];
    for (let i = 0; i < numChannels; i++) {
      channels.push(buffer.getChannelData(i));
    }
    for (let i = 0; i < buffer.length; i++) {
      for (let channel = 0; channel < numChannels; channel++) {
        const sample = Math.max(-1, Math.min(1, channels[channel][i]));
        const sampleIndex = (i * numChannels + channel) * 2;
        view.setInt16(offset + sampleIndex, sample < 0 ? sample * 32768 : sample * 32767, true);
      }
    }
  }
  
  return new Blob([arrayBuffer], { type: 'audio/wav' });
}
