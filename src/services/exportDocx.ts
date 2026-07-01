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
import { fasciaWISC, fasciaScalare, WISC_IV_CAMPI, NEPSY_II_DOMINI } from '../components/constants/testDefinitions'
import { notaRangeWisc, notaRangeNepsy } from './wizardToText'

// ── Tipi per input strutturato ──────────────────────────────
type ScoreMap = Record<string, string | number | boolean | null | undefined>

type CognitivoBlock = {
  punteggi?: ScoreMap
  includi_nota_range?: boolean
  riferimenti_subtest?: string
  eta_valutazione?: string
  strumenti_utilizzati?: string
  note_cliniche?: string
}

type NepsyBlock = {
  punteggi?: ScoreMap
  includi_nota_range?: boolean
  note_cliniche?: string
}

type ExportDocxInput = {
  testo: string
  data?: string
  nomeStudio?: string
  anagrafica?: AnagraficaPaziente | null
  professionista?: ProfiloProfessionista | null
  cognitivo?: CognitivoBlock
  nepsy?: NepsyBlock
}

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

function makeWiscTable(punteggi: ScoreMap): Table {
  const righeValide = WISC_IV_CAMPI.filter(c => punteggi[c.key])
  const colW = Math.floor(CONTENT_W / 4)
  const colWidths = [colW * 2, colW, colW, colW]
  const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' }
  const borders = { top: border, bottom: border, left: border, right: border }

  const rows = [
    new TableRow({
      children: ['Scala', 'Indici/QI', 'Categoria descrittiva', 'Interpretabilità'].map(text =>
        new TableCell({
          borders,
          width: { size: colW, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: 'E8E8E8', type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text, font: FONT, size: SIZE_BODY, bold: true })],
          })],
        })
      ),
    }),
    ...righeValide.map(c =>
      new TableRow({
        children: [
          new TableCell({
            borders, width: { size: colWidths[0], type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: c.label, font: FONT, size: SIZE_BODY })] })],
          }),
          new TableCell({
            borders, width: { size: colWidths[1], type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: String(punteggi[c.key] || ''), font: FONT, size: SIZE_BODY })],
            })],
          }),
          new TableCell({
            borders, width: { size: colWidths[2], type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: fasciaWISC(punteggi[c.key]), font: FONT, size: SIZE_BODY })],
            })],
          }),
          new TableCell({
            borders, width: { size: colWidths[3], type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: 'Si', font: FONT, size: SIZE_BODY })],
            })],
          }),
        ],
      })
    ),
  ]

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows,
  })
}

function makeNepsyTable(punteggi: ScoreMap): Table {
  const domWithData = NEPSY_II_DOMINI
    .map(d => ({ ...d, subtest: d.subtest.filter(s => punteggi[s.key]) }))
    .filter(d => d.subtest.length > 0)

  if (domWithData.length === 0) {
    return new Table({
      width: { size: CONTENT_W, type: WidthType.DXA },
      rows: [],
    })
  }

  const colW = Math.floor(CONTENT_W / 3)
  const colWidths = [colW * 2, colW, colW]
  const border = { style: BorderStyle.SINGLE, size: 4, color: '999999' }
  const borders = { top: border, bottom: border, left: border, right: border }

  const rows = [
    new TableRow({
      children: ['Sottotest', 'Punteggio scalare', 'Fascia'].map(text =>
        new TableCell({
          borders,
          width: { size: colW, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: 'E8E8E8', type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text, font: FONT, size: SIZE_BODY, bold: true })],
          })],
        })
      ),
    }),
    ...domWithData.flatMap(dom =>
      dom.subtest.map(st =>
        new TableRow({
          children: [
            new TableCell({
              borders, width: { size: colWidths[0], type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({ children: [new TextRun({ text: `${st.label} (${dom.dominio})`, font: FONT, size: SIZE_BODY })] })],
            }),
            new TableCell({
              borders, width: { size: colWidths[1], type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: String(punteggi[st.key] || ''), font: FONT, size: SIZE_BODY })],
              })],
            }),
            new TableCell({
              borders, width: { size: colWidths[2], type: WidthType.DXA },
              margins: { top: 80, bottom: 80, left: 120, right: 120 },
              children: [new Paragraph({
                alignment: AlignmentType.CENTER,
                children: [new TextRun({ text: fasciaScalare(punteggi[st.key]), font: FONT, size: SIZE_BODY })],
              })],
            }),
          ],
        })
      )
    ),
  ]

  return new Table({
    width: { size: CONTENT_W, type: WidthType.DXA },
    columnWidths: colWidths,
    rows,
  })
}

