import React, { useCallback, useRef, useState } from 'react';
import { FolderOpen, FileText, Save } from 'lucide-react';
import type { AppSettings, ChatAttachment, DraftFileState } from '../../types';
import { DEFAULT_DRAFT_FILE, DRAFT_FILE_OPTIONS, FILE_PICKER_ACCEPT } from '../../constants';
import { readAttachmentFile, buildDraftBlob, triggerBlobDownload } from '../../utils';
import { SettingsSection } from '../ui/SettingsSection';
import { TextField } from '../ui/FormFields';
import { WorkspaceFileCard } from '../WorkspaceFileCard';
import type { DraftFormat } from '../../types';

interface Props {
  settings: AppSettings;
  pendingAttachments: ChatAttachment[];
  setPendingAttachments: React.Dispatch<React.SetStateAction<ChatAttachment[]>>;
}

export function WorkspaceTab({ settings, pendingAttachments, setPendingAttachments }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [workspaceFiles, setWorkspaceFiles] = useState<ChatAttachment[]>([]);
  const [workspaceMessage, setWorkspaceMessage] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);
  const [draftFile, setDraftFile] = useState<DraftFileState>(DEFAULT_DRAFT_FILE);

  const openFilePicker = useCallback(() => fileInputRef.current?.click(), []);

  const importFiles = useCallback(async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return;
    setIsImporting(true); setWorkspaceMessage(null);
    try {
      const parsed = await Promise.all(Array.from(fileList).map(f => readAttachmentFile(f)));
      setPendingAttachments(prev => {
        const known = new Set(prev.map(a => a.id));
        return [...prev, ...parsed.filter(a => !known.has(a.id))];
      });
      setWorkspaceFiles(prev => {
        const merged = [...parsed, ...prev.filter(ex => !parsed.some(a => a.id === ex.id))];
        return merged.slice(0, 16);
      });
      const failed = parsed.filter(a => a.error).length;
      setWorkspaceMessage(failed > 0 ? `${parsed.length} file importati, ${failed} con limitazioni.` : `${parsed.length} file importati e pronti.`);
    } catch (e) {
      setWorkspaceMessage(`Import fallito: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [setPendingAttachments]);

  const enqueueFile = useCallback((id: string) => {
    const f = workspaceFiles.find(a => a.id === id);
    if (!f) return;
    setPendingAttachments(prev => prev.some(a => a.id === f.id) ? prev : [...prev, f]);
    setWorkspaceMessage(`Aggiunto in chat: ${f.name}`);
  }, [workspaceFiles, setPendingAttachments]);

  const copyText = useCallback(async (id: string) => {
    const f = workspaceFiles.find(a => a.id === id);
    if (!f?.extractedText) return;
    await navigator.clipboard.writeText(f.extractedText);
    setWorkspaceMessage(`Testo copiato: ${f.name}`);
  }, [workspaceFiles]);

  const exportDraft = useCallback(async () => {
    try {
      const { fileName, blob } = await buildDraftBlob(draftFile);
      triggerBlobDownload(fileName, blob);
      setWorkspaceMessage(`File creato: ${fileName}`);
    } catch (e) {
      setWorkspaceMessage(`Creazione fallita: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [draftFile]);

  return (
    <div className="space-y-8">
      <SettingsSection icon={<FolderOpen className="w-5 h-5 text-amber-400" />} title="Workspace" description="Gestisci file, importa documenti e crea file di output.">
        <input ref={fileInputRef} type="file" multiple accept={FILE_PICKER_ACCEPT}
          onChange={e => { void importFiles(e.target.files); }} className="hidden" />

        <div className="flex gap-2">
          <button onClick={openFilePicker} disabled={isImporting}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border border-border text-sm text-secondary hover:bg-elevated hover:text-primary disabled:opacity-40 transition-colors">
            <FileText className="w-4 h-4" />{isImporting ? 'Import...' : 'Leggi file locali'}
          </button>
          <button onClick={exportDraft}
            className="flex-1 inline-flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl bg-accent text-white transition-colors hover:bg-accent-hover">
            <Save className="w-4 h-4" />Crea file
          </button>
        </div>

        {workspaceMessage && <div className="rounded-xl bg-accent/10 border border-accent/20 px-3 py-2 text-xs text-accent">{workspaceMessage}</div>}

        {/* Draft file creator */}
        <div className="rounded-2xl border border-border bg-elevated/30 p-4 space-y-3">
          <TextField label="Nome file" value={draftFile.fileName}
            onChange={v => setDraftFile(prev => ({ ...prev, fileName: v }))} placeholder="gemcode-note.md" />
          <div>
            <label className="text-xs text-muted mb-1.5 block">Formato output</label>
            <select value={draftFile.format}
              onChange={e => setDraftFile(prev => ({ ...prev, format: e.target.value as DraftFormat }))}
              className="w-full bg-elevated border border-border rounded-xl px-3 py-2 text-sm text-primary">
              {DRAFT_FILE_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-muted mb-1.5 block">Contenuto</label>
            <textarea value={draftFile.content}
              onChange={e => setDraftFile(prev => ({ ...prev, content: e.target.value }))}
              rows={6} className="w-full bg-elevated border border-border rounded-xl px-3 py-2.5 text-xs text-secondary resize-y leading-relaxed" />
          </div>
        </div>

        {/* Imported files */}
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-primary">File importati</p>
            <span className="text-xs text-muted">{workspaceFiles.length}</span>
          </div>
          {workspaceFiles.length === 0 ? (
            <div className="rounded-xl border border-border bg-elevated/40 px-3 py-3 text-sm text-secondary">
              Nessun file importato. Usa "Leggi file locali" per iniziare.
            </div>
          ) : (
            <div className="space-y-2 max-h-96 overflow-auto pr-1">
              {workspaceFiles.map(f => (
                <WorkspaceFileCard key={f.id} file={f} inChat={pendingAttachments.some(a => a.id === f.id)}
                  onAddToChat={enqueueFile} onCopyText={copyText} />
              ))}
            </div>
          )}
        </div>
      </SettingsSection>
    </div>
  );
}
