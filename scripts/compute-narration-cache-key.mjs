import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const generatorPath = path.join(scriptDir, 'generate-elevenlabs-narration.mjs');
const rawSegments = process.env.NARRATION_SEGMENTS_JSON?.trim();
const voiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
const modelId = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';
const cacheVersion = process.env.NARRATION_CACHE_VERSION?.trim() || 'v1';

if (!rawSegments || rawSegments.length > 4000) throw new Error('NARRATION_SEGMENTS_JSON must contain 1-4000 characters.');
if (!/^[A-Za-z0-9_-]{8,64}$/.test(voiceId || '')) throw new Error('ELEVENLABS_VOICE_ID is invalid.');
if (!/^[A-Za-z0-9_-]{3,80}$/.test(modelId)) throw new Error('ELEVENLABS_MODEL_ID is invalid.');
if (!/^[A-Za-z0-9._-]{1,40}$/.test(cacheVersion)) throw new Error('NARRATION_CACHE_VERSION is invalid.');

let parsedSegments;
try {
  parsedSegments = JSON.parse(rawSegments);
} catch {
  throw new Error('NARRATION_SEGMENTS_JSON is not valid JSON.');
}
if (!Array.isArray(parsedSegments) || parsedSegments.length !== 6) {
  throw new Error('NARRATION_SEGMENTS_JSON must contain exactly six scene segments.');
}

const segments = parsedSegments.map((segment, index) => {
  const expectedId = `scene-${String(index + 1).padStart(2, '0')}`;
  const id = typeof segment === 'string' ? expectedId : segment?.id;
  const text = (typeof segment === 'string' ? segment : segment?.text)?.trim();
  if (id !== expectedId || !text || text.length > 500) throw new Error(`Invalid narration segment ${expectedId}.`);
  return { id, text };
});

const generatorSha256 = crypto.createHash('sha256').update(fs.readFileSync(generatorPath)).digest('hex');
const cacheIdentity = {
  schema: 1,
  cacheVersion,
  generatorSha256,
  voiceId,
  modelId,
  segments,
};
const digest = crypto.createHash('sha256').update(JSON.stringify(cacheIdentity)).digest('hex');
process.stdout.write(`renuvo-narration-v1-${digest}`);
