// ============================================================
// EXPORT DOCX — genera un .docx fedele al template reale
// Struttura ricavata dall'analisi XML diretta di un template reale
// anonimizzato (docs/COGNOME NOME (feb25).docx), non solo da
// screenshot — quindi valori esatti, non stimati:
//   - Font: Calibri (non Times New Roman), 11pt corpo, 12pt intestazione
//   - Margini asimmetrici: top 4cm, right 2.25cm, bottom 3cm, left 2cm
//     (il template reale non usa margini uniformi)
//   - Intestazione: nome, qualifica, specializzazione, poi linea separatrice
//   - Data a sinistra, "RELAZIONE" centrato e sottolineato
//   - Corpo giustificato con rientro prima riga
//   - Tabelle WISC/NEPSY: intestazione con sfondo azzurro chiaro (D5DCE4,
//     non grigio), bordi sottili neri, colonne centrate
//   - Numero pagina "N /Totale" in basso (formato confermato via XML footer)
// ============================================================

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, BorderStyle, WidthType, ShadingType,
  PageNumber, NumberFormat, UnderlineType, LevelFormat,
} from 'docx'
import type { AnagraficaPaziente, ProfiloProfessionista } from '../core/types'
import { MOCK_WISC_IV_TEMPLATE, MOCK_NEPSY_II_TEMPLATE } from '../data/mockTemplates'
import type { TestTemplate, RisultatoTest } from '../core/testTemplate'
import { calcolaFascia, getScalaApplicabile } from './testTemplateEngine'
import { titoloSezioneTest } from './wizardToText'

// ── Tipi per input strutturato ──────────────────────────────
type ScoreMap = Record<string, string | number | boolean | null | undefined>

type CognitivoBlock = {
  punteggi?: ScoreMap
  interpretabilita?: Record<string, boolean>
  includi_nota_range?: boolean
  subtest_pp?: ScoreMap
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
  // Test/questionari dinamici (id = UUID, creati in Gestione Test) con i
  // rispettivi risultati compilati nel wizard — es. un CBCL. Senza questi
  // due campi il DOCX finale mostrerebbe solo il titolo di sezione e la
  // tabella come testo monospace grezzo, invece di una tabella Word vera
  // come per WISC-IV/NEPSY-II.
  templates?: TestTemplate[]
  testRisultati?: Record<string, RisultatoTest>
}

// ── Costanti layout — valori reali estratti dal template ────
const FONT          = 'Calibri'
const SIZE_BODY     = 22   // 11pt in half-points
const SIZE_HEADER   = 24   // 12pt
const SIZE_SMALL    = 18   // 9pt (note sotto tabella)
const PAGE_W        = 11906 // A4 in DXA
const PAGE_H        = 16838
// Margini reali (non uniformi) letti da word/document.xml → w:pgMar
const MARGIN_TOP    = 2269
const MARGIN_RIGHT  = 1274
const MARGIN_BOTTOM = 1702
const MARGIN_LEFT   = 1134
const CONTENT_W     = PAGE_W - MARGIN_LEFT - MARGIN_RIGHT  // ~9498 DXA
// Colore di sfondo intestazione tabella nel template reale (azzurro
// chiaro, non il grigio E8E8E8 usato in precedenza)
const TABLE_HEADER_FILL = 'D5DCE4'

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

