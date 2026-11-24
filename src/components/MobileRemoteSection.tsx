import React, { useCallback, useEffect, useState } from 'react';
import { Smartphone, QrCode, Trash2, RefreshCw } from 'lucide-react';
import { t } from '../lib/i18n';
import { Button } from './ui/Button';
import { Select } from './ui/Select';
import { logError } from '../lib/logger';
import type { MobilePairing, MobileRemoteStatus } from '../types/electron';

/**
 * Settings > Móvil: lets the Orca Mobile app use yanote's chat tabs over the local network
 * (or Tailscale). Changes apply at once, without the modal's Save button.
 */
export const MobileRemoteSection: React.FC<{ isOpen: boolean }> = ({ isOpen }) => {
  const api = window.electronAPI;
  const [status, setStatus] = useState<MobileRemoteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [address, setAddress] = useState('');
  const [pairing, setPairing] = useState<MobilePairing | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!api?.mobileStatus) return;
    try {
      const next = await api.mobileStatus();
      setStatus(next);
      setAddress((current) => (current && next.addresses.some((a) => a.address === current) ? current : next.addresses[0]?.address ?? ''));
    } catch (err) {
      logError('MobileRemoteSection.status', err);
    }
  }, [api]);

  // The modal unmounts its content when closed, so a shown QR never outlives the panel
  useEffect(() => {
    if (!isOpen) return;
    void refresh();
    // Shows when a phone connects (or a QR gets used) while the panel is open
    const timer = setInterval(() => void refresh(), 3000);
    return () => clearInterval(timer);
  }, [isOpen, refresh]);

  if (!api?.mobileStatus) return null;

  const toggle = async (enabled: boolean) => {
    setBusy(true);
    setError(null);
    setPairing(null);
    try {
      const next = await api.mobileSetEnabled!(enabled);
      setStatus(next);
      if (enabled && !next.running) setError(next.error || t("No se pudo iniciar el acceso desde el móvil"));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const createQr = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await api.mobileCreatePairing!(address || undefined);
      if (!res.success) setError(res.error || t("No se pudo crear el código"));
      else setPairing(res);
      void refresh();
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (id: string) => {
    await api.mobileRevokeDevice?.(id);
    void refresh();
  };

  const enabled = Boolean(status?.enabled);
  const kindLabel = (kind: string) => (kind === 'tailscale' ? 'Tailscale' : kind === 'lan' ? 'Wi‑Fi / LAN' : t("otra red"));
  const pairedDevices = (status?.devices ?? []).filter((d) => d.lastSeenAt);

  return (
    <fieldset disabled={busy} className="flex flex-col gap-2 p-3 bg-card border border-border rounded-md shadow-sm">
      <span className="font-semibold flex items-center gap-1.5 uppercase text-foreground">
        <Smartphone size={14} strokeWidth={1.75} /> {t("Móvil (Orca Mobile)")}
      </span>

      <label className="flex items-center gap-2 cursor-pointer select-none">
        <input
          type="checkbox"
          checked={enabled}
          onChange={(e) => void toggle(e.target.checked)}
          className="w-4 h-4 rounded-md border border-border text-foreground focus:ring-0 cursor-pointer accent-primary"
        />
        <span className="font-medium text-foreground">{t("Usar los chats de Claude, Codex y Antigravity desde el teléfono")}</span>
      </label>
      <span className="text-[10px] font-medium opacity-60">
        {t("Funciona con la app Orca Mobile en la misma Wi‑Fi o por Tailscale. Quien tenga el código puede escribir en tus chats: no lo compartas.")}
      </span>

      {error && <span className="text-[11px] font-medium text-destructive">{error}</span>}
      {enabled && status && !status.running && status.error && !error && (
        <span className="text-[11px] font-medium text-destructive">{status.error}</span>
      )}

      {enabled && status?.running && (
        <>
          <div className="flex items-end gap-2">
            <div className="flex flex-col gap-1 flex-1 min-w-0">
              <label htmlFor="mobile-address-select" className="text-xs font-medium text-foreground">
                {t("Dirección de este ordenador")}
              </label>
              <Select id="mobile-address-select" size="md" value={address} onChange={(e) => setAddress(e.target.value)} className="w-full">
                {status.addresses.map((a) => (
                  <option key={a.address} value={a.address}>{`${a.address} (${kindLabel(a.kind)})`}</option>
                ))}
              </Select>
            </div>
            <Button variant="secondary" size="sm" onClick={() => void refresh()} aria-label={t("Actualizar direcciones")}>
              <RefreshCw size={12} strokeWidth={1.75} />
            </Button>
          </div>
          <Button variant="secondary" size="sm" onClick={() => void createQr()} disabled={!address}>
            <QrCode size={12} strokeWidth={1.75} /> {t("Generar código QR")}
          </Button>

          {pairing?.success && (
            <div className="flex flex-col items-center gap-2 p-3 rounded-md border border-border bg-background">
              {pairing.qrDataUrl && <img src={pairing.qrDataUrl} alt={t("Código QR para Orca Mobile")} className="w-48 h-48 rounded bg-white p-1" />}
              <span className="text-[11px] text-center text-foreground">
                {t("En Orca Mobile pulsa «Pair Desktop» y escanea el código. Si no lo usas, caduca en 15 minutos.")}
              </span>
              <span className="text-[10px] text-muted-foreground">{pairing.endpoint}</span>
            </div>
          )}

          <div className="flex flex-col gap-1 mt-1">
            <span className="text-xs font-medium text-foreground">{t("Teléfonos emparejados")}</span>
            {pairedDevices.length === 0 && <span className="text-[11px] text-muted-foreground">{t("Ninguno todavía")}</span>}
            {pairedDevices.map((d) => (
              <div key={d.id} className="flex items-center justify-between gap-2 px-2 py-1.5 rounded-md border border-border">
                <span className="flex items-center gap-2 min-w-0">
                  <span className={`w-2 h-2 rounded-full ${d.connected ? 'bg-success' : 'bg-muted-foreground/40'}`} aria-hidden />
                  <span className="truncate text-foreground">{d.name}</span>
                  <span className="text-[10px] text-muted-foreground">{d.connected ? t("conectado") : t("desconectado")}</span>
                </span>
                <Button variant="ghost" size="sm" onClick={() => void revoke(d.id)} aria-label={t("Quitar {0}", [d.name])}>
                  <Trash2 size={12} strokeWidth={1.75} />
                </Button>
              </div>
            ))}
          </div>
        </>
      )}
    </fieldset>
  );
};
