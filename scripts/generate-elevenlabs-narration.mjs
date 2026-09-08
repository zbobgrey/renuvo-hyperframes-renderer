import fs from 'node:fs';
import path from 'node:path';

const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const text = process.env.NARRATION_TEXT?.trim();
const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';
const outputPath = path.resolve(process.env.NARRATION_OUTPUT || 'media/narration.mp3');

if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured as a GitHub Actions repository secret.');
if (!text || text.length > 1600) throw new Error('NARRATION_TEXT must contain 1-1600 characters.');
const retiredCopy = ['Turn regular customers', 'into recurring revenue'].join(' ');
if (text.toLowerCase().includes(retiredCopy.toLowerCase())) {
  throw new Error('NARRATION_TEXT contains retired Renuvo marketing copy.');
}
if (!/^[A-Za-z0-9_-]{8,64}$/.test(voiceId || '')) throw new Error('ELEVENLABS_VOICE_ID is invalid.');
if (!/^[A-Za-z0-9_-]{3,80}$/.test(modelId)) throw new Error('ELEVENLABS_MODEL_ID is invalid.');

const response = await fetch(
  `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=mp3_44100_128`,
  {
    method: 'POST',
    headers: {
      Accept: 'audio/mpeg',
      'Content-Type': 'application/json',
      'xi-api-key': apiKey,
    },
    body: JSON.stringify({
      text,
      model_id: modelId,
      seed: 270907,
      apply_text_normalization: 'on',
      voice_settings: {
        stability: 0.62,
        similarity_boost: 0.82,
        style: 0.08,
        use_speaker_boost: true,
        speed: 1.08,
      },
    }),
  },
);

if (!response.ok) {
  const detail = (await response.text()).slice(0, 600);
  throw new Error(`ElevenLabs text-to-speech failed: HTTP ${response.status} ${detail}`);
}

const audio = Buffer.from(await response.arrayBuffer());
if (audio.length < 1024) throw new Error('ElevenLabs returned an unexpectedly small audio response.');
fs.mkdirSync(path.dirname(outputPath), { recursive: true });
fs.writeFileSync(outputPath, audio);
console.log(`Generated ElevenLabs narration (${audio.length} bytes) at ${outputPath}`);
