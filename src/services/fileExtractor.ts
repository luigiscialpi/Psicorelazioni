// ============================================================
// FILE EXTRACTOR — astrae l'estrazione di testo da DOCX, PDF, DOC
// Ogni formato ha pipeline diversa, ma l'output è sempre lo stesso:
// { markdown: string, warning?: string }
// ============================================================
import type { ExtractedText, FileKind } from '../core/types'

type MammothNode = {
  value?: string
  isBold?: boolean
  styleId?: string
  styleName?: string
}

type MammothWithTransforms = {
  transforms: {
    getDescendantsOfType(node: MammothNode, type: string): MammothNode[]
    paragraph(transform: (paragraph: MammothNode) => unknown): unknown
  }
  convertToMarkdown(
    input: { arrayBuffer: ArrayBuffer },
    options: { styleMap: string[]; transformDocument: unknown },
  ): Promise<{ value: string }>
}

type TurndownConstructor = new (options: Record<string, unknown>) => {
  addRule(name: string, rule: { filter: string | string[]; replacement: () => string }): void
  remove(filters: string[]): void
  turndown(input: Element): string
}

type PandocResult = {
  stdout?: string
  files?: Record<string, string | Blob>
}

type PdfTextItem = {
  str: string
  height: number
  transform: number[]
  dir: string
  width: number
  fontName: string
  hasEOL: boolean
}

type PdfLine = {
  y: number
  prevY: number | null
  height: number
  parts: string[]
}

// Il worker è servito come asset statico da /public (vedi README.md, §2 Setup)

export function getFileKind(filename: string): FileKind {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'docx') return 'docx'
  if (ext === 'doc')  return 'doc'
  if (ext === 'pdf')  return 'pdf'
  return 'unsupported'
}

// ── DOCX (pipeline alternativa + fallback) ─────────────────
// Pipeline primaria: docx-preview (render HTML più fedele) + Turndown
// (HTML -> Markdown). Questa strada è spesso più leggibile dei risultati
// ottenuti da convertToMarkdown diretto.
//
// Fallback: Mammoth, mantenuto come rete di sicurezza quando il rendering
// alternativo non produce testo utile.

// Mappa gli stili di Word (anche in italiano) verso heading/liste Markdown.
const DOCX_STYLE_MAP = [
  "p[style-name='Title'] => h1:fresh",
  "p[style-name='Titolo'] => h1:fresh",
  "p[style-name^='Heading 1'] => h1:fresh",
  "p[style-name^='Titolo 1'] => h1:fresh",
  "p[style-name^='Heading 2'] => h2:fresh",
  "p[style-name^='Titolo 2'] => h2:fresh",
  "p[style-name^='Heading 3'] => h3:fresh",
  "p[style-name^='Titolo 3'] => h3:fresh",
  "p[style-name^='Heading'] => h2:fresh",
  "p[style-name^='Titolo'] => h2:fresh",
  "p[style-name='Subtitle'] => h2:fresh",
  "p[style-name='Sottotitolo'] => h2:fresh",
]

// Normalizza il Markdown prodotto: righe vuote multiple, spazi finali,
// e i grassetti "vuoti" (**  **) che Mammoth può lasciare.
function ripulisciMarkdown(md: string) {
  return md
    .replace(/[ \t]+$/gm, '')          // spazi a fine riga
    .replace(/\*\*\s*\*\*/g, '')       // grassetti vuoti
    .replace(/__\s*__/g, '')           // enfasi vuota
    .replace(/\u00A0/g, ' ')           // nbsp -> spazio normale
    .replace(/[ \t]{2,}/g, ' ')        // spazi multipli
    .replace(/\n{3,}/g, '\n\n')        // massimo una riga vuota
    .trim()
}

function mediana(nums: number[]) {
  if (!nums.length) return 0
  const sorted = [...nums].sort((a, b) => a - b)
  return sorted[Math.floor(sorted.length / 2)]
}

