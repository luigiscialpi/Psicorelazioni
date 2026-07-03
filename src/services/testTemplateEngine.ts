import type { TestTemplate, CampoTest, RisultatoTest, ScalaPunteggio, SogliaCustom } from '../core/testTemplate'

// Tipi di utilità interni
type FasciaType = string | null

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
 * Genera la tabella Markdown per i risultati di un test.
 */
export function generaTabella(template: TestTemplate, risultato: RisultatoTest): string {
  let table = ''
  
  // Tabella principale (se ci sono punteggi per i campi principali)
  const campiPrincipaliValidi = template.campiPrincipali.filter(c => 
    risultato.punteggi[c.key] !== undefined && risultato.punteggi[c.key] !== ''
  )
  
  if (campiPrincipaliValidi.length > 0) {
    table += `| ${template.nome} scale | Punteggio | Categoria descrittiva | Interpretabilità |\n`
    table += `|---|---|---|---|\n`
    for (const c of campiPrincipaliValidi) {
      const p = risultato.punteggi[c.key]
      const scala = getScalaApplicabile(c, template)
      const fascia = calcolaFascia(p, scala) ?? '-'
      const interpret = risultato.interpretabilita?.[c.key] !== false ? 'Sì' : 'No'
      table += `| ${c.label} | ${p} | ${fascia} | ${interpret} |\n`
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
 */
export function buildGeminiPayload(template: TestTemplate, risultato: RisultatoTest): string {
  let out = `=== SEZIONE: ${template.id} ===\n`
  
  if (template.richiedeEtaValutazione) {
    out += `Età al momento della valutazione: ${risultato.etaValutazione || 'Non specificata'}\n`
  }
  if (template.richiedeStrumentiUtilizzati) {
    out += `Strumenti utilizzati: ${risultato.strumentiUtilizzati || 'Non specificati'}\n`
  }
  
  const tabella = generaTabella(template, risultato).trim()
  out += `Tabella ${template.nome} (non modificare, verrà inserita automaticamente):\n${tabella || 'Nessuna'}\n\n`
  
  out += `Nota range: ${risultato.includiNotaRange !== false && template.notaRange ? template.notaRange : 'Nessuna'}\n`
  
  if (template.gruppiSecondari?.length) {
    const narrativaGruppi = calcolaNarrativaGruppi(template, risultato).trim()
    out += `Subtest/Gruppi (spiegare SEMPRE a parole nel testo, MAI in tabella): ${narrativaGruppi || 'Nessuno'}\n`
  }
  
  out += `Note cliniche: ${risultato.noteCliniche || 'Nessuna'}`
  
  return out
}
