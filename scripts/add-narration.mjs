#!/usr/bin/env node

/**
 * TabVault Demo Post-Processor: Voice Narration (ElevenLabs TTS)
 *
 * Reads demo-popup.mp4 + demo-timings.json, generates TTS narration via
 * ElevenLabs API, positions audio clips at correct timestamps with ffmpeg,
 * and merges everything into demo-final.mp4.
 *
 * Prerequisites:
 *   - ELEVENLABS_API_KEY environment variable (required)
 *   - demo-popup.mp4 (from demo:record)
 *   - demo-timings.json (from demo:record)
 *   - ffmpeg installed
 *
 * Usage: npm run demo:narrate
 *   or:  ELEVENLABS_API_KEY=sk_xxx node scripts/add-narration.mjs
 *   or:  node scripts/add-narration.mjs --force   (regenerate all TTS clips)
 *
 * Output: demo-final.mp4
 */

import path from 'path';
import fs from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const TEMP_DIR = path.resolve(ROOT, '.demo-temp');
const TTS_DIR = path.resolve(TEMP_DIR, 'tts');
const INPUT_VIDEO = path.resolve(ROOT, 'demo-popup.mp4');
const TIMINGS_FILE = path.resolve(ROOT, 'demo-timings.json');
const OUTPUT_VIDEO = path.resolve(ROOT, 'demo-final.mp4');

// ===== ElevenLabs Config =====
const ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVENLABS_API_KEY) {
  console.error('❌ Missing ELEVENLABS_API_KEY environment variable.');
  console.error('   Usage: ELEVENLABS_API_KEY=sk_xxx npm run demo:narrate');
  process.exit(1);
}
const VOICE_ID = process.env.ELEVENLABS_VOICE_ID || 'SAz9YHcvj6GT2YYXdXww'; // "River" — relaxed, neutral, informative
const MODEL_ID = 'eleven_multilingual_v2';

const FORCE = process.argv.includes('--force');

// ===== Scene Narration Text (English) =====
const NARRATIONS = {
  empty_state:     'Here\'s TabVault — a simple way to save and restore all your browser tabs.',
  save_frontend:   'Let\'s try it out. Hit save, give it a name, and that\'s it.',
  expand_collapse: 'You can expand any workspace to see exactly what\'s inside.',
  restore:         'Now watch this — we\'ll close everything, then bring it all back with one click.',
  save_backend:    'You can create different workspaces for each project you\'re working on.',
  save_design:     'On the free plan, you get up to three saved workspaces.',
  expand_multiple: 'And check this out — all your tab groups are perfectly preserved. Colors, names, everything.',
  search:          'Got a lot of workspaces? Just type to find what you need.',
  rename:          'Renaming is easy — just click the pencil icon and type away.',
  settings:        'There are a few handy settings here, like lazy loading to save memory, and auto-close on restore.',
  limit_warning:   'Try saving a fourth one and you\'ll hit the free plan limit.',
  pro_activation:  'Pro is a one-time purchase for just two dollars. Pop in your license key and you\'re good to go.',
  post_pro_save:   'Now with Pro, there\'s no limit. Save as many workspaces as you want.',
  pro_settings:    'Pro also gives you automatic backups, plus export and import.',
  delete:          'And when you\'re done with a workspace, just delete it.',
  end:             'That\'s TabVault — simple, fast tab management for Chrome.',
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// =====================================================
// TTS GENERATION
// =====================================================

async function generateSpeech(text, outputPath) {
  // Skip if cached file exists (unless --force)
  if (!FORCE && fs.existsSync(outputPath) && fs.statSync(outputPath).size > 0) {
    console.log(`  ♻ Cached: ${path.basename(outputPath)}`);
    return;
  }

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${VOICE_ID}`,
    {
      method: 'POST',
      headers: {
        'xi-api-key': ELEVENLABS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        model_id: MODEL_ID,
        output_format: 'mp3_44100_128',
        voice_settings: {
          stability: 0.50,
          similarity_boost: 0.80,
          style: 0.40,
          use_speaker_boost: true,
        },
      }),
    }
  );

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ElevenLabs API error ${response.status}: ${err}`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);
  console.log(`  ✓ Generated: ${path.basename(outputPath)} (${(buffer.length / 1024).toFixed(0)} KB)`);
}

async function generateAllNarrations(scenes) {
  console.log('\n🎙️  Generating TTS narration clips...\n');

  for (const scene of scenes) {
    const text = NARRATIONS[scene.id];
    if (!text) {
      console.log(`  ⏭ Skipped: ${scene.id} (no narration text)`);
      continue;
    }

    const outputPath = path.resolve(TTS_DIR, `${scene.id}.mp3`);
    try {
      await generateSpeech(text, outputPath);
    } catch (err) {
      console.error(`  ✗ Failed: ${scene.id} — ${err.message}`);
    }

    // Small delay between API calls to avoid rate limits
    await sleep(200);
  }
}

// =====================================================
// AUDIO DURATION
// =====================================================

function getAudioDuration(filePath) {
  try {
    const output = execSync(
      `ffprobe -v error -show_entries format=duration -of csv=p=0 "${filePath}"`,
      { encoding: 'utf8' }
    );
    return parseFloat(output.trim());
  } catch {
    return 0;
  }
}

// =====================================================
// AUDIO ASSEMBLY (adelay + amix)
// =====================================================