// Promuove a heading i blocchi con testo breve e font sensibilmente maggiore.
function promuoviTitoliDaStile(container: Element) {
  const blocchi = Array.from(container.querySelectorAll<HTMLElement>('p, div'))
    .filter(el => el.childElementCount === 0 || !el.querySelector('p, div, li, table'))

  const campioni = blocchi
    .map(el => {
      const txt = (el.textContent || '').replace(/\s+/g, ' ').trim()
      const fs = parseFloat(window.getComputedStyle(el).fontSize || '0')
      return { el, txt, fs }
    })
    .filter(x => x.txt && x.fs > 0)

  const base = mediana(campioni.map(x => x.fs))
  if (!base) return

  for (const { el, txt, fs } of campioni) {
    const cs = window.getComputedStyle(el)
    const fw = parseInt(cs.fontWeight, 10)
    const isBold = Number.isFinite(fw) ? fw >= 600 : /bold/i.test(cs.fontWeight)
    const short = txt.length <= 110
    const headingByClass = /heading|title|titolo/i.test(`${el.className || ''} ${el.getAttribute('style') || ''}`)
    const headingBySize = fs >= base * 1.25 && short

    if (!headingByClass && !(headingBySize && isBold)) continue
    if (/[.!?;:]$/.test(txt)) continue

    const h = document.createElement(fs >= base * 1.55 ? 'h1' : 'h2')
    h.innerHTML = el.innerHTML
    el.replaceWith(h)
  }
}

function creaTurndownService(TurndownService: TurndownConstructor) {
  const td = new TurndownService({
    headingStyle: 'atx',
    bulletListMarker: '-',
    codeBlockStyle: 'fenced',
    emDelimiter: '*',
    strongDelimiter: '**',
  })

  // Mantieni i line-break clinicamente rilevanti (elenchi, recapiti, sezioni brevi)
  td.addRule('lineBreak', {
    filter: 'br',
    replacement: () => '  \n',
  })

  // Rimuove riferimenti a elementi non testuali in output markdown
  td.remove(['style', 'script', 'noscript'])
  return td
}

async function extractDocxConDocxPreview(file: File) {
  const buffer = await file.arrayBuffer()

  const docxPreviewMod = await import('docx-preview')
  const TurndownMod = await import('turndown')

  const renderAsync =
    docxPreviewMod.renderAsync ||
    docxPreviewMod.default?.renderAsync ||
    docxPreviewMod.default

  if (typeof renderAsync !== 'function') {
    throw new Error('Impossibile inizializzare docx-preview.')
  }

  const TurndownService = TurndownMod.default
  if (!TurndownService) throw new Error('Impossibile inizializzare Turndown.')

  const host = document.createElement('div')
  host.style.position = 'fixed'
  host.style.left = '-99999px'
  host.style.top = '0'
  host.style.width = '1200px'
  host.style.pointerEvents = 'none'
  host.setAttribute('aria-hidden', 'true')

  const bodyContainer = document.createElement('div')
  const styleContainer = document.createElement('div')
  host.appendChild(styleContainer)
  host.appendChild(bodyContainer)
  document.body.appendChild(host)

  try {
    await renderAsync(buffer, bodyContainer, styleContainer, {
      className: 'docx',
      inWrapper: false,
      ignoreWidth: true,
      ignoreHeight: true,
      breakPages: false,
      renderHeaders: false,
      renderFooters: false,
      renderFootnotes: true,
      renderEndnotes: true,
    })

    // Riduce il rumore del layout Word e prova a ripristinare heading semantici.
    bodyContainer.querySelectorAll('.docx-page-break, .docx-page-number, header, footer').forEach(n => n.remove())
    promuoviTitoliDaStile(bodyContainer)

    const turndown = creaTurndownService(TurndownService)
    return ripulisciMarkdown(turndown.turndown(bodyContainer))
  } finally {
    host.remove()
  }
}

