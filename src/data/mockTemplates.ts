import type { TestTemplate } from '../core/testTemplate'

export const MOCK_WISC_IV_TEMPLATE: TestTemplate = {
  id: 'wisc-iv',
  nome: 'WISC-IV',
  categoria: 'cognitivo',
  scalaDefault: { tipo: 'qi_wisc' },
  notaRange: '*WISC-IV: QI >129 molto superiore, 120-129 superiore, 110-119 medio-superiore, 90-109 media, 80-89 media inferiore, 70-79 inferiore alla media, <69 molto inferiore alla norma.*',
  richiedeEtaValutazione: true,
  richiedeStrumentiUtilizzati: true,
  builtIn: true,
  attivo: true,
  schemaVersion: 1,
  campiPrincipali: [
    { key: 'icv', label: 'Comprensione Verbale (ICV)', descr: "L'Indice di Comprensione Verbale (ICV) offre una misura della formazione di concetti verbali, del ragionamento e della conoscenza acquisita dall'ambiente." },
    { key: 'rp', label: 'Ragionamento Visuo-Percettivo (RP)', descr: "L'Indice di Ragionamento Visuo-Percettivo (RP) offre una misura del ragionamento fluido nel dominio percettivo, con particolare attenzione all'elaborazione simultanea dell'informazione visuo-spaziale." },
    { key: 'iml', label: 'Memoria di Lavoro (IML)', descr: "L'Indice di Memoria di Lavoro (IML) offre una misura della capacità di mantenere temporaneamente le informazioni in memoria, eseguire operazioni mentali su di esse e produrre un risultato." },
    { key: 've', label: 'Velocità di Elaborazione (VE)', descr: "L'Indice di Velocità di Elaborazione (VE) offre una misura della velocità e accuratezza nell'elaborazione dell'informazione visiva semplice o routinaria." },
    { key: 'qit', label: 'Totale (QI)', descr: "Il Quoziente Intellettivo Totale (QIT) rappresenta una stima globale del funzionamento cognitivo, derivata dall'integrazione dei quattro indici principali." },
    { key: 'iag', label: 'Indice di Abilità Generale (IAG)', descr: "L'Indice di Abilità Generale (IAG) offre una misura del funzionamento cognitivo generale meno sensibile alle componenti di memoria di lavoro e velocità di elaborazione." },
    { key: 'icc', label: 'Indice di Efficienza Cognitiva (ICC)', descr: "L'Indice di Efficienza Cognitiva (ICC) offre una misura dell'efficienza con cui il soggetto elabora le informazioni, integrando memoria di lavoro e velocità di elaborazione." },
  ],
  gruppiSecondari: [
    {
      key: 'icv', label: 'Comprensione Verbale (ICV)', scalaDefault: { tipo: 'scalare' },
      campi: [
        { key: 'so', label: 'Somiglianze (SO)' },
        { key: 'vc', label: 'Vocabolario (VC)' },
        { key: 'co', label: 'Comprensione (CO)' },
      ]
    },
    {
      key: 'rp', label: 'Ragionamento Visuo-Percettivo (RP)', scalaDefault: { tipo: 'scalare' },
      campi: [
        { key: 'dc', label: 'Disegno con i Cubi (DC)' },
        { key: 'ci', label: 'Concetti Illustrati (CI)' },
        { key: 'rm', label: 'Ragionamento con le Matrici (RM)' },
      ]
    },
    {
      key: 'iml', label: 'Memoria di Lavoro (IML)', scalaDefault: { tipo: 'scalare' },
      campi: [
        { key: 'mc', label: 'Memoria di Cifre (MC)' },
        { key: 'rln', label: 'Riordinamento di Lettere e Numeri (RLN)' },
        { key: 'ar', label: 'Aritmetica (AR) — supplementare' },
      ]
    },
    {
      key: 've', label: 'Velocità di Elaborazione (VE)', scalaDefault: { tipo: 'scalare' },
      campi: [
        { key: 'cf', label: 'Cifrario (CF)' },
        { key: 'rs', label: 'Ricerca di Simboli (RS)' },
        { key: 'ca', label: 'Cancellazione (CA) — supplementare' },
      ]
    }
  ],
  colonne: [{ nome: 'Punteggio' }],
}

export const MOCK_NEPSY_II_TEMPLATE: TestTemplate = {
  id: 'nepsy-ii',
  nome: 'NEPSY-II',
  categoria: 'nepsy',
  scalaDefault: { tipo: 'scalare' },
  notaRange: '*NEPSY-II: punteggi scalari con media 10 e DS 3; valori più alti indicano prestazioni migliori. Interpretazione contestualizzata al dominio valutato.*',
  richiedeEtaValutazione: false,
  richiedeStrumentiUtilizzati: true,
  builtIn: true,
  attivo: true,
  schemaVersion: 1,
  campiPrincipali: [
    { key: 'attenzione_uditiva', label: 'Attenzione Uditiva (Attenzione e Funzioni Esecutive)' },
    { key: 'risposte_associate', label: 'Risposte Associate (Attenzione e Funzioni Esecutive)' },
    { key: 'inibizione', label: 'Inibizione (Attenzione e Funzioni Esecutive)' },
    { key: 'fluenza_disegno', label: 'Fluenza nel Disegno (Attenzione e Funzioni Esecutive)' },
    { key: 'memoria_facce', label: 'Memoria di Facce (Memoria e Apprendimento)' },
    { key: 'memoria_narrativa', label: 'Memoria Narrativa (Memoria e Apprendimento)' },
    { key: 'liste_parole', label: 'Apprendimento di Liste di Parole (Memoria e Apprendimento)' },
    { key: 'denominazione', label: 'Denominazione Rapida Automatizzata (Linguaggio)' },
    { key: 'comprensione_istr', label: 'Comprensione di Istruzioni (Linguaggio)' },
    { key: 'fluenza_fonemica', label: 'Fluenza Fonemica (Linguaggio)' },
    { key: 'riconoscimento_emozioni', label: 'Riconoscimento delle Emozioni (Percezione Sociale)' },
    { key: 'teoria_mente', label: 'Teoria della Mente (ToM) (Percezione Sociale)' },
    { key: 'copia_figure', label: 'Copia di Figure (Visuospaziale)' },
    { key: 'orientamento_linee', label: 'Giudizio di Orientamento delle Linee (Visuospaziale)' },
  ],
  colonne: [{ nome: 'Punteggio' }],
}

export const MOCK_TEST_TEMPLATES = [
  MOCK_WISC_IV_TEMPLATE,
  MOCK_NEPSY_II_TEMPLATE
]