function buildAudioTrack(scenes, totalDuration) {
  console.log('\n🔊 Building combined audio track...\n');

  // Collect available clips with their timing
  const clips = [];
  for (const scene of scenes) {
    const clipPath = path.resolve(TTS_DIR, `${scene.id}.mp3`);
    if (!fs.existsSync(clipPath) || fs.statSync(clipPath).size === 0) continue;

    const duration = getAudioDuration(clipPath);
    const delayMs = Math.round(scene.startTime * 1000);
    const maxDur = scene.duration || 999; // scene duration limit
    const trimmed = duration > maxDur;

    clips.push({ id: scene.id, path: clipPath, delayMs, duration, maxDur });
    console.log(`  ${scene.id}: start=${scene.startTime.toFixed(2)}s, audio=${duration.toFixed(2)}s${trimmed ? ` (trimmed→${maxDur.toFixed(2)}s)` : ''}`);
  }

  if (clips.length === 0) {
    console.error('  ✗ No audio clips found!');
    return null;
  }

  // Build ffmpeg command with adelay + amix
  const combinedPath = path.resolve(TEMP_DIR, 'combined-audio.mp3');
  const inputs = clips.map(c => `-i "${c.path}"`).join(' ');

  // Build filter: trim to scene duration, apply adelay, then amix all
  const filters = clips.map((c, i) => {
    // atrim prevents audio from bleeding into the next scene
    const trim = c.duration > c.maxDur ? `atrim=duration=${c.maxDur},afade=t=out:st=${Math.max(0, c.maxDur - 0.3)}:d=0.3,` : '';
    return `[${i}]${trim}adelay=${c.delayMs}|${c.delayMs},volume=1.0[a${i}]`;
  });

  const mixInputs = clips.map((_, i) => `[a${i}]`).join('');
  const mixFilter = `${mixInputs}amix=inputs=${clips.length}:duration=longest:normalize=0[out]`;

  const filterComplex = [...filters, mixFilter].join(';');

  const cmd = [
    'ffmpeg -y',
    inputs,
    `-filter_complex "${filterComplex}"`,
    '-map "[out]"',
    `-t ${totalDuration}`,
    '-ar 44100 -ac 1',
    `"${combinedPath}"`,
  ].join(' ');

  console.log(`\n  Running ffmpeg (${clips.length} clips)...`);

  try {
    execSync(cmd, { stdio: 'pipe', cwd: ROOT });
  } catch (err) {
    console.error(`  ✗ ffmpeg audio assembly failed: ${err.stderr?.toString() || err.message}`);
    return null;
  }

  const size = (fs.statSync(combinedPath).size / 1024).toFixed(0);
  console.log(`  ✓ Combined audio: ${size} KB`);
  return combinedPath;
}

// =====================================================
// VIDEO MERGE
// =====================================================

function mergeVideoAudio(videoPath, audioPath) {
  console.log('\n🎬 Merging video + audio...\n');

  const cmd = [
    'ffmpeg -y',
    `-i "${videoPath}"`,
    `-i "${audioPath}"`,
    '-c:v copy',         // Copy video stream (no re-encode)
    '-c:a aac -b:a 128k', // Encode audio as AAC
    '-map 0:v:0 -map 1:a:0', // Use video duration (don't truncate if audio is shorter)
    `"${OUTPUT_VIDEO}"`,
  ].join(' ');

  try {
    execSync(cmd, { stdio: 'pipe', cwd: ROOT });
  } catch (err) {
    console.error(`  ✗ ffmpeg merge failed: ${err.stderr?.toString() || err.message}`);
    return false;
  }

  return true;
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log('=== TabVault Demo Post-Processor (Voice Narration) ===\n');

  // Validate inputs
  if (!ELEVENLABS_API_KEY) {
    console.error('✗ ELEVENLABS_API_KEY not set. Set it as environment variable or edit the script.');
    process.exit(1);
  }

  if (!fs.existsSync(INPUT_VIDEO)) {
    console.error(`✗ Input video not found: ${INPUT_VIDEO}`);
    console.error('  Run "npm run demo:record" first.');
    process.exit(1);
  }

  if (!fs.existsSync(TIMINGS_FILE)) {
    console.error(`✗ Timings file not found: ${TIMINGS_FILE}`);
    console.error('  Run "npm run demo:record" first (the updated version emits demo-timings.json).');
    process.exit(1);
  }

  // Create temp directories
  fs.mkdirSync(TTS_DIR, { recursive: true });

  // Read timings
  const timings = JSON.parse(fs.readFileSync(TIMINGS_FILE, 'utf8'));
  console.log(`📊 Video duration: ${timings.totalDuration.toFixed(2)}s, ${timings.scenes.length} scenes`);

  // Step 1: Generate TTS clips
  await generateAllNarrations(timings.scenes);

  // Step 2: Build combined audio track
  const audioPath = buildAudioTrack(timings.scenes, timings.totalDuration);
  if (!audioPath) {
    console.error('\n✗ Audio assembly failed. Aborting.');
    process.exit(1);
  }

  // Step 3: Merge video + audio
  const success = mergeVideoAudio(INPUT_VIDEO, audioPath);
  if (!success) {
    console.error('\n✗ Video merge failed. Aborting.');
    process.exit(1);
  }

  // Report
  if (fs.existsSync(OUTPUT_VIDEO)) {
    const size = (fs.statSync(OUTPUT_VIDEO).size / 1024).toFixed(0);
    console.log(`\n✅ Final video: ${OUTPUT_VIDEO} (${size} KB)`);
    console.log('   Includes: subtitles (burned in) + voice narration (English TTS)');
  }
}

main().catch((err) => {
  console.error('Error:', err.message);
  console.error(err.stack);
  process.exit(1);
});
