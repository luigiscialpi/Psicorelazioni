import type { TestTemplate, CampoTest, RisultatoTest, ScalaPunteggio, SogliaCustom } from '../core/testTemplate'

// Tipi di utilità interni
type FasciaType = string | null

/**
 * Converte al volo la struttura dati legacy (cognitivo, nepsy) nel nuovo formato unificato (test_risultati).
 */
export function migraWizardSnapshotLegacy(raw: any): any {
  if (!raw) return raw
  // Se ha già test_risultati con wisc-iv o nepsy-ii, o se non ha i campi legacy, non facciamo nulla.
  const hasWisc = raw.test_risultati?.['wisc-iv']
  const hasNepsy = raw.test_risultati?.['nepsy-ii']
  if ((hasWisc || hasNepsy) || (!raw.cognitivo && !raw.nepsy)) {
    // Assicuriamoci comunque che sezioni_attive sia mappato con i nuovi ID
    if (raw.sezioni_attive) {
      raw.sezioni_attive = raw.sezioni_attive.map((s: string) => 
        s === 'cognitivo' ? 'wisc-iv' : s === 'nepsy' ? 'nepsy-ii' : s
      )
    }
    return raw
  }

  const test_risultati = { ...(raw.test_risultati || {}) }

  if (raw.cognitivo && (raw.cognitivo.somministrato || Object.keys(raw.cognitivo.punteggi || {}).length > 0)) {
    test_risultati['wisc-iv'] = {
      somministrato: raw.cognitivo.somministrato ?? true,
      punteggi: raw.cognitivo.punteggi || {},
      punteggiSecondari: raw.cognitivo.subtest_pp || {},
      interpretabilita: raw.cognitivo.interpretabilita || {},
      includiNotaRange: raw.cognitivo.includi_nota_range !== false,
      etaValutazione: raw.cognitivo.eta_valutazione || '',
      strumentiUtilizzati: raw.cognitivo.strumenti_utilizzati || '',
      noteCliniche: raw.cognitivo.note_cliniche || '',
    }
  }

  if (raw.nepsy && (raw.nepsy.somministrato || Object.keys(raw.nepsy.punteggi || {}).length > 0)) {
    test_risultati['nepsy-ii'] = {
      somministrato: raw.nepsy.somministrato ?? true,
      punteggi: raw.nepsy.punteggi || {},
      punteggiSecondari: {},
      interpretabilita: {},
      includiNotaRange: raw.nepsy.includi_nota_range !== false,
      etaValutazione: '',
      strumentiUtilizzati: raw.nepsy.strumenti_utilizzati || '',
      noteCliniche: raw.nepsy.note_cliniche || '',
    }
  }

  let sezioni_attive = raw.sezioni_attive || []
  sezioni_attive = sezioni_attive.map((s: string) => 
    s === 'cognitivo' ? 'wisc-iv' : s === 'nepsy' ? 'nepsy-ii' : s
  )

  return {
    ...raw,
    test_risultati,
    sezioni_attive,
    cognitivo: undefined,
    nepsy: undefined
  }
}

// Funzione base per determinare la fascia di un QI (Media 100, DS 15)
export function getFasciaWISC(punteggio: number): string {
  if (punteggio > 129) return 'Molto superiore'
  if (punteggio >= 120) return 'Superiore'
  if (punteggio >= 110) return 'Medio-superiore'
  if (punteggio >= 90) return 'Media'
  if (punteggio >= 80) return 'Media inferiore'
  if (punteggio >= 70) return 'Inferiore alla media'
  return 'Molto inferiore alla norma'
}

// Funzione base per determinare la fascia per punteggi scalari (Media 10, DS 3)
export function getFasciaScalare(punteggio: number): string {
  if (punteggio >= 13) return 'Sopra la norma'
  if (punteggio >= 8) return 'Nella norma'
  if (punteggio >= 5) return 'Al limite'
  return 'Sotto la norma'
}

// Funzione per valutare un punteggio rispetto a soglie custom
export function getFasciaCustom(punteggio: number, soglie: SogliaCustom[]): string {
  // Ordiniamo le soglie per sicurezza o presumiamo siano in ordine di min.
  for (const s of soglie) {
    if (punteggio >= s.min && (s.max === null || punteggio <= s.max)) {
      return s.etichetta
    }
  }
  return 'Fuori range'
}

/**
 * Calcola la fascia associata a un determinato punteggio in base alla scala.
 */