async function extractDocxConPandocWasm(file: File) {
  const pandocBrowser = await import('./pandocBrowser')
  const convert = pandocBrowser.convertWithPandoc
  if (typeof convert !== 'function') throw new Error('Impossibile inizializzare pandoc-wasm.')

  const options = {
    from: 'docx+styles',
    to: 'gfm+pipe_tables+table_captions+raw_html',
    wrap: 'none',
    'markdown-headings': 'atx',
    'output-file': 'out.md',
  }

  const files = {
    'input.docx': file,
  }

  const result: PandocResult = await convert(options, null, files)
  const out = result?.files?.['out.md'] ?? result?.stdout ?? ''

  let markdown = ''
  if (typeof out === 'string') {
    markdown = out
  } else if (out instanceof Blob) {
    markdown = await out.text()
  }

  const cleaned = ripulisciMarkdown(markdown)
  if (!cleaned) throw new Error('Pandoc non ha prodotto testo utile.')
  return cleaned
}

async function extractDocxConMammoth(file: File) {
  const mammoth = (await import('mammoth')).default as unknown as MammothWithTransforms
  const buffer = await file.arrayBuffer()

  function promuoviTitoliGrassetto(paragraph: MammothNode): MammothNode {
    if (paragraph.styleId || paragraph.styleName) return paragraph

    const runs = mammoth.transforms.getDescendantsOfType(paragraph, 'run')
    const texts = mammoth.transforms.getDescendantsOfType(paragraph, 'text')
    const testo = texts.map((t: MammothNode) => t.value || '').join('').trim()

    if (!testo || testo.length > 90) return paragraph
    if (runs.length === 0) return paragraph

    const tuttoGrassetto = runs.every((r: MammothNode) => r.isBold)
    if (!tuttoGrassetto) return paragraph

    if (/[.!?;:]$/.test(testo)) return paragraph

    return { ...paragraph, styleId: 'Heading2', styleName: 'Heading 2' }
  }

  const result = await mammoth.convertToMarkdown(
    { arrayBuffer: buffer },
    {
      styleMap: DOCX_STYLE_MAP,
      transformDocument: mammoth.transforms.paragraph(promuoviTitoliGrassetto),
    },
  )
  return ripulisciMarkdown(result.value)
}

async function extractDocx(file: File): Promise<ExtractedText> {
  try {
    const markdown = await extractDocxConPandocWasm(file)
    if (markdown && markdown.length >= 40) {
      return { markdown }
    }
  } catch (err) {
    console.warn('[extractDocx] pipeline pandoc-wasm non riuscita, fallback su docx-preview:', err)
  }

  try {
    const markdown = await extractDocxConDocxPreview(file)
    if (markdown && markdown.length >= 40) {
      return {
        markdown,
        warning: 'Conversione DOCX effettuata in modalità compatibilità (docx-preview).',
      }
    }
  } catch (err) {
    console.warn('[extractDocx] pipeline docx-preview non riuscita, fallback su Mammoth:', err)
  }

  const markdown = await extractDocxConMammoth(file)
  if (!markdown) throw new Error('Il file non contiene testo estraibile.')

  return {
    markdown,
    warning: 'Conversione DOCX effettuata in modalità compatibilità (fallback). Se l’impaginazione non è ideale, prova a riesportare il file da Word in .docx recente.',
  }
}

