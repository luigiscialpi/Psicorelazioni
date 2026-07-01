// ============================================================
// MOCK DATA — usato quando Supabase non è configurato
// Le relazioni di esempio sono interamente INVENTATE (nessun dato
// reale di paziente), ma rispettano la struttura reale identificata
// dall'analisi di 3 relazioni vere (lette privatamente, mai
// riportate come contenuto — solo per ricavarne lo scheletro).
// ============================================================

export const MOCK_RELAZIONI = [
  {
    id: 'r1',
    created_at: '2024-03-15T10:00:00Z',
    tipo: 'importata',
    tipo_relazione: 'valutazione-completa',
    titolo: 'Valutazione neuropsicologica — PAZ-001',
    anno: 2024,
    paziente_id: 'p1',
    tag: ['wisc-iv', 'nepsy', 'dsa'],
    testo_markdown: `# Relazione di Valutazione Neuropsicologica

## Dati e motivo dell'invio
Il paziente, di anni 10 e 4 mesi, frequentante la classe V primaria, viene inviato dalla neuropsichiatra infantile curante per approfondimento diagnostico a seguito di difficoltà scolastiche persistenti in ambito di lettura e scrittura, segnalate dai docenti nel corso dell'anno.

## Anamnesi
Anamnesi remota: nato a termine, sviluppo psicomotorio nella norma. Prima infanzia priva di eventi clinicamente rilevanti.
Situazione attuale: il rendimento scolastico risulta disomogeneo, con particolare affaticamento nelle attività di lettura ad alta voce e nella produzione scritta autonoma.

## Osservazione comportamentale
Il paziente si presenta al colloquio accompagnato dalla madre, con adattamento progressivo al setting. L'atteggiamento risulta collaborativo, sebbene si osservi una lieve tensione emotiva nell'affrontare i compiti di lettura.

## Valutazione cognitiva
Strumenti utilizzati: WISC-IV.

| Indice | Punteggio standard | Percentile |
|---|---|---|
| ICV | 102 | 55° |
| IRP | 98 | 45° |
| IML | 89 | 23° |
| IVE | 91 | 27° |
| QIT | 96 | 39° |

L'Indice di Comprensione Verbale (ICV) offre una misura della formazione di concetti verbali, del ragionamento e della conoscenza acquisita dall'ambiente. Il punteggio ottenuto si colloca nella norma.

L'Indice di Memoria di Lavoro (IML) offre una misura della capacità di mantenere temporaneamente le informazioni in memoria, eseguire operazioni mentali su di esse e produrre un risultato. Il punteggio ottenuto si colloca nella fascia medio-bassa, suggerendo una relativa fragilità in quest'area.

## Approfondimento neuropsicologico
Strumenti utilizzati: NEPSY-II (sottotest attenzione e funzioni esecutive).

| Sottotest | Punteggio scalare |
|---|---|
| Attenzione uditiva | 7 |
| Inibizione | 6 |

La prestazione ai compiti di attenzione sostenuta risulta nella norma, mentre si rileva una difficoltà nella componente inibitoria, con tendenza a risposte impulsive.

## Valutazione apprendimenti
Strumenti utilizzati: Prove MT, BVSCO 3.

| Prova | Punteggio | Fascia |
|---|---|---|
| Lettura brano (rapidità) | -1.8 DS | Richiesta di attenzione |
| Lettura brano (correttezza) | -2.1 DS | Richiesta di intervento immediato |
| Dettato ortografico | 12 errori | Richiesta di intervento immediato |

La prestazione in lettura risulta significativamente al di sotto della norma sia in termini di rapidità che di correttezza. Anche la scrittura sotto dettato evidenzia un numero di errori ortografici superiore all'atteso per età e scolarità.

## Conclusioni
Alla luce di quanto emerso dalla valutazione, si rileva un quadro compatibile con Disturbo Specifico dell'Apprendimento, con compromissione della lettura e della scrittura (F81.0 - F81.1).

Consigli: si raccomanda l'attivazione di un percorso di potenziamento specifico per le abilità di lettura e scrittura, con cadenza bisettimanale.
Indicazioni per la scuola: si suggerisce la predisposizione di un Piano Didattico Personalizzato.
Strumenti compensativi: sintesi vocale, audiolibri, calcolatrice.
Misure dispensative: dispensa dalla lettura ad alta voce in classe, tempi aggiuntivi nelle verifiche scritte.

Si rilascia alla famiglia per gli usi consentiti dalla Legge 170/2010.`
  },
  {
    id: 'r2',
    created_at: '2024-09-20T14:30:00Z',
    tipo: 'importata',
    tipo_relazione: 'rivalutazione',
    titolo: 'Rivalutazione PDP — PAZ-002',
    anno: 2024,
    paziente_id: 'p2',
    tag: ['rivalutazione', 'adhd'],
    testo_markdown: `# Relazione di Rivalutazione

## Dati e motivo dell'invio
Il paziente, di anni 13, frequentante la classe II secondaria di primo grado, viene inviato dalla famiglia per rivalutazione finalizzata al rinnovo del Piano Didattico Personalizzato.

## Anamnesi
Situazione attuale: il percorso di potenziamento intrapreso nell'ultimo anno scolastico ha mostrato un graduale miglioramento nella gestione dei compiti scolastici, sebbene permangano difficoltà nella pianificazione del lavoro autonomo.

## Osservazione comportamentale
Il paziente si presenta al colloquio con atteggiamento collaborativo e buon contatto comunicativo, mostrando consapevolezza rispetto alle proprie difficoltà.

## Questionari
Tipo: CBCL compilato dai genitori, YSR compilato dal paziente.

| Scala | T-score genitori | T-score auto |
|---|---|---|
| Problemi di attenzione | 68 | 62 |
| Ansia/depressione | 55 | 58 |

Le scale relative ai problemi di attenzione si confermano nella fascia clinicamente significativa secondo il report genitoriale, con percezione lievemente inferiore da parte del paziente stesso.

## Conclusioni
Alla luce di quanto emerso dalla rivalutazione, si conferma il quadro diagnostico già formulato (F90.0), con miglioramento del funzionamento adattivo rispetto alla precedente valutazione.

Indicazioni per la scuola: si conferma l'utilità del PDP in essere, con suggerimento di rivedere i tempi di consegna per le prove scritte più articolate.

Si rilascia alla famiglia per gli usi consentiti dalla Legge 170/2010.`
  },
  {
    // Relazione GENERATA dall'app (non importata) — include wizard_snapshot
    // per dimostrare il flusso "Apri e modifica" dall'Archivio in modalità demo.
    id: 'r3',
    created_at: '2025-01-10T09:00:00Z',
    updated_at: '2025-01-10T09:00:00Z',
    tipo: 'generata',
    tipo_relazione: 'valutazione',
    titolo: 'Relazione — Bianchi — 10/1/2025',
    anno: 2025,
    paziente_id: 'p3',
    tag: ['anamnesi', 'osservazione', 'cognitivo', 'conclusioni'],
    testo_markdown: `# Relazione di Valutazione Neuropsicologica

## Dati e motivo dell'invio
Il/la paziente viene inviato/a da neuropsichiatra infantile per approfondimento diagnostico.

## Anamnesi
Anamnesi remota: sviluppo psicomotorio nella norma.
Situazione attuale: rendimento scolastico complessivamente adeguato.

## Osservazione comportamentale
Adattamento graduale al setting. Atteggiamento collaborante durante la valutazione.

## Valutazione cognitiva

| WISC-IV scale | Indici/QI | Categoria descrittiva | Interpretabilità |
|---|---|---|---|
| Comprensione Verbale (ICV) | 108 | Media | Sì |
| Ragionamento Visuo-Percettivo (RP) | 95 | Media | Sì |
| Memoria di Lavoro (IML) | 88 | Media inferiore | Sì |
| Velocità di Elaborazione (VE) | 91 | Media | Sì |
| Totale (QI) | 95 | Media | Sì |

L'Indice di Comprensione Verbale (ICV) offre una misura della formazione di concetti verbali. Il punteggio ottenuto (108) si colloca nella fascia "Media".

## Conclusioni
Alla luce di quanto emerso dalla valutazione, il quadro cognitivo generale risulta nella norma.

Si rilascia alla famiglia per gli usi consentiti dalla Legge 170/2010.`,
    // Snapshot completo delle risposte del wizard — SENZA anagrafica
    // (quella vive solo nel record paziente p3 qui sotto)
    wizard_snapshot: {
      sezioni_attive: ['anamnesi', 'osservazione', 'cognitivo', 'conclusioni'],
      motivo_invio: 'approfondimento diagnostico', tipo_invio: 'neuropsichiatra infantile', nome_inviante: '',
      paziente_nuovo: false, codice_paziente: '',
      anamnesi: {
        remota_voci: ['sviluppo_norma'], remota_dettagli: {}, remota_extra: '',
        recente_voci: ['rendimento_adeguato'], recente_dettagli: {}, recente_extra: '',
      },
      osservazione: { adattamento_voci: ['adattamento_grad'], atteggiamento_voci: ['collaborante'], note: '' },
      cognitivo: { somministrato: true, punteggi: { icv: '108', rp: '95', iml: '88', ve: '91', qit: '95' }, note_cliniche: '' },
      nepsy: { somministrato: true, punteggi: {}, note_cliniche: '' },
      apprendimenti: { strumenti: '', punteggi_grezzi: '', lettura: '', scrittura: '', matematica: '' },
      questionari: { tipo: '', punteggi_grezzi: '', note_cliniche: '' },
      conclusioni: { diagnosi: 'quadro cognitivo nella norma', codice_icd: '', consigli_paziente: '', consigli_scuola: '', strumenti_compensativi: '', misure_dispensative: '' },
      destinatario_finale: 'famiglia', lunghezza: 'standard', note_extra: '',
    },
  },
]