export function calcolaFascia(punteggio: number | string, scala: ScalaPunteggio): FasciaType {
  const p = typeof punteggio === 'string' ? parseFloat(punteggio) : punteggio
  if (isNaN(p)) return null

  switch (scala.tipo) {
    case 'qi_wisc':
      return getFasciaWISC(p)
    case 'scalare':
      return getFasciaScalare(p)
    case 'soglie_custom':
      return getFasciaCustom(p, scala.soglie)
    default:
      return null
  }
}

/**
 * Determina la scala applicabile a un campo. Eredita la scala del test se il campo non ne ha una propria.
 */
export function getScalaApplicabile(campo: CampoTest, template: TestTemplate): ScalaPunteggio {
  if (campo.scala) return campo.scala
  return template.scalaDefault
}

/**
 * Valuta un'espressione aritmetica in modo controllato e sicuro.
 */
export function valutaFormulaSicura(espressione: string, variabili: Record<string, number>): number {
  let expr = espressione.trim()
  const matchVar = espressione.match(/\{[a-zA-Z0-9_-]+\}/g)
  if (matchVar) {
    for (const m of matchVar) {
      const key = m.slice(1, -1)
      const val = variabili[key] !== undefined ? variabili[key] : NaN
      expr = expr.replace(m, String(val))
    }
  }

  // Verifica di sicurezza: consente solo numeri, spazi, decimali, parentesi e operatori
  if (!/^[0-9\s.+\-*/()]+$/.test(expr)) {
    return NaN
  }

  try {
    const result = new Function(`return (${expr})`)()
    return typeof result === 'number' && !isNaN(result) ? result : NaN
  } catch (e) {
    return NaN
  }
}

/**
 * Calcola in tempo reale i valori delle formule definite nel template.
 */
export function valutaFormule(template: TestTemplate, risultato: RisultatoTest): Record<string, string | number> {
  const tuttiPunteggi = { ...risultato.punteggi }
  
  if (!template.formule || template.formule.length === 0) {
    return tuttiPunteggi
  }

  const variabili: Record<string, number> = {}
  for (const [k, v] of Object.entries(risultato.punteggi)) {
    const n = parseFloat(String(v))
    if (!isNaN(n)) variabili[k] = n
  }
  if (risultato.punteggiSecondari) {
    for (const [k, v] of Object.entries(risultato.punteggiSecondari)) {
      const n = parseFloat(String(v))
      if (!isNaN(n)) variabili[k] = n
    }
  }

  // Valuta ogni formula sequenzialmente (in modo che le formule successive possano dipendere da quelle precedenti)
  for (const f of template.formule) {
    const val = valutaFormulaSicura(f.espressione, variabili)
    if (!isNaN(val)) {
      const arrotondato = Math.round(val * 10) / 10
      tuttiPunteggi[f.targetKey] = arrotondato
      variabili[f.targetKey] = arrotondato
    }
  }

  return tuttiPunteggi
}

/**
 * Genera la tabella Markdown per i risultati di un test, supportando colonne multiple.
 */
export function generaTabella(template: TestTemplate, risultato: RisultatoTest): string {
  let table = ''
  
  const campiPrincipaliValidi = template.campiPrincipali.filter(c => 
    risultato.punteggi[c.key] !== undefined && risultato.punteggi[c.key] !== ''
  )
  
  if (campiPrincipaliValidi.length > 0) {
    const colList = template.colonne || ['Punteggio']
    
    // Intestazione tabella
    table += `| ${template.nome} scale | ` + colList.join(' | ') + ` | Categoria descrittiva | Interpretabilità |\n`
    table += `|---|` + colList.map(() => '---').join('|') + `|---|---|\n`
    
    for (const c of campiPrincipaliValidi) {
      const p = risultato.punteggi[c.key]
      const scala = getScalaApplicabile(c, template)
      const fascia = calcolaFascia(p, scala) ?? '-'
      const interpret = risultato.interpretabilita?.[c.key] !== false ? 'Sì' : 'No'
      
      // Estrae i punteggi per ciascuna colonna definita nel template
      const rowScores = colList.map((colName, index) => {
        if (index === 0) return p // Prima colonna: chiave campoKey standard
        const extraKey = `${c.key}_${colName}`
        return risultato.punteggi[extraKey] !== undefined ? risultato.punteggi[extraKey] : '—'
      })
      
      table += `| ${c.label} | ` + rowScores.join(' | ') + ` | ${fascia} | ${interpret} |\n`
    }
    table += '\n'
  }
  
  // Tabelle secondarie (se presenti)
  if (template.gruppiSecondari && risultato.punteggiSecondari) {
    for (const gruppo of template.gruppiSecondari) {
      const campiSecondariValidi = gruppo.campi.filter(c => 
        risultato.punteggiSecondari![c.key] !== undefined && risultato.punteggiSecondari![c.key] !== ''
      )
      
      if (campiSecondariValidi.length > 0) {
        table += `**${gruppo.label}**\n`
        table += `| Sottotest | Punteggio |\n`
        table += `|---|---|\n`
        for (const c of campiSecondariValidi) {
          const p = risultato.punteggiSecondari![c.key]
          table += `| ${c.label} | ${p} |\n`
        }
        table += '\n'
      }
    }
  }

  return table
}