// ── PDF (via pdf.js) ───────────────────────────────────────
// pdf.js restituisce frammenti di testo posizionati sulla pagina, senza
// concetto di titolo/paragrafo. Ricostruiamo la struttura in tre passaggi:
//   1) raggruppa i frammenti in righe usando la coordinata Y;
//   2) misura l'altezza del font per riconoscere le intestazioni (font più
//      grande della media → titolo Markdown);
//   3) unisce le righe in paragrafi, spezzando dove il salto verticale è
//      ampio (riga vuota) e ricongiungendo le parole sillabate a fine riga.
async function extractPdf(file: File): Promise<ExtractedText> {
  const pdfjsLib = await import('pdfjs-dist')
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const pageBlocks: string[] = []

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // 1) Raggruppa gli items in righe { y, height, text, gap }
    const righe: PdfLine[] = []
    let lastY: number | null = null
    let current: PdfLine | null = null

    for (const item of content.items.filter((value): value is PdfTextItem => 'str' in value && 'transform' in value)) {
      const y = item.transform[5]
      const h = item.height || Math.abs(item.transform[3]) || 0

      if (current && lastY !== null && Math.abs(y - lastY) > 2) {
        righe.push(current)
        current = null
      }
      if (!current) {
        current = { y, prevY: lastY, height: h, parts: [] }
      }
      current.height = Math.max(current.height, h)
      current.parts.push(item.str)
      lastY = y
    }
    if (current) righe.push(current)

    // Testo pulito di ogni riga + gap verticale rispetto alla precedente
    const rExt = righe
      .map((r, idx) => {
        const testo = r.parts.join('').replace(/[ \t]{2,}/g, ' ').trim()
        const prec = righe[idx - 1]
        const gap = prec ? Math.abs(prec.y - r.y) : 0
        return { testo, height: r.height, gap }
      })
      .filter(r => r.testo)

    if (rExt.length === 0) continue

    // 2) Altezza font "di corpo" = mediana, per stimare le intestazioni
    const heights = rExt.map(r => r.height).filter(Boolean).sort((a, b) => a - b)
    const heightBase = heights.length ? heights[Math.floor(heights.length / 2)] : 0
    // Interlinea tipica per capire quando un gap è "riga vuota" (nuovo paragrafo)
    const gaps = rExt.map(r => r.gap).filter(g => g > 0).sort((a, b) => a - b)
    const gapBase = gaps.length ? gaps[Math.floor(gaps.length / 2)] : 0

    // 3) Ricostruisce i paragrafi
    const out: string[] = []
    let paragrafo = ''

    const flush = () => {
      if (paragrafo.trim()) out.push(paragrafo.trim())
      paragrafo = ''
    }

    for (const r of rExt) {
      const isHeading =
        heightBase > 0 && r.height >= heightBase * 1.25 && r.testo.length <= 90

      // Un gap sensibilmente maggiore dell'interlinea = nuovo paragrafo
      const nuovoParagrafo = gapBase > 0 && r.gap > gapBase * 1.6

      if (isHeading) {
        flush()
        const livello = heightBase > 0 && r.height >= heightBase * 1.6 ? '#' : '##'
        out.push(`${livello} ${r.testo}`)
        continue
      }

      if (nuovoParagrafo) flush()

      if (!paragrafo) {
        paragrafo = r.testo
      } else if (/[\u00AD-]$/.test(paragrafo)) {
        // parola sillabata a fine riga: unisci senza spazio
        paragrafo = paragrafo.replace(/[\u00AD-]$/, '') + r.testo
      } else {
        paragrafo += ' ' + r.testo
      }
    }
    flush()

    pageBlocks.push(out.join('\n\n'))
  }

  const markdown = pageBlocks
    .filter(Boolean)
    .join('\n\n---\n\n') // separatore di pagina, visibile ma non invasivo
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  if (!markdown) throw new Error('Nessun testo selezionabile trovato nel PDF.')

  return {
    markdown,
    warning: 'Testo estratto da PDF: la struttura (titoli, elenchi) è ricostruita automaticamente e potrebbe non essere perfetta. Verifica l\'anteprima prima di salvare.',
  }
}

// ── DOC legacy (non supportato lato client) ────────────────
async function extractDoc(_file?: File): Promise<never> {
  throw new Error(
    'Il formato .doc (Word 97-2003) non può essere letto direttamente dal browser. ' +
    'Apri il file in Word, scegli "Salva con nome" → formato .docx, poi ricarica qui il nuovo file.'
  )
}

// ── Entry point unico ──────────────────────────────────────
export async function extractText(file: File): Promise<ExtractedText> {
  const kind = getFileKind(file.name)
  switch (kind) {
    case 'docx': return extractDocx(file)
    case 'pdf':  return extractPdf(file)
    case 'doc':  return extractDoc(file)
    default:     throw new Error('Formato file non supportato. Usa .docx, .pdf, oppure converti i file .doc in .docx.')
  }
}
