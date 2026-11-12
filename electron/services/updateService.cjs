/**
 * App updates.
 * - Installed build (NSIS): electron-updater reads latest.yml from the GitHub release,
 *   asks the user, downloads, then restarts into the new version.
 * - Portable build: can't replace itself, so it only checks the latest GitHub release
 *   and opens the download page when the user accepts.
 * - Development: disabled.
 */

const RELEASES_API = 'https://api.github.com/repos/aalfaray/yanote/releases/latest';
const RELEASES_PAGE = 'https://github.com/aalfaray/yanote/releases/latest';

/** 1 if a > b, -1 if a < b, 0 if equal ("v1.2.0", "1.10.0-beta" ok; pre-release tags ignored). */
function compareVersions(a, b) {
  const parts = (v) =>
    String(v || '')
      .trim()
      .replace(/^v/i, '')
      .split('-')[0]
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = parts(a);
  const pb = parts(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d !== 0) return d > 0 ? 1 : -1;
  }
  return 0;
}

/** electron-updater gives notes as HTML string or [{version, note}]; the UI wants plain text. */
function notesToText(notes) {
  const raw = Array.isArray(notes) ? notes.map((n) => (n && n.note) || '').join('\n\n') : String(notes || '');
  return raw
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|li|h\d)>/gi, '\n')
    .replace(/<li[^>]*>/gi, '• ')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function fetchLatestRelease(fetchImpl = globalThis.fetch) {
  const res = await fetchImpl(RELEASES_API, { headers: { Accept: 'application/vnd.github+json', 'User-Agent': 'yanote-app' } });
  if (!res.ok) throw new Error(`GitHub respondió ${res.status}`);
  const data = await res.json();
  return { version: String(data.tag_name || '').replace(/^v/i, ''), notes: data.body || '', url: data.html_url || RELEASES_PAGE };
}

/**
 * `mode`: 'auto' (installed), 'portable' or 'disabled'. Everything external is injected for tests.
 */
function createUpdateService({ mode, autoUpdater, currentVersion, fetchLatest = fetchLatestRelease, openExternal, emit }) {
  let manualCheck = false;
  let available = null;
  let downloading = false;

  if (mode === 'auto' && autoUpdater) {
    autoUpdater.autoDownload = false;
    autoUpdater.autoInstallOnAppQuit = true;
    autoUpdater.logger = null;

    autoUpdater.on('update-available', (info) => {
      available = { version: info.version, notes: notesToText(info.releaseNotes), url: RELEASES_PAGE };
      emit({ type: 'available', mode, currentVersion, ...available });
    });
    autoUpdater.on('update-not-available', () => {
      if (manualCheck) emit({ type: 'none', currentVersion });
    });
    autoUpdater.on('download-progress', (p) => {
      emit({ type: 'progress', percent: Math.round(p.percent || 0), transferred: p.transferred, total: p.total });
    });
    autoUpdater.on('update-downloaded', (info) => {
      downloading = false;
      emit({ type: 'downloaded', version: info.version });
    });
    autoUpdater.on('error', (err) => {
      // Background checks fail quietly (offline, rate limit); user-started actions report it
      if (manualCheck || downloading) emit({ type: 'error', error: (err && err.message) || String(err) });
      downloading = false;
    });
  }

  async function check({ manual = false } = {}) {
    manualCheck = manual;
    if (mode === 'disabled') {
      if (manual) emit({ type: 'error', error: 'Las actualizaciones solo funcionan en la versión instalada de yanote.' });
      return { success: false, mode };
    }
    try {
      if (mode === 'auto') {
        await autoUpdater.checkForUpdates();
        return { success: true, mode };
      }
      const latest = await fetchLatest();
      if (latest.version && compareVersions(latest.version, currentVersion) > 0) {
        available = { version: latest.version, notes: notesToText(latest.notes), url: latest.url };
        emit({ type: 'available', mode, currentVersion, ...available });
      } else if (manual) {
        emit({ type: 'none', currentVersion });
      }
      return { success: true, mode };
    } catch (err) {
      if (manual) emit({ type: 'error', error: (err && err.message) || String(err) });
      return { success: false, mode, error: (err && err.message) || String(err) };
    }
  }

  /** User accepted: download (installed) or open the download page (portable). */
  async function accept() {
    if (!available) return { success: false, error: 'No hay ninguna actualización disponible' };
    if (mode === 'portable') {
      await openExternal(available.url);
      return { success: true, opened: true };
    }
    if (mode !== 'auto') return { success: false, error: 'Actualizaciones desactivadas' };
    try {
      downloading = true;
      await autoUpdater.downloadUpdate();
      return { success: true };
    } catch (err) {
      downloading = false;
      return { success: false, error: (err && err.message) || String(err) };
    }
  }

  /** Quit and run the downloaded installer silently, then relaunch. */
  function install() {
    if (mode !== 'auto') return false;
    setImmediate(() => autoUpdater.quitAndInstall(true, true));
    return true;
  }

  return { check, accept, install, mode, currentVersion };
}

module.exports = { createUpdateService, compareVersions, notesToText, fetchLatestRelease, RELEASES_PAGE };
