// ============================================================
// ANAMNESI — voci ricorrenti selezionabili a checkbox
// Riducono la digitazione libera per i pattern più frequenti,
// osservati nelle relazioni reali analizzate. Ogni voce ha un
// testo pronto da inserire nella relazione; il campo libero resta
// sempre disponibile per dettagli specifici del singolo caso.
// ============================================================

export const ANAMNESI_REMOTA_VOCI = [
  { id: 'sviluppo_norma',      testo: 'sviluppo psicomotorio nella norma' },
  { id: 'nato_termine',        testo: 'nato/a a termine, gravidanza e parto privi di complicazioni riferite' },
  { id: 'linguaggio_norma',    testo: 'acquisizione del linguaggio nei tempi attesi' },
  { id: 'diagnosi_pregressa',  testo: 'presenta una diagnosi pregressa', richiedeDettaglio: true,
    placeholder: 'es. ADHD combinato, risalente a dicembre 2021, formulata da...' },
  { id: 'gia_seguito',         testo: 'già seguito/a da altro specialista o servizio', richiedeDettaglio: true,
    placeholder: 'es. logopedista dai 5 ai 7 anni per...' },
  { id: 'trattamento_farmaco', testo: 'in trattamento farmacologico', richiedeDettaglio: true,
    placeholder: 'es. farmaco, dosaggio, da quando...' },
  { id: 'anamnesi_familiare',  testo: 'anamnesi familiare positiva per difficoltà simili', richiedeDettaglio: true,
    placeholder: 'es. familiarità per DSA riferita dai genitori...' },
]

export const ANAMNESI_RECENTE_VOCI = [
  { id: 'rendimento_adeguato',   testo: 'rendimento scolastico complessivamente adeguato' },
  { id: 'rendimento_disomog',    testo: 'rendimento scolastico disomogeneo tra le diverse discipline' },
  { id: 'difficolta_specifiche', testo: 'difficoltà specifiche in una o più discipline', richiedeDettaglio: true,
    placeholder: 'es. maggiori difficoltà in matematica e lingue straniere...' },
  { id: 'relazioni_adeguate',    testo: 'relazioni con i pari e i docenti riferite come adeguate' },
  { id: 'relazioni_difficili',   testo: 'difficoltà nelle relazioni sociali a scuola', richiedeDettaglio: true,
    placeholder: 'es. isolamento, conflittualità con i pari...' },
  { id: 'supporto_extra',        testo: 'frequenta un percorso di supporto extrascolastico', richiedeDettaglio: true,
    placeholder: 'es. doposcuola specialistico, tutor DSA...' },
  { id: 'interessi_extra',       testo: 'nel tempo libero coltiva interessi/attività extrascolastiche', richiedeDettaglio: true,
    placeholder: 'es. nuoto, attività sportiva, musica...' },
]

export const OSSERVAZIONE_ADATTAMENTO_VOCI = [
  { id: 'adattamento_grad',   testo: 'adattamento graduale al setting' },
  { id: 'adattamento_pronto', testo: 'adattamento pronto e sereno al setting' },
  { id: 'accompagnato',       testo: 'accompagnato/a da un genitore/entrambi i genitori' },
]

export const OSSERVAZIONE_ATTEGGIAMENTO_VOCI = [
  { id: 'collaborante',       testo: 'atteggiamento collaborante durante la valutazione' },
  { id: 'riservato',          testo: 'atteggiamento riservato, con limitata espressione emotiva' },
  { id: 'contatto_visivo_ok', testo: 'contatto visivo adeguato' },
  { id: 'tono_umore_basso',   testo: 'si osserva un tono dell\'umore lievemente basso' },
  { id: 'ansia_prestazione',  testo: 'segni di ansia da prestazione durante le prove' },
  { id: 'buona_motivazione',  testo: 'buona motivazione e partecipazione attiva alle prove proposte' },
]