export type InlineRun = {
  text: string
  bold: boolean
  italics: boolean
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

// Parser inline per **grassetto** e *corsivo*.
// Il corsivo viene riconosciuto SOLO per coppie di asterischi bilanciate
// sulla riga (stesso approccio non-greedy del grassetto): un asterisco
// singolo isolato (es. una vecchia nota tipo "*WISC-IV: valori standard*"
// non richiusa, o un asterisco usato letteralmente) resta testo semplice
// invece di "accendere" il corsivo fino a fine riga — importante per non
// alterare la resa di relazioni già archiviate prima di questa funzione.
export function parseInline(text: string): InlineRun[] {
  // Passo 1: isola i tratti in **grassetto**
  const boldRe = /\*\*(.+?)\*\*/g
  const segments: { text: string; bold: boolean }[] = []
  let last = 0
  let m: RegExpExecArray | null
  while ((m = boldRe.exec(text)) !== null) {
    if (m.index > last) segments.push({ text: text.slice(last, m.index), bold: false })
    segments.push({ text: m[1], bold: true })
    last = m.index + m[0].length
  }
  if (last < text.length) segments.push({ text: text.slice(last), bold: false })
  if (!segments.length) segments.push({ text, bold: false })

  // Passo 2: dentro ai soli segmenti non già in grassetto, isola il *corsivo*
  const italicRe = /\*(.+?)\*/g
  const parts: InlineRun[] = []
  for (const seg of segments) {
    if (seg.bold) {
      parts.push({ text: seg.text, bold: true, italics: false })
      continue
    }
    let segLast = 0
    let found = false
    let im: RegExpExecArray | null
    italicRe.lastIndex = 0
    while ((im = italicRe.exec(seg.text)) !== null) {
      found = true
      if (im.index > segLast) parts.push({ text: seg.text.slice(segLast, im.index), bold: false, italics: false })
      parts.push({ text: im[1], bold: false, italics: true })
      segLast = im.index + im[0].length
    }
    if (!found) parts.push({ text: seg.text, bold: false, italics: false })
    else if (segLast < seg.text.length) parts.push({ text: seg.text.slice(segLast), bold: false, italics: false })
  }

  const nonEmpty = parts.filter(p => p.text.length > 0)
  return nonEmpty.length ? nonEmpty : [{ text, bold: false, italics: false }]
}

// Rimuove marcatori ** / * letterali da un titolo (H1/H2 non passano da
// parseInline: sono già in grassetto/sottolineato di loro, quindi un
// eventuale **grassetto** applicato per errore dentro un titolo andrebbe
// altrimenti stampato con gli asterischi visibili nel DOCX finale).
export function stripInlineMarkers(text: string): string {
  return text.replace(/\*\*(.+?)\*\*/g, '$1').replace(/\*(.+?)\*/g, '$1')
}

// Riconosce un elenco puntato ("- "/"* ") o numerato ("1. ") a inizio riga
// (nessun supporto per livelli annidati, sufficiente per una relazione
// clinica narrativa).
export function parseListItem(line: string): { ordered: boolean; text: string } | null {
  const bullet = line.match(/^\s*[-*]\s+(.+)$/)
  if (bullet) return { ordered: false, text: bullet[1] }
  const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/)
  if (numbered) return { ordered: true, text: numbered[1] }
  return null
}

function listItemParagraph(text: string, ordered: boolean): Paragraph {
  const runs = parseInline(text.trim())
  return new Paragraph({
    numbering: { reference: ordered ? 'numbered-list' : 'bullet-list', level: 0 },
    spacing: { after: 60 },
    children: runs.map(r => new TextRun({ text: r.text, font: FONT, size: SIZE_BODY, bold: r.bold, italics: r.italics })),
  })
}

// Paragrafo di testo "normale": elenco puntato/numerato se la riga lo è,
// altrimenti il consueto paragrafo giustificato con rientro prima riga.
// Condiviso fra markdownToParagraphs() e il ciclo principale più sotto,
// così le due pipeline restano sempre in sincrono su questo comportamento.
function testoParagraph(line: string): Paragraph {
  const item = parseListItem(line)
  if (item) return listItemParagraph(item.text, item.ordered)

  const runs = parseInline(line.trim())
  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 720 },
    spacing: { after: 120 },
    children: runs.map(r => new TextRun({ text: r.text, font: FONT, size: SIZE_BODY, bold: r.bold, italics: r.italics })),
  })
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
      result.push(para(stripInlineMarkers(line.slice(2).trim()), { bold: true, underline: true, center: true, size: SIZE_HEADER, spaceBefore: 240, spaceAfter: 180 }))
      continue
    }

    // Titolo H2
    if (line.startsWith('## ')) {
      result.push(para(stripInlineMarkers(line.slice(3).trim()), { bold: true, underline: true, center: true, spaceBefore: 200, spaceAfter: 140 }))
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

    // Testo normale: elenco puntato/numerato, oppure paragrafo con **grassetto**/*corsivo* inline
    result.push(testoParagraph(line))
  }

  return result
}

