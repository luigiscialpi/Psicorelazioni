// ============================================================
// EXPORT DOCX — genera un .docx fedele al template reale
// Struttura ricavata da screenshot della relazione originale:
//   - Intestazione: nome, qualifica, specializzazione (serif, sx)
//   - Data a sinistra, "RELAZIONE" centrato e sottolineato
//   - Corpo giustificato con rientro prima riga
//   - Tabelle WISC/NEPSY con intestazione in grassetto, bordi
//   - Numero pagina in basso a destra (X/Y)
//   - Font: Times New Roman, 11pt corpo, 12pt intestazione
//   - Margini A4: 2.5cm tutti i lati
// ============================================================

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageNumber, NumberFormat, UnderlineType,
} from 'docx'
import type { AnagraficaPaziente, ProfiloProfessionista } from '../core/types'

// ── Costanti layout ────────────────────────────────────────
const FONT        = 'Times New Roman'
const SIZE_BODY   = 22   // 11pt in half-points
const SIZE_HEADER = 24   // 12pt
const SIZE_SMALL  = 18   // 9pt (note sotto tabella)
const PAGE_W      = 11906 // A4 in DXA
const PAGE_H      = 16838
const MARGIN      = 1418  // ~2.5cm in DXA
const CONTENT_W   = PAGE_W - MARGIN * 2  // ~8070 DXA

// ── Helpers paragrafo ──────────────────────────────────────
type ParagraphOptions = {
  bold?: boolean
  underline?: boolean
  center?: boolean
  indent?: boolean
  size?: number
  spaceBefore?: number
  spaceAfter?: number
}

type InlineRun = {
  text: string
  bold: boolean
}

type MarkdownBlock =
  | { type: 'text'; content: string }
  | { type: 'table'; content: string }

type ExportDocxInput = {
  testo: string
  data?: string
  nomeStudio?: string
  anagrafica?: AnagraficaPaziente | null
  professionista?: ProfiloProfessionista | null
}

function para(text: string, opts: ParagraphOptions = {}): Paragraph {
  const {
    bold = false, underline = false, center = false, indent = false,
    size = SIZE_BODY, spaceBefore = 0, spaceAfter = 120,
  } = opts

  return new Paragraph({
    alignment: center ? AlignmentType.CENTER : AlignmentType.JUSTIFIED,
    indent: indent ? { firstLine: 720 } : undefined,
    spacing: { before: spaceBefore, after: spaceAfter },
    children: [
      new TextRun({
        text,
        font: FONT,
        size,
        bold,
        underline: underline ? { type: UnderlineType.SINGLE } : undefined,
      }),
    ],
  })
}

function emptyLine(spaceAfter = 120): Paragraph {
  return new Paragraph({ spacing: { after: spaceAfter }, children: [new TextRun('')] })
}

function formatDataIt(value?: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
}

function deAnonimizzaTesto(md: string, anagrafica?: AnagraficaPaziente | null): string {
  const fullName = [anagrafica?.nome, anagrafica?.cognome].filter(Boolean).join(' ').trim()
  const birthDate = formatDataIt(anagrafica?.data_nascita)
  const scuolaClasse = String(anagrafica?.scuola_classe || '').trim()

  let out = String(md || '')
  if (fullName) out = out.replace(/\[PAZIENTE\]/g, fullName)
  if (birthDate) out = out.replace(/\[DATA\]/g, birthDate)
  if (scuolaClasse) out = out.replace(/\[SCUOLA\]/g, scuolaClasse)
  return out
}

// ── Parser Markdown minimale → array di Paragraph ─────────
// Gestisce: ## titoli, **grassetto** inline, testo normale,
// blocchi monospace (tabelle incollate dal software di scoring)
function markdownToParagraphs(md: string): Paragraph[] {
  if (!md) return []
  const lines  = md.split('\n')
  const result: Paragraph[] = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    // Titolo H1
    if (line.startsWith('# ')) {
      result.push(para(line.slice(2).trim(), { bold: true, underline: true, center: true, size: SIZE_HEADER, spaceBefore: 240, spaceAfter: 180 }))
      continue
    }

    // Titolo H2
    if (line.startsWith('## ')) {
      result.push(para(line.slice(3).trim(), { bold: true, underline: true, center: true, spaceBefore: 200, spaceAfter: 140 }))
      continue
    }

    // Riga vuota
    if (line.trim() === '') {
      result.push(emptyLine(60))
      continue
    }

    // Separatore di pagina dal PDF extractor (---) → ignorato
    if (line.trim() === '---') continue

    // Riga monospace (tabella incollata dal software di scoring):
    // rilevata da pattern tipo "| col | col |" o da blocchi rientrati
    if (line.startsWith('|') || line.match(/^\s{4,}/)) {
      result.push(new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: line.trimEnd(), font: 'Courier New', size: SIZE_SMALL })],
      }))
      continue
    }

    // Testo normale con **grassetto** inline
    const runs = parseInline(line.trim())
    result.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { firstLine: 720 },
      spacing: { after: 120 },
      children: runs.map(r => new TextRun({ text: r.text, font: FONT, size: SIZE_BODY, bold: r.bold })),
    }))
  }

  return result
}

