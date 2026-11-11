import React, { useState, useEffect } from 'react';
import { GitBranch, GitCommit, UploadCloud, DownloadCloud, RefreshCw, History, CheckCircle2, AlertCircle } from 'lucide-react';
import { Modal } from './ui/Modal';
import { Button } from './ui/Button';
import { Input } from './ui/Input';
import type { GitStatus, GitCommitItem } from '../types/electron';

interface GitModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilePath?: string | null;
  onRefreshNotes: () => void;
}

export const GitModal: React.FC<GitModalProps> = ({
  isOpen,
  onClose,
  currentFilePath,
  onRefreshNotes,
}) => {
  const [activeTab, setActiveTab] = useState<'sync' | 'history'>('sync');
  const [status, setStatus] = useState<GitStatus | null>(null);
  const [commitMessage, setCommitMessage] = useState('');
  const [history, setHistory] = useState<GitCommitItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const fetchStatus = async () => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.gitStatus();
      if (res.success) {
        setStatus(res);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  const fetchHistory = async () => {
    if (!window.electronAPI) return;
    try {
      const res = await window.electronAPI.gitHistory(currentFilePath || undefined);
      if (res.success) {
        setHistory(res.all || []);
      }
    } catch (err: any) {
      console.error(err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      setActionMessage(null);
      fetchStatus();
      fetchHistory();
    }
  }, [isOpen, currentFilePath]);

  const handleCommit = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const msg = commitMessage.trim() || `Actualización de notas - ${new Date().toLocaleTimeString()}`;
      const res = await window.electronAPI.gitCommit(msg);
      if (res.success) {
        setActionMessage({ type: 'success', text: '¡Cambios confirmados (commit) con éxito!' });
        setCommitMessage('');
        await fetchStatus();
        await fetchHistory();
      } else {
        setActionMessage({ type: 'error', text: `Error al hacer commit: ${res.error}` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePush = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await window.electronAPI.gitPush();
      if (res.success) {
        setActionMessage({ type: 'success', text: '¡Cambios enviados a GitHub (push) correctamente!' });
        await fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: `Error en Push: ${res.error || 'Verifica que el repositorio remoto y credenciales estén configurados en Ajustes.'}` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handlePull = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const res = await window.electronAPI.gitPull();
      if (res.success) {
        setActionMessage({ type: 'success', text: '¡Cambios descargados de GitHub (pull)!' });
        onRefreshNotes();
        await fetchStatus();
      } else {
        setActionMessage({ type: 'error', text: `Error en Pull: ${res.error || 'Verifica la conexión a GitHub.'}` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const handleSyncAll = async () => {
    if (!window.electronAPI) return;
    setLoading(true);
    setActionMessage(null);
    try {
      const msg = commitMessage.trim() || `Sincronización rápida - ${new Date().toLocaleTimeString()}`;
      const res = await window.electronAPI.gitSync(msg);
      if (res.success) {
        setActionMessage({
          type: res.synced ? 'success' : 'info',
          text: res.message || 'Sincronización completada.',
        });
        setCommitMessage('');
        onRefreshNotes();
        await fetchStatus();
        await fetchHistory();
      } else {
        setActionMessage({ type: 'error', text: `Error en sincronización: ${res.error}` });
      }
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message });
    } finally {
      setLoading(false);
    }
  };

  const modifiedCount = (status?.modified?.length || 0) + (status?.not_added?.length || 0) + (status?.staged?.length || 0);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Control de Versiones & GitHub" badge={status?.currentBranch || 'git'}>
      <div className="flex flex-col gap-3">
        {/* Tab Switcher */}
        <div className="flex items-center gap-2 border-b-2 border-black pb-2">
          <Button
            variant={activeTab === 'sync' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('sync')}
          >
            <RefreshCw size={13} strokeWidth={2.5} />
            Sincronizar
          </Button>
          <Button
            variant={activeTab === 'history' ? 'primary' : 'secondary'}
            size="sm"
            onClick={() => setActiveTab('history')}
          >
            <History size={13} strokeWidth={2.5} />
            Historial de Versiones
          </Button>
        </div>

        {/* Action message */}
        {actionMessage && (
          <div
            className={`p-2.5 rounded border-2 border-black text-xs font-bold flex items-center gap-2 ${
              actionMessage.type === 'success'
                ? 'bg-[#78E08F] text-black shadow-[2px_2px_0px_#000]'
                : actionMessage.type === 'error'
                ? 'bg-[#FF6B6B] text-white shadow-[2px_2px_0px_#000]'
                : 'bg-[#FFE500] text-black shadow-[2px_2px_0px_#000]'
            }`}
          >
            {actionMessage.type === 'success' ? (
              <CheckCircle2 size={16} strokeWidth={2.5} />
            ) : (
              <AlertCircle size={16} strokeWidth={2.5} />
            )}
            <span className="flex-1">{actionMessage.text}</span>
          </div>
        )}

        {activeTab === 'sync' && (
          <div className="flex flex-col gap-3">
            {/* Status overview card */}
            <div className="bg-white border-2 border-black rounded p-3 shadow-[2px_2px_0px_#000] flex flex-col gap-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-black flex items-center gap-1">
                  <GitBranch size={14} strokeWidth={2.5} /> Rama actual:
                </span>
                <span className="font-mono bg-[#FFE500] px-1.5 py-0.5 rounded border border-black font-black text-[11px]">
                  {status?.currentBranch || 'main'}
                </span>
              </div>

              <div className="flex items-center justify-between text-xs">
                <span className="font-bold">Estado del repositorio:</span>
                <span
                  className={`font-black text-xs px-1.5 py-0.5 rounded border border-black ${
                    modifiedCount === 0
                      ? 'bg-[#78E08F] text-black'
                      : 'bg-[#FF6B6B] text-white'
                  }`}
                >
                  {modifiedCount === 0 ? '✓ Limpio (Sin cambios)' : `● ${modifiedCount} cambio(s)`}
                </span>
              </div>

              {/* Changes preview list */}
              {modifiedCount > 0 && (
                <div className="mt-1 pt-2 border-t border-dashed border-black/40 text-[11px] max-h-24 overflow-y-auto">
                  <span className="font-black text-neutral-600 block mb-1">Archivos modificados:</span>
                  {status?.modified?.map((f) => (
                    <div key={f} className="text-[#c05621] font-mono truncate">~ {f}</div>
                  ))}
                  {status?.not_added?.map((f) => (
                    <div key={f} className="text-[#2b6cb0] font-mono truncate">+ {f}</div>
                  ))}
                  {status?.staged?.map((f) => (
                    <div key={f} className="text-[#2f855a] font-mono truncate">✓ {f}</div>
                  ))}
                </div>
              )}
            </div>

            {/* Commit message input */}
            <Input
              label="Mensaje del Commit:"
              placeholder="Ej. Notas de la reunión, ideas para el proyecto..."
              value={commitMessage}
              onChange={(e) => setCommitMessage(e.target.value)}
            />

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-2 mt-1">
              <Button
                variant="primary"
                onClick={handleSyncAll}
                disabled={loading}
                className="col-span-2 py-2 text-sm"
              >
                <RefreshCw size={14} strokeWidth={2.5} className={loading ? 'animate-spin' : ''} />
                {loading ? 'Sincronizando...' : '⚡ Sincronizar Todo (Commit + Push)'}
              </Button>

              <Button
                variant="secondary"
                onClick={handleCommit}
                disabled={loading || modifiedCount === 0}
              >
                <GitCommit size={14} strokeWidth={2.5} />
                Solo Commit
              </Button>

              <Button
                variant="cyan"
                onClick={handlePush}
                disabled={loading}
              >
                <UploadCloud size={14} strokeWidth={2.5} />
                Push a GitHub
              </Button>

              <Button
                variant="purple"
                onClick={handlePull}
                disabled={loading}
                className="col-span-2"
              >
                <DownloadCloud size={14} strokeWidth={2.5} />
                Pull (Descargar cambios de GitHub)
              </Button>
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div className="flex flex-col gap-2">
            <span className="text-xs font-black uppercase text-neutral-600">
              Últimas 20 revisiones guardadas:
            </span>

            {history.length === 0 ? (
              <div className="p-4 bg-white border-2 border-black rounded text-center text-xs font-medium">
                No hay historial de commits registrado todavía.
              </div>
            ) : (
              <div className="flex flex-col gap-1.5 max-h-[300px] overflow-y-auto pr-1">
                {history.map((c) => (
                  <div
                    key={c.hash}
                    className="p-2 bg-white border-2 border-black rounded shadow-[1.5px_1.5px_0px_#000] text-xs flex flex-col gap-1"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-black text-black truncate flex-1 mr-2">
                        {c.message}
                      </span>
                      <span className="font-mono text-[10px] bg-neutral-100 border border-black px-1 rounded">
                        {c.hash.substring(0, 7)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-[10px] text-neutral-500 font-medium">
                      <span>{c.author_name || 'Tú'}</span>
                      <span>{new Date(c.date).toLocaleString()}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
};
