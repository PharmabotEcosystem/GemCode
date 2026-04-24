import * as mammoth from 'mammoth/mammoth.browser';
import { Document as DocxDocument, Packer, Paragraph, TextRun } from 'docx';
import { jsPDF } from 'jspdf';
import { getDocument } from 'pdfjs-dist';
import type { ChatAttachment, DraftFileState } from './types';
import { TEXT_FILE_EXTENSIONS, IMAGE_FILE_EXTENSIONS, DRAFT_FILE_OPTIONS } from './constants';

export function getFileExtension(name: string): string {
  const clean = name.toLowerCase().trim();
  const dot = clean.lastIndexOf('.');
  return dot >= 0 ? clean.slice(dot + 1) : '';
}

export function formatBytes(size: number): string {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / (1024 * 1024)).toFixed(1)} MB`;
}

export function stripDataUrlPrefix(dataUrl: string): string {
  const i = dataUrl.indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : dataUrl;
}

function ensureExtension(fileName: string, ext: string): string {
  const t = fileName.trim() || `gemcode-file.${ext}`;
  return t.toLowerCase().endsWith(`.${ext}`) ? t : `${t}.${ext}`;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result ?? ''));
    r.onerror = () => reject(r.error ?? new Error(`Impossibile leggere ${file.name}`));
    r.readAsDataURL(file);
  });
}

async function extractPdfText(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const pdf = await getDocument({ data: bytes }).promise;
  const pages: string[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const page = await pdf.getPage(p);
    const content = await page.getTextContent();
    const lines = content.items.map(it => ('str' in it ? String(it.str) : '')).join(' ').replace(/\s+/g, ' ').trim();
    if (lines) pages.push(lines);
  }
  return pages.join('\n\n').trim().slice(0, 12000);
}

async function extractDocxText(file: File): Promise<string> {
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() });
  return result.value.replace(/\n{3,}/g, '\n\n').trim().slice(0, 12000);
}

export async function readAttachmentFile(file: File): Promise<ChatAttachment> {
  const ext = getFileExtension(file.name);
  const base: ChatAttachment = {
    id: `${file.name}-${file.size}-${file.lastModified}`,
    name: file.name, mimeType: file.type || 'application/octet-stream',
    size: file.size, kind: 'binary', extractedText: '', previewText: '',
  };
  try {
    if (file.type.startsWith('image/') || IMAGE_FILE_EXTENSIONS.has(ext)) {
      const imageDataUrl = await fileToDataUrl(file);
      return { ...base, kind: 'image', imageDataUrl, previewText: `Immagine ${file.name} · ${formatBytes(file.size)}` };
    }
    if (file.type === 'application/pdf' || ext === 'pdf') {
      const t = await extractPdfText(file);
      return { ...base, kind: 'pdf', extractedText: t, previewText: t || `PDF ${file.name} senza testo estraibile` };
    }
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
      const t = await extractDocxText(file);
      return { ...base, kind: 'docx', extractedText: t, previewText: t || `DOCX ${file.name} senza testo estraibile` };
    }
    if (TEXT_FILE_EXTENSIONS.has(ext) || file.type.startsWith('text/')) {
      const t = (await file.text()).slice(0, 12000);
      return { ...base, kind: 'text', extractedText: t, previewText: t || `${file.name} vuoto` };
    }
    if (ext === 'doc') {
      return { ...base, kind: 'binary', previewText: `${file.name} e un DOC legacy. Converti in DOCX.`, error: 'Formato DOC legacy non supportato.' };
    }
    return { ...base, kind: 'binary', previewText: `${file.name} importato come file binario (${formatBytes(file.size)}).`, error: 'Contenuto binario non leggibile dal browser.' };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { ...base, previewText: `Errore lettura ${file.name}: ${msg}`, error: msg };
  }
}

export function buildAttachmentPrompt(att: ChatAttachment): string {
  const h = `File allegato: ${att.name} (${att.mimeType || 'n/d'}, ${formatBytes(att.size)})`;
  if (att.kind === 'image') return `${h}\nTipo: immagine. Se il modello supporta input visivo usa anche l'immagine allegata.`;
  if (att.extractedText) return `${h}\nContenuto estratto:\n${att.extractedText}`;
  if (att.error) return `${h}\nNota: ${att.error}`;
  return `${h}\nNota: contenuto non disponibile.`;
}

export function buildDisplayText(userText: string, attachments: ChatAttachment[]): string {
  const lines: string[] = [];
  if (attachments.length > 0) lines.push(`Allegati: ${attachments.map(a => a.name).join(', ')}`);
  if (userText.trim()) lines.push(userText.trim());
  return lines.join('\n');
}

export function buildPromptText(userText: string, attachments: ChatAttachment[]): string {
  const trimmed = userText.trim();
  const blocks = attachments.map(buildAttachmentPrompt);
  if (trimmed) blocks.push(`Richiesta utente:\n${trimmed}`);
  return blocks.join('\n\n').trim();
}

export function extractMessageImages(attachments?: ChatAttachment[]): string[] {
  return (attachments ?? []).filter(a => a.imageDataUrl).map(a => stripDataUrlPrefix(a.imageDataUrl!));
}

export async function buildDraftBlob(draft: DraftFileState): Promise<{ fileName: string; blob: Blob }> {
  const opt = DRAFT_FILE_OPTIONS.find(e => e.value === draft.format) ?? DRAFT_FILE_OPTIONS[0];
  const fileName = ensureExtension(draft.fileName, opt.extension);
  if (opt.mode === 'docx') {
    const paragraphs = draft.content.split(/\r?\n/).map(l => new Paragraph({ children: [new TextRun(l)] }));
    const doc = new DocxDocument({ sections: [{ children: paragraphs.length > 0 ? paragraphs : [new Paragraph('')] }] });
    return { fileName, blob: await Packer.toBlob(doc) };
  }
  if (opt.mode === 'pdf') {
    const pdf = new jsPDF({ unit: 'pt', format: 'a4' });
    const margin = 48; const pw = pdf.internal.pageSize.getWidth(); const ph = pdf.internal.pageSize.getHeight();
    const lines = pdf.splitTextToSize(draft.content || ' ', pw - margin * 2);
    let cy = margin; pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
    lines.forEach((line: string) => { if (cy > ph - margin) { pdf.addPage(); cy = margin; } pdf.text(line, margin, cy); cy += 16; });
    return { fileName, blob: pdf.output('blob') };
  }
  return { fileName, blob: new Blob([draft.content], { type: opt.mimeType }) };
}

export function triggerBlobDownload(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = fileName; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