// ── Intestazione fissa dello studio ───────────────────────
function splitHeaderLines(nomeStudio?: string, professionista?: ProfiloProfessionista | null): string[] {
  if (professionista && (professionista.nome_completo || professionista.titolo || professionista.specializzazione)) {
    const lines: string[] = []
    const nome = String(professionista.nome_completo || '').trim()
    const prefisso = professionista.genere === "donna" ? "Dr.ssa" : "Dr.";
    const titolo = String(professionista.titolo || '').trim()
    const specializzazione = String(professionista.specializzazione || '').trim()

    if (nome) lines.push(`${prefisso} ${nome}`);
    if (titolo) lines.push(titolo)
    if (specializzazione) lines.push(specializzazione)

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
        // Nel template reale il nome è a 14pt (sz=28), non 12pt —
        // valore confermato via XML, non stimato dallo screenshot.
        children: [
          new TextRun({
            text: nome,
            font: "Corsiva Hebrew",
            size: 28,
            bold: false,
          }),
        ],
      }),
      ...resto.map(
        (r) =>
          new Paragraph({
            spacing: { after: 40 },
            // Qualifica e specializzazione sono a 10pt (sz=20) nel
            // template reale, leggermente più piccole del corpo (11pt).
            children: [new TextRun({ text: r, font: FONT, size: 20 })],
          }),
      ),
      // Nessuna linea separatrice: il template reale ha tutti i bordi
      // del paragrafo intestazione esplicitamente a "nil" nell'XML —
      // l'intestazione è solo testo, senza riga sotto.
    ],
  });
}

function rightParagraph(text: string, bold = false): Paragraph {
  return new Paragraph({
    alignment: AlignmentType.RIGHT,
    spacing: { after: 40 },
    children: [
      new TextRun({
        text,
        font: FONT,
        size: SIZE_BODY,
        bold,
      }),
    ],
  });
}

function firmaProfessionistaParagraphs(
  professionista?: ProfiloProfessionista | null,
): Paragraph[] {
  if (!professionista) return [];

  const nome = String(professionista.nome_completo || "").trim();
  const titolo = String(professionista.titolo || "").trim();
  const indirizzo = String(professionista.indirizzo || "").trim();
  const citta = String(professionista.citta || "").trim();
  const telefono = String(professionista.telefono || "").trim();
  const email = String(professionista.email || "").trim();
  const piva = String(professionista.partita_iva || "").trim();
  const cf = String(professionista.codice_fiscale || "").trim();

  const lines: Paragraph[] = [
    new Paragraph({
      spacing: { before: 260, after: 60 },
      alignment: AlignmentType.RIGHT,
      children: [],
    }),
  ];

  if (nome) {
    lines.push(rightParagraph(nome, true));
  }

  if (titolo) {
    lines.push(rightParagraph(titolo));
  }

  const location = [indirizzo, citta].filter(Boolean).join(", ");
  if (location) {
    lines.push(rightParagraph(location));
  }

  const contatti = [telefono ? `Cell. ${telefono}` : "", email]
    .filter(Boolean)
    .join("  •  ");
  if (contatti) {
    lines.push(rightParagraph(contatti));
  }

  const fisc = [piva ? `P.IVA ${piva}` : "", cf ? `CF ${cf}` : ""]
    .filter(Boolean)
    .join("  •  ");
  if (fisc) {
    lines.push(rightParagraph(fisc));
  }

  return lines;
}

// ── Footer con numero pagina ───────────────────────────────
function makeFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.RIGHT,
        children: [
          new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: SIZE_BODY }),
          // Il template reale usa "N /Totale" (spazio prima dello slash,
          // nessuno spazio dopo) — confermato dal testo del footer XML.
          new TextRun({ text: ' /', font: FONT, size: SIZE_BODY }),
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
  const { nome, cognome, data_nascita, scuola_classe, genere } = anagrafica
  const nomeCompleto = [nome, cognome].filter(Boolean).join(' ')
  if (!nomeCompleto && !data_nascita && !scuola_classe) return null

  const dataFmt = data_nascita
    ? new Date(data_nascita).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
    : null

  // Risolve "nato/nata" in base al genere quando noto, invece di lasciare
  // sempre la forma ambigua con la barra — coerente con l'istruzione di
  // concordanza grammaticale già data a Gemini per il resto del testo
  // (vedi istruzioneGenere in geminiService.ts).
  const natoForma = genere === 'femmina' ? 'nata' : genere === 'maschio' ? 'nato' : 'nato/a'

  const parti: string[] = []
  if (nomeCompleto) parti.push(nomeCompleto)
  if (dataFmt)      parti.push(`${natoForma} il ${dataFmt}`)
  if (scuola_classe) parti.push(scuola_classe)

  return new Paragraph({
    alignment: AlignmentType.JUSTIFIED,
    indent: { firstLine: 720 },
    spacing: { after: 200 },
    children: [new TextRun({ text: parti.join(', ') + '.', font: FONT, size: SIZE_BODY, bold: true })],
  })
}

