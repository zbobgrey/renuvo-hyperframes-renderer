import fs from 'node:fs';
import path from 'node:path';

const htmlPath = path.resolve(process.env.COMPOSITION_HTML || process.argv[2] || 'index.html');
const manifestPath = path.resolve(process.env.NARRATION_MANIFEST || process.argv[3] || 'media/narration-timing.json');
const timingOutputPath = path.resolve(process.env.RENDER_TIMING_OUTPUT || path.join(path.dirname(manifestPath), 'render-timing.json'));
const motionPath = path.resolve(process.env.MOTION_MANIFEST || htmlPath.replace(/\.html$/i, '.motion.json'));
const totalDuration = 37;
const prePostPadding = 0.8;

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
if (!Array.isArray(manifest.scenes) || manifest.scenes.length !== 6) {
  throw new Error('Narration manifest must contain exactly six scenes.');
}

const requiredDurations = manifest.scenes.map((scene, index) => {
  const expectedId = `scene-${String(index + 1).padStart(2, '0')}`;
  if (scene.id !== expectedId) throw new Error(`Expected ${expectedId}, received ${scene.id || 'no id'}.`);
  if (!Number.isFinite(scene.lastSpeechSeconds) || scene.lastSpeechSeconds <= 0) {
    throw new Error(`${scene.id} has no valid ElevenLabs speech duration.`);
  }
  return scene.lastSpeechSeconds + prePostPadding;
});

const requiredTotal = requiredDurations.reduce((sum, duration) => sum + duration, 0);
if (requiredTotal > totalDuration) {
  throw new Error(`Narration needs ${requiredTotal.toFixed(3)}s including breathing room, exceeding the ${totalDuration}s composition.`);
}

const extra = totalDuration - requiredTotal;
const weights = manifest.scenes.map((scene) => scene.lastSpeechSeconds + 1);
const weightTotal = weights.reduce((sum, weight) => sum + weight, 0);
const durations = requiredDurations.map((duration, index) => duration + extra * (weights[index] / weightTotal));

function round(value) {
  return Number(value.toFixed(3));
}

let cursor = 0;
const scenes = manifest.scenes.map((scene, index) => {
  const start = round(cursor);
  const duration = index === manifest.scenes.length - 1 ? round(totalDuration - start) : round(durations[index]);
  const audioStart = round(start + Math.max(0.3, (duration - scene.lastSpeechSeconds) / 2));
  const speechStart = round(audioStart + scene.firstSpeechSeconds);
  const speechEnd = round(audioStart + scene.lastSpeechSeconds);
  cursor = start + duration;
  return {
    id: scene.id,
    start,
    duration,
    audioStart,
    speechStart,
    speechEnd,
    file: scene.file,
    words: scene.words,
  };
});

const finalEnd = round(scenes.at(-1).start + scenes.at(-1).duration);
if (finalEnd !== totalDuration) throw new Error(`Generated scene timing ends at ${finalEnd}s instead of ${totalDuration}s.`);
for (let index = 1; index < scenes.length; index += 1) {
  const previousEnd = round(scenes[index - 1].start + scenes[index - 1].duration);
  if (scenes[index].start !== previousEnd) throw new Error(`${scenes[index].id} is not contiguous with the previous scene.`);
}

let html = fs.readFileSync(htmlPath, 'utf8');
for (const scene of scenes) {
  const pattern = new RegExp(`(<section id="${scene.id}"[^>]*data-start=")[^"]+(" data-duration=")[^"]+("[^>]*>)`);
  if (!pattern.test(html)) throw new Error(`Could not find timing attributes for ${scene.id}.`);
  html = html.replace(pattern, `$1${scene.start}$2${scene.duration}$3`);
}

const tracks = scenes.map((scene, index) =>
  `      <audio id="${scene.id}-narration" src="media/${scene.file}" data-start="${scene.audioStart}" data-track-index="${20 + index}" data-audio-group="voiceover" data-volume="1"></audio>`,
).join('\n');
const trackPattern = /(<!-- RENUVO_NARRATION_TRACKS_START -->)[\s\S]*?(<!-- RENUVO_NARRATION_TRACKS_END -->)/;
if (!trackPattern.test(html)) throw new Error('Composition narration-track markers are missing.');
html = html.replace(trackPattern, `$1\n${tracks}\n      $2`);

const renderTiming = {
  source: 'ElevenLabs character alignment',
  totalDuration,
  scenes: scenes.map(({ id, start, duration, audioStart, speechStart, speechEnd }) => ({
    id,
    start,
    duration,
    audioStart,
    speechStart,
    speechEnd,
    words: (manifest.scenes.find((scene) => scene.id === id)?.words || []).map((word) => ({
      word: word.word,
      start: round(audioStart + word.startSeconds),
      end: round(audioStart + word.endSeconds),
    })),
  })),
};
const timingPattern = /(<script id="renuvo-timing-data">)window\.__RENUVO_TIMING__\s*=\s*[\s\S]*?;<\/script>/;
if (!timingPattern.test(html)) throw new Error('Composition timing-data script is missing.');
html = html.replace(timingPattern, `$1window.__RENUVO_TIMING__ = ${JSON.stringify(renderTiming)};</script>`);

fs.writeFileSync(htmlPath, html);
fs.writeFileSync(timingOutputPath, `${JSON.stringify({ ...renderTiming, scenes }, null, 2)}\n`);
if (fs.existsSync(motionPath)) {
  const motion = JSON.parse(fs.readFileSync(motionPath, 'utf8'));
  if (Array.isArray(motion.assertions)) {
    const sceneByHeadline = new Map(scenes.map((scene) => [`#${scene.id}-headline`, scene]));
    for (const assertion of motion.assertions) {
      const scene = assertion.kind === 'appearsBy' ? sceneByHeadline.get(assertion.selector) : undefined;
      if (scene) assertion.bySec = round(Math.min(scene.start + scene.duration - 0.2, scene.speechStart + 0.8));
    }
    motion.duration = totalDuration;
    fs.writeFileSync(motionPath, `${JSON.stringify(motion, null, 2)}\n`);
  }
}
console.log('Narration-driven scene timing:');
for (const scene of scenes) {
  console.log(`  ${scene.id} ${scene.start.toFixed(3)}-${(scene.start + scene.duration).toFixed(3)}s; speech ${scene.speechStart.toFixed(3)}-${scene.speechEnd.toFixed(3)}s`);
}