/**
 * Genera la narrativa Markdown per i risultati di un test.
 */
export function generaNarrativa(template: TestTemplate, risultato: RisultatoTest): string {
  let narrazione = ''
  
  for (const c of template.campiPrincipali) {
    const p = risultato.punteggi[c.key]
    const interpretabile = risultato.interpretabilita?.[c.key] !== false
    
    if (p !== undefined && p !== '' && c.descr) {
      const scala = getScalaApplicabile(c, template)
      const fascia = calcolaFascia(p, scala)
      
      if (interpretabile) {
        narrazione += `${c.descr} Il punteggio ottenuto (${p}) si colloca nella fascia "${fascia}".\n\n`
      } else {
        narrazione += `${c.descr} Il punteggio ottenuto (${p}) NON risulta interpretabile a causa dell'eccessiva dispersione dei punteggi nei subtest.\n\n`
      }
    }
  }

  if (risultato.noteCliniche) {
    narrazione += `**Note Cliniche:**\n${risultato.noteCliniche}\n\n`
  }

  return narrazione
}

/**
 * Assembla il testo completo per la sezione del test (Strumenti + Tabella + Narrativa + Nota)
 */
export function generaSezioneTest(template: TestTemplate, risultato: RisultatoTest): string {
  if (!risultato.somministrato) return ''

  let out = `## ${template.categoria === 'cognitivo' ? 'Valutazione cognitiva' : 'Approfondimento neuropsicologico'}\n`
  
  if (template.richiedeStrumentiUtilizzati && risultato.strumentiUtilizzati) {
    out += `Strumenti utilizzati: ${risultato.strumentiUtilizzati}.\n\n`
  } else if (template.richiedeStrumentiUtilizzati) {
    out += `Strumenti utilizzati: ${template.nome}.\n\n`
  }
  
  out += generaTabella(template, risultato)
  out += generaNarrativa(template, risultato)
  out += calcolaNarrativaGruppi(template, risultato)
  
  if (risultato.includiNotaRange !== false && template.notaRange) {
    out += `${template.notaRange}\n\n`
  }
  
  return out.trim()
}

/**
 * Genera la narrativa per i gruppi secondari (es. subtest).
 */
export function calcolaNarrativaGruppi(template: TestTemplate, risultato: RisultatoTest): string {
  if (!template.gruppiSecondari?.length || !risultato.punteggiSecondari) return ''
  
  const frasi = template.gruppiSecondari.map(g => {
    const compilati = g.campi.filter(c => risultato.punteggiSecondari?.[c.key] !== undefined && risultato.punteggiSecondari[c.key] !== '')
    if (!compilati.length) return ''
    const dettagli = compilati
      .map(c => {
        const p = risultato.punteggiSecondari![c.key]
        const scala = getScalaApplicabile(c, template) // Usa template.scalaDefault o g.scalaDefault in teoria, ma getScalaApplicabile supporta campo o template.
        // Wait, getScalaApplicabile accepts CampoTest, TestTemplate.
        const scalaEffettiva = c.scala || g.scalaDefault || template.scalaDefault
        const fascia = calcolaFascia(p, scalaEffettiva)?.toLowerCase() ?? '-'
        return `${c.label} (pp ${p}, fascia ${fascia})`
      })
      .join(', ')
    return `Per l'indice ${g.label} sono stati considerati i seguenti subtest: ${dettagli}.`
  }).filter(Boolean)
  
  if (!frasi.length) return ''
  return frasi.join(' ') + '\n\n'
}

