import { useReducer, useRef, useCallback, type ChangeEvent, type DragEvent } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, X, Save, Eye, EyeOff, FlaskConical, AlertTriangle } from 'lucide-react'
import { insertRelazione } from '../../data/relazioniData'
import { upsertPaziente } from '../../data/pazientiData'
import { USE_MOCK } from '../../core/config'
import { supabase } from '../../core/supabase'
import { extractText, getFileKind } from '../../services/fileExtractor'
import { createDefaultImportMeta, createImportedFileEntry, filesReducer } from '../state/importRelazioniState'
import type { FileKind, ImportedFileEntry, ImportRelazioneMeta, ImportableFileKind } from '../../core/types'

const TIPI_RELAZIONE = ['', 'valutazione-completa', 'rivalutazione', 'approfondimento', 'certificazione-dsa', 'altro']

// Content-type corretto per Supabase Storage in base al formato originale
const CONTENT_TYPES: Record<ImportableFileKind, string> = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf:  'application/pdf',
  doc:  'application/msword',
}

function FileKindBadge({ kind }: { kind: FileKind }) {
  const labels: Record<FileKind, string> = { docx: 'DOCX', pdf: 'PDF', doc: 'DOC', unsupported: '?' }
  const colors = {
    docx: { bg: 'var(--accent-lt)', fg: 'var(--accent-dk)' },
    pdf:  { bg: '#FEE2E2', fg: '#991B1B' },
    doc:  { bg: '#FEF3C7', fg: '#92400E' },
    unsupported: { bg: '#F3F4F6', fg: '#4B5563' },
  }
  const c = colors[kind] || colors.doc
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: c.bg, color: c.fg, flexShrink: 0 }}>
      {labels[kind] || '?'}
    </span>
  )
}

type FileItemProps = {
  file: ImportedFileEntry
  onRemove: (id: string) => void
  onSave: (id: string, meta: ImportRelazioneMeta) => Promise<void>
}