function makeTestTable(template: TestTemplate, risultato: RisultatoTest): Table {
  const campiValidi = template.campiPrincipali.filter(c => risultato.punteggi[c.key])
  
  if (campiValidi.length === 0) {
    return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, rows: [] })
  }

  const mostraColonna = campiValidi.some(c => risultato.interpretabilita?.[c.key] === false)
  const numColonne = mostraColonna ? 4 : 3
  const colW = Math.floor(CONTENT_W / numColonne)
  const colWidths = mostraColonna ? [colW * 2, colW, colW, colW] : [colW * 2, colW, colW]
  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  const borders = { top: border, bottom: border, left: border, right: border }

  const intestazioni = mostraColonna
    ? [`${template.nome} scale`, 'Punteggio', 'Categoria descrittiva', 'Interpretabilità']
    : [`${template.nome} scale`, 'Punteggio', 'Categoria descrittiva']

  const rows = [
    new TableRow({
      children: intestazioni.map(text =>
        new TableCell({
          borders, width: { size: colW, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: TABLE_HEADER_FILL, type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text, font: FONT, size: SIZE_BODY, bold: true })],
          })],
        })
      ),
    }),
    ...campiValidi.map(c => {
      const p = risultato.punteggi[c.key]
      const scala = getScalaApplicabile(c, template)
      const fascia = calcolaFascia(p, scala) ?? '-'
      
      const celle = [
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
            children: [new TextRun({ text: String(p), font: FONT, size: SIZE_BODY })],
          })],
        }),
        new TableCell({
          borders, width: { size: colWidths[2], type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: fascia, font: FONT, size: SIZE_BODY })],
          })],
        }),
      ]
      
      if (mostraColonna) {
        const interpretabile = risultato.interpretabilita?.[c.key] !== false
        celle.push(new TableCell({
          borders, width: { size: colWidths[3], type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: interpretabile ? 'Sì' : 'No', font: FONT, size: SIZE_BODY })],
          })],
        }))
      }
      return new TableRow({ children: celle })
    }),
  ]

  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: colWidths, rows })
}

function makeSecondaryTestTable(subLabel: string, campi: Array<{ key: string; label: string }>, punteggiSecondari: Record<string, string | number>): Table {
  const border = { style: BorderStyle.SINGLE, size: 4, color: '000000' }
  const borders = { top: border, bottom: border, left: border, right: border }
  const colW = Math.floor(CONTENT_W / 2)
  const colWidths = [colW, colW]

  const rows = [
    new TableRow({
      children: [
        new TableCell({
          borders, width: { size: colW * 2, type: WidthType.DXA },
          columnSpan: 2,
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: TABLE_HEADER_FILL, type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: subLabel, font: FONT, size: SIZE_BODY, bold: true })],
          })],
        })
      ]
    }),
    new TableRow({
      children: [
        new TableCell({
          borders, width: { size: colW, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: 'F2F2F2', type: ShadingType.CLEAR },
          children: [new Paragraph({
            children: [new TextRun({ text: 'Sottotest', font: FONT, size: SIZE_BODY, bold: true })],
          })],
        }),
        new TableCell({
          borders, width: { size: colW, type: WidthType.DXA },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          shading: { fill: 'F2F2F2', type: ShadingType.CLEAR },
          children: [new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [new TextRun({ text: 'Punteggio', font: FONT, size: SIZE_BODY, bold: true })],
          })],
        }),
      ]
    }),
    ...campi.map(c => {
      const p = punteggiSecondari[c.key] ?? '—'
      return new TableRow({
        children: [
          new TableCell({
            borders, width: { size: colW, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({ children: [new TextRun({ text: c.label, font: FONT, size: SIZE_BODY })] })],
          }),
          new TableCell({
            borders, width: { size: colW, type: WidthType.DXA },
            margins: { top: 80, bottom: 80, left: 120, right: 120 },
            children: [new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ text: String(p), font: FONT, size: SIZE_BODY })],
            })],
          }),
        ]
      })
    })
  ]

  return new Table({ width: { size: CONTENT_W, type: WidthType.DXA }, columnWidths: colWidths, rows })
}