export const MOCK_PAZIENTI = [
  { id: 'p1', codice: 'PAZ-001', eta_approssimativa: 10, sesso: 'M', tipo_consulto: 'valutazione-completa' },
  { id: 'p2', codice: 'PAZ-002', eta_approssimativa: 13, sesso: 'F', tipo_consulto: 'rivalutazione' },
  // Paziente con anagrafica reale — collegato a r3, dimostra la separazione
  // dati: questi campi non sono mai passati a Gemini, vivono solo qui.
  { id: 'p3', nome: 'Marco', cognome: 'Bianchi', data_nascita: '2013-05-12', scuola_classe: '3ª Scuola Secondaria di Primo Grado' },
]

export const MOCK_PROFILO_STILE = `# PROFILO DI STILE — Valutazioni neuropsicologiche
Ultimo aggiornamento: 2024-09-20 | Relazioni analizzate: 2 | Versione: 1

## 1. Struttura standard (ORDINE INVARIABILE)
1. Intestazione professionale — fissa, da template
2. Apertura anagrafica: codice paziente, età, scuola/classe, chi invia, motivo
3. Anamnesi remota e recente
4. Osservazione del comportamento al colloquio
5. Valutazione cognitiva (WISC-IV) — tabella + descrizione narrativa per indice
6. Approfondimento neuropsicologico (NEPSY-II) — tabella + narrativa
7. Valutazione apprendimenti, quando pertinente
8. Questionari (CBCL/YSR) — confronto genitori vs autovalutazione
9. Conclusioni: diagnosi, codice ICD, consigli a paziente/famiglia/scuola
10. Riferimento alla L. 170/2010
11. Chiusura con formula fissa di rilascio

## 2. Registro linguistico
- Terza persona, mai in prima persona
- Forma impersonale per i risultati ("la prestazione risulta...", "si rileva...")
- Frasi-cornice fisse per ogni indice WISC, cambia solo il dato del paziente

## 3. Formule ricorrenti
- "L'Indice di [nome] (sigla) offre una misura di..."
- "Alla luce di quanto emerso dalla valutazione..."
- "Si rilascia alla famiglia per gli usi consentiti dalla Legge 170/2010"

## 4. Tabelle dei punteggi
Mai generate dal testo libero: riportate fedelmente come incollate dal software di scoring.

## 5. Terminologia preferita vs da evitare
| Preferita | Da evitare |
|---|---|
| "la prestazione risulta nella norma" | "il punteggio è buono" |
| "si rileva una difficoltà in..." | "ha un problema con..." |
| "il quadro neuropsicologico" | "la situazione" |

## 6. Lunghezza e ritmo
- Valutazioni complete: 1300-1800 parole
- Rivalutazioni/follow-up: 700-1000 parole
`

export const MOCK_SESSIONI = []
