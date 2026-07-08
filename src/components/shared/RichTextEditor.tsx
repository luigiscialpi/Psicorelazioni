// ============================================================
// RICH TEXT EDITOR — toggle Visuale / Testo per la bozza della relazione
// (RisultatoGenerazione.tsx), sul modello dell'editor di Jira/Confluence.
//
// Il contenuto è SEMPRE Markdown — lo stesso formato consumato da
// exportDocx.ts — mai un formato parallelo. In modalità "Visuale" viene
// mostrato/editato come rich text in un contentEditable (document.execCommand
// per grassetto/corsivo/elenchi/titolo), e riconvertito in Markdown con
// Turndown ad ogni azione rilevante (blur, click toolbar, cambio modalità,
// flush() imperativo prima di Salva/Esporta).
//
// Grammatica supportata end-to-end con exportDocx.ts:
//   # Titolo principale   ## Titolo sezione   **grassetto**   *corsivo*
//   - elenco puntato      1. elenco numerato
// Font e dimensione NON sono editabili qui: il DOCX finale usa sempre
// Calibri fisso (fedeltà al template reale ricavato dall'XML originale,
// vedi intestazione di exportDocx.ts) — un selettore di font/size
// sembrerebbe funzionare a video ma verrebbe silenziosamente ignorato in
// export, un comportamento ingannevole che qui evitiamo deliberatamente.
// Il "formato" disponibile è quindi solo Titolo principale/sezione/Testo
// normale, cioè gli unici tre livelli che l'esportatore capisce davvero.
//
// Blocchi "grezzi" (righe che iniziano con "|" o con 4+ spazi — in genere
// tabelle di punteggio incollate da software esterni, trattate da
// exportDocx.ts come testo monospace verbatim) vengono preservati
// byte-per-byte nel giro Markdown -> HTML -> Markdown: qui sono mostrati
// come blocco monospace non modificabile (contenteditable="false"),
// editabile solo passando in modalità Testo. Senza questa precauzione,
// remark potrebbe interpretarli come tabella GFM "pulita" e Turndown li
// riscriverebbe con una riga di separazione (| --- | --- |) mai incollata
// dall'utente, o con spaziature diverse — la stessa classe di bug del
// "doppio-table" già affrontata in exportDocx.ts.
// ============================================================

import { useEffect, useImperativeHandle, useRef, useState, forwardRef } from 'react'
import TurndownService from 'turndown'
import { Bold, Italic, List, ListOrdered, Eye, Code2 } from 'lucide-react'

export type RichTextEditorHandle = {
  /** Sincronizza il contenuto visuale in Markdown e lo restituisce subito
   *  (non dipende dal giro di re-render di React) — da chiamare prima di
   *  qualunque salvataggio/esportazione. */
  flush: () => string
}