// Parser inline per **grassetto**
function parseInline(text: string): InlineRun[] {
  const parts: InlineRun[] = []
  const re    = /\*\*(.+?)\*\*/g
  let last    = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push({ text: text.slice(last, m.index), bold: false })
    parts.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ text: text.slice(last), bold: false })
  return parts.length ? parts : [{ text, bold: false }]
}

// ── Tabella WISC da testo strutturato ─────────────────────
// Se il Markdown contiene una sezione "| Scala | Indici/QI |..."
// la converte in una vera Table Word con intestazione in grassetto.
// Altrimenti il testo viene riportato in monospace come fallback.
function parseMarkdownTable(text: string): Table | null {
  const lines = text
    .split('\n')
    .map((line: string) => line.trim())
    .filter((line: string) => /^\|.*\|$/.test(line))
  if (lines.length < 2) return null

  const rows = lines
    .filter((line: string) => !line.match(/^\|[-\s|]+\|$/)) // rimuovi righe separatore
    .map((line: string) => line.split('|').slice(1, -1).map((cell: string) => cell.trim()))

  if (!rows.length) return null

  const colCount = rows[0].length
  const colW     = Math.floor(CONTENT_W / colCount)
  const colWidths = Array(colCount).fill(colW)

  const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' }
  const borders = { top: border, bottom: border, left: border, right: border }

  const tableRows = rows.map((row, ri) =>
    new TableRow({
      children: row.map(cell =>
        new TableCell({
          borders,
          width:   { size: colW, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: ri === 0 ? { fill: 'E8E8E8', type: ShadingType.CLEAR } : undefined,
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: cell, font: FONT, size: SIZE_BODY, bold: ri === 0 })],
            }),
          ],
        })
      ),
    })
  )

  return new Table({
    width:        { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows:         tableRows,
  })
}

function isTableLine(line: string): boolean {
  const l = String(line || '').trim()
  return /^\|.*\|$/.test(l)
}

function isTableSeparatorLine(line: string): boolean {
  const l = String(line || '').trim()
  return /^\|[-:\s|]+\|$/.test(l)
}

function splitMarkdownBlocks(md: string): MarkdownBlock[] {
  const lines = String(md || '').split('\n')
  const blocks: MarkdownBlock[] = []
  let textBuffer: string[] = []
  let tableBuffer: string[] = []

  const flushText = () => {
    if (textBuffer.length === 0) return
    blocks.push({ type: 'text', content: textBuffer.join('\n') })
    textBuffer = []
  }

  const flushTable = () => {
    if (tableBuffer.length === 0) return
    blocks.push({ type: 'table', content: tableBuffer.join('\n') })
    tableBuffer = []
  }

  for (const line of lines) {
    if (isTableLine(line)) {
      flushText()
      tableBuffer.push(line.trim())
      continue
    }

    // riga vuota immediatamente dopo una tabella: chiude il blocco tabella
    if (tableBuffer.length > 0 && line.trim() === '') {
      flushTable()
      textBuffer.push('')
      continue
    }

    // separatore markdown tabella fuori contesto: trattalo come testo
    if (isTableSeparatorLine(line) && tableBuffer.length === 0) {
      textBuffer.push(line)
      continue
    }

    if (tableBuffer.length > 0) {
      flushTable()
    }
    textBuffer.push(line)
  }

  flushTable()
  flushText()

  return blocks
}

// ── Intestazione fissa dello studio ───────────────────────
function splitHeaderLines(nomeStudio?: string, professionista?: ProfiloProfessionista | null): string[] {
  if (professionista && (professionista.nome_completo || professionista.titolo || professionista.specializzazione)) {
    const lines: string[] = []
    const nome = String(professionista.nome_completo || '').trim()
    const titolo = String(professionista.titolo || '').trim()
    const specializzazione = String(professionista.specializzazione || '').trim()
    const indirizzo = String(professionista.indirizzo || '').trim()
    const citta = String(professionista.citta || '').trim()
    const telefono = String(professionista.telefono || '').trim()
    const email = String(professionista.email || '').trim()
    const piva = String(professionista.partita_iva || '').trim()
    const cf = String(professionista.codice_fiscale || '').trim()

    if (nome) lines.push(nome)
    if (titolo) lines.push(titolo)
    if (specializzazione) lines.push(specializzazione)

    const location = [indirizzo, citta].filter(Boolean).join(', ')
    if (location) lines.push(location)

    const contatti = [telefono ? `Cell. ${telefono}` : '', email].filter(Boolean).join('  •  ')
    if (contatti) lines.push(contatti)

    const fisc = [piva ? `P.IVA ${piva}` : '', cf ? `CF ${cf}` : ''].filter(Boolean).join('  •  ')
    if (fisc) lines.push(fisc)

    if (lines.length) return lines
  }

  return (nomeStudio || 'Dr.ssa [Nome Cognome]\nPsicologa\nEsperta in Psicopatologia dell\'Apprendimento')
    .split('\n')
    .map((line: string) => line.trim())
    .filter(Boolean)
}

