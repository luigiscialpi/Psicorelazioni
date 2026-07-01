# Piano di Implementazione — PsicoRelazioni
### App per la generazione assistita di relazioni di valutazione neuropsicologica
*Versione 1.7 — Documento di pianificazione aggiornato*

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
| Modulo 1 — Auth + Import (DOCX/PDF/DOC) | ✅ Completo | Mammoth.js (DOCX) + pdf.js (PDF) funzionanti e testati; `.doc` guidato verso conversione manuale a `.docx` |
| Livello dati astratto | ✅ Completo | `dataService.js`, `geminiService.js` |
| Modulo 2 — Profilo di stile | ✅ Calibrato sulla struttura reale | Prompt di analisi aggiornato per riconoscere indici WISC, tabelle NEPSY, formule normative fisse |
| Modulo 3 — Wizard | ✅ Calibrato sulla struttura reale | Selettore di sezioni dinamico + step dedicati per anamnesi, osservazione, cognitivo, NEPSY, apprendimenti, questionari, conclusioni. Campi "punteggi" come testo libero per le tabelle incollate |
| Modulo 4 — Generazione + editor | 🟡 Parziale | Generazione e editor testuale aggiornati al nuovo formato; manca ancora "rigenera sezione" e l'anteprima formattata |
| Modulo 5 — Export DOCX | ✅ Implementato | Template fedele allo screenshot: Times New Roman, margini 2.5cm, intestazione professionale, titolo centrato sottolineato, numero pagina X/Y, tabelle WISC con intestazione grigia e bordi |
| Modulo 5 — Archivio | ✅ Implementato | Ricerca full-text, filtro per tipo, apertura dettaglio, riapertura per modifica quando `wizard_snapshot` è presente |

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
Non più un campo di testo dove "incollare" una tabella: un **input numerico per ciascun indice** (ICV, RP, IML, VE, QIT, e opzionalmente IAG/ICC). Accanto a ogni valore inserito, la fascia interpretativa ("Media", "Superiore", "Inferiore alla Media"...) viene **calcolata automaticamente** in base alle soglie standard — le stesse soglie sono state verificate contro i valori reali osservati nello screenshot del template. Da questi numeri il sistema genera sia la tabella Word sia una base di testo narrativo con le frasi-cornice standard per ciascun indice, che tua sorella può arricchire con note cliniche libere.

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

**Punteggi test → dato pulito, non testo grezzo**: un modulo dedicato (`testDefinitions.js`) è la fonte di verità unica per i campi WISC-IV e NEPSY-II (indici/subtest, soglie interpretative). Un secondo modulo (`wizardToText.js`) trasforma i punteggi numerici in tabelle Markdown e narrativa di base, condiviso sia dalla chiamata a Gemini sia dall'export DOCX — evitando di duplicare questa logica in due posti.

**Salvataggio automatico debounced**: ogni risposta viene salvata automaticamente in `sessioni_wizard` dopo 1.5 secondi di inattività. Se tua sorella chiude il browser a metà, riprende da dove ha lasciato.

**Navigazione libera**: la barra di progresso è cliccabile sugli step già visitati per tornare indietro senza perdere le risposte successive.

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
- Eventuali sessioni wizard in sospeso

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
- [x] Riapertura e modifica di relazioni esistenti (wizard pre-popolato da `wizard_snapshot`)
- [x] Anagrafica reale persistita separatamente dal contenuto clinico (tabella `pazienti` collegata via `paziente_id`)
- [x] Salvataggio automatico wizard (debounced)
- [x] Selezione few-shot per similarità (tipo + tag)
- [ ] Ampliare/rivedere insieme a tua sorella la lista di voci checkbox per anamnesi e osservazione

### Versione 1.1 — Priorità 3
- [ ] Anteprima formattata della relazione (HTML renderizzato, non solo textarea)
- [ ] Statistiche dashboard
- [ ] Export multiplo ZIP
- [ ] Feedback qualità generazione e miglioramento progressivo del profilo
- [ ] Streaming risposta Gemini

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
