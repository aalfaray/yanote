import { describe, it, expect } from 'vitest';
import { serializeTabs, restoreTabs } from '../../src/lib/session';
import type { TabItem } from '../../src/types/electron';

const tabs: TabItem[] = [
  { id: 'n1', title: 'plan.md', path: 'C:\\notas\\plan.md', content: 'en disco', isDirty: false, isPinned: true },
  { id: 'n2', title: 'borrador.md', path: 'C:\\notas\\borrador.md', content: 'sin guardar', isDirty: true },
  { id: 's1', title: 'scratch-1.md', path: null, content: 'idea', isDirty: true },
  { id: 't1', title: 'PowerShell', path: null, content: '', kind: 'terminal', shell: 'powershell', cwd: 'C:\\proj' },
  { id: 't2', title: 'Iniciar sesión', path: null, content: '', kind: 'terminal', shell: 'powershell', initialCommand: 'claude auth login' },
  { id: 'c1', title: 'Claude', path: null, content: '', kind: 'claude', cwd: 'C:\\proj', sessionId: 'sess-1' },
];

describe('Frontend: workspace session (reopen last tabs)', () => {
  it('stores only what is needed to reopen each tab', () => {
    const saved = serializeTabs(tabs);
    expect(saved.map((t) => t.id)).toEqual(['n1', 'n2', 's1', 't1', 'c1']);
    expect(saved[0]).toMatchObject({ path: 'C:\\notas\\plan.md', content: '', isPinned: true });
    expect(saved[1]).toMatchObject({ content: 'sin guardar', isDirty: true });
    expect(saved[2]).toMatchObject({ content: 'idea', path: null });
    expect(saved[3]).toMatchObject({ kind: 'terminal', shell: 'powershell', cwd: 'C:\\proj' });
    expect(saved[4]).toMatchObject({ kind: 'claude', cwd: 'C:\\proj', sessionId: 'sess-1' });
  });

  it('reopens notes from disk, keeps unsaved text, and drops missing files', async () => {
    const saved = serializeTabs(tabs);
    saved.unshift({ id: 'gone', title: 'borrado.md', path: 'C:\\notas\\borrado.md', content: '', isDirty: false });
    const read = async (p: string) => (p.endsWith('plan.md') ? { success: true, content: 'versión actual' } : { success: false });
    const res = await restoreTabs(saved, 'c1', read);
    expect(res?.activeTabId).toBe('c1');
    expect(res?.tabs.map((t) => t.id)).toEqual(['n1', 'n2', 's1', 't1', 'c1']);
    expect(res?.tabs[0]).toMatchObject({ content: 'versión actual', isDirty: false, isPinned: true });
    expect(res?.tabs[1]).toMatchObject({ content: 'sin guardar', isDirty: true });
    expect(res?.tabs[4]).toMatchObject({ kind: 'claude', sessionId: 'sess-1' });
  });

  it('falls back to the first tab and returns null when nothing is left', async () => {
    const read = async () => ({ success: true, content: 'x' });
    expect((await restoreTabs(serializeTabs(tabs), 'no-existe', read))?.activeTabId).toBe('n1');
    expect(await restoreTabs([], null, read)).toBeNull();
    expect(await restoreTabs(undefined, null, read)).toBeNull();
    const onlyMissing = [{ id: 'g', title: 'g.md', path: 'C:\\g.md', content: '', isDirty: false }];
    expect(await restoreTabs(onlyMissing, 'g', async () => ({ success: false }))).toBeNull();
  });
});