export async function esportaDocx({ testo, data, nomeStudio, anagrafica, professionista, cognitivo, nepsy }: ExportDocxInput): Promise<Blob> {
  const oggi = data || new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const testoPulito = deAnonimizzaTesto(testo, anagrafica)

  const blocchi: Array<Paragraph | Table> = []
  const lines = testoPulito.split('\n')
  let i = 0
  let inCognitivo = false
  let inNepsy = false
  let cognitivoNarrativaLines: string[] = []
  let nepsyNarrativaLines: string[] = []

  const flushCognitivo = () => {
    if (inCognitivo) {
      const narrativa = cognitivoNarrativaLines.join('\n').trim()
      if (cognitivo?.punteggi && Object.keys(cognitivo.punteggi).length > 0) {
        blocchi.push(makeWiscTable(cognitivo.punteggi))
        blocchi.push(emptyLine(120))
        if (cognitivo.includi_nota_range) {
          blocchi.push(new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: notaRangeWisc(), font: FONT, size: SIZE_SMALL, italics: true })],
          }))
        }
      }
      if (narrativa) {
        blocchi.push(...markdownToParagraphs(narrativa))
      }
      cognitivoNarrativaLines = []
      inCognitivo = false
    }
  }

  const flushNepsy = () => {
    if (inNepsy) {
      const narrativa = nepsyNarrativaLines.join('\n').trim()
      if (nepsy?.punteggi && Object.keys(nepsy.punteggi).length > 0) {
        blocchi.push(makeNepsyTable(nepsy.punteggi))
        blocchi.push(emptyLine(120))
        if (nepsy.includi_nota_range) {
          blocchi.push(new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: notaRangeNepsy(), font: FONT, size: SIZE_SMALL, italics: true })],
          }))
        }
      }
      if (narrativa) {
        blocchi.push(...markdownToParagraphs(narrativa))
      }
      nepsyNarrativaLines = []
      inNepsy = false
    }
  }

  while (i < lines.length) {
    const line = lines[i]

    if (line.startsWith('# Relazione')) {
      i++
      continue
    }

    if (line.startsWith('## Dati e motivo')) {
      i++
      while (i < lines.length && !lines[i].startsWith('## ')) i++
      continue
    }

    if (line.startsWith('## Valutazione cognitiva')) {
      flushNepsy()
      inCognitivo = true
      i++
      while (i < lines.length && lines[i].match(/^\s*(\*WISC|===)/)) i++
      if (i < lines.length && lines[i].trim() && !lines[i].startsWith('#')) {
        cognitivoNarrativaLines.push(lines[i])
        i++
      }
      continue
    }

    if (line.startsWith('## Approfondimento neuropsicologico')) {
      flushCognitivo()
      inNepsy = true
      i++
      while (i < lines.length && lines[i].match(/^\s*(\*Nepsy|===)/)) i++
      if (i < lines.length && lines[i].trim() && !lines[i].startsWith('#')) {
        nepsyNarrativaLines.push(lines[i])
        i++
      }
      continue
    }

    if (inCognitivo) {
      if (line.startsWith('## ')) {
        flushCognitivo()
        continue
      }
      if (line.trim()) cognitivoNarrativaLines.push(line)
      i++
      continue
    }

    if (inNepsy) {
      if (line.startsWith('## ')) {
        flushNepsy()
        continue
      }
      if (line.trim()) nepsyNarrativaLines.push(line)
      i++
      continue
    }

    if (line.startsWith('## ')) {
      const title = line.slice(3).trim()
      blocchi.push(para(title, { bold: true, underline: true, center: true, size: SIZE_HEADER, spaceBefore: 200, spaceAfter: 140 }))
      i++
      continue
    }

    if (line.trim() === '') {
      blocchi.push(emptyLine(120))
      i++
      continue
    }

    if (line.startsWith('|') || line.match(/^\s{4,}/)) {
      blocchi.push(new Paragraph({
        spacing: { after: 40 },
        children: [new TextRun({ text: line.trimEnd(), font: 'Courier New', size: SIZE_SMALL })],
      }))
      i++
      continue
    }

    const runs = parseInline(line.trim())
    blocchi.push(new Paragraph({
      alignment: AlignmentType.JUSTIFIED,
      indent: { firstLine: 720 },
      spacing: { after: 120 },
      children: runs.map(r => new TextRun({ text: r.text, font: FONT, size: SIZE_BODY, bold: r.bold })),
    }))
    i++
  }

  flushCognitivo()
  flushNepsy()

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
        new Paragraph({
          spacing: { before: 280, after: 80 },
          children: [new TextRun({ text: oggi, font: FONT, size: SIZE_BODY })],
        }),
        new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { after: 280 },
          children: [new TextRun({ text: 'RELAZIONE', font: FONT, size: SIZE_BODY, bold: true, underline: { type: UnderlineType.SINGLE } })],
        }),
        ...(paraAnagrafica ? [paraAnagrafica] : []),
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
