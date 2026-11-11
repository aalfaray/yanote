import React, { useState, useEffect } from 'react';
import { Folder, GitFork, Shield, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import type { AppConfig } from '../types/electron';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfigChanged: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onConfigChanged,
}) => {
  const [notesPath, setNotesPath] = useState('');
  const [githubRepo, setGithubRepo] = useState('');
  const [githubBranch, setGithubBranch] = useState('main');
  const [githubToken, setGithubToken] = useState('');
  const [autoSyncOnSave, setAutoSyncOnSave] = useState(false);
  const [alwaysOnTop, setAlwaysOnTop] = useState(false);
  const [statusMessage, setStatusMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (isOpen && window.electronAPI) {
      window.electronAPI.getAppConfig().then((cfg) => {
        setNotesPath(cfg.notesPath || '');
        setGithubRepo(cfg.githubRepo || '');
        setGithubBranch(cfg.githubBranch || 'main');
        setGithubToken(cfg.githubToken || '');
        setAutoSyncOnSave(cfg.autoSyncOnSave || false);
        setAlwaysOnTop(cfg.alwaysOnTop || false);
      });
      setStatusMessage(null);
    }
  }, [isOpen]);

  const handleSelectFolder = async () => {
    if (!window.electronAPI) return;
    const path = await window.electronAPI.selectFolder();
    if (path) {
      setNotesPath(path);
      setStatusMessage({ type: 'success', text: `Carpeta actualizada a: ${path}` });
      onConfigChanged();
    }
  };

  const handleSaveSettings = async () => {
    if (!window.electronAPI) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      const updated: Partial<AppConfig> = {
        githubRepo: githubRepo.trim(),
        githubBranch: githubBranch.trim() || 'main',
        githubToken: githubToken.trim(),
        autoSyncOnSave,
        alwaysOnTop,
      };

      await window.electronAPI.saveAppConfig(updated);

      // If remote URL is provided, configure git remote
      if (githubRepo.trim()) {
        const remoteRes = await window.electronAPI.gitSetRemote(githubRepo.trim(), githubBranch.trim() || 'main');
        if (!remoteRes.success) {
          setStatusMessage({ type: 'error', text: `Ajustes guardados, pero error al vincular Git: ${remoteRes.error}` });
          setSaving(false);
          return;
        }
      }

      setStatusMessage({ type: 'success', text: '¡Ajustes y vinculación con GitHub guardados correctamente!' });
      onConfigChanged();
    } catch (err: any) {
      setStatusMessage({ type: 'error', text: err.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Ajustes & Configuración GitHub">
      <div className="flex flex-col gap-4 text-xs">
        {/* Status Message */}
        {statusMessage && (
          <div
            className={`p-2.5 rounded border-2 border-black font-bold flex items-center gap-2 ${
              statusMessage.type === 'success'
                ? 'bg-[#78E08F] text-black shadow-[2px_2px_0px_#000]'
                : 'bg-[#FF6B6B] text-white shadow-[2px_2px_0px_#000]'
            }`}
          >
            {statusMessage.type === 'success' ? (
              <CheckCircle2 size={16} strokeWidth={2.5} />
            ) : (
              <AlertCircle size={16} strokeWidth={2.5} />
            )}
            <span>{statusMessage.text}</span>
          </div>
        )}

        {/* Section: Notes Directory */}
        <div className="flex flex-col gap-1.5 p-3 bg-white border-2 border-black rounded shadow-[2px_2px_0px_#000]">
          <span className="font-black flex items-center gap-1.5 uppercase text-black">
            <Folder size={14} strokeWidth={2.5} /> Carpeta del Repositorio de Notas
          </span>
          <div className="flex items-center gap-2">
            <input
              type="text"
              readOnly
              value={notesPath}
              className="flex-1 bg-neutral-100 border border-black px-2 py-1.5 text-xs font-mono rounded truncate"
            />
            <Button variant="secondary" size="sm" onClick={handleSelectFolder}>
              Examinar
            </Button>
          </div>
          <span className="text-[10px] text-neutral-500 font-medium">
            Aquí se almacenan los archivos .md y el historial local de Git. Puedes seleccionar una carpeta existente o un repositorio ya clonado.
          </span>
        </div>

        {/* Section: GitHub Configuration */}
        <div className="flex flex-col gap-2.5 p-3 bg-white border-2 border-black rounded shadow-[2px_2px_0px_#000]">
          <span className="font-black flex items-center gap-1.5 uppercase text-black">
            <GitFork size={14} strokeWidth={2.5} /> Vinculación con GitHub
          </span>

          <Input
            label="URL del Repositorio Remoto en GitHub:"
            placeholder="https://github.com/usuario/mi-repositorio-notas.git"
            value={githubRepo}
            onChange={(e) => setGithubRepo(e.target.value)}
          />

          <div className="grid grid-cols-2 gap-2">
            <Input
              label="Rama Principal:"
              placeholder="main"
              value={githubBranch}
              onChange={(e) => setGithubBranch(e.target.value)}
            />

            <Input
              label="Personal Access Token (Opcional):"
              type="password"
              placeholder="ghp_xxxxxxxxxxxx"
              value={githubToken}
              onChange={(e) => setGithubToken(e.target.value)}
            />
          </div>

          <span className="text-[10px] text-neutral-500 font-medium">
            El token de acceso personal (PAT de GitHub con permisos <code>repo</code>) permite hacer push/pull automático sin requerir configurar SSH globalmente.
          </span>
        </div>

        {/* Section: Options & Portability */}
        <div className="flex flex-col gap-2 p-3 bg-white border-2 border-black rounded shadow-[2px_2px_0px_#000]">
          <span className="font-black flex items-center gap-1.5 uppercase text-black">
            <Shield size={14} strokeWidth={2.5} /> Opciones del Editor
          </span>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={autoSyncOnSave}
              onChange={(e) => setAutoSyncOnSave(e.target.checked)}
              className="w-4 h-4 rounded border-2 border-black text-[#FFE500] focus:ring-0 cursor-pointer accent-[#FFE500]"
            />
            <span className="font-bold">
              Auto-guardar y enviar a GitHub (Commit & Push al guardar con Ctrl+S)
            </span>
          </label>

          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={alwaysOnTop}
              onChange={(e) => setAlwaysOnTop(e.target.checked)}
              className="w-4 h-4 rounded border-2 border-black text-[#FFE500] focus:ring-0 cursor-pointer accent-[#FFE500]"
            />
            <span className="font-bold">
              Iniciar siempre en modo superposición (Always on Top)
            </span>
          </label>
        </div>

        {/* Save Button */}
        <Button
          variant="primary"
          size="md"
          onClick={handleSaveSettings}
          disabled={saving}
          className="w-full py-2"
        >
          <Save size={15} strokeWidth={2.5} />
          {saving ? 'Guardando...' : 'Guardar Ajustes'}
        </Button>
      </div>
    </Modal>
  );
};
