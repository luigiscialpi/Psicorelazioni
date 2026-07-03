# Piano di Implementazione — PsicoRelazioni
### App per la generazione assistita di relazioni di valutazione neuropsicologica
*Versione 2.0 — Documento di pianificazione aggiornato*

---

## Indice

0. [Stato di avanzamento](#0-stato-di-avanzamento)
1. [Panoramica del progetto](#1-panoramica-del-progetto)
2. [Scelta tecnologica e motivazioni](#2-scelta-tecnologica-e-motivazioni)
3. [Architettura generale](#3-architettura-generale)
4. [Struttura del database Supabase](#4-struttura-del-database-supabase)
5. [Fasi di sviluppo](#5-fasi-di-sviluppo)
6. [Modulo 1 — Setup e importazione relazioni](#modulo-1--setup-e-importazione-relazioni)
7. [Modulo 2 — Analisi dello stile con Gemini](#modulo-2--analisi-dello-stile-con-gemini)
8. [Modulo 3 — Wizard di creazione relazione](#modulo-3--wizard-di-creazione-relazione)
9. [Modulo 4 — Generazione e revisione](#modulo-4--generazione-e-revisione)
10. [Modulo 5 — Export DOCX e gestione archivio](#modulo-5--export-docx-e-gestione-archivio)
11. [Problematiche anticipate e soluzioni](#11-problematiche-anticipare-e-soluzioni)
12. [Privacy e conformità](#12-privacy-e-conformità)
13. [Roadmap e priorità](#13-roadmap-e-priorità)
14. [Stima dei tempi](#14-stima-dei-tempi)

---

## 0. Stato di avanzamento

> Sezione aggiornata in questa revisione: il blocco principale delle versioni precedenti (template reale mancante) è stato risolto.

### 🟢 Sbloccato: struttura reale identificata da 3 relazioni vere

Tua sorella ha fornito 3 relazioni reali (un `.docx`, un `.doc`, un `.pdf` — utili anche per verificare concretamente il Modulo 1 su tutti i formati supportati). Trattandosi di file **non anonimizzati** (nomi e dati identificativi di pazienti reali, inclusi recapiti professionali in calce), sono stati gestiti così:

1. Lettura **esclusivamente in sandbox locale**, mai incollati o discussi nella conversazione
2. Estrazione **solo della struttura** (sezioni, ordine, formule fisse, terminologia) — nessun dato paziente, punteggio clinico reale o informazione identificativa è mai stato riportato in chat o salvato nel codice
3. Cancellazione immediata dei file grezzi dal sandbox subito dopo l'estrazione strutturale

Da questa analisi è emerso un dato importante che ha cambiato l'impostazione del progetto: **il dominio reale non è la psicoterapia generica** ipotizzata nelle versioni precedenti del piano, ma la **valutazione neuropsicologica e dell'apprendimento in età evolutiva** (tipo WISC-IV, NEPSY-II, CBCL/YSR, AC-MT, BVSCO — diagnosi DSA/ADHD secondo L. 170/2010), con un destinatario tipico che è la famiglia e/o la scuola, non un tribunale o un medico generico.

### Struttura reale identificata

Le tre relazioni condividono uno scheletro quasi identico:
1. Intestazione professionale (fissa)
2. Apertura anagrafica + motivo dell'invio (spesso da un neuropsichiatra infantile)
3. Anamnesi remota e recente
4. Osservazione comportamentale al colloquio
5. Valutazione cognitiva (WISC-IV) — tabella punteggi + descrizione narrativa per ciascun indice, con frasi-cornice identiche tra le relazioni
6. Approfondimento neuropsicologico (NEPSY-II)
7. Valutazione apprendimenti, quando pertinente
8. Questionari (CBCL/YSR)
9. Conclusioni con diagnosi, codice ICD, consigli a paziente/famiglia/scuola
10. Riferimenti normativi fissi (L. 170/2010), quasi verbatim identici tra i documenti
11. Chiusura con formula fissa di rilascio

### Decisione di prodotto: le tabelle dei punteggi non vengono generate dal wizard

Tua sorella usa già un software dedicato per calcolare i punteggi dei test (WISC-IV, NEPSY-II, ecc.). Replicare quella logica di scoring nel wizard sarebbe lavoro ridondante e rischioso (un errore di calcolo nel wizard sarebbe peggio che nessun wizard). La scelta è quindi che **il wizard accoglie le tabelle già pronte come testo incollato**, in un campo dedicato per ogni sezione pertinente, e le riporta fedelmente nella relazione finale senza tentare di interpretarle o ricalcolarle. Il wizard si occupa solo del testo narrativo attorno alle tabelle.

### Decisione di prodotto: sezioni selezionabili dinamicamente

Non tutte le relazioni includono tutte le sezioni (una rivalutazione può non avere una nuova valutazione cognitiva, per esempio). Il primo step del wizard è ora un selettore di sezioni: tua sorella sceglie quali includere per il caso specifico, e il wizard genera dinamicamente solo gli step corrispondenti — invece di un percorso fisso a 7 step come nelle versioni precedenti del piano.

### ✅ Stato per modulo

| Modulo | Stato | Note |
|---|---|---|
| Setup progetto | ✅ Completo | React + Vite, design system, font |
| Modulo 1 — Auth + Import (DOCX/PDF/DOC) | ✅ Completo | Mammoth.js (DOCX) + pdf.js (PDF) funzionanti e testati; `.doc` guidato verso conversione manuale a `.docx`. Rafforzato con fallback Pandoc WASM → docx-preview/Turndown → Mammoth e ricostruzione PDF migliorata (quindicesima correzione) |
| Livello dati astratto | ✅ Completo | `dataService.js`, `geminiService.js` |
| Modulo 2 — Profilo di stile | ✅ Calibrato sulla struttura reale | Prompt di analisi aggiornato per riconoscere indici WISC, tabelle NEPSY, formule normative fisse. Affidabilità Gemini (fallback modelli, retry, limiti payload) e logica incrementale deterministica aggiunte (sedicesima e diciassettesima correzione) |
| Modulo 3 — Wizard | ✅ Calibrato sulla struttura reale | Selettore di sezioni dinamico + step dedicati per anamnesi, osservazione, cognitivo, NEPSY, apprendimenti, questionari, conclusioni. Campi "punteggi" come testo libero per le tabelle incollate. Allineamento bidirezionale col Profilo di Stile e accordion punti ponderati per subtest WISC-IV (diciottesima e ventesima correzione) |
| Modulo 4 — Generazione + editor | 🟡 Parziale | Generazione e editor testuale aggiornati al nuovo formato; manca ancora "rigenera sezione" e l'anteprima formattata. Campi di contorno (intestazione, età/strumenti, note lettura/scrittura/matematica) ora tessuti nella narrativa di Gemini invece di restare testo grezzo (ventunesima correzione) |
| Modulo 5 — Export DOCX | ✅ Implementato | Template fedele allo screenshot: Times New Roman, margini 2.5cm, intestazione professionale, titolo centrato sottolineato, numero pagina X/Y, tabelle WISC con intestazione grigia e bordi |
| Modulo 5 — Archivio | ✅ Implementato | Ricerca full-text, filtro per tipo, apertura dettaglio, riapertura per modifica quando `wizard_snapshot` è presente. Dettaglio ora con rendering Markdown reale (tabelle/liste/blockquote) invece di testo piatto (quattordicesima correzione) |

### Decisione tecnica: `useReducer` al posto di `useState`

Confermata dalle versioni precedenti: tutti i componenti con stato composto da più campi correlati (wizard, lista file in importazione, stato di sessione/pagina dell'app) usano `useReducer`. Nel wizard ora a sezioni dinamiche, questo si è rivelato ancora più utile: la lista degli step si ricostruisce a runtime in base a quali sezioni sono selezionate (`buildSteps(sezioniAttive)`), e un reducer con azioni nominate gestisce sia i campi sia il toggle delle sezioni in modo centralizzato.

### Nota sul trattamento dei file ricevuti

Per trasparenza sul processo: i 3 file originali non sono mai stati salvati permanentemente, allegati a un artifact, o riportati come testo in questa conversazione. Sono stati letti una sola volta in un ambiente di esecuzione isolato al solo scopo di identificarne la struttura, poi eliminati. Questo approccio dovrebbe essere lo standard anche per qualsiasi materiale reale futuro (nuovi esempi di relazioni, screenshot, ecc.) finché non saranno disponibili meccanismi di anonimizzazione automatica nell'app stessa.

### Prossimo passo utile (non più bloccante)

Per il Modulo 5 (export DOCX), sarebbe utile in futuro vedere uno dei `.docx` originali aperto direttamente in Word (font usato, margini, eventuale intestazione/logo fisso) per replicare fedelmente l'aspetto finale. Non è bloccante per continuare lo sviluppo degli altri moduli.

**Aggiornamento**: uno screenshot dello stesso template è stato ricevuto e usato per calibrare l'export DOCX (font Times New Roman, margini 2.5cm, intestazione professionale, titolo centrato sottolineato, tabelle WISC con intestazione grigia, numerazione pagina X/Y). Il Modulo 5 — Export è ora implementato.

### Tre correzioni di modello dati (dopo revisione con l'utente)

Testando il flusso end-to-end sono emerse tre discrepanze tra il modello dati e l'uso reale, corrette in questa revisione:

**1. Separazione tra dati anagrafici reali e payload per Gemini**

Il concetto di "codice paziente" andava bene come principio generale di minimizzazione dei dati, ma nella pratica clinica reale la relazione finale deve riportare nome, cognome e data di nascita reali del paziente (confermato dallo screenshot). La soluzione adottata:

- Il wizard raccoglie nome, cognome, data di nascita, scuola/classe in uno step dedicato (`anagrafica`)
- Questi campi vengono **esplicitamente rimossi** dal payload prima di qualunque chiamata a Gemini (vedi `geminiService.js` → `generaRelazione`, destructuring `{ anagrafica, ...wizard }`)
- Il testo generato da Gemini parla sempre e solo di "il/la paziente", mai di un nome
- I dati anagrafici vengono ricomposti **solo lato client**, al momento dell'export DOCX (`exportDocx.js` → `anagraficaParagraph`), come primo paragrafo dopo il titolo "RELAZIONE"
- Un banner nell'interfaccia rende esplicito questo comportamento al momento della generazione, per trasparenza verso l'utente

**2. Anamnesi a voci selezionabili (checkbox) invece di solo testo libero**

Per ridurre la digitazione ripetitiva, gli step di Anamnesi e Osservazione comportamentale offrono ora una lista di voci ricorrenti selezionabili (es. "sviluppo psicomotorio nella norma", "adattamento graduale al setting"), alcune delle quali richiedono un dettaglio testuale opzionale (es. "presenta una diagnosi pregressa" → campo per specificare quale). Le voci sono definite in un modulo dedicato (`anamnesiVoci.js`) separato dal wizard, così sono facili da correggere o ampliare senza toccare la logica dei componenti. Un campo di testo libero resta comunque disponibile per ogni sezione, per i dettagli che non rientrano nelle voci predefinite. Questo è un punto esplicitamente indicato come "da affinare" — l'elenco attuale è un punto di partenza ragionevole, non definitivo.

**3. Punteggi dei test come input numerici guidati, non testo incollato**

Correzione concettuale importante: non esiste un software esterno di scoring da cui "incollare" tabelle già pronte — tua sorella dispone dei punteggi grezzi (numeri) e li inserisce manualmente. Per WISC-IV e NEPSY-II, che sono test standardizzati con struttura fissa, il wizard offre ora **un campo numerico per ciascun indice/subtest** (`testDefinitions.js` definisce i campi WISC-IV e i domini/subtest NEPSY-II). La fascia interpretativa ("Media", "Superiore", "Inferiore alla Media"...) viene calcolata automaticamente in base alle soglie standard, verificate contro i valori reali osservati nello screenshot. Da questi dati puliti (`wizardToText.js`) vengono generate sia la tabella Markdown/Word sia una narrativa di base con le frasi-cornice standard, che Gemini può poi arricchire con le note cliniche inserite. Per Apprendimenti e Questionari, dove gli strumenti sono più eterogenei (Prove MT, BVSCO, AC-MT, CBCL, Conners...), resta il campo di testo libero, essendo meno pratico standardizzare campi per ogni possibile test.

### Quarta correzione: relazioni riapribili e modificabili, anagrafica persistita correttamente

Testando il flusso "genera → esporta" fino in fondo è emerso un problema strutturale, non solo funzionale: **il DOCX esportato era l'unico output persistente**. Il testo clinico veniva salvato in archivio, ma senza l'anagrafica associata (che viveva solo in memoria React e spariva alla chiusura della pagina) e senza un modo di riaprire quella relazione per modificarla — per aggiungere un test dimenticato, l'unica opzione era ripartire da un wizard vuoto.

Corretto con tre interventi collegati:

- **Tabella `pazienti` estesa con anagrafica reale** (nome, cognome, data di nascita, scuola/classe) — protetta solo da autenticazione + Row Level Security, senza cifratura applicativa aggiuntiva in questa fase (scelta esplicita dell'utente, da rivalutare se l'uso si espande oltre l'ambito personale)
- **`wizard_snapshot` (JSONB) nella tabella `relazioni`**: salva tutte le risposte del wizard (sezioni scelte, voci di anamnesi selezionate, punteggi inseriti...) **esclusa l'anagrafica**, che resta collegata solo tramite `paziente_id`. Questo permette di ricostruire lo stato esatto del wizard quando si riapre una relazione
- **Archivio funzionante** (`Archivio.jsx`, prima solo un placeholder): ricerca full-text, filtro per tipo, apertura di una relazione con anteprima del contenuto e dell'anagrafica associata, pulsante "Apri e modifica" che ripopola il wizard con lo snapshot salvato e permette di aggiungere sezioni, correggere punteggi, rigenerare e ri-esportare — aggiornando il record esistente invece di crearne uno duplicato

Le relazioni importate da DOCX/PDF esistenti non hanno uno `wizard_snapshot` (non sono mai passate dal wizard), quindi restano consultabili ma non riapribili per la modifica guidata — comportamento corretto e segnalato chiaramente nell'interfaccia, non un bug.

### Quinta correzione: migrazione a TypeScript e riorganizzazione del progetto

Il progetto è stato migrato da JavaScript a TypeScript e riorganizzato in cartelle tematiche (`components/pages`, `components/state`, `services`, `data`, `core`), con l'aggiunta di `react-router-dom` per una navigazione con URL reali invece dello stato interno che pilotava un `switch` di pagine. Sono comparsi anche una scheda **Profilo Professionista** (dati fissi dello studio da riportare nell'intestazione del DOCX, invece di ripeterli ogni volta) e un servizio Pandoc lato browser per rafforzare la pipeline di estrazione DOCX/PDF. Questa migrazione è stata condotta in una sessione di lavoro separata; qui si documenta solo l'esito, non il processo.

### Sesta correzione — critica: anonimizzazione prima dell'invio a Gemini per l'analisi dello stile

Durante l'uso reale è emerso un problema di privacy serio: la funzione `analizzaStile` (Modulo 2, Profilo di Stile) mandava a Gemini il **testo integrale e non anonimizzato** delle relazioni importate — comprensivo di nome e cognome del paziente, data di nascita, nome e contatti del professionista, nomi di altri specialisti citati in anamnesi. A differenza del wizard (dove l'anagrafica è raccolta in un campo separato fin dall'origine, vedi terza correzione), le relazioni importate da DOCX/PDF sono blocchi di testo libero senza questa separazione strutturale.

Corretto con un nuovo modulo `anonimizza.ts`, che applica un'anonimizzazione **locale, senza chiamate di rete**, prima di qualsiasi invio a Gemini in `analizzaStile` e `aggiornaProfiloIncrementale`:
- Sostituzione di nome/cognome del paziente collegato (se noto tramite `paziente_id`) con `[PAZIENTE]`
- Pattern euristici per date di nascita, numeri di telefono, partite IVA, codici fiscali, indirizzi
- **Anteprima obbligatoria** in `ProfiloStile.tsx`: prima di confermare l'invio a Gemini, l'utente vede il testo *dopo* l'anonimizzazione con le sostituzioni evidenziate, e deve confermare esplicitamente ("Ho verificato, procedi con l'analisi") — nessun percorso bypassa questo passaggio
- Un avviso persistente ricorda che l'anonimizzazione automatica non è garantita al 100% e che la verifica manuale resta necessaria

Questo bug è stato scoperto analizzando il traffico di rete reale dell'app durante un test con dati clinici veri, non durante lo sviluppo — evidenzia il valore di testare il flusso end-to-end con attenzione a cosa viaggia davvero in ogni richiesta, non solo al comportamento visibile dell'interfaccia.

### Settima correzione: validazione UX del wizard, step per step

Prima di questa revisione, `canProceed()` — la funzione che decide se il pulsante "Avanti" è cliccabile — restituiva sempre `true` per ogni step. L'unica validazione avveniva in `canGenerate()`, chiamata solo sull'ultimissimo step, controllando in blocco campi sparsi lungo tutto il wizard. Conseguenza pratica: un utente poteva attraversare tutti gli 8-10 step, arrivare in fondo, e solo lì scoprire (tramite un bottone disabilitato senza spiegazione) che mancava, ad esempio, la data di nascita inserita 6 step prima.

Corretto introducendo una validazione centralizzata per step (`validateStep(stepId, data)`), coerente con le pratiche standard per i wizard multi-step: mai accumulare la validazione alla fine, dare sempre un feedback immediato e specifico su cosa manca, senza però validare in modo aggressivo mentre l'utente sta ancora scrivendo.

**Campi obbligatori per step** (marcati con `*` nel form, gli altri restano `(facoltativo)`):
- **Sezioni**: almeno una sezione selezionata
- **Anagrafica**: nome, cognome, data di nascita (scuola/classe resta facoltativa)
- **Contesto**: motivo dell'invio
- **Cognitivo** (se selezionato): almeno un punteggio WISC-IV inserito — se l'utente non ne ha nessuno, il messaggio suggerisce di deselezionare la sezione invece di lasciarla vuota
- **NEPSY** (se selezionato): stessa regola, almeno un punteggio
- **Conclusioni** (se selezionata): diagnosi

Gli step a compilazione libera per costruzione (Anamnesi, Osservazione, Apprendimenti, Questionari, Dettagli finali) non hanno campi bloccanti — sono pensati per essere eventualmente vuoti senza che questo comprometta la relazione.

**Tre elementi di interfaccia coordinati**:
1. Il pulsante "Avanti" si disabilita solo se lo step corrente ha campi mancanti, con un messaggio inline sotto che elenca esattamente cosa serve
2. La barra di progresso in alto usa tre colori: grigio per gli step non ancora visitati, verde/accent per quelli completi, **rosso** per quelli già visitati ma rimasti incompleti — la navigazione resta sempre libera (si può cliccare ovunque), il colore è solo un indicatore diagnostico, mai un blocco
3. Sull'ultimo step, se `canGenerate()` risulta ancora falso (caso limite: l'utente è arrivato in fondo saltando avanti da step incompleti), un riepilogo elenca tutti gli step con errori residui, ciascuno cliccabile per tornarci direttamente

### Ottava correzione: template DOCX calibrato sull'originale reale, non più su stima da screenshot

Tua sorella ha fornito un file DOCX reale anonimizzato (una relazione con nomi e dati sostituiti da placeholder, usata inizialmente come spunto di template). A differenza dello screenshot usato nella revisione precedente, questo ha permesso un'analisi diretta dell'XML interno del documento (`word/document.xml`, `header2.xml`, footer), rivelando alcuni scostamenti tra cosa si vedeva a schermo e cosa era effettivamente codificato:

| Parametro | Valore usato finora (da screenshot) | Valore reale (da XML) |
|---|---|---|
| Font | Times New Roman | **Calibri** |
| Margini pagina | 2.5cm uniformi | **Asimmetrici**: top 4cm, right 2.25cm, bottom 3cm, left 2cm |
| Sfondo intestazione tabella | Grigio (E8E8E8) | **Azzurro chiaro (D5DCE4)** |
| Colore bordi tabella | Grigio medio (999999) | **Nero (000000)** |
| Dimensione nome nell'intestazione | 12pt | **14pt**, non in grassetto |
| Qualifica/specializzazione nell'intestazione | 11pt (corpo standard) | **10pt** |
| Linea separatrice sotto l'intestazione | Presente | **Assente** — il template reale non ne ha una (bordi espliciti `nil` nell'XML) |
| Numero di pagina nel piè di pagina | `N/Totale` | **`N /Totale`** (spazio prima dello slash) |

Tutti questi valori sono stati aggiornati in `exportDocx.ts`. La differenza pratica rispetto alla revisione precedente è nel metodo: leggere l'XML grezzo di un file reale dà valori esatti, mentre uno screenshot per quanto dettagliato lascia margine di stima su font e colori esatti — vale la pena, quando disponibile, preferire sempre un file reale (anche anonimizzato) a un'immagine per calibrare l'export.

### Nona correzione: tabelle duplicate nel DOCX finale (bug, risolto in tre round)

Segnalato dall'utente dopo un test reale: nel documento esportato, le tabelle WISC-IV/NEPSY-II comparivano due volte consecutive — la prima correttamente formattata come tabella Word, la seconda come testo Markdown grezzo (`| ... | ... |`) non convertito. Il bug si è rivelato più insidioso del previsto e ha richiesto tre round di indagine prima di trovare la causa reale.

**Primo tentativo (insufficiente)**: ipotesi che Gemini, nonostante l'istruzione esplicita di non generare tabelle, le ripetesse comunque nel testo narrativo restituito per le sezioni cognitivo/nepsy — comportamento noto dei modelli linguistici, che tendono a "confermare visivamente" dati numerici appena elaborati. Aggiunta una funzione `rimuoviTabelleMarkdown()` che ripulisce il testo narrativo da blocchi `| ... |` prima della concatenazione. Il bug è persistito nei test successivi.

**Secondo tentativo**: analizzando un caso reale con la nota esplicativa in corsivo duplicata insieme alla tabella (es. `*WISC-IV: QI >129 molto superiore...*`), si è scoperto che quella frase — priva di caratteri `|` — sfuggiva al filtro. Corretto riconoscendo anche il pattern della nota range. Ancora insufficiente: un terzo test con documento reale ha mostrato la stessa duplicazione.

**Diagnosi corretta, ottenuta esaminando la risposta grezza di Gemini via log**: la risposta di Gemini era in realtà **pulita fin dall'inizio** — zero tabelle, zero note duplicate. Il problema non era mai stato nella generazione né nel parsing, ma in `exportDocx.ts`: la funzione che converte il Markdown assemblato (già corretto, con la tabella inserita una sola volta) in DOCX **ricostruiva la tabella da zero** a partire dai punteggi numerici (corretto, serve per avere una vera tabella Word navigabile), ma nello stesso tempo **non riconosceva le righe della tabella Markdown già presente nel testo** durante la scansione per estrarre la narrativa — le trattava come paragrafi normali, catturandole e ristampandole come testo grezzo.

**Correzione reale**: il loop di scansione in `exportDocx.ts` ora salta esplicitamente le righe tabella (`|...|`) e la nota range, sia subito dopo l'intestazione di sezione sia in qualunque punto successivo del testo. Verificato questa volta con un test end-to-end completo — dal Markdown assemblato fino al PDF renderizzato del DOCX finale, non solo con funzioni isolate — usando il pattern esatto osservato nei documenti reali forniti dall'utente.

**Lezione operativa**: i primi due tentativi erano ragionevoli ma basati su un'assunzione mai verificata (che il problema fosse a monte, nella generazione). Solo l'ispezione diretta della risposta grezza di Gemini ha permesso di escludere quell'ipotesi e guardare nel punto giusto. Le funzioni di pulizia del primo e secondo tentativo sono state mantenute (non fanno danno e restano una difesa aggiuntiva legittima se Gemini dovesse in futuro includere tabelle nonostante l'istruzione), ma la causa effettiva era altrove.

### Decima correzione: nome del paziente sempre impersonale nel testo generato

L'istruzione originale a Gemini ("usa solo 'il/la paziente', mai il nome") aveva un effetto collaterale stilistico non previsto: il template reale usa il nome proprio del paziente ripetutamente in tutto il documento (osservate 11 occorrenze in una singola relazione, tra anamnesi, osservazione, valutazione cognitiva e conclusioni) — è lo stile naturale e personale della scrittura clinica originale, non un dettaglio incidentale. Con l'istruzione precedente, il nome compariva una sola volta (nel paragrafo di apertura con anagrafica, composto lato client) e mai nel corpo del testo, con un salto di registro percepibile.

**Soluzione**, ispirata alle pratiche di pseudonimizzazione con token consistente usate nei sistemi di de-identificazione testuale: invece di istruire Gemini a scrivere una perifrasi grammaticale ("il/la paziente" — intrinsecamente non sostituibile in modo affidabile, per via di articoli e concordanze diverse a seconda del contesto), gli si chiede di scrivere un segnaposto letterale `{{NOME}}` esattamente dove scriverebbe il nome. Dopo la generazione, in `RisultatoGenerazione.tsx` — l'unico punto che ha sia il testo generato sia l'anagrafica reale — una funzione dedicata (`sostituisciNomePlaceholder` in `wizardToText.ts`) sostituisce ogni occorrenza del token col nome vero tramite `replaceAll`, sostituzione esatta senza ambiguità grammaticale. Gemini continua a non vedere mai il nome reale; il nome entra nel documento solo lato client, in un punto isolato e controllato.

### Undicesima correzione: anonimizzazione estesa a tutti i campi di testo libero del wizard, non solo alle relazioni importate

L'utente ha fatto notare, guardando di nuovo il template reale, che oltre al nome del paziente vengono anonimizzati anche nomi di professionisti terzi (es. "DOTTORESSA", "DOTTORESSA2" per uno specialista citato in anamnesi e uno diverso per la diagnosi pregressa) e nomi di istituti scolastici ("SCUOLA"). Verificando il codice è emerso che il modulo di anonimizzazione euristica (`anonimizza.ts`, con regole per riconoscere titoli professionali e nomi di scuole) esisteva già ma veniva usato **solo** per anonimizzare gli esempi few-shot nell'analisi del Profilo di Stile — non per i campi di testo libero che l'utente scrive direttamente nel wizard (note cliniche, riferimenti subtest, consigli, diagnosi...), che finivano nel prompt di generazione senza alcun filtro.

**Correzione**: applicata `anonimizzaTesto()` a ciascun campo di testo libero prima di inserirlo nel payload per Gemini, in `generaNarrativaSezioni()`. A differenza del nome del paziente (dove si preferisce il nome vero nel documento finale, tramite `{{NOME}}`), qui i placeholder generati (`[PERSONA]`, `[SCUOLA]`) restano visibili nel testo finale senza ulteriore sostituzione: sono dati di **terzi**, non del paziente, e non devono comparire in chiaro in nessun punto del processo.

**Due bug scoperti testando il modulo con frasi tratte dal template reale**, entrambi con la stessa causa tecnica: il flag `i` (case-insensitive) applicato all'intera regex anziché solo alla porzione che doveva davvero ignorare maiuscole/minuscole (il titolo "dott./prof."), che rendeva insensibile al caso anche la parte del pattern che richiedeva rigorosamente l'iniziale maiuscola di un nome proprio. Effetto pratico: una parola minuscola comune (es. "presso") poteva essere catturata per errore insieme al nome del professionista, "mangiando" testo legittimo dalla frase; e il pattern che riconosce "Nome Cognome, nato il..." non copriva la forma "nato/a" (con la barra), che è quella usata sistematicamente nei documenti generati dall'app — il nome del paziente scritto per esteso in un campo libero sarebbe passato in chiaro. Entrambi corretti separando esplicitamente le porzioni case-insensitive da quelle case-sensitive del pattern, e verificati con le frasi esatte del template originale.

### Dodicesima correzione: Anamnesi e Osservazione ora riscritte da Gemini, non più composte meccanicamente

Le sezioni Anamnesi e Osservazione comportamentale, basate su voci selezionabili a checkbox (vedi Modulo 3), venivano composte con una funzione puramente deterministica (`vociToTesto`): concatenazione delle etichette fisse delle voci selezionate, separate da virgole — zero riscrittura stilistica, zero applicazione del Profilo di Stile. Il risultato era un salto di registro netto rispetto alle altre sezioni (Cognitivo, NEPSY, Conclusioni), che passando da Gemini risultavano discorsive e naturali mentre Anamnesi/Osservazione restavano telegrafiche.

**Correzione**: queste due sezioni ora passano da Gemini come le altre. Il codice non compone più la frase finale — passa a Gemini l'elenco dei fatti grezzi selezionati (le etichette delle voci, non ancora impastate in prosa), con l'istruzione esplicita di comporli in prosa fluida secondo il Profilo di Stile, non di riportarli come lista. I campi di testo libero associati alle voci (dettagli opzionali, note extra) passano dallo stesso filtro di anonimizzazione dell'undicesima correzione. **Non è stato rimosso il fallback deterministico**: se per qualunque motivo la narrativa di Gemini per queste sezioni risultasse assente (modalità mock, errore, risposta incompleta), il codice ricade sulla vecchia composizione da `vociToTesto` — verificato esplicitamente con un test dedicato, la sezione non resta mai vuota.

### Tredicesima correzione: colonna "Interpretabilità" opzionale nella tabella WISC-IV

La colonna "Interpretabilità" nella tabella WISC-IV era finora sempre "Sì" per ogni indice, valore fisso non configurabile (hardcoded in due punti indipendenti: la generazione del Markdown e la costruzione della tabella Word, che — come emerso nella nona correzione — sono funzioni separate per costruzione). Su richiesta dell'utente, è stata aggiunta una checkbox per indice nel wizard (di default spuntata = interpretabile), e la logica di generazione di entrambe le tabelle ora omette la colonna quando tutti gli indici compilati sono interpretabili — il caso più comune — mostrandola solo quando almeno un indice è stato esplicitamente marcato come non interpretabile. Verificato sia sulla tabella Markdown sia, visivamente, sul DOCX renderizzato.

### Quattordicesima correzione: rendering Markdown reale in Archivio e Profilo di Stile

Sia il dettaglio relazione in Archivio sia la pagina Profilo di Stile mostravano il contenuto come testo piatto o con un renderer Markdown manuale parziale, perdendo tabelle, liste e blockquote (questi ultimi usati per le note range WISC/NEPSY). Corretto sostituendo entrambi i punti con un renderer Markdown completo e condiviso, con supporto esplicito a tabelle/liste/blockquote:
- **Archivio**: il dettaglio relazione ora renderizza Markdown strutturato invece di testo piatto.
- **Profilo di Stile**: sostituito il renderer manuale con lo stesso renderer completo, unificando la resa visiva con l'Archivio.
- **Stili condivisi**: introdotto un blocco CSS dedicato (`.markdown-profile`) per heading, tabelle, codice e spacing coerente tra le due pagine.
- Dipendenze aggiunte: `react-markdown`, `remark-gfm`.

### Quindicesima correzione: pipeline di import DOCX/PDF rafforzata con Pandoc WASM

La pipeline di importazione (Modulo 1) affidata solo a Mammoth.js perdeva struttura su documenti complessi (tabelle annidate, formattazioni particolari). Rafforzata con una catena di fallback a più livelli e con una ricostruzione più fedele lato PDF:
- **DOCX — nuova catena di fallback a 3 livelli**:
    1. Pandoc WASM (primario, migliore tenuta su struttura/tabelle)
    2. docx-preview + Turndown (compatibilità)
    3. Mammoth con style-map e trasformazioni (ultima rete di sicurezza, comportamento precedente)
- **PDF**: ricostruzione semantica migliorata (raggruppamento righe per coordinata Y, stima heading da font-size, paragrafazione da gap verticale, merge sillabazioni a fine riga).
- **Normalizzazione output**: cleanup Markdown centralizzato per ridurre rumore tipografico e artefatti, condiviso da entrambi i percorsi DOCX e PDF.
- **Integrazione Pandoc in ambiente browser (fix build Vite)**: aggiunto un modulo wrapper browser dedicato (`src/pandocBrowser.js`) che inizializza Pandoc caricando il file WASM come asset URL, per evitare errori in dev build relativi a `wasi_snapshot_preview1` che si verificano con l'import diretto del WASM; configurazione Vite aggiornata con inclusione asset `.wasm`.
- Dipendenze aggiunte: `docx-preview`, `turndown`, `pandoc-wasm`.

### Sedicesima correzione: affidabilità, fallback e controllo payload delle chiamate Gemini

Le chiamate a Gemini (sia per l'analisi dello stile sia per la generazione) non gestivano in modo robusto errori temporanei o corpus di relazioni troppo grandi. Corretto con diversi interventi collegati:
- **Modelli**: introdotta una lista di modelli candidati configurabile (`VITE_GEMINI_MODELS`), con fallback automatico tra modelli flash/lite quando il modello preferito non è disponibile.
- **Robustezza chiamate API**: gestione esplicita degli errori di quota/modello non disponibile, retry con backoff su risposte 429/5xx, parsing dei dettagli d'errore restituiti dall'API.
- **Limiti corpus**: introdotti limiti espliciti sul payload totale e sulla singola relazione inviata per l'analisi di stile, con troncamento controllato invece di un errore secco.
- **Pianificazione invio**: nuova funzione di pianificazione del corpus, che decide quante relazioni inviare subito e quante restano in coda per l'analisi incrementale successiva.
- **Output analisi stile**: ora ritorna anche metadati operativi (`relazioniUsate`, `relazioniTotali`, `charsCorpus`) oltre al testo del profilo, usati per l'anteprima invio (vedi correzione successiva).
- Questa correzione riduce il rischio di interruzioni durante l'uso reale, ma non elimina il punto di rischio residuo sull'uso dell'API gratuita — vedi Roadmap (§13) per la migrazione pianificata delle chiamate lato server.

### Diciassettesima correzione: Profilo di Stile, logica incrementale resa deterministica

L'aggiornamento incrementale del Profilo di Stile dipendeva solo dal timestamp dell'ultimo aggiornamento, un criterio fragile in caso di relazioni caricate fuori ordine o di rielaborazioni parziali. Corretto rendendo il processo deterministico:
- Le relazioni vengono ora ordinate cronologicamente e processate in una coda stabile.
- L'incrementale non dipende più solo dal timestamp, ma da un conteggio esplicito già analizzato (`num_relazioni_analizzate`).
- L'anteprima di invio è stata arricchita con le statistiche operative introdotte nella correzione precedente (relazioni inviate, relazioni in coda, caratteri del corpus).

### Diciottesima correzione: allineamento bidirezionale Profilo di Stile <-> Wizard (due iterazioni)

Il wizard raccoglieva i campi della sezione cognitiva senza sapere se il Profilo di Stile della professionista richiedesse effettivamente quei dettagli (es. riferimenti ai subtest, età di valutazione). Corretto con un parser leggero che legge il `profilo_stile` salvato e ne estrae i requisiti operativi, in due iterazioni successive:

**Prima iterazione**
- Se il profilo richiede riferimenti ai subtest WISC per indice, lo step Cognitivo li richiede esplicitamente prima di consentire la generazione.
- I riferimenti sono strutturati per indice (`ICV`, `RP/IRP`, `IML/ML`, `VE/IVE`) e confluiscono nella narrativa WISC passata a Gemini.
- Compatibilità mantenuta con snapshot precedenti che avevano un singolo campo testuale `riferimenti_subtest`.

**Seconda iterazione**
- Se il profilo richiede età al momento della valutazione, strumenti e note range WISC, il wizard li espone come campi strutturati e li valida in checklist.
- Nuovi campi WISC: `eta_valutazione`, `strumenti_utilizzati`, toggle `includi_nota_range`, più i riferimenti subtest per indice della prima iterazione.
- Nuovi campi NEPSY: `strumenti_utilizzati`, toggle `includi_nota_range`.
- Prima della generazione viene mostrata una checklist di aderenza al profilo; se incompleta, il pulsante "Genera relazione" resta disabilitato.
- I nuovi campi vengono passati a Gemini in payload esplicito (`eta_valutazione`, `strumenti_utilizzati`, `nota_range_wisc`, `nota_range_nepsy`) per ridurre ambiguità e migliorare la coerenza dell'output.

> *Superata da correzioni successive*: i 4 campi testuali `riferimenti_subtest` per indice descritti nella prima iterazione sono stati sostituiti da un accordion con punti ponderati numerici per subtest (vedi Ventesima correzione), e `eta_valutazione`/`strumenti_utilizzati` — qui passati a Gemini come campo/valore separato — sono stati successivamente integrati nella narrativa in prosa invece che restare righe isolate (vedi Ventunesima correzione).

### Diciannovesima correzione: chiarezza dei flussi URL Bozza vs Modifica

I due percorsi "riprendere una bozza salvata" e "modificare una relazione già archiviata" condividevano la stessa rotta e la stessa etichetta generica in dashboard, generando ambiguità su cosa si stesse davvero riaprendo. Corretto distinguendo esplicitamente i due flussi:
- Due rotte con semantica diversa: `/bozza/riprendi?sessionId=...` (ripresa sessione) e `/modifica?relazioneId=...` (ingresso da Archivio).
- Se una sessione bozza deriva da una relazione d'archivio, il wizard mantiene il contesto "modifica" anche in ripresa (topbar e breadcrumb coerenti: Archivio > Modifica relazione).
- Dashboard Bozze: sostituita la dicitura generica "Wizard avviato il..." con etichette contestuali — "Modifica da archivio: <titolo relazione>" se la bozza deriva da una relazione esistente, "Bozza nuova relazione (<tipo>)" negli altri casi.
- Obiettivo: ridurre l'ambiguità cognitiva tra "nuova relazione", "ripresa bozza" e "modifica da archivio".

### Ventesima correzione: subtest WISC-IV per indice, da testo libero a punti ponderati con accordion

I 4 campi di testo libero "Riferimenti ai subtest per indice" introdotti nella prima iterazione dell'allineamento Profilo↔Wizard (diciottesima correzione) restavano un dato descrittivo (nomi dei subtest somministrati), non un punteggio verificabile. Sostituiti con un dato numerico strutturato:
- **Accordion per indice** (`<details>/<summary>`, coerente con lo stile già usato altrove nel wizard, nessuna nuova libreria) al posto dei 4 campi di testo.
- Ogni indice (ICV, RP, IML, VE) mostra ora 3 subtest predefiniti con **campo numerico per il punto ponderato (pp)**, stessa scala dei punteggi scalari NEPSY-II (media 10, DS 3): fonte di verità in `testDefinitions.ts` → `WISC_IV_SUBTEST_PER_INDICE`. ICV e RP hanno 3 subtest "core" nel WISC-IV reale; per IML e VE il terzo campo è un subtest supplementare, etichettato esplicitamente come tale.
- Ogni subtest resta **facoltativo**, in linea col resto della sezione cognitiva — si compilano solo i subtest effettivamente somministrati, e la fascia interpretativa ("Media", "Superiore"...) è calcolata automaticamente accanto al campo, in tempo reale.
- Nuovo campo dati: `cognitivo.subtest_pp` (oggetto piatto, chiave = subtest, es. `{ vc: 9, so: 11 }`), al posto del vecchio `cognitivo.riferimenti_subtest` (stringa o oggetto per indice).
- Nuova funzione `wiscSubtestPpToNarrativa()` in `wizardToText.ts`: genera **solo testo narrativo** ("Per l'indice Comprensione Verbale sono stati considerati i seguenti subtest: Vocabolario (pp 9, fascia media)...") — mai una tabella, come richiesto esplicitamente per questo dato, a differenza delle tabelle indici/QI e NEPSY-II che restano tabellari.
- Il payload verso Gemini (`geminiService.ts`) ora include questa narrativa al posto del vecchio testo libero anonimizzato "as-is"; tipi e riferimenti aggiornati anche in `exportDocx.ts` e `profileAlignment.ts`.
- Compatibilità: le bozze salvate prima di questa modifica avevano `riferimenti_subtest` come nomi di subtest (non punteggi) — non convertibile in pp numerici, quindi **non viene migrato automaticamente**; per quelle bozze `subtest_pp` riparte vuoto.

### Ventunesima correzione: campi "di contorno" fatti passare da Gemini invece di restare testo grezzo

Verificato con una relazione di test reale che 4 gruppi di campi finivano nel documento finale come righe fisse, mai visti da Gemini: `tipo_invio`/`motivo_invio` (frase di apertura, introdotti nella "terza correzione" ma mai inviati a Gemini), `cognitivo.eta_valutazione`/`cognitivo.strumenti_utilizzati` e `nepsy.strumenti_utilizzati` (introdotti nella seconda iterazione dell'allineamento Profilo↔Wizard, diciottesima correzione, ma passati a Gemini solo come nota range/tabella, non come questi campi specifici), `apprendimenti.lettura`/`.scrittura`/`.matematica`. Corretto così:
- Aggiunta una nuova sezione "intestazione" (non è uno step del wizard, è sempre generata se `tipo_invio` o `motivo_invio` sono compilati) che Gemini scrive come singola frase iniziale coerente col Profilo di Stile, al posto della frase hardcoded in `assemblaDocumentoMarkdown`.
- `eta_valutazione` e `strumenti_utilizzati` vengono ora passati nel payload delle sezioni `cognitivo`/`nepsy`, con istruzione esplicita a Gemini di aprirne la narrazione con una frase discorsiva ("La valutazione è stata condotta all'età di 8 anni, mediante la scala WISC-IV...") invece di riportarli come riga campo/valore.
- Le tre note di apprendimenti (`lettura`, `scrittura`, `matematica`) vengono ora tessute nella narrativa della sezione invece che riappese in coda come frasi isolate.
- `assemblaDocumentoMarkdown` non duplica più questi dati: li usa come riga fissa **solo** se la narrativa di Gemini per quella sezione manca (mock senza narrativa, o generazione fallita) — altrimenti si fida che siano già stati incorporati nel testo.
- Resta esplicitamente **esclusa** l'anagrafica (nome, cognome, data di nascita, scuola/classe): non viene mai inviata a Gemini, per lo stesso motivo di privacy già documentato nella terza correzione del modello dati.

### Ventiduesima correzione (bug): il nome di chi invia il/la paziente non compariva mai nella relazione

Segnalato dall'utente dopo un test reale: il campo "Nome inviante" del wizard (step Contesto dell'invio, es. "dott.ssa Maria Rosaria Martina") non compariva in nessun punto del DOCX esportato. La causa era più semplice di un bug di elaborazione: il campo `nome_inviante` veniva raccolto nello stato del wizard ma **non era mai letto** da nessuna funzione a valle — non entrava nel payload per Gemini (introdotto nella ventunesima correzione per `tipo_invio`/`motivo_invio`, ma senza `nome_inviante`), né nella frase fissa di fallback in `assemblaDocumentoMarkdown`. Un campo dell'interfaccia collegato a nulla.

**Correzione**: `nome_inviante` è ora incluso sia nel payload della sezione "intestazione" inviato a Gemini, sia nella frase fallback fissa. A differenza dei nomi di terzi citati incidentalmente in note libere (undicesima correzione, dove il nome viene sostituito con `[PERSONA]` prima dell'invio), qui il nome **non passa dal filtro di anonimizzazione**: è esattamente il dato che l'utente vuole veder comparire per esteso nel referto ("su segnalazione della Dott.ssa Rossi..."), come nei documenti reali forniti da tua sorella. Anonimizzarlo avrebbe prodotto un placeholder `[PERSONA]` visibile in chiaro nel testo finale — l'opposto di quanto richiesto. Aggiornato di conseguenza anche il testo esplicativo dello step del wizard, che affermava erroneamente che tutti i dati di quello step "non contengono informazioni identificative".

---

## 1. Panoramica del progetto

### Obiettivo
Creare un'applicazione che aiuti una psicologa a redigere nuove relazioni cliniche in modo assistito dall'AI, mantenendo il suo stile personale di scrittura appreso dalle relazioni precedenti.

### Utente target
Una singola utente (la psicologa), uso sia su PC Windows che su smartphone personale.

### Funzionalità core
- Importazione e archiviazione delle relazioni passate (DOCX)
- Analisi automatica dello stile di scrittura tramite AI
- Wizard guidato a domande per raccogliere le informazioni del nuovo caso
- Generazione automatica della bozza di relazione nello stile dell'utente
- Editor per revisione e correzione della bozza
- Export finale in DOCX
- Archivio consultabile di tutte le relazioni (passate e nuove)

---

## 2. Scelta tecnologica e motivazioni

### Opzione scelta — Solo Web App (PWA)
Un'app web ospitata su Vercel, accessibile da qualsiasi dispositivo tramite browser, installabile come PWA sia su Windows che su Android/iOS.

**Vantaggi:**
- Un solo deploy, zero installazione su Windows
- Aggiornamenti automatici e trasparenti
- Sviluppo più rapido, nessuna complessità Electron
- Funziona perfettamente su smartphone senza store

**Svantaggi:**
- L'importazione dei DOCX avviene tramite drag&drop o file picker (nessun accesso diretto al filesystem)
- Richiede connessione internet (ma Supabase gestisce cache offline)

### Stack tecnologico definitivo

| Componente | Tecnologia | Motivo |
|---|---|---|
| Frontend | React + Vite | Sviluppo rapido, ecosistema maturo |
| UI Components | Tailwind CSS + shadcn/ui | Design professionale e pulito |
| Hosting | Vercel (gratuito) | Deploy automatico, HTTPS, CDN |
| Database + Auth | Supabase (gratuito) | Auth, PostgreSQL, Storage per DOCX |
| DOCX → Markdown | Mammoth.js (client-side) | Conversione locale, nessun upload del file grezzo |
| AI / Generazione | Google Gemini API (gratuita) | gemini-2.0-flash, 1M token context |
| Export DOCX | docx.js | Generazione DOCX lato client |
| PWA | Vite PWA Plugin | Installazione su Windows e smartphone |

---

## 3. Architettura generale

```
┌─────────────────────────────────────────────────────┐
│                   UTENTE                            │
│         (browser Windows / smartphone)              │
└───────────────────┬─────────────────────────────────┘
                    │ HTTPS
┌───────────────────▼─────────────────────────────────┐
│              PWA React (Vercel)                     │
│  ┌─────────────┐  ┌──────────────┐  ┌───────────┐  │
│  │  Importa    │  │   Wizard     │  │  Editor   │  │
│  │  Relazioni  │  │  Nuova Rel.  │  │  + Export │  │
│  └──────┬──────┘  └──────┬───────┘  └─────┬─────┘  │
│         │                │                │         │
│  ┌──────▼────────────────▼────────────────▼──────┐  │
│  │           Mammoth.js (DOCX → MD)              │  │
│  │           docx.js (MD → DOCX export)          │  │
│  └──────────────────────┬────────────────────────┘  │
└─────────────────────────┼───────────────────────────┘
                          │
          ┌───────────────┼───────────────┐
          │               │               │
┌─────────▼──────┐ ┌──────▼──────┐ ┌────▼──────────┐
│   Supabase DB  │ │  Supabase   │ │  Google Gemini │
│  (PostgreSQL)  │ │  Storage    │ │  API (gratuita)│
│  - pazienti    │ │  - DOCX     │ │  - analisi     │
│  - relazioni   │ │    originali│ │    stile       │
│  - profilo     │ │             │ │  - generazione │
│    stile       │ │             │ │    relazione   │
└────────────────┘ └─────────────┘ └───────────────┘
```

### Flusso dati principale

**Setup iniziale (una tantum):**
1. L'utente carica i DOCX delle vecchie relazioni
2. Mammoth.js li converte in Markdown nel browser
3. Il testo Markdown viene salvato in Supabase
4. Gemini analizza il corpus e produce un **Profilo di Stile** (documento Markdown strutturato)
5. Il Profilo di Stile viene salvato in Supabase come configurazione globale

**Creazione nuova relazione:**
1. L'utente avvia il Wizard e risponde alle domande
2. L'app recupera il Profilo di Stile da Supabase
3. L'app seleziona 2-3 relazioni simili dal database come esempi few-shot
4. Gemini genera la bozza combinando le risposte, il Profilo di Stile e gli esempi
5. L'utente revisiona nell'editor integrato
6. Export finale in DOCX

---

## 4. Struttura del database Supabase

### Tabella: `relazioni`
Archivia tutte le relazioni (importate e nuove).

| Campo | Tipo | Note |
|---|---|---|
| `id` | UUID | Chiave primaria |
| `created_at` | Timestamp | Data creazione |
| `tipo` | Enum | `importata` / `generata` |
| `paziente_id` | UUID | FK → pazienti (opzionale) |
| `testo_markdown` | Text | Contenuto relazione in MD |
| `testo_originale_path` | Text | Path Storage al DOCX originale |
| `titolo` | Text | Es. "Relazione iniziale - Caso A" |
| `note_interne` | Text | Note private non incluse nella relazione |
| `anno` | Integer | Anno della relazione |
| `tipo_relazione` | Text | `iniziale`, `follow-up`, `diagnostica`, `legale`, `scolastica` |
| `tag` | Text[] | Tag semantici: `ansia`, `valutazione-cognitiva`, `minori`, ecc. |

### Tabella: `pazienti`
Dati anonimi o pseudonimizzati dei pazienti.

| Campo | Tipo | Note |
|---|---|---|
| `id` | UUID | Chiave primaria |
| `codice` | Text | Es. "PAZ-001" (mai nome reale) |
| `eta_approssimativa` | Integer | Età al momento della prima relazione |
| `sesso` | Text | M/F/Altro |
| `tipo_consulto` | Text | Es. "diagnostico", "follow-up", "legale" |
| `note_generali` | Text | Anamnesi anonima |

### Tabella: `profilo_stile`
Un solo record, aggiornato ogni volta che si aggiunge materiale.

| Campo | Tipo | Note |
|---|---|---|
| `id` | Integer | Sempre 1 |
| `updated_at` | Timestamp | Ultimo aggiornamento |
| `documento_stile` | Text | **Documento Markdown strutturato con sezioni e indice** |
| `versione` | Integer | Numero versione del profilo |
| `num_relazioni_analizzate` | Integer | Quante relazioni hanno contribuito |
| `note_manuali` | Text | Override o integrazioni scritte a mano dall'utente |

> **Nota sul formato:** il Profilo di Stile è un documento Markdown leggibile, non un JSON. L'IA lo interpreta meglio, l'utente lo modifica facilmente, e le sezioni sono indirizzabili.

### Tabella: `sessioni_wizard`
Salva le bozze del wizard in lavorazione.

| Campo | Tipo | Note |
|---|---|---|
| `id` | UUID | Chiave primaria |
| `created_at` | Timestamp | |
| `stato` | Enum | `in_corso` / `completata` / `esportata` |
| `risposte_wizard` | JSON | Tutte le risposte alle domande |
| `bozza_generata` | Text | Testo generato da Gemini |
| `relazione_finale_id` | UUID | FK → relazioni (dopo export) |

### Storage Supabase
- Bucket `docx-originali`: DOCX caricati dall'utente (privato, solo authenticated)
- Bucket `export-docx`: DOCX generati dall'app (privato)

---

## 5. Fasi di sviluppo

Il progetto si sviluppa in 5 moduli indipendenti e sequenziali. Ogni modulo è testabile autonomamente prima di procedere al successivo.

```
FASE 1          FASE 2          FASE 3          FASE 4          FASE 5
Setup &    →   Analisi    →    Wizard     →   Generazione →   Export &
Import         Stile           Domande        & Editor        Archivio
```

---

## Modulo 1 — Setup e importazione relazioni

### Obiettivo
Permettere all'utente di caricare tutte le vecchie relazioni — in formato **DOCX, PDF o DOC** — e archiviarle in Supabase in formato Markdown.

### Formati supportati e strategia per ciascuno

L'archivio reale di tua sorella contiene tre formati diversi, ognuno richiede una pipeline diversa lato client:

| Formato | Libreria | Comportamento |
|---|---|---|
| `.docx` | Mammoth.js | Conversione diretta a Markdown, con riconoscimento di titoli/grassetto/elenchi |
| `.pdf` | pdf.js (Mozilla) | Estrazione testo selezionabile, ricostruito in paragrafi per coordinata verticale. **Richiede che il PDF non sia una scansione/immagine** — verificato: l'archivio reale ha solo testo selezionabile, nessuna scansione |
| `.doc` (Word 97-2003) | — | **Non gestibile lato client**: non esiste una libreria JS affidabile per il formato binario legacy. L'utente viene guidato a “Salva con nome → .docx” da Word, poi a ricaricare il nuovo file |

> **Nota sulla qualità di estrazione**: il testo da `.docx` mantiene struttura (titoli, elenchi) riconoscibile in Markdown. Il testo da `.pdf` è più "piatto" — pdf.js non distingue titoli da corpo del testo, quindi il Markdown risultante ha paragrafi semplici separati da un marcatore di pagina, senza heading automatici. Questo non blocca l'analisi di stile (Gemini lavora bene anche su testo non formattato), ma l'anteprima va sempre controllata prima di salvare.

### Sotto-componenti

**1.1 — Autenticazione**
- Login con email + password tramite Supabase Auth
- Nessuna registrazione pubblica (account creato manualmente una tantum)
- Sessione persistente (non deve ri-loggarsi ogni volta)
- Su smartphone: biometria tramite il browser (FaceID/impronta) per sbloccare la sessione salvata

**1.2 — Schermata di importazione**
- Drag & drop multiplo di file DOCX, PDF, DOC
- Selezione tramite file picker nativo del browser
- Badge visivo per formato (DOCX/PDF/DOC) su ogni file in coda
- Indicatore di progresso per ogni file
- Anteprima del testo estratto prima di confermare il salvataggio
- Avviso esplicito quando l'estrazione PDF produce testo non strutturato

**1.3 — Pipeline di estrazione (client-side, per formato)**
- Modulo dedicato (`fileExtractor`) che astrae le differenze tra formati dietro un'unica funzione di estrazione
- Mammoth.js converte `.docx` in Markdown nel browser
- pdf.js estrae il testo selezionabile da `.pdf`, ricostruendo paragrafi dalla posizione verticale del testo nella pagina
- `.doc` produce un messaggio guidato invece di un errore generico, con istruzione su come convertirlo
- Nessun file grezzo viene mai mandato a Gemini (solo testo)
- Il file originale (in qualsiasi formato) viene caricato su Supabase Storage come backup, con content-type corretto per formato
- Il Markdown viene salvato nella tabella `relazioni`

**1.4 — Metadati manuali**
- Dopo l'estrazione, l'utente assegna facoltativamente: anno, tipo di relazione, codice paziente, tag semantici
- Questi metadati migliorano la ricerca futura e permettono di selezionare relazioni simili come riferimento

### Nota tecnica — worker pdf.js
pdf.js elabora i PDF su un web worker separato per non bloccare l'interfaccia durante l'estrazione. Questo richiede un file worker servito come asset statico (`public/pdf.worker.min.mjs`), copiato manualmente dalla libreria durante il setup. Se in futuro la dipendenza `pdfjs-dist` viene aggiornata, il worker va ricopiato — questo passaggio è documentato in `SETUP.md` per evitare che venga dimenticato.

---

## Modulo 2 — Analisi dello stile con Gemini

### Obiettivo
Analizzare il corpus di relazioni importate e produrre un **Profilo di Stile** riutilizzabile in ogni generazione.

### Sotto-componenti

**2.1 — Selezione del corpus**
- L'utente può scegliere quali relazioni includere nell'analisi (default: tutte)
- Possibilità di escludere relazioni atipiche o di formato diverso
- Visualizzazione del conteggio token stimato prima di avviare l'analisi

**2.2 — Costruzione del prompt di analisi**
Il prompt inviato a Gemini avrà questa struttura:
- **System context**: "Sei un assistente specializzato nell'analisi dello stile di scrittura clinica in psicologia"
- **Corpus**: tutte le relazioni in Markdown, separate da delimitatori chiari
- **Istruzione**: analizzare e descrivere in dettaglio: struttura delle sezioni, registro linguistico, terminologia tecnica preferita, lunghezza media dei paragrafi, formule ricorrenti di apertura/chiusura, modo di presentare diagnosi e osservazioni
- **Output richiesto**: documento Markdown strutturato con le sezioni definite sotto

**2.3 — Formato del Profilo di Stile**

Il documento restituito da Gemini deve seguire questa struttura:

```markdown
# PROFILO DI STILE — [Nome Psicologa]
Ultimo aggiornamento: YYYY-MM-DD | Relazioni analizzate: N | Versione: V

## 1. Struttura standard (ORDINE INVARIABILE)
Elenco numerato delle sezioni nell'ordine esatto.

## 2. Registro linguistico
Regole su persona grammaticale, tono, passività, ecc.

## 3. Formule ricorrenti (DA RIPRODURRE ESATTAMENTE)
Frasi fisse di apertura, transizione, chiusura.

## 4. Esempi di frasi caratteristiche
Citazioni dirette dalle relazioni analizzate.

## 5. Terminologia preferita vs da evitare
Tabella di termini consigliati e sconsigliati.

## 6. Lunghezza e ritmo
Regole su lunghezza paragrafi, sezioni, relazione totale.
```

**2.4 — Salvataggio e visualizzazione**
- Il documento Markdown restituito da Gemini viene salvato nel campo `documento_stile`
- Schermata "Il mio stile" che mostra il documento in linguaggio naturale
- L'utente può leggere, correggere manualmente e integrare il profilo
- Questo garantisce trasparenza e controllo sull'output AI

### Strategia per i limiti di token
Gemini 2.0 Flash ha 1M token di context. Una relazione psicologica media è ~800-1500 parole (~1200-2000 token). Con 100 relazioni si arriva a ~200k token, abbondantemente nei limiti. Se il corpus supera i 600k token, si usa un approccio a batch: si analizzano gruppi di relazioni e si sintetizzano i profili parziali in un profilo finale.

---

## Modulo 3 — Wizard di creazione relazione

### Obiettivo
Guidare tua sorella attraverso la raccolta di tutte le informazioni necessarie per generare una relazione di valutazione neuropsicologica, **adattandosi dinamicamente alle sole sezioni pertinenti al caso specifico**, riducendo al minimo la digitazione libera e mantenendo separati i dati anagrafici reali dal contenuto clinico elaborato dall'AI.

### Architettura: step dinamici basati su sezioni selezionate

Il wizard costruisce il proprio percorso a runtime in base alle sezioni scelte al primo step (`buildSteps(sezioniAttive)`).

**Step 0 — Selezione sezioni**
Tua sorella spunta quali sezioni includere nella relazione. Solo gli step corrispondenti vengono mostrati.

Sezioni disponibili: Anamnesi, Osservazione comportamentale, Valutazione cognitiva (WISC-IV), Approfondimento neuropsicologico (NEPSY-II), Valutazione apprendimenti, Questionari, Conclusioni e diagnosi.

**Step 1 — Anagrafica (dati reali, sempre presente)**

⚠️ Questo step è concettualmente diverso da tutti gli altri: raccoglie **nome, cognome, data di nascita, scuola/classe reali** del paziente. Un banner nell'interfaccia avvisa esplicitamente che questi dati restano sul dispositivo e non vengono mai inviati a Gemini — verranno inseriti automaticamente solo nel documento Word finale, come primo paragrafo dopo il titolo "RELAZIONE".

**Step 2 — Contesto dell'invio (sempre presente)**
Dati che invece *possono* essere elaborati dall'AI perché non identificativi: motivo dell'invio, chi invia (neuropsichiatra infantile / scuola / famiglia / altro specialista), nome dell'inviante (opzionale), riferimento interno facoltativo per ritrovare il caso in archivio.

**Step Anamnesi (se selezionata) — a voci selezionabili**
Invece di un campo di testo libero, propone una lista di voci ricorrenti da spuntare (es. *"sviluppo psicomotorio nella norma"*, *"presenta una diagnosi pregressa"*), alcune delle quali aprono un campo di dettaglio opzionale quando selezionate (es. specificare quale diagnosi). Un campo di testo libero resta comunque disponibile per ogni sotto-sezione (remota/recente) per casi non coperti dalle voci predefinite. Le voci sono raccolte in un modulo dedicato e pensate come punto di partenza da affinare nel tempo, non come lista definitiva.

**Step Osservazione (se selezionata) — a voci selezionabili**
Stessa logica: voci per adattamento al setting e per atteggiamento/collaborazione durante il colloquio, più un campo libero per osservazioni non standard.

**Step Valutazione cognitiva — WISC-IV (se selezionata) — input numerici guidati**
Non più un campo di testo dove "incollare" una tabella: un **input numerico per ciascun indice** (ICV, RP, IML, VE, QIT, e opzionalmente IAG/ICC). Accanto a ogni valore inserito, la fascia interpretativa ("Media", "Superiore", "Inferiore alla Media"...) viene **calcolata automaticamente** in base alle soglie standard — le stesse soglie sono state verificate contro i valori reali osservati nello screenshot del template. Da questi numeri il sistema genera sia la tabella Word sia una base di testo narrativo con le frasi-cornice standard per ciascun indice, che tua sorella può arricchire con note cliniche libere. Sotto la tabella degli indici, un **accordion per indice** (facoltativo) permette di inserire il punto ponderato (pp) di fino a 3 subtest per indice (es. Vocabolario, Somiglianze per ICV) — anche questi dati restano facoltativi e vengono sempre spiegati a parole nella relazione finale, mai mostrati come tabella.

**Step NEPSY / Approfondimento neuropsicologico (se selezionato) — input numerici per dominio**
Stessa logica del cognitivo: i subtest sono organizzati per dominio (Attenzione e Funzioni Esecutive, Memoria e Apprendimento, Linguaggio, Percezione Sociale, Visuospaziale), ciascuno con un campo numerico per il punteggio scalare e fascia calcolata automaticamente. Si compilano solo i subtest effettivamente somministrati.

**Step Valutazione apprendimenti (se selezionata) — resta testo libero**
A differenza di WISC-IV e NEPSY-II, gli strumenti per gli apprendimenti sono più eterogenei tra i casi (Prove MT, BVSCO, AC-MT, con formati di punteggio diversi) — non è stato ritenuto conveniente standardizzare campi specifici. Resta un campo di testo per i punteggi, con note separate opzionali per lettura, scrittura, matematica.

**Step Questionari (se selezionati) — resta testo libero**
Stessa motivazione: CBCL/YSR/Conners hanno scale diverse tra loro, gestiti con campo libero.

**Step Conclusioni (se selezionate)**
Diagnosi, codice ICD (opzionale), consigli a paziente/famiglia, consigli alla scuola (opzionale), strumenti compensativi e misure dispensative (opzionali).

**Step finale — Ultimi dettagli (sempre presente)**
Destinatario della copia (famiglia / scuola / entrambi), lunghezza indicativa, note aggiuntive libere.

### Caratteristiche del wizard

**Sezioni dinamiche**: aggiungere o rimuovere una sezione non richiede modifiche al codice, solo un toggle nel primo step.

**Separazione anagrafica/contenuto clinico**: è la caratteristica più importante di questa revisione. Il reducer del wizard tiene `anagrafica` come sezione a parte; la funzione di generazione (`generaRelazione` in `geminiService.js`) fa esplicitamente `const { anagrafica, ...wizard } = wizardCompleto` prima di costruire qualunque prompt, così è strutturalmente impossibile che quei dati finiscano per errore nella chiamata a Gemini.

**Punteggi test → dato pulito, non testo grezzo**: un modulo dedicato (`testDefinitions.js`) è la fonte di verità unica per i campi WISC-IV e NEPSY-II (indici/subtest, soglie interpretative), inclusi ora i 3 subtest predefiniti per ciascun indice WISC-IV (`WISC_IV_SUBTEST_PER_INDICE`) usati nell'accordion dei punti ponderati. Un secondo modulo (`wizardToText.js`) trasforma i punteggi numerici in tabelle Markdown e narrativa di base, condiviso sia dalla chiamata a Gemini sia dall'export DOCX — evitando di duplicare questa logica in due posti.

**Salvataggio automatico debounced**: ogni risposta viene salvata automaticamente in `sessioni_wizard` dopo 1.5 secondi di inattività. Se tua sorella chiude il browser a metà, riprende da dove ha lasciato.

**Navigazione libera**: la barra di progresso è sempre cliccabile, su qualunque step, in qualunque direzione — non solo verso quelli già visitati. Un indicatore di colore (rosso) segnala gli step visitati ma ancora incompleti, senza però bloccare la navigazione: è un aiuto diagnostico, non un vincolo.

**Validazione per step, non accumulata alla fine**: una funzione centralizzata (`validateStep(stepId, data)`) dichiara i campi obbligatori di ciascuno step e restituisce l'elenco di quelli mancanti. Il pulsante "Avanti" si disabilita solo quando lo step corrente ha campi mancanti, con un messaggio inline che elenca cosa serve — mai un bottone disabilitato senza spiegazione. Solo Anagrafica (nome, cognome, data di nascita), Contesto (motivo dell'invio), Cognitivo/NEPSY se selezionati (almeno un punteggio) e Conclusioni se selezionata (diagnosi) hanno campi bloccanti; gli step di libera compilazione (Anamnesi, Osservazione, Apprendimenti, Questionari, Dettagli finali) restano sempre attraversabili senza vincoli, coerentemente con la loro natura di arricchimento facoltativo del testo.

**useReducer centralizzato**: azioni nominate (`SET`, `SET_NESTED`, `TOGGLE_SEZIONE`, `TOGGLE_VOCE`, `SET_DETTAGLIO`) gestiscono sia campi semplici sia strutture annidate (punteggi per test, voci selezionate con dettaglio), evitando setter sparsi.

---

## Modulo 4 — Generazione e revisione

### Obiettivo
Utilizzare Gemini per generare una bozza di relazione a partire dalle risposte del wizard e dal Profilo di Stile, e permettere all'utente di revisionarla.

### 4.1 — Costruzione del prompt di generazione

Il prompt inviato a Gemini è **modulare e gerarchico**:

```
[SYSTEM — fisso]
Sei un assistente specializzato in redazione di relazioni psicologiche cliniche.
Devi scrivere ESCLUSIVAMENTE seguendo il Profilo di Stile fornito.
Non inventare dati. Usa il condizionale per le ipotesi.
Non usare mai nomi reali: usa solo codici o "il paziente/la paziente".

[PROFILO DI STILE — dinamico]
{contenuto del campo documento_stile dal DB}

[ESEMPI FEW-SHOT — dinamico]
{2-3 relazioni passate, selezionate per similarità dal DB}

[DATI WIZARD — dinamico]
{risposte strutturate del wizard, in formato leggibile}

[ISTRUZIONE FINALE]
Genera la relazione completa in Markdown.
Rispetta l'ordine delle sezioni del Profilo di Stile.
Rispetta la lunghezza indicata dall'utente nel wizard.
```

**Gerarchia di priorità:** il Profilo di Stile ha la precedenza sugli esempi few-shot. Se un esempio few-shot contradice il profilo, Gemini deve seguire il profilo.

### 4.1b — Selezione delle relazioni few-shot

Prima di generare, l'app seleziona le relazioni di riferimento con questa logica:

1. **Filtra per tipo:** stesso `tipo_relazione` del wizard (iniziale, follow-up, legale...)
2. **Filtra per tag:** match sui tag del caso (ansia, valutazione cognitiva, minori...)
3. **Ordina per anno:** preferisce le più recenti
4. **Prendi le prime 2-3** che rientrano nel budget token (stima: ~2000 token a relazione)

Se non ci sono relazioni simili, usa solo il Profilo di Stile (zero-shot).

### 4.2 — Gestione della risposta Gemini

- La risposta può essere ricevuta in streaming (effetto "scrittura in tempo reale") per feedback immediato all'utente
- In MVP, lo streaming è opzionale: il testo può essere mostrato tutto insieme
- Il testo viene mostrato nell'editor mentre arriva
- In caso di errore o risposta troncata, l'app offre di riprovare automaticamente

### 4.3 — Editor di revisione

- Editor di testo in Markdown (non WYSIWYG pesante), per coerenza con la pipeline import/export
- Formattazione base: grassetto, corsivo, intestazioni, elenchi
- La relazione è divisa in sezioni collassabili, corrispondenti alle sezioni standard
- Funzione "Rigenera sezione": l'utente può selezionare una sezione specifica e chiedere a Gemini di riscriverla con istruzioni aggiuntive
- Funzione "Suggerisci alternativa": Gemini propone una formulazione diversa per un paragrafo selezionato
- Cronologia delle modifiche (undo/redo)
- Conteggio parole e stima tempo di lettura

### 4.4 — Anteprima finale

- Anteprima "come apparirà nel DOCX" prima dell'export
- Possibilità di aggiungere intestazione personalizzata (nome studio, logo, dati professionali)
- Possibilità di aggiungere firma digitale testuale

---

## Modulo 5 — Export DOCX e gestione archivio

### Obiettivo
Generare il file DOCX finale e gestire l'archivio completo delle relazioni.

### 5.1 — Export DOCX

- La libreria `docx.js` converte il Markdown finale in un DOCX formattato
- L'utente può caricare un DOCX "template vuoto" con stili Word predefiniti (Heading1, Normal, ecc.) che `docx.js` riempie
- Il template viene salvato in Supabase e riutilizzato per ogni export
- Il DOCX generato viene sia scaricato sul dispositivo che salvato su Supabase Storage

**Stili applicati automaticamente:**
- Titoli H1/H2/H3 → stili Word corrispondenti
- Grassetto e corsivo preservati
- Elenchi puntati e numerati
- Spaziatura paragrafi coerente
- Font professionale (es. Times New Roman o Calibri, configurabile nel template)

### 5.2 — Archivio relazioni

- Vista lista con filtri: per anno, per tipo, per paziente, per parola chiave
- Ricerca full-text nel testo delle relazioni
- Anteprima rapida senza aprire il file
- Possibilità di riaprire una relazione generata e modificarla
- Export multiplo: selezionare più relazioni e scaricarle come ZIP

### 5.3 — Dashboard principale

La schermata home mostra:
- Ultime relazioni create
- Pulsante "Nuova relazione" prominente
- Statistiche: totale relazioni, relazioni questo mese, pazienti attivi
- Stato del Profilo di Stile (quando è stato aggiornato l'ultima volta)
- Eventuali sessioni wizard in sospeso, con etichetta contestuale ("Modifica da archivio: <titolo>" oppure "Bozza nuova relazione (<tipo>)")

---

## 11. Problematiche anticipate e soluzioni

### P1 — Qualità dell'estrazione testo da formati diversi
**Problema**: l'archivio reale contiene tre formati (DOCX, PDF, DOC), ognuno con limiti propri. Mammoth.js gestisce bene i DOCX standard, ma relazioni con tabelle complesse, caselle di testo, note a piè di pagina o immagini incorporate potrebbero perdere formattazione importante. Il formato DOC legacy non è leggibile lato client. I PDF restituiscono testo senza struttura riconoscibile (niente titoli/grassetto).

**Soluzioni — stato attuale:**
- ✅ **Implementato**: anteprima del testo estratto sempre visibile prima del salvataggio, per qualsiasi formato
- ✅ **Implementato**: per i `.doc`, l'app non tenta la conversione (fallirebbe silenziosamente) ma mostra subito un messaggio guidato: "salva come .docx da Word e ricarica"
- ✅ **Implementato**: per i PDF, un avviso esplicito ricorda che la struttura non è riconosciuta automaticamente, invitando a controllare l'anteprima con più attenzione
- ✅ **Verificato**: i PDF dell'archivio reale hanno testo selezionabile (non scansioni), quindi non serve OCR — semplifica molto questo punto
- 🔲 **Da fare**: permettere all'utente di modificare manualmente il Markdown estratto prima del salvataggio definitivo (oggi l'anteprima è di sola lettura)
- 🔲 **Da fare**: per i DOCX con tabelle complesse, verificare il comportamento reale con un file di esempio quando disponibile

### P2 — Limiti della Gemini API gratuita
**Problema**: 15 richieste al minuto, nessuna garanzia SLA, possibili interruzioni del servizio.

**Soluzioni:**
- Implementare un sistema di retry automatico con backoff esponenziale (aspetta 4s, poi 8s, poi 16s prima di riprovare)
- Mostrare messaggi chiari all'utente se la quota è esaurita ("Riprova tra qualche minuto")
- Cachare il Profilo di Stile in locale (localStorage) così non serve richiamarlo ad ogni generazione
- Implementare un fallback manuale: se Gemini non risponde, l'utente può generare un "template vuoto" con le sezioni da riempire manualmente
- Considerare Gemini 1.5 Flash come alternativa se 2.0 Flash presenta problemi

### P3 — Lunghezza del contesto e token
**Problema**: se il corpus di relazioni è molto grande, potrebbe superare la finestra di contesto anche di Gemini 2.0 Flash (1M token).

**Soluzioni:**
- Stimare il conteggio token prima di ogni chiamata API e mostrarlo all'utente
- Per la generazione, non mandare tutto il corpus: mandare solo il Profilo di Stile + 2-3 relazioni simili (selezione per similarità basata su tipo e tag)
- Per l'analisi iniziale dello stile, usare un approccio a batch se il corpus supera 500k token
- Usare la tokenizzazione approssimativa (1 token ≈ 4 caratteri in italiano) per le stime

### P4 — Stile AI vs stile reale
**Problema**: Gemini potrebbe non riuscire a replicare fedelmente lo stile della psicologa, producendo testo generico o con formule non sue.

**Soluzioni:**
- La funzione "Rigenera sezione" permette di affinare parti specifiche
- Il Profilo di Stile include esempi concreti di frasi e formule tipiche (few-shot examples), non solo descrizioni astratte
- Prevedere un meccanismo di feedback: dopo ogni export, chiedere all'utente una valutazione della qualità (1-5 stelle) e salvare questa info per migliorare i prompt nel tempo
- Offrire la possibilità di aggiungere manualmente al Profilo di Stile frasi e formule preferite
- Con l'uso continuativo (nuove relazioni generate → archiviate → incluse nell'analisi), il profilo migliorerà progressivamente

### P5 — Sincronizzazione offline / mobile
**Problema**: su smartphone, la connessione potrebbe essere instabile. L'utente non deve perdere il lavoro in corso.

**Soluzioni:**
- Le risposte del wizard vengono salvate in Supabase ad ogni step (non solo alla fine)
- Implementare un Service Worker PWA per cachare l'interfaccia (anche senza connessione si può vedere l'app)
- In modalità offline, le funzionalità che richiedono internet (Gemini, Supabase) mostrano un avviso chiaro
- Le sessioni wizard in corso vengono anche salvate in localStorage come backup locale

### P6 — Qualità export DOCX
**Problema**: `docx.js` non supporta tutti i costrutti Markdown avanzati, e la formattazione finale potrebbe differire dall'aspettato.

**Soluzioni:**
- Definire un set limitato di formattazioni supportate e comunicarlo all'utente
- Testare l'export con un campione di relazioni reali nella fase di sviluppo
- Offrire un'anteprima HTML del DOCX prima del download
- Come alternativa, permettere l'export in formato RTF (supportato da tutti i Word)

### P7 — Aggiornamenti dell'app
**Problema**: essendo una PWA su Vercel, gli aggiornamenti vengono deployati automaticamente, ma il Service Worker potrebbe cachare la versione vecchia.

**Soluzioni:**
- Implementare una strategia di cache "network first" per le risorse critiche
- Aggiungere un banner "Nuova versione disponibile — aggiorna" quando viene rilevato un update
- Versioning esplicito del Profilo di Stile nel DB per gestire cambiamenti di formato

---

## 12. Privacy e conformità

### Misure tecniche implementate
- Autenticazione obbligatoria su tutte le route
- Row Level Security su Supabase (nessun dato accessibile da altri utenti)
- Connessioni HTTPS end-to-end (garantite da Vercel e Supabase)
- Nessun log lato server del contenuto delle relazioni
- I DOCX originali sono in un bucket privato Supabase
- **Separazione strutturale anagrafica/contenuto clinico**: a differenza della raccomandazione iniziale "usa sempre codici paziente" (che dipendeva dalla disciplina dell'utente), il wizard ora raccoglie i dati anagrafici reali in una sezione isolata del proprio stato interno, e il codice stesso rimuove quella sezione prima di costruire il payload per Gemini (`const { anagrafica, ...wizard } = wizardCompleto`). Non è più una convenzione da rispettare manualmente, ma un vincolo strutturale nel codice — più robusto perché non dipende dal fatto che l'utente ricordi di "non scrivere il nome".
- Un avviso nell'interfaccia (step Anagrafica del wizard, e banner nella schermata di generazione) rende visibile questo comportamento, così l'utente ha conferma diretta di cosa accade ai propri dati

### Raccomandazioni operative residue
- Il campo "riferimento interno" nel wizard (per ritrovare il caso in archivio) va comunque tenuto non identificativo — è un codice a scelta dell'utente, non validato automaticamente
- Il campo "nome inviante" (es. nome del neuropsichiatra che invia il paziente) *può* finire nel testo mandato a Gemini se compilato: non è un dato del paziente, ma resta buona norma usarlo solo se strettamente necessario al contesto clinico
- Prima di inviare testo a Gemini, l'app avvisa chiaramente che il testo verrà processato da Google

### Nota su Google Gemini API
I dati inviati alla Gemini API gratuita (Google AI Studio) potrebbero essere usati da Google per il miglioramento dei modelli. Per uso professionale con dati sanitari, è **fortemente raccomandato** verificare le condizioni del servizio e valutare l'attivazione di un account Google Cloud con garanzie di privacy rafforzate (Vertex AI con DPA firmato). Questo resta il punto di rischio principale del progetto — mitigato ma non eliminato dalla separazione anagrafica, perché il contenuto clinico (osservazioni, punteggi, diagnosi) resta comunque un dato sanitario anche senza nome associato.

---

## 13. Roadmap e priorità

### MVP (Minimum Viable Product) — Priorità 1
- [x] Autenticazione (Supabase reale o bypass in modalità demo)
- [x] Importazione DOCX + PDF + DOC (Mammoth.js + pdf.js + guida conversione)
- [x] Wizard calibrato sulla struttura reale — sezioni dinamiche (WISC-IV, NEPSY-II, apprendimenti, questionari, conclusioni)
- [x] Anagrafica reale separata strutturalmente dal payload Gemini
- [x] Anamnesi/osservazione a voci selezionabili (checkbox) — set iniziale, da affinare nel tempo
- [x] Punteggi WISC-IV/NEPSY-II come input numerici guidati, tabella e fasce generate automaticamente
- [x] Generazione con Gemini — prompt calibrato sulla struttura neuropsicologica reale
- [x] Editor testo base
- [x] Profilo di stile — prompt calibrato sulle frasi-cornice WISC, terminologia reale, formule normative
- [x] Export DOCX — template fedele al formato reale, con anagrafica reale ricomposta lato client

### Versione 1.0 — Priorità 2
- [x] Export DOCX con template (Times New Roman, margini 2.5cm, intestazione, pagine X/Y, tabelle Word reali)
- [ ] Rigenera sezione nell'editor
- [x] Archivio con ricerca full-text e filtri
- [x] Anonimizzazione locale + anteprima obbligatoria prima dell'invio a Gemini per l'analisi dello stile (fix di privacy critico)
- [x] Validazione per step nel wizard (non più accumulata solo alla fine), con indicatore visivo di step incompleti nella barra di progresso
- [x] Export DOCX calibrato su file reale (Calibri, margini asimmetrici, colori tabella esatti) invece che stimato da screenshot
- [x] Fix bug tabelle duplicate nel DOCX esportato — causa reale identificata in `exportDocx.ts` (non nel testo generato da Gemini, come inizialmente ipotizzato), verificato end-to-end su Markdown assemblato + PDF renderizzato
- [x] Segnaposto `{{NOME}}` sostituito col nome reale dopo la generazione — il nome del paziente ora compare più volte nel testo, coerente con lo stile del template originale, senza che Gemini veda mai il dato reale
- [x] Anonimizzazione estesa a tutti i campi di testo libero del wizard (non solo alle relazioni importate per il Profilo di Stile), con due bug di regex corretti (case-insensitive applicato erroneamente a porzioni case-sensitive del pattern)
- [x] Anamnesi e Osservazione comportamentale riscritte da Gemini in prosa fluida, non più composte meccanicamente da concatenazione di etichette checkbox — con fallback deterministico se la narrativa non è disponibile
- [x] Colonna "Interpretabilità" nella tabella WISC-IV resa opzionale (checkbox per indice nel wizard), omessa quando tutti gli indici sono interpretabili
- [ ] Rigenera sezione nell'editor
- [x] Archivio con ricerca full-text e filtri
- [x] Anonimizzazione locale + anteprima obbligatoria prima dell'invio a Gemini per l'analisi dello stile (fix di privacy critico)
- [x] Validazione per step nel wizard (non più accumulata solo alla fine), con indicatore visivo di step incompleti nella barra di progresso
- [x] Riapertura e modifica di relazioni esistenti (wizard pre-popolato da `wizard_snapshot`)
- [x] Anagrafica reale persistita separatamente dal contenuto clinico (tabella `pazienti` collegata via `paziente_id`)
- [x] Salvataggio automatico wizard (debounced)
- [x] Selezione few-shot per similarità (tipo + tag)
- [ ] Ampliare/rivedere insieme a tua sorella la lista di voci checkbox per anamnesi e osservazione
- [x] Rendering Markdown reale (tabelle/liste/blockquote) in Archivio e Profilo di Stile, al posto di testo piatto o renderer parziale
- [x] Import DOCX/PDF rafforzato con fallback a più livelli (Pandoc WASM → docx-preview/Turndown → Mammoth) e ricostruzione PDF migliorata
- [x] Affidabilità chiamate Gemini: fallback multi-modello, retry con backoff, limiti espliciti su payload/corpus
- [x] Profilo di Stile: logica di aggiornamento incrementale resa deterministica (coda stabile, conteggio esplicito)
- [x] Allineamento bidirezionale Profilo di Stile ↔ Wizard, con checklist di aderenza prima della generazione
- [x] Chiarezza dei flussi URL bozza/modifica, con etichette contestuali in Dashboard Bozze
- [x] Subtest WISC-IV per indice come punti ponderati numerici in accordion (non più testo libero), spiegati sempre a parole nella relazione
- [x] Campi di contorno (intestazione, età/strumenti valutazione, note lettura/scrittura/matematica) tessuti nella narrativa di Gemini invece di restare testo grezzo duplicato

### Versione 1.1 — Priorità 3
- [ ] Anteprima formattata della relazione (HTML renderizzato, non solo textarea)
- [ ] Statistiche dashboard
- [ ] Export multiplo ZIP
- [ ] Feedback qualità generazione e miglioramento progressivo del profilo
- [ ] Streaming risposta Gemini
- [ ] Spostare le chiamate Gemini lato server (Vercel/Supabase Edge Function) con chiave API solo server-side, rate limit e validazione payload (eliminare esposizione chiave nel client)

### Future versioni — Opzionale
- [ ] Modalità offline / Service Worker completo
- [ ] Backup automatico su Google Drive
- [ ] Riconoscimento vocale per il wizard (Web Speech API)

> Legenda: ✅ = completato e definitivo · 🔴 = non iniziato

---

## 14. Stima dei tempi

Assumendo che la maggior parte del codice (componenti React, API, prompt) venga generata e iterata dall'IA, con l'utente che guida l'architettura e revisiona:

| Modulo | Attività | Stima AI-assisted |
|---|---|---|
| Setup | Progetto React + Vite, Supabase config, deploy Vercel, auth | 4-6 ore |
| Modulo 1 | Import DOCX, Mammoth.js, pipeline salvataggio | 4-6 ore |
| Modulo 2 | Analisi stile Gemini, documento Profilo di Stile, UI | 4-6 ore |
| Modulo 3 | Wizard 7 step, salvataggio automatico, navigazione | 6-8 ore |
| Modulo 4 | Prompt generazione modulare, streaming, editor, rigenera sezione | 6-10 ore |
| Modulo 5 | Export DOCX, template, archivio, ricerca | 4-6 ore |
| Testing | Bug fix, test su smartphone, test con dati reali | 4-6 ore |
| **Totale** | | **~1 settimana** (sessioni intensive) o **~2 settimane** (a ritmo rilassato) |

**Note sulle stime AI-assisted:**
- L'IA genera boilerplate, componenti UI, prompt engineering e logiche API in minuti
- Il collo di bottiglia diventa il **test con dati reali** (verificare che Gemini imiti davvero lo stile) e la **messaggistica di errore**
- La stima include tempo per iterare i prompt con Gemini finché l'output non è soddisfacente

---

*Documento aggiornato il 29 giugno 2026. Da aggiornare durante lo sviluppo con le decisioni prese e i problemi incontrati.*