function makeHeader(nomeStudio?: string, professionista?: ProfiloProfessionista | null): Header {
  const [nome = 'Dr.ssa [Nome Cognome]', ...resto] = splitHeaderLines(nomeStudio, professionista)
  return new Header({
    children: [
      new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: nome, font: FONT, size: SIZE_HEADER, bold: true })],
      }),
      ...resto.map(r =>
        new Paragraph({
          spacing: { after: 40 },
          children: [new TextRun({ text: r, font: FONT, size: SIZE_BODY })],
        })
      ),
      // Linea separatrice sotto l'intestazione
      new Paragraph({
        border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: '333333', space: 4 } },
        spacing: { after: 0 },
        children: [new TextRun('')],
      }),
    ],
  })
}

function firmaProfessionistaParagraphs(professionista?: ProfiloProfessionista | null): Paragraph[] {
  if (!professionista) return []
  const nome = String(professionista.nome_completo || '').trim()
  const titolo = String(professionista.titolo || '').trim()
  if (!nome && !titolo) return []

  const lines = [
    new Paragraph({ spacing: { before: 260, after: 60 }, children: [new TextRun({ text: 'Firma', font: FONT, size: SIZE_BODY, bold: true })] }),
  ]

  if (nome) {
    lines.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: nome, font: FONT, size: SIZE_BODY, bold: true })] }))
  }
  if (titolo) {
    lines.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: titolo, font: FONT, size: SIZE_BODY })] }))
  }

  return lines
}

// ── Footer con numero pagina ───────────────────────────────
function makeFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_BODY }),
          new TextRun({ text: '/', font: FONT, size: SIZE_BODY }),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], font: FONT, size: SIZE_BODY }),
        ],
      }),
    ],
  })
}

// ── Funzione principale ────────────────────────────────────
// Costruisce il paragrafo di apertura con l'anagrafica reale —
// dati che non sono mai stati inviati a Gemini, ricomposti qui
// solo lato client al momento dell'export.
function anagraficaParagraph(anagrafica?: AnagraficaPaziente | null): Paragraph | null {
  if (!anagrafica) return null
  const { nome, cognome, data_nascita, scuola_classe } = anagrafica
  const nomeCompleto = [nome, cognome].filter(Boolean).join(' ')
  if (!nomeCompleto && !data_nascita && !scuola_classe) return null

  const dataFmt = data_nascita
    ? new Date(data_nascita).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const parti: string[] = []
  if (nomeCompleto) parti.push(nomeCompleto)
  if (dataFmt)      parti.push(`nato/a il ${dataFmt}`)
  if (scuola_classe) parti.push(scuola_classe)

  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 720 },
    spacing: { after: 200 },
    children: [new TextRun({ text: parti.join(', ') + '.', font: FONT, size: SIZE_BODY, bold: true })],
  })
}

export async function esportaDocx({ testo, data, nomeStudio, anagrafica, professionista }: ExportDocxInput): Promise<Blob> {
  const oggi = data || new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const testoPulito = deAnonimizzaTesto(testo, anagrafica)

  // Separa in blocchi testuali/tabellari senza duplicare righe tabella.
  const blocchi: Array<Paragraph | Table> = []

  for (const block of splitMarkdownBlocks(testoPulito)) {
    if (block.type === 'text') {
      blocchi.push(...markdownToParagraphs(block.content))
      continue
    }

    const table = parseMarkdownTable(block.content)
    if (table) {
      blocchi.push(table)
      blocchi.push(emptyLine(120))
    } else {
      // fallback: se il parser tabella non riconosce la struttura,
      // mantieni comunque il contenuto come testo per non perdere informazioni.
      blocchi.push(...markdownToParagraphs(block.content))
    }
  }

  const paraAnagrafica = anagraficaParagraph(anagrafica)

  const doc = new Document({
    numbering: { config: [] },
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE_BODY } },
      },
    },
    sections: [{
      properties: {
        page: {
          size:   { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN, right: MARGIN, bottom: MARGIN, left: MARGIN },
          pageNumbers: { start: 1, formatType: NumberFormat.DECIMAL },
        },
      },
      headers: { default: makeHeader(nomeStudio, professionista) },
      footers: { default: makeFooter() },
      children: [
        // Data e titolo
        new Paragraph({
          spacing: { before: 280, after: 80 },
          children: [new TextRun({ text: oggi, font: FONT, size: SIZE_BODY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 280 },
          children: [new TextRun({ text: 'RELAZIONE', font: FONT, size: SIZE_BODY, bold: true, underline: { type: UnderlineType.SINGLE } })],
        }),
        // Anagrafica reale — inserita qui, mai vista da Gemini
        ...(paraAnagrafica ? [paraAnagrafica] : []),
        // Corpo generato
        ...blocchi,
        ...firmaProfessionistaParagraphs(professionista),
      ],
    }],
  })

  const buffer = await Packer.toBlob(doc)
  return buffer
}

// ── Trigger download nel browser ───────────────────────────
export function scaricaDocx(blob: Blob, nomeFile = 'relazione.docx'): void {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = nomeFile
  a.click()
  URL.revokeObjectURL(url)
}
