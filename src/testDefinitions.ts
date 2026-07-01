// ============================================================
// TEST NEUROPSICOLOGICI — definizioni strutturate
// Fonte di verità unica per: campi del wizard, generazione
// tabella Word (exportDocx), e dati puliti passati a Gemini.
// Basato sulla struttura osservata nello screenshot reale
// (tabella WISC-IV con colonne: scala | indici/QI | categoria
// descrittiva | interpretabilità).
// ============================================================

// Fasce descrittive standard WISC-IV (standard su punteggio 100, DS 15)
// Soglie derivate dalla nota a piè di tabella nello screenshot reale:
// >129 molto superiore, 120-129 superiore, 110-119 medio-superiore,
// 90-109 medio, 80-89 medio-inferiore, 70-79 limite della norma, <69 inferiore
export function fasciaWISC(punteggio) {
  const p = Number(punteggio)
  if (Number.isNaN(p)) return ''
  if (p > 129) return 'Molto superiore'
  if (p >= 120) return 'Superiore'
  if (p >= 110) return 'Medio-superiore'
  if (p >= 90)  return 'Media'
  if (p >= 80)  return 'Media inferiore'
  if (p >= 70)  return 'Inferiore alla Media'
  return 'Molto inferiore alla norma'
}

// Fasce per punteggi scalari (subtest singoli, media 10, DS 3) — usato in NEPSY-II
export function fasciaScalare(punteggio) {
  const p = Number(punteggio)
  if (Number.isNaN(p)) return ''
  if (p >= 17) return 'Molto superiore'
  if (p >= 14) return 'Superiore'
  if (p >= 13) return 'Medio-superiore'
  if (p >= 8)  return 'Media'
  if (p >= 6)  return 'Media inferiore'
  if (p >= 4)  return 'Inferiore alla Media'
  return 'Molto inferiore alla norma'
}

// ── WISC-IV ─────────────────────────────────────────────────
// 4 indici principali + QI Totale + due indici opzionali (IAG, ICC)
export const WISC_IV_CAMPI = [
  { key: 'icv', label: 'Comprensione Verbale (ICV)', tipo: 'indice',
    descr: "L'Indice di Comprensione Verbale (ICV) offre una misura della formazione di concetti verbali, del ragionamento e della conoscenza acquisita dall'ambiente." },
  { key: 'rp', label: 'Ragionamento Visuo-Percettivo (RP)', tipo: 'indice',
    descr: "L'Indice di Ragionamento Visuo-Percettivo (RP) offre una misura del ragionamento fluido nel dominio percettivo, con particolare attenzione all'elaborazione simultanea dell'informazione visuo-spaziale." },
  { key: 'iml', label: 'Memoria di Lavoro (IML)', tipo: 'indice',
    descr: "L'Indice di Memoria di Lavoro (IML) offre una misura della capacità di mantenere temporaneamente le informazioni in memoria, eseguire operazioni mentali su di esse e produrre un risultato." },
  { key: 've', label: 'Velocità di Elaborazione (VE)', tipo: 'indice',
    descr: "L'Indice di Velocità di Elaborazione (VE) offre una misura della velocità e accuratezza nell'elaborazione dell'informazione visiva semplice o routinaria." },
  { key: 'qit', label: 'Totale (QI)', tipo: 'totale',
    descr: 'Il Quoziente Intellettivo Totale (QIT) rappresenta una stima globale del funzionamento cognitivo, derivata dall\'integrazione dei quattro indici principali.' },
  { key: 'iag', label: 'Indice di Abilità Generale (IAG)', tipo: 'opzionale',
    descr: "L'Indice di Abilità Generale (IAG) offre una misura del funzionamento cognitivo generale meno sensibile alle componenti di memoria di lavoro e velocità di elaborazione." },
  { key: 'icc', label: 'Indice di Efficienza Cognitiva (ICC)', tipo: 'opzionale',
    descr: "L'Indice di Efficienza Cognitiva (ICC) offre una misura dell'efficienza con cui il soggetto elabora le informazioni, integrando memoria di lavoro e velocità di elaborazione." },
]

// ── NEPSY-II ────────────────────────────────────────────────
// Organizzato per dominio, ogni subtest ha punteggio scalare (media 10, DS 3)
export const NEPSY_II_DOMINI = [
  {
    dominio: 'Attenzione e Funzioni Esecutive',
    subtest: [
      { key: 'attenzione_uditiva', label: 'Attenzione Uditiva' },
      { key: 'risposte_associate', label: 'Risposte Associate' },
      { key: 'inibizione',         label: 'Inibizione' },
      { key: 'fluenza_disegno',    label: 'Fluenza nel Disegno' },
    ],
  },
  {
    dominio: 'Memoria e Apprendimento',
    subtest: [
      { key: 'memoria_facce',      label: 'Memoria di Facce' },
      { key: 'memoria_narrativa',  label: 'Memoria Narrativa' },
      { key: 'liste_parole',       label: 'Apprendimento di Liste di Parole' },
    ],
  },
  {
    dominio: 'Linguaggio',
    subtest: [
      { key: 'denominazione',      label: 'Denominazione Rapida Automatizzata' },
      { key: 'comprensione_istr',  label: 'Comprensione di Istruzioni' },
      { key: 'fluenza_fonemica',   label: 'Fluenza Fonemica' },
    ],
  },
  {
    dominio: 'Percezione Sociale',
    subtest: [
      { key: 'riconoscimento_emozioni', label: 'Riconoscimento delle Emozioni' },
      { key: 'teoria_mente',            label: 'Teoria della Mente (ToM)' },
    ],
  },
  {
    dominio: 'Visuospaziale',
    subtest: [
      { key: 'copia_figure',       label: 'Copia di Figure' },
      { key: 'orientamento_linee', label: 'Giudizio di Orientamento delle Linee' },
    ],
  },
]

// Appiattisce NEPSY in un unico array { key, label, dominio } — utile per iterare nel form
export const NEPSY_II_CAMPI_FLAT = NEPSY_II_DOMINI.flatMap(d =>
  d.subtest.map(s => ({ ...s, dominio: d.dominio }))
)
