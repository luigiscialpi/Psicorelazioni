# PsicoRelazioni

App web (React + Vite + TypeScript) che aiuta una neuropsicologa a redigere relazioni di valutazione neuropsicologica e dell'apprendimento assistita dall'AI, mantenendo il suo stile di scrittura personale appreso dalle relazioni passate. Utente singola, uso da PC e da smartphone.

Pipeline in breve: **importa relazioni passate → un LLM ne distilla un "Profilo di Stile" → un wizard raccoglie i dati del nuovo caso → un LLM genera la narrativa nello stile appreso → export in DOCX**.

## Indice

1. [Stack tecnologico](#1-stack-tecnologico)
2. [Setup e avvio locale](#2-setup-e-avvio-locale)
3. [Architettura e flusso dati](#3-architettura-e-flusso-dati)
4. [Struttura del progetto](#4-struttura-del-progetto)
5. [Modello dati e schema Supabase](#5-modello-dati-e-schema-supabase)
6. [Sistema dei test clinici (TestTemplate)](#6-sistema-dei-test-clinici-testtemplate)
7. [Generazione con Gemini](#7-generazione-con-gemini)
8. [Privacy e dati sensibili](#8-privacy-e-dati-sensibili)
9. [Routing e pagine](#9-routing-e-pagine)
10. [Convenzioni di sviluppo](#10-convenzioni-di-sviluppo)
11. [Punti di attenzione attuali](#11-punti-di-attenzione-attuali)

---

## 1. Stack tecnologico

| Livello | Tecnologia | Note |
|---|---|---|
| Frontend | React 19 + Vite + TypeScript | `tsc -b` per il typecheck, build target via Vite |
| Routing | react-router-dom v7 | client-side, vedi [§9](#9-routing-e-pagine) |
| Stile UI | **CSS puro** (fogli `.css` per componente/pagina) | Nessun Tailwind, nessun shadcn/ui, nonostante quanto potrebbero suggerire vecchie note di pianificazione |
| Icone | lucide-react | |
| Database + Auth + Storage | Supabase (Postgres + RLS) | client `@supabase/supabase-js`, nessun ORM |
| AI | Google Gemini API — SDK ufficiale `@google/genai` per output strutturato, `fetch` diretto al REST endpoint per testo libero (convivono, vedi [§7](#7-generazione-con-gemini)) | cascata di modelli con fallback; la SDK usa la sua build browser (`exports.browser` del pacchetto), verificata con `vite build` |
| Import DOCX/PDF → testo | `mammoth` (DOCX→HTML), `turndown` (HTML→Markdown), `pdfjs-dist` (PDF) | tutto client-side, il file grezzo non viene caricato altrove prima dell'estrazione |
| Conversioni aggiuntive | `pandoc-wasm` (`services/pandocBrowser.ts`) | Pandoc compilato in WASM, eseguito nel browser |
| Export finale | `docx` (generazione), `docx-preview` (anteprima in-browser) | |
| Preview Markdown | `react-markdown` + `remark-gfm` | |
| Validazione dati | `zod` | schemi in `core/testTemplate.ts`, riusati anche come `responseSchema` per Gemini (§7) |
| Lint | `oxlint` (non `eslint`) | `npm run lint` |
| Test | `vitest` | `npx vitest run` — `services/testTemplateEngine.test.ts`, `services/wizardToText.test.ts`, `services/exportDocx.test.ts`, `core/testTemplate.test.ts` |
| Hosting previsto | Vercel | nessuna configurazione PWA presente ad oggi (`vite.config.ts` non ha plugin PWA, nonostante fosse nei piani iniziali) |

## 2. Setup e avvio locale

1. Crea un progetto su [supabase.com](https://supabase.com).
2. In **SQL Editor**, esegui tutto `supabase_setup.sql` (crea le 6 tabelle e le policy RLS).
3. In **Storage**, crea due bucket privati: `docx-originali`, `export-docx`.
4. In **Project Settings → API**, copia `Project URL` e `anon public key`.
5. Crea `.env.local` nella root:
   ```
   VITE_SUPABASE_URL=https://xxxxxxxxxxxx.supabase.co
   VITE_SUPABASE_ANON_KEY=eyJhbGci...
   VITE_GEMINI_API_KEY=...
   ```
   Opzionali, per controllare la cascata di modelli AI (vedi [§7](#7-generazione-con-gemini)):
   ```
   VITE_GEMINI_MODEL=gemini-2.5-flash
   VITE_GEMINI_MODELS=gemini-2.5-flash,gemini-2.5-flash-lite
   ```
6. In Supabase → **Authentication → Users**, crea l'utente (email/password), disabilitando la conferma via email.
7. `npm install`, poi `npm run dev` → `http://localhost:5173`.

**Senza `.env.local`** (o con valori placeholder) l'app parte comunque in **modalità mock**: `USE_MOCK` (`core/config.ts`) e `USE_MOCK_AI` (`services/geminiService.ts`) si attivano automaticamente quando mancano le rispettive variabili d'ambiente, sostituendo Supabase con dati in-memory (`data/mockData.ts`, `data/mockTemplates.ts`) e Gemini con risposte finte. `USE_MOCK_AI` si attiva anche sotto test (`NODE_ENV === 'test'`), motivo per cui la suite Vitest non richiede alcuna API key.

**Nota — worker PDF**: l'import di file `.pdf` usa `pdf.js`, che richiede un worker servito come asset statico, già incluso in `public/pdf.worker.min.mjs`. Se aggiorni `pdfjs-dist`, ricopialo: `cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdf.worker.min.mjs`.

## 3. Architettura e flusso dati

```
 1. IMPORT           docs/relazioni passate (.docx/.pdf) → estrazione testo (mammoth/turndown/pdfjs)
                      → anonimizzazione (services/anonimizza.ts) → salvate come Relazione (tipo 'importata')
                                          │
 2. PROFILO DI STILE  corpus di Relazione.testo_anonimizzato → analizzaStile() (geminiService.ts)
                      → un unico documento Markdown salvato in profilo_stile.documento_stile
                                          │
 3. WIZARD            form a step dinamici (WizardNuovaRelazione.tsx) → WizardData
                      (anagrafica + sezioni_attive + test_risultati + narrativa libera)
                                          │
 4. GENERAZIONE       generaRelazione(profiloStile, wizardData) (geminiService.ts):
                        a) rimuove wizard.anagrafica dal payload (regola non negoziabile, §8)
                        b) generaNarrativaSezioni(): narrativa in prosa per ciascuna sezione,
                           a blocchi (prompt chaining), condizionata dal Profilo di Stile
                        c) assemblaDocumentoMarkdown() (wizardToText.ts): assembla
                           DETERMINISTICAMENTE lo scheletro del documento (tabelle punteggi,
                           intestazioni fisse, formule di chiusura) inserendo la narrativa
                           Gemini nei punti giusti
                                          │
 5. REVISIONE         RisultatoGenerazione.tsx: editor a doppia modalità (RichTextEditor,
                      §4) — Visuale (rich text) o Testo (Markdown grezzo) sullo stesso
                      contenuto, mai due stati paralleli; l'utente corregge il testo
                      prima dell'export
                                          │
 6. EXPORT            esportaDocx() (exportDocx.ts): parser Markdown minimale → documento
                      .docx via la libreria `docx`, reinserendo separatamente i dati
                      anagrafici (mai visti da Gemini) e riassemblando tabelle/note range
                      in modo deterministico
                                          │
 7. ARCHIVIO          Relazione (tipo 'generata') salvata con wizard_snapshot completo,
                      riapribile per modifica da Archivio.tsx
```

Sia il Profilo di Stile sia la narrativa generata sono **condizionati dallo stesso corpus**: più relazioni passate vengono importate, più lo stile appreso è rappresentativo. L'analisi può essere rieseguita in modo incrementale (`profilo_stile.updated_at` vs `relazioni.created_at` per capire quali relazioni sono "nuove" rispetto all'ultimo profilo).

## 4. Struttura del progetto

```
src/
  core/
    types.ts          # Tipi condivisi: Paziente, Relazione, WizardData, ProfiloStileRecord, ...
    testTemplate.ts    # Schemi Zod + tipi per il sistema TestTemplate (§6)
    config.ts          # USE_MOCK, funzione uid()
    supabase.ts         # Client Supabase
  data/                 # Layer di accesso dati: un file per entità, ognuno con branch USE_MOCK
    pazientiData.ts / relazioniData.ts / profiloData.ts / sessioniData.ts / testTemplatesData.ts
    mockData.ts         # Dati finti per la modalità demo
    mockTemplates.ts    # MOCK_WISC_IV_TEMPLATE, MOCK_NEPSY_II_TEMPLATE, MOCK_TEST_TEMPLATES
  services/
    geminiService.ts    # Tutte le chiamate a Gemini: analizzaStile, generaNarrativaSezioni,
                         # generaRelazione, generaTemplateTest, rilevaNomiTestDaProfilo
    testTemplateEngine.ts  # Motore generico per i test: calcolaFascia, generaTabella,
                         # generaNarrativa, generaSezioneTest, valutaFormule, buildGeminiPayload,
                         # migraWizardSnapshotLegacy — vedi §6
    wizardToText.ts     # assemblaDocumentoMarkdown() e le pulizie difensive sull'output Gemini
                         # (rimuoviTabelleMarkdown, pulisciSezioneDaIntestazioni,
                         # rimuoviFormuleRilascioDuplicate, convertiMarcatoriSottosezione)
    exportDocx.ts        # Markdown → .docx (titoli, **grassetto**/*corsivo*, elenchi puntati/numerati,
                         # tabelle, paragrafo anagrafica). Non un parser Markdown generico: riconosce
                         # solo la grammatica descritta in §3, in sincrono con RichTextEditor (sotto)
    fileExtractor.ts    # getFileKind(), extractText(): DOCX/PDF → Markdown
    anonimizza.ts        # Anonimizzazione testo relazioni per il corpus di analisi stile
    pandocBrowser.ts     # Wrapper per pandoc-wasm
    profileAlignment.ts  # Euristiche non bloccanti: cosa richiede il Profilo di Stile rilevato
  components/
    pages/               # Una pagina per rotta — vedi §9
    layout/Sidebar.tsx    # Nav laterale, voci hardcoded con relativa icona/path
    shared/RichTextEditor.tsx  # Editor Visuale/Testo per la bozza in RisultatoGenerazione.tsx
                         # (§9). Il contenuto è SEMPRE Markdown: la modalità "Visuale" è un
                         # contentEditable con document.execCommand, riconvertito in Markdown
                         # con Turndown (stessa configurazione di fileExtractor.ts) ad ogni
                         # azione rilevante e con un flush() imperativo prima di salvare/esportare
                         # (lo state React non è sincrono). Grammatica volutamente ridotta a ciò
                         # che exportDocx.ts sa davvero rendere (§3): niente selettore font/size
    state/                # Reducer dedicati (es. archivioState.ts, importRelazioniState.ts)
    constants/
      anamnesiVoci.ts      # Opzioni predefinite per lo step Anamnesi del wizard
docs/
  profilo_di_stile.md    # Esempio REALE di Profilo di Stile generato dall'app (corpus di
                         # Luigi/sua sorella): struttura da imitare per capire il formato atteso
supabase_setup.sql        # Script di creazione schema (§5)
```

## 5. Modello dati e schema Supabase

Tipi TypeScript in `core/types.ts` e `core/testTemplate.ts`. Le tabelle Supabase usano `snake_case`; il layer `data/*.ts` traduce da/verso i tipi TS in `camelCase`.

| Tabella | Scopo | Colonne principali |
|---|---|---|
| `pazienti` | Dati anagrafici REALI, isolati dal contenuto clinico | `nome`, `cognome`, `data_nascita`, `scuola_classe`, `codice` (riferimento interno libero, non univoco), `eta_approssimativa`, `sesso`, `tipo_consulto` |
| `relazioni` | Relazioni importate o generate | `tipo` (`'importata'` \| `'generata'`), `tipo_relazione`, `paziente_id` (FK), `testo_markdown`, `testo_anonimizzato`, `testo_originale_path` (bucket `docx-originali`), `wizard_snapshot` (JSONB, **senza anagrafica**) |
| `profilo_stile` | Record singolo (`id = 1`) | `documento_stile` (Markdown, vedi §3), `num_relazioni_analizzate`, `template_rilevati` (JSONB, azzerato ad ogni rigenerazione), `updated_at` (usato per capire quali relazioni sono "nuove" rispetto all'ultima analisi) |
| `sessioni_wizard` | Bozze di wizard in corso (autosalvataggio) | `stato` (`'in_corso'` \| `'completata'` \| `'esportata'`), `risposte_wizard` (JSONB), `bozza_generata`, `relazione_finale_id` (FK) |
| `professionista` | Record singolo (`id = 1`), dati per l'intestazione del DOCX | `nome_completo`, `genere`, `titolo`, `specializzazione`, `partita_iva`, `codice_fiscale`, ... |
| `test_templates` | Definizioni dei test clinici (§6), inclusi i due built-in WISC-IV/NEPSY-II | `id` (testuale, es. `wisc-iv`), `categoria`, `scala_default`, `campi_principali`/`gruppi_secondari` (JSONB), `nota_range`, `colonne`, `formule` (JSONB), `built_in`, `attivo`, `schema_version` |

Tutte le tabelle hanno RLS abilitata con policy `auth.role() = 'authenticated'` (utente singola: chiunque sia loggato vede tutto). Storage: due bucket privati, `docx-originali` (file caricati in import) e `export-docx`.

`WizardData` (il payload del wizard, salvato in `relazioni.wizard_snapshot`) ha forma libera (`UnknownRecord`) con alcuni campi noti: `sezioni_attive: string[]`, `anagrafica`, `test_risultati: Record<string, RisultatoTest>`. Relazioni salvate prima dell'unificazione dei test possono avere ancora i campi legacy `cognitivo`/`nepsy` invece di `test_risultati`: vengono letti e convertiti al volo da `migraWizardSnapshotLegacy()` in fase di caricamento, mai riscritti in quel formato (le nuove relazioni scrivono solo su `test_risultati`).

## 6. Sistema dei test clinici (TestTemplate)

Ogni test (WISC-IV, NEPSY-II, o uno creato da zero in **Gestione Test**) è descritto da un `TestTemplate` (Zod, `core/testTemplate.ts`):

- `campiPrincipali: CampoTest[]` — i punteggi principali (`key`, `label`, `descr?`, `scala?`)
- `gruppiSecondari?: GruppoTest[]` — subtest raggruppati, sempre spiegati **a parole** nella narrativa, mai come tabella
- `scalaDefault` — fasce interpretative (es. media 100 DS 15 per WISC-IV, media 10 DS 3 per NEPSY-II), con eventuali `sogliaCustom` per campo
- `notaRange?` — nota testuale sulle fasce, stampata sotto la tabella nel DOCX finale
- `colonne?: string[]` — metriche multiple per campo (es. `['Punteggio', 'Percentile']`), default `['Punteggio']`
- `formule?` — calcolo automatico di indici derivati dai subtest (es. IAG), valutate in modo sicuro da `valutaFormule()` (nessuna eval arbitraria)
- `builtIn`/`attivo` — i due test storici hanno `builtIn = true`; disattivare un template è un soft-delete (`attivo = false`); esiste anche una `deleteTestTemplate()` che fa una DELETE reale (da usare con cautela, non ha un equivalente funzionante in modalità mock)

`testTemplateEngine.ts` è il motore generico che, dato un `TestTemplate` + un `RisultatoTest` compilato nel wizard, produce in modo **puramente deterministico** (nessuna chiamata AI):
- `generaTabella()` / `generaSezioneTest()` → la tabella Markdown/sezione da inserire nel documento finale
- `calcolaFascia()` → fascia interpretativa per un punteggio dato la scala
- `calcolaNarrativaGruppi()` → descrizione testuale piatta dei subtest, per il payload Gemini
- `buildGeminiPayload()` → il testo che Gemini riceve per scrivere il commento narrativo. **Contiene solo dati grezzi (label/punteggio/fascia), mai la tabella già renderizzata né la nota range col corsivo**: un LLM a cui si mostra contenuto già formattato come tabella o citazione, appena prima di chiedergli di commentarlo, tende a farne l'eco nella risposta. Tabella e nota range finale vengono inserite nel documento solo dopo, da `assemblaDocumentoMarkdown()` — Gemini non le vede mai renderizzate.

`wizardToText.ts` applica comunque, come rete di sicurezza, quattro pulizie difensive sul testo tornato da Gemini prima dell'inserimento nel documento (`rimuoviTabelleMarkdown`, `pulisciSezioneDaIntestazioni`, `rimuoviFormuleRilascioDuplicate`, `convertiMarcatoriSottosezione`): loggano via `console.warn` quante righe/duplicati/marcatori rimuovono o convertono, utile per capire quanto spesso il modello rigenera comunque contenuto che non dovrebbe. L'ultima delle quattro merita una nota a parte: il prompt chiede a Gemini di usare marcatori `=== SOTTOSEZIONE: nome ===` per separare sotto-parti **solo** nelle sezioni di test con sottotest/gruppi (es. CBCL: "Scale Sindromiche" vs "Scale DSM Oriented"), dove `exportDocx.ts` sa interpretarli e posizionarli sotto la tabella giusta; se il modello li usa comunque in una sezione discorsiva (tipicamente "conclusioni", per separare diagnosi da raccomandazioni), nessun altro punto del codice li interpreta — `convertiMarcatoriSottosezione` li converte in un sotto-titolo in **grassetto** invece di lasciarli come testo tecnico visibile nel documento finale.

`assemblaDocumentoMarkdown()` deduplica anche per categoria: se `sezioni_attive` contiene sia un test dinamico di categoria `questionari`/`apprendimenti` (es. CBCL) sia la vecchia sezione libera con lo stesso nome (`wizard.questionari`/`wizard.apprendimenti`, mantenuta solo per compatibilità con relazioni compilate prima dei template dinamici), viene mostrato solo il primo — altrimenti lo stesso questionario compare due volte sotto lo stesso titolo "## Questionari", con la seconda copia che mostra anche i campi liberi non ripuliti (es. appunti grezzi digitati dalla psicologa) invece della narrativa Gemini rifinita.

WISC-IV e NEPSY-II sono `TestTemplate` come qualunque altro (`MOCK_WISC_IV_TEMPLATE`/`MOCK_NEPSY_II_TEMPLATE`, seminati di default nella stessa mappa dei test custom): nessun trattamento speciale nel motore. L'unica particolarità residua, volutamente cosmetica, è in `titoloSezioneTest()`: per questi due soli built-in (garantiti singoli per costruzione — non è possibile che ne esistano due nella stessa relazione) il titolo di sezione è un'etichetta amichevole ("Valutazione cognitiva"/"Approfondimento neuropsicologico") invece del nome grezzo del test; qualunque altro template dinamico usa sempre il proprio `nome` come titolo, anche per evitare collisioni quando più test della stessa categoria sono attivi insieme (es. due questionari diversi) — vedi la nota sotto su `sezioniDinamiche`.

## 7. Generazione con Gemini

`services/geminiService.ts` ha **due percorsi di trasporto verso Gemini che convivono**, scelti in base a se la risposta attesa è prosa libera o un oggetto con una forma precisa:

- **Testo libero** (`callGemini`/`callGeminiWithFinishReason`): `fetch` diretto contro l'endpoint REST `generateContent`, nessuna SDK. Usato da `analizzaStile` e dalle funzioni di aggiornamento incrementale del profilo, che producono Markdown discorsivo dove uno schema non aiuterebbe.
- **Output strutturato** (`callGeminiStructured`): SDK ufficiale `@google/genai` (`ai.models.generateContent` con `responseMimeType: 'application/json'` e `responseJsonSchema` generato da uno schema Zod via `z.toJSONSchema(schema, {target:'openapi-3.0'})`), poi validato di nuovo lato client con `schema.parse(...)` prima di restituirlo. Usato da `generaNarrativaSezioni`, `rilevaNomiTestDaProfilo`, `generaTemplateTest`: tutte funzioni dove la risposta deve avere una forma precisa (elenco di sezioni, elenco di nomi test, un `TestTemplate`). Confermato che la SDK builda correttamente per il browser con Vite (usa la sua condizione `exports.browser`, build separata da quella Node).

Un JSON troncato per limite di token non è recuperabile chiedendo una continuazione (a differenza del testo libero, dove `continuaSezione()` prova a proseguire da dove si è interrotto): se il finish reason è `MAX_TOKENS` sul percorso strutturato, la chiamata fallisce esplicitamente invece di restituire JSON incompleto.

**Cascata di modelli**: `MODEL_CANDIDATES` (default `gemini-2.5-flash`, `gemini-2.5-flash-lite`, `gemini-3.5-flash`, `gemini-3.1-flash-lite`, sovrascrivibile con `VITE_GEMINI_MODEL`/`VITE_GEMINI_MODELS`). Per ogni chiamata: fino a 3 tentativi sul modello corrente, poi passaggio automatico al successivo in caso di quota esaurita o modello non disponibile sull'account. La stessa logica di retry/fallback è **implementata due volte** (una per `fetch`, con `res.status`; una per la SDK, leggendo `err.status` da `ApiError`) invece che condivisa: se cambi le soglie o le condizioni di retry, aggiornale in entrambi i punti.

**Le generazioni principali**:
- `analizzaStile(corpus)` → un documento Markdown (il "Profilo di Stile", vedi `docs/profilo_di_stile.md` per un esempio reale) con: struttura standard delle relazioni, registro linguistico, formule ricorrenti da riprodurre, come vengono trattate le tabelle, terminologia preferita/da evitare, lunghezza/ritmo, e un'analisi per-test di tutti i test clinici rilevati nell'archivio (`## 7. Analisi dei Test Clinici Rilevati nell'Archivio`, seguita da un `### Test: Nome` per ciascuno). Il marcatore esatto di questa sezione 7 è cercato per `indexOf` da `splitProfilo()` per gli aggiornamenti incrementali: va mantenuto invariato se si tocca il prompt.
- `generaRelazione(profiloStile, wizardData)` → rimuove `anagrafica` dal payload (§8), poi chiama `generaNarrativaSezioni()` che spezza le sezioni attive in **blocchi di massimo 3** (prompt chaining, per restare sotto ai limiti di token di output) e per ciascun blocco chiede, con output strutturato, SOLO narrativa in prosa per sezione (mai tabelle, già pronte lato client), condizionata dal Profilo di Stile passato per intero come contesto a priorità massima. Il risultato per sezione viene poi passato ad `assemblaDocumentoMarkdown()` (§3). Non c'è più bisogno di un fallback a regex sui delimitatori: una risposta che non rispetta lo schema fa fallire la chiamata (e quindi scatta il retry/cascata modelli) invece di essere interpretata alla meno peggio.
- `rilevaNomiTestDaProfilo`/`generaTemplateTest` (usate da **Gestione Test**) → rispettivamente un elenco `{nome, categoria}` e un `TestTemplate` completo, con `GeneratedTestTemplateSchema` (`core/testTemplate.ts`, derivato da `TestTemplateSchema.omit(...)` per escludere i campi gestiti dall'app) come contratto. Un errore reale (quota, risposta non conforme) ora arriva come eccezione con messaggio utile a chi chiama, invece di essere inghiottito in un `null`/array vuoto indistinguibile da un esito legittimo "nessun test trovato".

Modalità mock: `USE_MOCK_AI` (attiva senza `VITE_GEMINI_API_KEY`, con placeholder, o sotto test) fa rispondere funzioni che restituiscono testo/oggetti finti invece di chiamare l'API — ogni funzione che chiama Gemini ha un ramo mock dedicato, controllato prima di costruire il client SDK (`getGeminiClient()` è lazy apposta: costruirlo eagerly romperebbe l'import del modulo per chi non ha una API key, mock compresi).

## 8. Privacy e dati sensibili

**Regola non negoziabile**: i dati anagrafici del paziente non raggiungono mai l'API Gemini. In `generaRelazione()`:
```ts
const { anagrafica, ...wizard } = wizardCompleto
```
è un vincolo strutturale nel codice, non una convenzione da ricordare. Il genere viene però estratto ed eventualmente preservato separatamente (per l'accordo di genere nel testo, es. "nato/nata"), perché di per sé non è identificativo. I dati anagrafici tornano nel documento solo lato client, in `RisultatoGenerazione.tsx`/`exportDocx.ts` (`anagraficaParagraph()`), mai visti dall'AI.

Altre misure: autenticazione obbligatoria su tutte le route, RLS su Supabase, bucket Storage privati, nessun log server-side del contenuto delle relazioni (l'app non ha backend proprio: tutta la logica gira client-side, l'unico "server" è Supabase). Le relazioni importate vengono anonimizzate (`services/anonimizza.ts`) prima di entrare nel corpus usato per `analizzaStile`.

**Rischio residuo, non eliminato dal codice**: i dati inviati alla Gemini API con API key gratuita (Google AI Studio) possono essere usati da Google per il miglioramento dei modelli. Il contenuto clinico (osservazioni, punteggi, diagnosi) resta un dato sanitario anche senza nome associato. Per uso professionale continuativo andrebbe valutato un account Google Cloud / Vertex AI con DPA firmato.

Il campo "riferimento interno" (per ritrovare il caso in archivio) va tenuto non identificativo per scelta dell'utente — non è validato automaticamente. Il campo "nome inviante" (es. il collega che invia il paziente), se compilato, può finire nel testo mandato a Gemini: non è un dato del paziente, ma va usato solo se necessario al contesto clinico.

## 9. Routing e pagine

Routing dichiarativo (`react-router-dom`), definito in `components/pages/App.tsx`. Tutte le rotte tranne `/auth` richiedono sessione attiva (`ProtectedRoute`, redirect a `/auth` se assente); da autenticati, `/auth` reindirizza a `/dashboard`.

| Rotta | Pagina | Voce in sidebar |
|---|---|---|
| `/auth` | `AuthScreen` | — |
| `/dashboard` | `Dashboard` | Pannello |
| `/bozza` | `Dashboard` (`mode="bozze"`) | Bozze in corso |
| `/bozza/riprendi` | `WizardNuovaRelazione` | (da Bozze in corso) |
| `/import` | `ImportRelazioni` | Importa relazioni |
| `/stile` | `ProfiloStile` | Profilo di stile |
| `/professionista` | `ProfiloProfessionista` | Scheda professionista |
| `/archivio` | `Archivio` | Archivio |
| `/nuova` | `WizardNuovaRelazione` | Nuova relazione |
| `/modifica` | `WizardNuovaRelazione` | (da Archivio, modifica relazione esistente) |
| `/risultato/:relazioneId?` | `RisultatoGenerazione` | path param = id di `relazioni` (riapertura da Archivio); per una generazione fresca non ancora salvata usa invece `?sessionId=` in query string (vedi sotto) |
| `/gestione-test` | `GestioneTest` | Gestione test |
| `/`, `*` | → redirect `/dashboard` | |

Tutte le pagine tranne `AuthScreen` sono caricate con `React.lazy`. Il layout con sidebar (`AppLayout`, dentro `App.tsx`) gestisce anche il drawer mobile.

**Sicurezza-refresh su `/risultato`**: i dati per generare (`wizardData`) viaggiano in `location.state` di React Router, che un refresh del browser cancella. `RisultatoGenerazione.tsx` mitiga così: appena una generazione fresca ha successo, il testo viene salvato in `sessioni_wizard.bozza_generata` (riusando `wizardData._sessionId`, già creato dall'autosave del wizard durante la compilazione) e l'URL viene sostituito con `/risultato?sessionId=<id>` via `navigate(..., {replace:true})`. Se `location.state` va perso ma l'URL porta ancora quel `sessionId`, il componente ricarica il testo da Supabase invece di richiamare Gemini una seconda volta (l'LLM non è deterministico: una rigenerazione può produrre un testo diverso dal primo) o di buttare via la generazione. Resta una finestra residua stretta: un refresh durante i pochi secondi della *prima* chiamata a Gemini (prima che l'URL venga aggiornato) perde comunque lo stato, dato che a quel punto in-corso non c'è ancora nulla da recuperare.

## 10. Convenzioni di sviluppo

- **Stato**: pagine complesse (wizard, archivio, import) usano `useReducer` con action type espliciti, non stato sparso in `useState` multipli.
- **Naming**: variabili/funzioni/commit in italiano; nomi tecnici (funzioni, tipi, chiavi JSON) in inglese o italiano a seconda del file esistente — segui la convenzione già presente nel file che stai modificando, non introdurne una nuova.
- **Commenti**: i punti critici (sicurezza dati, bug non ovvi, vincoli impliciti) sono marcati con `⚠️` e una riga di spiegazione sopra la funzione — vedi `generaRelazione()` in `geminiService.ts` come esempio.
- **Mock branch obbligatorio**: qualunque nuova funzione che chiama Supabase o Gemini deve avere anche il proprio ramo `USE_MOCK`/`USE_MOCK_AI`, altrimenti l'app non è più utilizzabile senza credenziali reali (e i test, che girano in mock, non la coprono).
- **Zod come fonte di verità sui tipi test**: modificare la forma di `TestTemplate`/`RisultatoTest` si fa in `core/testTemplate.ts`, non con cast sparsi altrove.
- **Lint**: `npm run lint` (oxlint, non eslint — regole/config diverse da quanto normalmente ci si aspetta da eslint).
- **Test**: `npx vitest run`; oggi `services/testTemplateEngine.test.ts`, `services/wizardToText.test.ts`, `services/exportDocx.test.ts`, `core/testTemplate.test.ts`. Gira in automatico in mock mode, non serve alcuna chiave API.
- **Typecheck**: `npx tsc -b` (project references).

## 11. Punti di attenzione attuali

- `supabase_setup.sql` è lo script di riferimento per ricreare lo schema da zero; se lo modifichi a mano tenendolo disallineato dal progetto Supabase reale, la fonte di verità sui nomi colonna resta comunque il codice in `data/*.ts` (query dirette), non questo file.
- `deleteTestTemplate()` esegue una DELETE reale sulla tabella `test_templates` (non solo soft-delete via `attivo = false`); in modalità mock è un no-op silenzioso, non rimuove nulla dall'array locale.
- Nessun plugin PWA è configurato in `vite.config.ts` ad oggi: l'app non è installabile come PWA nonostante fosse tra gli obiettivi iniziali.
- **Nessun isolamento dati tra utenti sullo stesso progetto Supabase**: le policy RLS (`supabase_setup.sql`) sono tutte `USING (auth.role() = 'authenticated')` — controllano solo che ci sia un login valido, non _quale_ utente. Non esiste una colonna `user_id`/`auth.uid()` da nessuna parte: un secondo utente creato in Authentication → Users sullo stesso progetto vede per intero pazienti, relazioni e profilo di stile del primo. Isolare i dati per utente richiederebbe una colonna owner + policy riscritte su tutte le tabelle, non è un cambiamento piccolo.
- Il layer dati (`data/*.ts`) traduce sempre `camelCase` (TypeScript) ↔ `snake_case` (Supabase) a mano, campo per campo: non c'è un mapper automatico, quindi aggiungere un campo a un tipo richiede di aggiornarlo in almeno tre punti (schema Zod/tipo, query di lettura, payload di scrittura).
- Lo schema `responseSchema` di `generaTemplateTest` (§7) include un'unione discriminata (`scalaDefault`, tre forme diverse secondo `tipo`): la conversione Zod→JSON Schema e la validazione lato client sono testate (`core/testTemplate.test.ts`), ma quanto bene Gemini rispetti effettivamente quella forma va verificato con una chiamata reale, non è osservabile in sviluppo senza chiave API valida.
- In `RichTextEditor.tsx` il `<div contentEditable>` e la `<textarea>` restano sempre entrambi montati (visibilità a CSS, mai smontaggio condizionale): non è uno stile, è la correzione di un bug reale di perdita contenuto (smontare/rimontare il contentEditable lo svuotava). Non "semplificare" tornando a un rendering condizionale dei due modi.
