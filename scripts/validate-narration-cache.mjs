import fs from 'node:fs';
import path from 'node:path';

const outputDir = path.resolve(process.env.NARRATION_OUTPUT_DIR || 'media/narration');
const manifestPath = path.resolve(process.env.NARRATION_MANIFEST || 'media/narration-timing.json');
const rawSegments = process.env.NARRATION_SEGMENTS_JSON?.trim();
const expectedVoiceId = process.env.ELEVENLABS_VOICE_ID?.trim();
const expectedModelId = process.env.ELEVENLABS_MODEL_ID?.trim() || 'eleven_multilingual_v2';

if (!rawSegments) throw new Error('NARRATION_SEGMENTS_JSON is required to validate narration media.');
const expectedSegments = JSON.parse(rawSegments);
if (!Array.isArray(expectedSegments) || expectedSegments.length !== 6) {
  throw new Error('Expected exactly six narration segments.');
}
if (!fs.existsSync(manifestPath)) throw new Error(`Narration manifest is missing: ${manifestPath}`);

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (manifest.voiceId !== expectedVoiceId) throw new Error('Cached narration voice does not match the requested voice.');
if (manifest.modelId !== expectedModelId) throw new Error('Cached narration model does not match the requested model.');
if (!Array.isArray(manifest.scenes) || manifest.scenes.length !== 6) {
  throw new Error('Cached narration manifest must contain exactly six scenes.');
}

for (let index = 0; index < 6; index += 1) {
  const expectedId = `scene-${String(index + 1).padStart(2, '0')}`;
  const expectedText = (typeof expectedSegments[index] === 'string'
    ? expectedSegments[index]
    : expectedSegments[index]?.text)?.trim();
  const scene = manifest.scenes[index];
  if (scene?.id !== expectedId) throw new Error(`Cached narration scene ${index + 1} must use id ${expectedId}.`);
  if (scene.text !== expectedText) throw new Error(`Cached narration text does not match ${expectedId}.`);
  if (scene.file !== `narration/${expectedId}.mp3`) throw new Error(`Cached narration file path is invalid for ${expectedId}.`);
  if (!Number.isFinite(scene.durationSeconds) || scene.durationSeconds <= 0) throw new Error(`${expectedId} has no valid duration.`);
  if (!Number.isFinite(scene.firstSpeechSeconds) || scene.firstSpeechSeconds < 0) throw new Error(`${expectedId} has no valid speech start.`);
  if (!Number.isFinite(scene.lastSpeechSeconds) || scene.lastSpeechSeconds <= scene.firstSpeechSeconds || scene.lastSpeechSeconds > scene.durationSeconds + 0.1) {
    throw new Error(`${expectedId} has an invalid speech window.`);
  }
  if (!Array.isArray(scene.words) || scene.words.length === 0) throw new Error(`${expectedId} has no word timestamps.`);
  let previousEnd = 0;
  for (const word of scene.words) {
    if (!word.word || !Number.isFinite(word.startSeconds) || !Number.isFinite(word.endSeconds)) throw new Error(`${expectedId} contains an invalid word timestamp.`);
    if (word.startSeconds < previousEnd - 0.05 || word.endSeconds < word.startSeconds || word.endSeconds > scene.durationSeconds + 0.1) {
      throw new Error(`${expectedId} word timestamps are not monotonic or exceed the clip duration.`);
    }
    previousEnd = word.endSeconds;
  }
  const audioPath = path.join(outputDir, `${expectedId}.mp3`);
  if (!fs.existsSync(audioPath) || fs.statSync(audioPath).size < 1024) throw new Error(`Cached narration audio is missing or too small: ${expectedId}.mp3`);
}

console.log(`Validated six narration clips and timestamp data from ${manifestPath}`);
