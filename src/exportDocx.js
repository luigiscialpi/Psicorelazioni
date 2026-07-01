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
  VerticalAlign, PageNumber, NumberFormat, UnderlineType,
} from 'docx'

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
function para(text, opts = {}) {
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

function emptyLine(spaceAfter = 120) {
  return new Paragraph({ spacing: { after: spaceAfter }, children: [new TextRun('')] })
}

// ── Parser Markdown minimale → array di Paragraph ─────────
// Gestisce: ## titoli, **grassetto** inline, testo normale,
// blocchi monospace (tabelle incollate dal software di scoring)
function markdownToParagraphs(md) {
  if (!md) return []
  const lines  = md.split('\n')
  const result = []

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
function parseInline(text) {
  const parts = []
  const re    = /\*\*(.+?)\*\*/g
  let last    = 0
  let m
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
function parseMarkdownTable(text) {
  const lines = text.split('\n').filter(l => l.startsWith('|'))
  if (lines.length < 2) return null

  const rows = lines
    .filter(l => !l.match(/^\|[-\s|]+\|$/)) // rimuovi righe separatore
    .map(l => l.split('|').slice(1, -1).map(c => c.trim()))

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

// ── Intestazione fissa dello studio ───────────────────────
function makeHeader(nomeStudio) {
  const [nome, ...resto] = (nomeStudio || 'Dr.ssa [Nome Cognome]\nPsicologa\nEsperta in Psicopatologia dell\'Apprendimento').split('\n')
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

// ── Footer con numero pagina ───────────────────────────────
function makeFooter() {
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
function anagraficaParagraph(anagrafica) {
  if (!anagrafica) return null
  const { nome, cognome, data_nascita, scuola_classe } = anagrafica
  const nomeCompleto = [nome, cognome].filter(Boolean).join(' ')
  if (!nomeCompleto && !data_nascita && !scuola_classe) return null

  const dataFmt = data_nascita
    ? new Date(data_nascita).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  const parti = []
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

export async function esportaDocx({ testo, data, nomeStudio, anagrafica }) {
  const oggi = data || new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // Separa le tabelle Markdown dal testo normale e genera
  // blocchi misti: Paragraph normali + Table quando trova | ... |
  const blocchi = []
  const sezioni = testo.split(/\n(?=##? )/)  // split sui titoli H1/H2

  for (const sez of sezioni) {
    const tableLine = sez.split('\n').find(l => l.startsWith('|'))
    if (tableLine) {
      const tableText = sez.split('\n').filter(l => l.startsWith('|')).join('\n')
      const preText   = sez.split('\n').filter(l => !l.startsWith('|') && !l.match(/^\|[-\s|]+\|$/)).join('\n')
      blocchi.push(...markdownToParagraphs(preText))
      const table = parseMarkdownTable(tableText)
      if (table) {
        blocchi.push(table)
        blocchi.push(emptyLine(120))
      }
    } else {
      blocchi.push(...markdownToParagraphs(sez))
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
      headers: { default: makeHeader(nomeStudio) },
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
      ],
    }],
  })

  const buffer = await Packer.toBlob(doc)
  return buffer
}

// ── Trigger download nel browser ───────────────────────────
export function scaricaDocx(blob, nomeFile = 'relazione.docx') {
  const url = URL.createObjectURL(blob)
  const a   = document.createElement('a')
  a.href     = url
  a.download = nomeFile
  a.click()
  URL.revokeObjectURL(url)
}