function FileItem({ file, onRemove, onSave }: FileItemProps) {
  const [meta, dispatchMeta] = useReducer(
    (state: ImportRelazioneMeta, action: { key: keyof ImportRelazioneMeta; value: string | number }) => ({ ...state, [action.key]: action.value }),
    createDefaultImportMeta(file.name)
  )
  const [showPreview, togglePreview] = useReducer(s => !s, false)

  return (
    <div className="file-item">
      <div className="file-item-header">
        <FileText size={16} color="var(--accent)" />
        <FileKindBadge kind={file.kind} />
        <span className="file-item-name">{file.name}</span>

        <span className={`file-status ${file.status}`}>
          {file.status === 'converting' && <><span className="spinner" /> Estrazione…</>}
          {file.status === 'ready'      && <><CheckCircle size={12} /> Pronto</>}
          {file.status === 'saving'     && <><span className="spinner" /> Salvataggio…</>}
          {file.status === 'saved'      && <><CheckCircle size={12} /> Salvato</>}
          {file.status === 'error'      && <><AlertCircle size={12} /> Errore</>}
        </span>

        {file.status !== 'saving' && file.status !== 'saved' && (
          <button className="btn btn-ghost btn-sm" onClick={() => onRemove(file.id)}>
            <X size={14} />
          </button>
        )}
      </div>

      {file.status === 'error' && (
        <p style={{ fontSize: 12, color: 'var(--danger)', marginBottom: 10, lineHeight: 1.5 }}>
          {file.errorMsg || 'Impossibile estrarre il testo dal file.'}
        </p>
      )}

      {file.warning && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'flex-start', fontSize: 11.5, color: '#92400E', background: '#FEF3C7', border: '1px solid #FCD34D', borderRadius: 4, padding: '6px 9px', marginBottom: 10, lineHeight: 1.4 }}>
          <AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>{file.warning}</span>
        </div>
      )}

      {file.markdown && (
        <>
          <button className="btn btn-ghost btn-sm" style={{ marginBottom: 8 }} onClick={togglePreview}>
            {showPreview ? <><EyeOff size={13} /> Nascondi anteprima</> : <><Eye size={13} /> Mostra anteprima</>}
          </button>
          {showPreview && (
            <div className="file-preview">{file.markdown.slice(0, 800)}{file.markdown.length > 800 ? '\n…' : ''}</div>
          )}
        </>
      )}

      {(file.status === 'ready' || file.status === 'error') && (
        <>
          <div className="meta-row" style={{ marginBottom: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Titolo</label>
              <input className="form-input" value={meta.titolo} onChange={e => dispatchMeta({ key: 'titolo', value: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Anno</label>
              <input className="form-input" type="number" min="2000" max="2100" value={meta.anno}
                onChange={e => dispatchMeta({ key: 'anno', value: parseInt(e.target.value, 10) })} />
            </div>
          </div>

          <div className="meta-row" style={{ marginBottom: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tipo relazione</label>
              <select className="form-select" value={meta.tipo_relazione} onChange={e => dispatchMeta({ key: 'tipo_relazione', value: e.target.value })}>
                {TIPI_RELAZIONE.map(t => <option key={t} value={t}>{t || '— seleziona —'}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Codice paziente <span>(facoltativo)</span></label>
              <input className="form-input" placeholder="PAZ-001" value={meta.codice_paziente}
                onChange={e => dispatchMeta({ key: 'codice_paziente', value: e.target.value.toUpperCase() })} />
            </div>
          </div>

          {file.status === 'ready' && (
            <button className="btn btn-primary btn-sm" onClick={() => onSave(file.id, meta)}>
              <Save size={13} /> Salva in archivio
            </button>
          )}
        </>
      )}

      {file.status === 'saved' && (
        <p style={{ fontSize: 12.5, color: '#065F46' }}>✓ Relazione "{meta.titolo}" salvata correttamente.</p>
      )}
    </div>
  )
}

export default function ImportRelazioni() {
  const [files, dispatchFiles] = useReducer(filesReducer, [] as ImportedFileEntry[])
  const [dragOver, toggleDrag] = useReducer(s => !s, false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function convertFile(fileObj: File) {
    const kind = getFileKind(fileObj.name)
    const entry = createImportedFileEntry(fileObj, kind)
    dispatchFiles({ type: 'ADD', entry })

    try {
      const { markdown, warning } = await extractText(fileObj)
      dispatchFiles({ type: 'UPDATE', id: entry.id, patch: { status: 'ready', markdown, warning } })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Errore sconosciuto durante la conversione.'
      dispatchFiles({ type: 'UPDATE', id: entry.id, patch: { status: 'error', errorMsg: message } })
    }
  }

  const onDrop = useCallback((e: DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    toggleDrag()
    Array.from(e.dataTransfer.files as FileList).filter((f: File) => f.name.match(/\.(docx?|pdf)$/i)).forEach(convertFile)
  }, [])

  function onFileChange(e: ChangeEvent<HTMLInputElement>) {
    if (!e.target.files) return
    Array.from(e.target.files).forEach(convertFile)
    e.target.value = ''
  }

  function removeFile(id: string) { dispatchFiles({ type: 'REMOVE', id }) }

  async function saveFile(id: string, meta: ImportRelazioneMeta) {
    const fileEntry = files.find(f => f.id === id)
    if (!fileEntry) return

    dispatchFiles({ type: 'UPDATE', id, patch: { status: 'saving' } })

    try {
      let paziente_id = null
      if (meta.codice_paziente) {
        const p = await upsertPaziente(meta.codice_paziente)
        paziente_id = p?.id ?? null
      }

      // Upload file originale solo se Supabase è realmente configurato
      let storagePath = null
      if (!USE_MOCK) {
        storagePath = `${Date.now()}_${fileEntry.name}`
        await supabase.storage.from('docx-originali').upload(storagePath, fileEntry.file, {
          contentType: fileEntry.kind === 'docx' || fileEntry.kind === 'pdf' ? CONTENT_TYPES[fileEntry.kind] : 'application/octet-stream',
        })
      }

      await insertRelazione({
        titolo: meta.titolo,
        tipo: 'importata',
        tipo_relazione: meta.tipo_relazione || null,
        anno: meta.anno,
        testo_markdown: fileEntry.markdown,
        testo_originale_path: storagePath,
        paziente_id,
        tag: [],
      })

      dispatchFiles({ type: 'UPDATE', id, patch: { status: 'saved' } })
    } catch (err: unknown) {
      console.error(err)
      const message = err instanceof Error ? err.message : 'errore sconosciuto'
      dispatchFiles({ type: 'UPDATE', id, patch: { status: 'error', errorMsg: 'Errore durante il salvataggio: ' + message } })
    }
  }

  return (
    <>
      <div className="topbar">
        <div>
          <div className="topbar-title">Importa relazioni</div>
          <div className="topbar-sub">Carica i tuoi file Word o PDF esistenti</div>
        </div>
      </div>

      <div className="page-body">
        <div className="alert alert-warn" style={{ marginBottom: 16 }}>
          <AlertTriangle size={15} style={{ flexShrink: 0 }} />
          <span>
            Il testo delle relazioni viene anonimizzato automaticamente prima di essere inviato a Gemini per l'analisi dello stile, ma l'anonimizzazione automatica non è garantita al 100% — verifica sempre l'anteprima prima di confermare.
          </span>
        </div>

        {USE_MOCK && (
          <div className="alert alert-warn" style={{ marginBottom: 16 }}>
            <FlaskConical size={15} style={{ flexShrink: 0 }} />
            <span>Modalità demo — la conversione DOCX→Markdown è reale, ma il salvataggio resta solo in memoria locale (si perde al refresh). Configura Supabase per la persistenza.</span>
          </div>
        )}

        <div className="alert alert-info">
          <Upload size={15} style={{ flexShrink: 0, marginTop: 1 }} />
          <span>
            I file vengono elaborati localmente nel browser — il testo non lascia il tuo dispositivo finché non premi "Salva in archivio".
            Non includere mai nomi reali dei pazienti: usa codici (es. PAZ-001). I file <strong>.doc</strong> (Word 97-2003) vanno prima salvati come <strong>.docx</strong> da Word.
          </span>
        </div>

        <div
          className={`dropzone ${dragOver ? 'drag-over' : ''}`}
          onClick={() => inputRef.current?.click()}
          onDragOver={e => { e.preventDefault(); if (!dragOver) toggleDrag() }}
          onDragLeave={() => dragOver && toggleDrag()}
          onDrop={onDrop}
        >
          <div className="dropzone-icon"><Upload size={32} /></div>
          <h3>Trascina i file qui</h3>
          <p>DOCX, PDF — oppure clicca per selezionare, puoi caricare più file insieme</p>
          <input ref={inputRef} type="file" accept=".doc,.docx,.pdf" multiple style={{ display: 'none' }} onChange={onFileChange} />
        </div>

        {files.length > 0 && (
          <div className="file-list">
            {files.map(f => <FileItem key={f.id} file={f} onRemove={removeFile} onSave={saveFile} />)}
          </div>
        )}
      </div>
    </>
  )
}
