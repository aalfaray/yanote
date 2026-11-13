// Native text-to-speech fallback using Windows System.Speech (SAPI) through PowerShell.
// Used by the renderer when the Web Speech API exposes no voices.
const { spawn } = require('child_process');
const { getLogger } = require('./logService.cjs');

const log = getLogger('speechService');

// Script adapted from the standalone System.Speech script: picks the first enabled
// Spanish voice (falls back to the default voice), speaks each segment to the default
// audio device and reports progress on stdout ("SEG <index>", then "DONE").
const SPEAK_SCRIPT = `
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$raw = [Console]::In.ReadToEnd()
$json = [System.Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($raw.Trim()))
$req = $json | ConvertFrom-Json
$sintetizador = New-Object System.Speech.Synthesis.SpeechSynthesizer
try {
    $idioma = if ($req.language -eq 'en') { 'en-*' } else { 'es-*' }
    $voz = $sintetizador.GetInstalledVoices() | Where-Object { $_.Enabled -and $_.VoiceInfo.Culture.Name -like $idioma } | Select-Object -First 1
    if ($null -ne $voz) { $sintetizador.SelectVoice($voz.VoiceInfo.Name) }
    $sintetizador.Rate = [int]$req.rate
    $sintetizador.Volume = 100
    $sintetizador.SetOutputToDefaultAudioDevice()
    $i = [int]$req.start
    foreach ($texto in @($req.segments)) {
        [Console]::Out.WriteLine("SEG $i")
        [Console]::Out.Flush()
        $sintetizador.Speak([string]$texto)
        $i++
    }
    [Console]::Out.WriteLine('DONE')
    [Console]::Out.Flush()
} finally {
    $sintetizador.Dispose()
}
`;

/** Maps a Web Speech style rate (0.5 – 2, 1 = normal) to the SAPI range (-10 – 10, 0 = normal). */
function toSapiRate(rate) {
  const value = Number(rate);
  if (!Number.isFinite(value)) return 0;
  return Math.max(-10, Math.min(10, Math.round((value - 1) * 10)));
}

function encodeRequest({ segments, start = 0, rate = 1, language }) {
  const payload = JSON.stringify({ segments, start, rate: toSapiRate(rate), ...(language === 'es' || language === 'en' ? { language } : {}) });
  return Buffer.from(payload, 'utf8').toString('base64');
}

function createSpeechService({ spawnFn = spawn, platform = process.platform } = {}) {
  let current = null;

  function stop() {
    if (!current) return false;
    const proc = current;
    current = null;
    try {
      proc.kill();
    } catch (err) {
      // process already gone
      log.warn('stopping speech process failed', err);
    }
    return true;
  }

  /**
   * Speaks segments sequentially. `onEvent` receives
   * { type: 'segment', index } | { type: 'end' } | { type: 'error', message }.
   */
  function speak(request, onEvent) {
    stop();

    if (platform !== 'win32') {
      onEvent({ type: 'error', message: 'La voz nativa solo está disponible en Windows.' });
      return { success: false, error: 'unsupported-platform' };
    }

    const segments = Array.isArray(request && request.segments)
      ? request.segments.filter((s) => typeof s === 'string' && s.trim().length > 0)
      : [];
    if (segments.length === 0) {
      onEvent({ type: 'end' });
      return { success: false, error: 'empty' };
    }

    const encodedScript = Buffer.from(SPEAK_SCRIPT, 'utf16le').toString('base64');
    const proc = spawnFn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encodedScript],
      { windowsHide: true }
    );
    current = proc;

    let stdoutBuffer = '';
    let stderrBuffer = '';
    let finished = false;
    const isCurrent = () => current === proc;
    const finish = (event) => {
      if (finished) return;
      finished = true;
      if (isCurrent()) current = null;
      onEvent(event);
    };

    proc.stdout.on('data', (chunk) => {
      if (!isCurrent()) return;
      stdoutBuffer += chunk.toString('utf8');
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || '';
      for (const line of lines) {
        const match = /^SEG (\d+)$/.exec(line.trim());
        if (match) onEvent({ type: 'segment', index: Number(match[1]) });
        else if (line.trim() === 'DONE') finish({ type: 'end' });
      }
    });

    proc.stderr.on('data', (chunk) => {
      stderrBuffer += chunk.toString('utf8');
    });

    proc.on('error', (err) => {
      if (isCurrent()) finish({ type: 'error', message: err.message });
    });

    proc.on('close', (code) => {
      // Killed by stop(): stay silent, the renderer already knows.
      if (!isCurrent()) return;
      if (code === 0) finish({ type: 'end' });
      else finish({ type: 'error', message: stderrBuffer.trim() || `PowerShell terminó con código ${code}` });
    });

    proc.stdin.end(encodeRequest({ segments, start: request.start || 0, rate: request.rate, language: request.language }));
    return { success: true };
  }

  return { speak, stop, isSpeaking: () => current !== null };
}

module.exports = { createSpeechService, toSapiRate, encodeRequest, SPEAK_SCRIPT };
