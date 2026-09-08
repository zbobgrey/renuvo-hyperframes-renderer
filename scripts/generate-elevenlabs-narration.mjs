import fs from 'node:fs';
import path from 'node:path';

const apiKey = process.env.ELEVENLABS_API_KEY?.trim();
const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';
const outputDir = path.resolve(process.env.NARRATION_OUTPUT_DIR || 'media/narration');
const manifestPath = path.resolve(process.env.NARRATION_MANIFEST || 'media/narration-timing.json');
const rawSegments = process.env.NARRATION_SEGMENTS_JSON?.trim();

if (!apiKey) throw new Error('ELEVENLABS_API_KEY is not configured as a GitHub Actions repository secret.');
if (!/^[A-Za-z0-9_-]{8,64}$/.test(voiceId || '')) throw new Error('ELEVENLABS_VOICE_ID is invalid.');
if (!/^[A-Za-z0-9_-]{3,80}$/.test(modelId)) throw new Error('ELEVENLABS_MODEL_ID is invalid.');
if (!rawSegments || rawSegments.length > 4000) throw new Error('NARRATION_SEGMENTS_JSON must contain 1-4000 characters.');

let inputSegments;
try {
  inputSegments = JSON.parse(rawSegments);
} catch {
  throw new Error('NARRATION_SEGMENTS_JSON is not valid JSON.');
}

if (!Array.isArray(inputSegments) || inputSegments.length !== 6) {
  throw new Error('NARRATION_SEGMENTS_JSON must contain exactly six scene segments.');
}

const segments = inputSegments.map((segment, index) => {
  const expectedId = `scene-${String(index + 1).padStart(2, '0')}`;
  const id = typeof segment === 'string' ? expectedId : segment?.id;
  const text = (typeof segment === 'string' ? segment : segment?.text)?.trim();
  if (id !== expectedId) throw new Error(`Narration segment ${index + 1} must use id ${expectedId}.`);
  if (!text || text.length > 500) throw new Error(`${expectedId} narration must contain 1-500 characters.`);
  return { id, text };
});

const combinedText = segments.map(({ text }) => text).join(' ');
const retiredCopy = ['Turn regular customers', 'into recurring revenue'].join(' ');
if (combinedText.length > 1600) throw new Error('Combined narration exceeds 1600 characters.');
if (combinedText.toLowerCase().includes(retiredCopy.toLowerCase())) {
  throw new Error('Narration contains retired Renuvo marketing copy.');
}

function round(value) {
  return Number(value.toFixed(3));
}

function alignmentToWords(alignment) {
  const characters = alignment.characters;
  const starts = alignment.character_start_times_seconds;
  const ends = alignment.character_end_times_seconds;
  const source = characters.join('');
  const words = [];
  for (const match of source.matchAll(/\S+/g)) {
    const first = match.index;
    const last = first + match[0].length - 1;
    words.push({
      word: match[0],
      startSeconds: round(starts[first]),
      endSeconds: round(ends[last]),
    });
  }
  return words;
}

fs.mkdirSync(outputDir, { recursive: true });
const generated = [];

for (const [index, segment] of segments.entries()) {
  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}/with-timestamps?output_format=mp3_44100_128`,
    {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        'xi-api-key': apiKey,
      },
      body: JSON.stringify({
        text: segment.text,
        model_id: modelId,
        seed: 270907 + index,
        previous_text: index > 0 ? segments[index - 1].text : undefined,
        next_text: index < segments.length - 1 ? segments[index + 1].text : undefined,
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
    throw new Error(`ElevenLabs timing generation failed for ${segment.id}: HTTP ${response.status} ${detail}`);
  }

  const payload = await response.json();
  const alignment = payload.alignment || payload.normalized_alignment;
  const characters = alignment?.characters;
  const starts = alignment?.character_start_times_seconds;
  const ends = alignment?.character_end_times_seconds;
  if (!payload.audio_base64 || !Array.isArray(characters) || !Array.isArray(starts) || !Array.isArray(ends)) {
    throw new Error(`ElevenLabs returned no usable audio alignment for ${segment.id}.`);
  }
  if (!characters.length || characters.length !== starts.length || starts.length !== ends.length) {
    throw new Error(`ElevenLabs returned inconsistent alignment arrays for ${segment.id}.`);
  }

  const audio = Buffer.from(payload.audio_base64, 'base64');
  if (audio.length < 1024) throw new Error(`ElevenLabs returned an unexpectedly small audio response for ${segment.id}.`);
  const file = `${segment.id}.mp3`;
  fs.writeFileSync(path.join(outputDir, file), audio);

  const firstSpokenIndex = characters.findIndex((character) => /\S/.test(character));
  let lastSpokenIndex = characters.length - 1;
  while (lastSpokenIndex >= 0 && !/\S/.test(characters[lastSpokenIndex])) lastSpokenIndex -= 1;
  const firstSpeechSeconds = round(starts[Math.max(0, firstSpokenIndex)]);
  const lastSpeechSeconds = round(ends[Math.max(0, lastSpokenIndex)]);
  generated.push({
    id: segment.id,
    text: segment.text,
    file: `narration/${file}`,
    durationSeconds: round(Math.max(...ends)),
    firstSpeechSeconds,
    lastSpeechSeconds,
    words: alignmentToWords(alignment),
  });
  console.log(`${segment.id}: ${lastSpeechSeconds.toFixed(3)}s, ${audio.length} bytes, ${generated.at(-1).words.length} aligned words`);
}

const manifest = {
  provider: 'ElevenLabs',
  endpoint: 'text-to-speech/with-timestamps',
  voiceId,
  modelId,
  generatedAt: new Date().toISOString(),
  scenes: generated,
};
fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`Generated six timestamp-aligned narration clips and ${manifestPath}`);
