import { useReducer, useRef, useCallback } from 'react'
import { Upload, FileText, CheckCircle, AlertCircle, X, Save, Eye, EyeOff, FlaskConical, AlertTriangle } from 'lucide-react'
import { insertRelazione, upsertPaziente, USE_MOCK } from './dataService'
import { supabase } from './supabase'
import { extractText, getFileKind } from './fileExtractor'

const TIPI_RELAZIONE = ['', 'valutazione-completa', 'rivalutazione', 'approfondimento', 'certificazione-dsa', 'altro']
const uid = () => Math.random().toString(36).slice(2)

// Content-type corretto per Supabase Storage in base al formato originale
const CONTENT_TYPES = {
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pdf:  'application/pdf',
}

function FileKindBadge({ kind }) {
  const labels = { docx: 'DOCX', pdf: 'PDF', doc: 'DOC' }
  const colors = {
    docx: { bg: 'var(--accent-lt)', fg: 'var(--accent-dk)' },
    pdf:  { bg: '#FEE2E2', fg: '#991B1B' },
    doc:  { bg: '#FEF3C7', fg: '#92400E' },
  }
  const c = colors[kind] || colors.doc
  return (
    <span style={{ fontSize: 10, fontWeight: 600, padding: '2px 6px', borderRadius: 4, background: c.bg, color: c.fg, flexShrink: 0 }}>
      {labels[kind] || '?'}
    </span>
  )
}

// ── Reducer per la lista file ──────────────────────────────
function filesReducer(state, action) {
  switch (action.type) {
    case 'ADD':
      return [...state, action.entry]
    case 'UPDATE':
      return state.map(f => f.id === action.id ? { ...f, ...action.patch } : f)
    case 'REMOVE':
      return state.filter(f => f.id !== action.id)
    default:
      return state
  }
}

function FileItem({ file, onRemove, onSave }) {
  const [meta, dispatchMeta] = useReducer(
    (s, a) => ({ ...s, [a.k]: a.v }),
    {
      titolo: file.name.replace(/\.(docx?|pdf)$/i, ''),
      anno: new Date().getFullYear(),
      tipo_relazione: '',
      codice_paziente: '',
    }
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
              <input className="form-input" value={meta.titolo} onChange={e => dispatchMeta({ k: 'titolo', v: e.target.value })} />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Anno</label>
              <input className="form-input" type="number" min="2000" max="2100" value={meta.anno}
                onChange={e => dispatchMeta({ k: 'anno', v: parseInt(e.target.value) })} />
            </div>
          </div>

          <div className="meta-row" style={{ marginBottom: 10 }}>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Tipo relazione</label>
              <select className="form-select" value={meta.tipo_relazione} onChange={e => dispatchMeta({ k: 'tipo_relazione', v: e.target.value })}>
                {TIPI_RELAZIONE.map(t => <option key={t} value={t}>{t || '— seleziona —'}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label className="form-label">Codice paziente <span>(facoltativo)</span></label>
              <input className="form-input" placeholder="PAZ-001" value={meta.codice_paziente}
                onChange={e => dispatchMeta({ k: 'codice_paziente', v: e.target.value.toUpperCase() })} />
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
  const [files, dispatchFiles] = useReducer(filesReducer, [])
  const [dragOver, toggleDrag] = useReducer(s => !s, false)
  const inputRef = useRef()

  async function convertFile(fileObj) {
    const id = uid()
    const kind = getFileKind(fileObj.name)
    dispatchFiles({ type: 'ADD', entry: { id, name: fileObj.name, kind, status: 'converting', markdown: '', file: fileObj } })

    try {
      const { markdown, warning } = await extractText(fileObj)
      dispatchFiles({ type: 'UPDATE', id, patch: { status: 'ready', markdown, warning } })
    } catch (err) {
      dispatchFiles({ type: 'UPDATE', id, patch: { status: 'error', errorMsg: err.message } })
    }
  }

  const onDrop = useCallback(e => {
    e.preventDefault()
    toggleDrag()
    Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.(docx?|pdf)$/i)).forEach(convertFile)
  }, [])

  function onFileChange(e) {
    Array.from(e.target.files).forEach(convertFile)
    e.target.value = ''
  }

  function removeFile(id) { dispatchFiles({ type: 'REMOVE', id }) }

  async function saveFile(id, meta) {
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
          contentType: CONTENT_TYPES[fileEntry.kind] || 'application/octet-stream',
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
    } catch (err) {
      console.error(err)
      dispatchFiles({ type: 'UPDATE', id, patch: { status: 'error', errorMsg: 'Errore durante il salvataggio: ' + err.message } })
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
          onClick={() => inputRef.current.click()}
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