/**
 * Costruisce la sezione da inviare come prompt a Gemini per il test.
 *
 * ⚠️ Il payload contiene SOLO dati grezzi (label/punteggio/fascia), MAI la tabella
 * Markdown già renderizzata (generaTabella) né il testo formattato di notaRange.
 * Motivo: un LLM a cui si mostra una tabella `|...|` o una frase in corsivo appena
 * prima di chiedergli di commentarla tende a farne l'eco nella narrativa generata,
 * eco che poi va ripulita a valle con regex (vedi rimuoviTabelleMarkdown /
 * pulisciSezioneDaIntestazioni in wizardToText.ts). Tabella e nota range vengono
 * inserite nel documento finale in modo deterministico da generaSezioneTest() /
 * assemblaDocumentoMarkdown(): Gemini non le vede mai renderizzate, solo i valori.
 */
export function buildGeminiPayload(template: TestTemplate, risultato: RisultatoTest): string {
  let out = `=== SEZIONE: ${template.id} ===\n`
  
  if (template.richiedeEtaValutazione) {
    out += `Età al momento della valutazione: ${risultato.etaValutazione || 'Non specificata'}\n`
  }
  if (template.richiedeStrumentiUtilizzati) {
    out += `Strumenti utilizzati: ${risultato.strumentiUtilizzati || 'Non specificati'}\n`
  }

  const campiPrincipaliValidi = template.campiPrincipali.filter(c =>
    risultato.punteggi[c.key] !== undefined && risultato.punteggi[c.key] !== ''
  )
  if (campiPrincipaliValidi.length > 0) {
    out += 'Punteggi (solo dati: NON riprodurre come tabella o elenco, usali solo per scrivere il commento in prosa):\n'
    for (const c of campiPrincipaliValidi) {
      const p = risultato.punteggi[c.key]
      const fascia = calcolaFascia(p, getScalaApplicabile(c, template)) ?? '-'
      const interpretabile = risultato.interpretabilita?.[c.key] !== false
      out += `${c.label}: ${p}, fascia ${fascia}${interpretabile ? '' : ' (NON interpretabile: dispersione eccessiva nei subtest)'}\n`
    }
  } else {
    out += 'Punteggi: nessuno\n'
  }

  if (risultato.includiNotaRange !== false && template.notaRange) {
    const notaPulita = template.notaRange.replace(/^\*+|\*+$/g, '').trim()
    out += `Criterio interpretativo di riferimento (usa per informare il commento, NON citarlo testualmente né riprodurlo come nota a parte): ${notaPulita}\n`
  } else {
    out += 'Criterio interpretativo di riferimento: nessuno\n'
  }
  
  if (template.gruppiSecondari?.length) {
    const narrativaGruppi = calcolaNarrativaGruppi(template, risultato).trim()
    out += `Subtest/Gruppi (spiegare SEMPRE a parole nel testo, MAI in tabella): ${narrativaGruppi || 'Nessuno'}\n`
  }
  
  out += `Note cliniche: ${risultato.noteCliniche || 'Nessuna'}`
  
  return out
}

/**
 * Valida la coerenza di un array di soglie custom (contiguità, no buchi/sovrapposizioni).
 */
export function validaSoglieCustom(soglie: SogliaCustom[]): { valida: boolean; errore?: string } {
  if (soglie.length === 0) {
    return { valida: false, errore: 'Almeno una soglia deve essere definita.' }
  }

  const ordinate = [...soglie].sort((a, b) => a.min - b.min)

  for (let i = 0; i < ordinate.length; i++) {
    const cur = ordinate[i]

    if (i < ordinate.length - 1 && cur.max === null) {
      return { valida: false, errore: `La soglia "${cur.etichetta}" non può avere limite superiore indefinito se non è l'ultima.` }
    }
    if (cur.max !== null && cur.min > cur.max) {
      return { valida: false, errore: `La soglia "${cur.etichetta}" ha un minimo maggiore del massimo.` }
    }

    if (i < ordinate.length - 1) {
      const next = ordinate[i + 1]
      // Verifichiamo la contiguità. In teoria cur.max dovrebbe essere (next.min - 1) o next.min.
      // Assumiamo che siano numeri interi e contigui come 0-69, 70-79, o soglie a decimale dove max == next.min.
      if (cur.max !== null && cur.max < next.min - 1) {
        return { valida: false, errore: `C'è un buco nei valori tra "${cur.etichetta}" e "${next.etichetta}".` }
      }
      if (cur.max !== null && cur.max > next.min) {
        return { valida: false, errore: `C'è una sovrapposizione tra "${cur.etichetta}" e "${next.etichetta}".` }
      }
    }
  }

  return { valida: true }
}