type Props = {
  value: string
  onChange: (markdown: string) => void
  minHeight?: number
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

// ── Blocchi grezzi (tabelle incollate / righe indentate) ────────────────
function isRawLine(line: string): boolean {
  return /^\s*\|.*\|\s*$/.test(line) || /^ {4,}\S/.test(line)
}

type Segment = { raw: boolean; text: string }

function splitSegments(markdown: string): Segment[] {
  const lines = markdown.split('\n')
  const segments: Segment[] = []
  let buffer: string[] = []
  let bufferRaw: boolean | null = null

  const flush = () => {
    if (buffer.length) segments.push({ raw: Boolean(bufferRaw), text: buffer.join('\n') })
    buffer = []
  }

  for (const line of lines) {
    const raw = isRawLine(line)
    if (bufferRaw !== null && raw !== bufferRaw) flush()
    bufferRaw = raw
    buffer.push(line)
  }
  flush()
  return segments
}

// Inline **grassetto**/*corsivo* -> HTML. Stessa strategia "coppie
// bilanciate" (bold non-greedy, poi italic non-greedy sul resto) di
// parseInline() in exportDocx.ts, cosicché l'anteprima Visuale mostri
// esattamente ciò che l'esportatore interpreterà — nessuna doppia fonte
// di verità sulla grammatica supportata.
function inlineToHtml(text: string): string {
  let html = escapeHtml(text)
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>')
  return html
}

// Markdown "supportato" (# / ## / **bold** / *italic* / elenchi / paragrafi)
// -> HTML per il contentEditable. Nessuna libreria Markdown generica: viene
// tenuto volutamente minimale e speculare a markdownToParagraphs() in
// exportDocx.ts, per restare sempre in sincrono con ciò che il DOCX finale
// capisce davvero (niente H3+, niente tabelle GFM auto-riconosciute, ecc.)
// evitando anche di appesantire il bundle con un motore di rendering.
function proseToHtml(markdown: string): string {
  const lines = markdown.split('\n')
  const parts: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null

  const flushList = () => {
    if (!list) return
    const tag = list.ordered ? 'ol' : 'ul'
    parts.push(`<${tag}>${list.items.map(it => `<li>${inlineToHtml(it)}</li>`).join('')}</${tag}>`)
    list = null
  }

  for (const line of lines) {
    if (line.startsWith('# ')) { flushList(); parts.push(`<h1>${inlineToHtml(line.slice(2).trim())}</h1>`); continue }
    if (line.startsWith('## ')) { flushList(); parts.push(`<h2>${inlineToHtml(line.slice(3).trim())}</h2>`); continue }
    if (line.trim() === '') { flushList(); continue }

    // Stessi pattern di parseListItem() in exportDocx.ts — vanno tenuti allineati.
    const bullet = line.match(/^\s*[-*]\s+(.+)$/)
    const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
    if (bullet) {
      if (!list || list.ordered) { flushList(); list = { ordered: false, items: [] } }
      list.items.push(bullet[1])
      continue
    }
    if (numbered) {
      if (!list || !list.ordered) { flushList(); list = { ordered: true, items: [] } }
      list.items.push(numbered[1])
      continue
    }

    flushList()
    parts.push(`<p>${inlineToHtml(line.trim())}</p>`)
  }
  flushList()
  return parts.join('')
}

function markdownToHtml(markdown: string): string {
  if (!markdown.trim()) return '<p><br></p>'
  return splitSegments(markdown)
    .map(seg => seg.raw
      ? `<pre class="rich-editor-rawblock" contenteditable="false" data-raw-block="1" title="Blocco tabellare — modificabile solo in modalità Testo">${escapeHtml(seg.text)}</pre>`
      : proseToHtml(seg.text))
    .join('\n')
}

// ── Turndown (HTML -> Markdown): stessa configurazione di base usata per
// l'import DOCX in fileExtractor.ts, più le regole per i blocchi grezzi e
// per eventuali titoli H3+ (mai prodotti da questa toolbar, ma possibili
// se il testo arriva da un documento importato con quel livello di titolo).
let turndownSingleton: TurndownService | null = null
function getTurndown(): TurndownService {
  if (turndownSingleton) return turndownSingleton
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  })
  td.addRule('lineBreak', { filter: 'br', replacement: () => '  \n' })
  td.addRule('rawBlock', {
    filter: (node) => node.nodeName === 'PRE' && node.getAttribute('data-raw-block') === '1',
    replacement: (_content, node) => '\n\n' + (node.textContent || '') + '\n\n',
  })
  // exportDocx.ts riconosce solo # e ## : un H3+ (possibile solo da un
  // import, mai da questa toolbar) degrada a grassetto invece che a
  // "### " letterale stampato nel DOCX.
  td.addRule('deepHeading', {
    filter: ['h3', 'h4', 'h5', 'h6'],
    replacement: content => `\n\n**${content}**\n\n`,
  })
  td.remove(['style', 'script', 'noscript'])
  turndownSingleton = td
  return td
}