export async function esportaDocx({ testo, data, nomeStudio, anagrafica, professionista, cognitivo, nepsy, templates, testRisultati }: ExportDocxInput): Promise<Blob> {
  const oggi = data || new Date().toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const testoPulito = deAnonimizzaTesto(testo, anagrafica)

  // Sezioni dei template dinamici (CBCL e simili) indicizzate per titolo —
  // lo stesso titolo che assemblaDocumentoMarkdown() ha scritto come "## "
  // nel markdown, così da riconoscerle nel parsing sotto e disegnare una
  // tabella Word vera invece di lasciare la tabella Markdown come testo
  // monospace grezzo.
  const sezioniDinamiche = new Map<string, { template: TestTemplate; risultato: RisultatoTest }>()
  for (const template of templates || []) {
    const risultato = testRisultati?.[template.id]
    if (risultato?.somministrato) {
      sezioniDinamiche.set(titoloSezioneTest(template), { template, risultato })
    }
  }

  const blocchi: Array<Paragraph | Table> = []
  const lines = testoPulito.split('\n')
  let i = 0
  let inCognitivo = false
  let inNepsy = false
  let inDinamica: { template: TestTemplate; risultato: RisultatoTest } | null = null
  let cognitivoNarrativaLines: string[] = []
  let nepsyNarrativaLines: string[] = []
  let dinamicaNarrativaLines: string[] = []

  const flushDinamica = () => {
    if (inDinamica) {
      const narrativa = dinamicaNarrativaLines.join('\n').trim()
      
      // Definiamo una mappa per contenere i diversi pezzi di narrativa spezzettati.
      // Chiave 'generale' per il testo iniziale del test.
      // Altre chiavi basate sui nomi dei gruppi secondari (es: "Scale Sindromiche", "Scale DSM Oriented")
      const narrativaSpezzata: Record<string, string> = { generale: '' }
      
      if (narrativa) {
        // Spezziamo la narrativa basandoci su marcatori dinamici o intestazioni standard
        const righeNarrative = narrativa.split('\n')
        let sezioneCorrente = 'generale'
        let righeAccumulate: string[] = []
        
        for (const riga of righeNarrative) {
          const matchSottosezione = riga.match(/===\s*SOTTOSEZIONE:\s*(.*?)\s*===/i) || 
                                    riga.match(/^###\s*(.*)$/) ||
                                    riga.match(/^\*\*(Scale Sindromiche|Scale DSM Oriented|Scale DSM|Sindromiche|DSM)\*\*\s*$/i)

          if (matchSottosezione) {
            // Salva la sezione precedente
            narrativaSpezzata[sezioneCorrente] = righeAccumulate.join('\n').trim()
            righeAccumulate = []
            
            // Estrae il nome pulito della nuova sottosezione
            const nomeTrovato = matchSottosezione[1].trim()
            
            // Normalizziamo il nome della sezione per fare matching più resiliente con i gruppi secondari
            sezioneCorrente = nomeTrovato.toLowerCase()
          } else {
            righeAccumulate.push(riga)
          }
        }
        narrativaSpezzata[sezioneCorrente] = righeAccumulate.join('\n').trim()
      }

      // 1. Aggiungi la tabella principale del test
      if (Object.keys(inDinamica.risultato.punteggi || {}).length > 0) {
        blocchi.push(makeTestTable(inDinamica.template, inDinamica.risultato))
        if (inDinamica.risultato.includiNotaRange !== false && inDinamica.template.notaRange) {
          blocchi.push(new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: inDinamica.template.notaRange, font: FONT, size: SIZE_SMALL, italics: true })],
          }))
        }
        blocchi.push(emptyLine(60))
      }

      // 2. Aggiungi subito la narrativa generale / iniziale (se presente)
      const testoGenerale = narrativaSpezzata['generale'] || ''
      if (testoGenerale) {
        blocchi.push(...markdownToParagraphs(testoGenerale))
        blocchi.push(emptyLine(60))
      }

      // 3. Aggiungi le tabelle secondarie ciascuna seguita immediatamente dalla sua narrativa
      if (inDinamica.template.gruppiSecondari && inDinamica.risultato.punteggiSecondari) {
        for (const gruppo of inDinamica.template.gruppiSecondari) {
          const secValidi = gruppo.campi.filter(c => inDinamica!.risultato.punteggiSecondari![c.key] !== undefined && inDinamica!.risultato.punteggiSecondari![c.key] !== '')
          if (secValidi.length > 0) {
            blocchi.push(emptyLine(60))
            const tabellaSecondaria = makeSecondaryTestTable(gruppo.label, secValidi, inDinamica.risultato.punteggiSecondari as Record<string, string | number>)
            blocchi.push(tabellaSecondaria)
            blocchi.push(emptyLine(60))
            
            // Cerchiamo se c'è della narrativa per questo gruppo specifico nella mappa degli spezzettati
            const chiaviGruppo = [
              gruppo.label.toLowerCase(),
              gruppo.key.toLowerCase(),
              gruppo.label.replace(/\(.*?\)/g, '').trim().toLowerCase() // es: "scale sindromiche (cbcl)" -> "scale sindromiche"
            ]
            
            let testoGruppo = ''
            for (const chiave of chiaviGruppo) {
              // Cerca corrispondenza esatta o parziale
              const chiaveTrovata = Object.keys(narrativaSpezzata).find(k => k === chiave || k.includes(chiave) || chiave.includes(k))
              if (chiaveTrovata) {
                testoGruppo = narrativaSpezzata[chiaveTrovata]
                break
              }
            }
            
            if (testoGruppo) {
              blocchi.push(...markdownToParagraphs(testoGruppo))
              blocchi.push(emptyLine(60))
            }
          }
        }
      }

      dinamicaNarrativaLines = []
      inDinamica = null
    }
  }

  const flushCognitivo = () => {
    if (inCognitivo) {
      const narrativa = cognitivoNarrativaLines.join('\n').trim()
      if (cognitivo?.punteggi && Object.keys(cognitivo.punteggi).length > 0) {
        blocchi.push(makeTestTable(MOCK_WISC_IV_TEMPLATE, { 
          punteggi: cognitivo.punteggi as Record<string, string>, 
          interpretabilita: cognitivo.interpretabilita,
          punteggiSecondari: cognitivo.subtest_pp as Record<string, string>
        }))
        if (cognitivo.includi_nota_range) {
          blocchi.push(new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: MOCK_WISC_IV_TEMPLATE.notaRange || '', font: FONT, size: SIZE_SMALL, italics: true })],
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
        blocchi.push(makeTestTable(MOCK_NEPSY_II_TEMPLATE, { 
          punteggi: nepsy.punteggi as Record<string, string> 
        }))
        if (nepsy.includi_nota_range) {
          blocchi.push(new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: MOCK_NEPSY_II_TEMPLATE.notaRange || '', font: FONT, size: SIZE_SMALL, italics: true })],
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

    // ⚠️ Qui c'era uno skip esplicito di "## Dati e motivo dell'invio" (avanzava
    // fino alla prossima intestazione senza mai fare blocchi.push). Non esiste
    // nessun altro punto in questo file che renderizzi quel contenuto altrove:
    // lo skip non evitava un doppio rendering, cancellava l'intera sezione dal
    // documento finale. Ora cade nel ramo generico "## " qualche riga sotto,
    // come Anamnesi/Osservazione/Conclusioni.

    // Un H1 creato dall'utente nell'editor Visuale (diverso dal titolo fisso
    // "# Relazione" sopra, che viene reso a parte nell'intestazione): senza
    // questo controllo la riga cadeva nel ramo generico "Testo normale" più
    // sotto, che stampa "# Titolo" come testo letterale invece che come titolo.
    if (line.startsWith('# ')) {
      blocchi.push(para(stripInlineMarkers(line.slice(2).trim()), { bold: true, underline: true, center: true, size: SIZE_HEADER, spaceBefore: 240, spaceAfter: 180 }))
      i++
      continue
    }

    if (line.startsWith('## ') && sezioniDinamiche.has(line.slice(3).trim())) {
      flushCognitivo()
      flushNepsy()
      flushDinamica()
      inDinamica = sezioniDinamiche.get(line.slice(3).trim())!
      i++
      // Salta righe tabella Markdown, vecchie tabelle/grezzi secondari (es: **Scale Sindromiche**), righe vuote iniziali,
      // e la nota range in corsivo, per evitare di duplicare la parte tabellare e iniziare subito con la narrativa.
      while (i < lines.length && (
        lines[i].match(/^\s*(\|.*\||\*[A-Z]|\*\*)/) || 
        lines[i].trim() === ''
      )) {
        i++
      }
      if (i < lines.length && lines[i].trim() && !lines[i].startsWith('#')) {
        dinamicaNarrativaLines.push(lines[i])
        i++
      }
      continue
    }

    if (line.startsWith('## Valutazione cognitiva')) {
      flushNepsy()
      flushDinamica()
      inCognitivo = true
      i++
      // Salta: righe di tabella Markdown (già presenti nel testo, ricostruita
      // da makeWiscTable in flushCognitivo), la nota range in corsivo, e i
      // vecchi marcatori \*WISC/===. Prima si saltavano solo questi ultimi
      // due, lasciando che la tabella Markdown finisse catturata come
      // "narrativa" e ristampata come testo grezzo — causa della doppia
      // tabella nel DOCX finale.
      while (i < lines.length && lines[i].match(/^\s*(\|.*\||\*WISC|===)/)) i++
      if (i < lines.length && lines[i].trim() && !lines[i].startsWith('#')) {
        cognitivoNarrativaLines.push(lines[i])
        i++
      }
      continue
    }

    if (line.startsWith('## Approfondimento neuropsicologico')) {
      flushCognitivo()
      flushDinamica()
      inNepsy = true
      i++
      // Stessa correzione della sezione cognitivo: salta anche le righe
      // tabella, non solo la nota Nepsy/===.
      while (i < lines.length && lines[i].match(/^\s*(\|.*\||\*Nepsy|===)/)) i++
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
      // Scarta eventuali righe tabella residue: possono comparire qui se
      // Gemini ha incluso una tabella indesiderata più in basso nel testo
      // narrativo, non solo subito dopo l'intestazione di sezione.
      const isRigaTabella = /^\s*\|.*\|\s*$/.test(line)
      const isNotaRange = /^\s*\*[A-Z][\w-]*(-II)?:\s.*\*\s*$/.test(line)
      if (line.trim() && !isRigaTabella && !isNotaRange) cognitivoNarrativaLines.push(line)
      i++
      continue
    }

    if (inNepsy) {
      if (line.startsWith('## ')) {
        flushNepsy()
        continue
      }
      const isRigaTabella = /^\s*\|.*\|\s*$/.test(line)
      const isNotaRange = /^\s*\*[A-Z][\w-]*(-II)?:\s.*\*\s*$/.test(line)
      if (line.trim() && !isRigaTabella && !isNotaRange) nepsyNarrativaLines.push(line)
      i++
      continue
    }

    if (inDinamica) {
      if (line.startsWith('## ')) {
        flushDinamica()
        continue
      }
      const isRigaTabella = /^\s*\|.*\|\s*$/.test(line)
      const isNotaRange = /^\s*\*[A-Z][\w-]*(-II)?:\s.*\*\s*$/.test(line)
      const isTitoloGruppoSecondario = /^\s*\*\*.*\*\*\s*$/.test(line)
      if (line.trim() && !isRigaTabella && !isNotaRange && !isTitoloGruppoSecondario) {
        dinamicaNarrativaLines.push(line)
      }
      i++
      continue
    }

    if (line.startsWith('## ')) {
      const title = stripInlineMarkers(line.slice(3).trim())
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

    blocchi.push(testoParagraph(line))
    i++
  }

  flushCognitivo()
  flushNepsy()
  flushDinamica()

  const paraAnagrafica = anagraficaParagraph(anagrafica)

  const doc = new Document({
    numbering: {
      config: [
        {
          reference: 'bullet-list',
          levels: [{
            level: 0,
            format: LevelFormat.BULLET,
            text: '•',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
        {
          reference: 'numbered-list',
          levels: [{
            level: 0,
            format: LevelFormat.DECIMAL,
            text: '%1.',
            alignment: AlignmentType.LEFT,
            style: { paragraph: { indent: { left: 720, hanging: 360 } } },
          }],
        },
      ],
    },
    styles: {
      default: {
        document: { run: { font: FONT, size: SIZE_BODY } },
      },
    },
    sections: [{
      properties: {
        page: {
          size:   { width: PAGE_W, height: PAGE_H },
          margin: { top: MARGIN_TOP, right: MARGIN_RIGHT, bottom: MARGIN_BOTTOM, left: MARGIN_LEFT },
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
