// ============================================================
// FILE EXTRACTOR — astrae l'estrazione di testo da DOCX, PDF, DOC
// Ogni formato ha pipeline diversa, ma l'output è sempre lo stesso:
// { markdown: string, warning?: string }
// ============================================================
import mammoth from 'mammoth'
import * as pdfjsLib from 'pdfjs-dist'

// Il worker è servito come asset statico da /public (vedi SETUP.md)
pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'

export function getFileKind(filename) {
  const ext = filename.toLowerCase().split('.').pop()
  if (ext === 'docx') return 'docx'
  if (ext === 'doc')  return 'doc'
  if (ext === 'pdf')  return 'pdf'
  return 'unsupported'
}

// ── DOCX (via Mammoth, invariato) ──────────────────────────
async function extractDocx(file) {
  const buffer = await file.arrayBuffer()
  const result = await mammoth.convertToMarkdown({ arrayBuffer: buffer })
  const md = result.value.trim()
  if (!md) throw new Error('Il file non contiene testo estraibile.')
  return { markdown: md }
}

// ── PDF (via pdf.js) ───────────────────────────────────────
// Il testo estratto è "piatto": pdf.js restituisce stringhe posizionate
// sulla pagina, senza concetto di titolo/grassetto/elenco come in un DOCX.
// Si ricostruiscono i paragrafi raggruppando le righe consecutive e si
// separano le pagine con un separatore visibile, utile per Gemini in fase
// di analisi anche se il Markdown risultante è meno strutturato.
async function extractPdf(file) {
  const buffer = await file.arrayBuffer()
  const pdf = await pdfjsLib.getDocument({ data: buffer }).promise

  const pageTexts = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const content = await page.getTextContent()

    // Raggruppa gli "items" in righe basandosi sulla coordinata Y,
    // poi unisce le righe in paragrafi quando il gap verticale è piccolo.
    let lastY = null
    let lines = []
    let currentLine = []

    for (const item of content.items) {
      const y = item.transform[5]
      if (lastY !== null && Math.abs(y - lastY) > 2) {
        lines.push(currentLine.join(' '))
        currentLine = []
      }
      currentLine.push(item.str)
      lastY = y
    }
    if (currentLine.length) lines.push(currentLine.join(' '))

    pageTexts.push(lines.join('\n').trim())
  }

  const markdown = pageTexts
    .filter(Boolean)
    .join('\n\n---\n\n') // separatore di pagina, visibile ma non invasivo
    .trim()

  if (!markdown) throw new Error('Nessun testo selezionabile trovato nel PDF.')

  return {
    markdown,
    warning: 'Testo estratto da PDF: la struttura (titoli, elenchi) non è riconosciuta automaticamente come nei file Word. Verifica l\'anteprima prima di salvare.',
  }
}

// ── DOC legacy (non supportato lato client) ────────────────
async function extractDoc() {
  throw new Error(
    'Il formato .doc (Word 97-2003) non può essere letto direttamente dal browser. ' +
    'Apri il file in Word, scegli "Salva con nome" → formato .docx, poi ricarica qui il nuovo file.'
  )
}

// ── Entry point unico ──────────────────────────────────────
export async function extractText(file) {
  const kind = getFileKind(file.name)
  switch (kind) {
    case 'docx': return extractDocx(file)
    case 'pdf':  return extractPdf(file)
    case 'doc':  return extractDoc(file)
    default:     throw new Error('Formato file non supportato. Usa .docx, .pdf, oppure converti i file .doc in .docx.')
  }
}