function htmlToMarkdown(container: HTMLElement): string {
  const md = getTurndown().turndown(container)
  return md.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

const RichTextEditor = forwardRef<RichTextEditorHandle, Props>(function RichTextEditor(
  { value, onChange, minHeight = 520 },
  ref,
) {
  const [mode, setMode] = useState<'visual' | 'text'>('visual')
  const editableRef = useRef<HTMLDivElement>(null)
  const lastEmittedRef = useRef<string>(value)
  const syncedOnceRef = useRef(false)

  // Ri-sincronizza l'HTML del contentEditable da `value` SOLO quando il
  // cambiamento non è un'eco di ciò che l'editor stesso ha appena emesso —
  // altrimenti sposteremmo il cursore ad ogni battitura dell'utente.
  useEffect(() => {
    if (mode !== 'visual') return
    if (syncedOnceRef.current && value === lastEmittedRef.current) return
    if (editableRef.current) editableRef.current.innerHTML = markdownToHtml(value)
    syncedOnceRef.current = true
  }, [value, mode])

  function emitFromVisual() {
    if (!editableRef.current) return
    const md = htmlToMarkdown(editableRef.current)
    lastEmittedRef.current = md
    onChange(md)
  }

  function goText() {
    emitFromVisual()
    setMode('text')
  }

  useImperativeHandle(ref, () => ({
    flush: () => {
      if (mode === 'visual' && editableRef.current) {
        const md = htmlToMarkdown(editableRef.current)
        lastEmittedRef.current = md
        onChange(md)
        return md
      }
      return value
    },
  }), [mode, value, onChange])

  function exec(command: string, arg?: string) {
    editableRef.current?.focus()
    document.execCommand(command, false, arg)
    emitFromVisual()
  }

  return (
    <div className="rich-editor">
      <div className="rich-editor-tabs">
        <button
          type="button"
          className={`rich-editor-tab ${mode === 'visual' ? 'active' : ''}`}
          onClick={() => setMode('visual')}
        >
          <Eye size={13} /> Visuale
        </button>
        <button
          type="button"
          className={`rich-editor-tab ${mode === 'text' ? 'active' : ''}`}
          onClick={goText}
        >
          <Code2 size={13} /> Testo
        </button>
      </div>

      {mode === 'visual' && (
        <div className="rich-editor-toolbar">
          <select
            className="rich-editor-format-select"
            defaultValue=""
            onChange={e => {
              if (!e.target.value) return
              exec('formatBlock', e.target.value)
              e.target.value = ''
            }}
          >
            <option value="" disabled>Formato…</option>
            <option value="<h1>">Titolo principale</option>
            <option value="<h2>">Titolo sezione</option>
            <option value="<p>">Testo normale</option>
          </select>
          <span className="rich-editor-sep" />
          <button type="button" className="rich-editor-btn" title="Grassetto" onClick={() => exec('bold')}>
            <Bold size={14} />
          </button>
          <button type="button" className="rich-editor-btn" title="Corsivo" onClick={() => exec('italic')}>
            <Italic size={14} />
          </button>
          <span className="rich-editor-sep" />
          <button type="button" className="rich-editor-btn" title="Elenco puntato" onClick={() => exec('insertUnorderedList')}>
            <List size={14} />
          </button>
          <button type="button" className="rich-editor-btn" title="Elenco numerato" onClick={() => exec('insertOrderedList')}>
            <ListOrdered size={14} />
          </button>
        </div>
      )}

      {/* Le due superfici restano SEMPRE montate (visibilità via CSS, non
          via montaggio condizionale): se il contentEditable venisse
          smontato passando a "Testo" e rimontato tornando a "Visuale",
          React creerebbe un div vuoto, e l'ottimizzazione anti-cursor-jump
          qui sotto (che salta la resync quando pensa che il contenuto sia
          già allineato) lo lascerebbe vuoto — perdendo il testo, come
          osservato: "torno in Visuale e non c'è più nulla". */}
      <div
        ref={editableRef}
        className="rich-editor-surface rich-editor-surface--attached markdown-profile form-textarea"
        style={{ minHeight, display: mode === 'visual' ? 'block' : 'none' }}
        contentEditable
        suppressContentEditableWarning
        onBlur={emitFromVisual}
      />
      <textarea
        className="form-textarea rich-editor-surface"
        value={value}
        onChange={e => onChange(e.target.value)}
        style={{ minHeight, display: mode === 'text' ? 'block' : 'none', fontFamily: 'var(--font-ui)', fontSize: 13.5, lineHeight: 1.8 }}
      />
    </div>
  )
})

export default RichTextEditor
