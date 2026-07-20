# Gemini Service e Prompt Chaining — approfondimento

> Numeri esatti (cascata modelli, numero di tentativi, nomi di tutte le funzioni) sono in README §7 e vanno letti lì: qui solo le regole che restano vere anche quando quei dettagli cambiano.

## Due canali, non uno

`services/geminiService.ts` ha due percorsi di trasporto verso Gemini che **convivono**, scelti in base alla forma della risposta attesa:

- **Testo libero** — `callGemini()` / `callGeminiWithFinishReason()`: `fetch` diretto contro l'endpoint REST `generateContent`, nessuna SDK. Per prosa discorsiva dove uno schema non aiuterebbe (es. analisi di stile).
- **Output strutturato** — `callGeminiStructured()`: SDK ufficiale `@google/genai`, richiesta con `responseJsonSchema` generato da uno schema Zod (`z.toJSONSchema`), risposta validata di nuovo lato client con `schema.parse(...)` prima di essere usata. Per qualunque risposta che il codice deve poi elaborare (elenco di sezioni, un `TestTemplate`, ecc.).

Nessuno dei due è il percorso "principale": la scelta dipende dalla forma della risposta, non da preferenza. Non introdurre una terza via (es. un fetch diretto che poi fa `JSON.parse` a mano su un output non validato) quando una delle due esistenti già copre il caso.

Una differenza pratica importante: un JSON troncato per limite di token **non è recuperabile chiedendo una continuazione** (a differenza del testo libero, dove si può provare a proseguire da dove ci si è interrotti) — se il finish reason segnala il limite di token sul percorso strutturato, la chiamata deve fallire esplicitamente invece di restituire JSON incompleto o parsato a forza.

## Retry e fallback tra modelli

Il servizio implementa retry e cascata automatica tra modelli candidati (dettagli e valori esatti in README §7) per errori temporanei o quota esaurita. Questa logica appartiene esclusivamente al servizio: non duplicarla nei componenti chiamanti, e non far sapere ai componenti UI quale modello è stato effettivamente usato — l'unico contratto pubblico è l'interfaccia delle funzioni `callGemini*`. Se aggiungi una nuova funzione che chiama Gemini, passa da queste funzioni esistenti invece di scrivere un nuovo `fetch`/client SDK: altrimenti quella chiamata non erediterà retry, fallback, né la gestione del finish reason.

## Prompt chaining

La generazione della narrativa è intenzionalmente suddivisa in più richieste indipendenti invece che in una sola richiesta di grandi dimensioni. Vantaggi: meno token per richiesta, risposte più stabili, retry limitati alla singola sezione, minore probabilità di troncamento. Ogni richiesta produce solo la narrativa della sezione corrente, e deve ricevere tutto il contesto necessario senza assumere che il modello ricordi richieste precedenti nella stessa generazione — quando una sezione dipende dal contenuto già generato, quella dipendenza va resa esplicita nel prompt, non lasciata alla memoria conversazionale del modello.

Quando una nuova funzionalità chiede a Gemini di produrre molto testo strutturato, pensa fin da subito a come spezzarla in questo modo piuttosto che tentare prima con una richiesta unica e ottimizzare solo se tronca.

## Costruzione del prompt

Non passare mai a Gemini contenuto già formattato per l'output finale (tabelle Markdown già pronte, corsivo, citazioni impaginate): solo dati grezzi che il client assemblerà deterministicamente dopo (vedi `buildGeminiPayload()` in `testTemplateEngine.ts`, e la nota nel file principale della skill). Il contesto inviato deve restare il minimo indispensabile — niente campi inutilizzati o duplicati — perché riduce token, costo, e imprevedibilità della risposta.

Le istruzioni di stile (registro professionale, tono clinico, nessuna formattazione Markdown oltre a quella richiesta) restano centralizzate nel servizio, non duplicate nei singoli prompt dei componenti.

## Mock mode

`USE_MOCK_AI` fa girare l'app senza chiamate reali a Gemini (si attiva anche sotto test, quindi la suite Vitest non richiede una API key). Ogni funzione che chiama Gemini deve avere il proprio ramo mock con un output fittizio ma strutturalmente plausibile — non un placeholder generico che romperebbe il codice a valle se qualcuno lo trattasse come vero.

## Aggiungere una nuova chiamata Gemini — checklist

1. Decidi `callGemini()` (prosa libera) vs `callGeminiStructured()` (il risultato verrà elaborato dal codice) in base alla forma della risposta, non per abitudine
2. Se strutturato, definisci lo schema Zod e usalo sia per la richiesta sia per validare la risposta — mai un cast (`as`) per aggirare la validazione
3. Passa dalle funzioni `callGemini*` esistenti per ereditare retry/fallback/gestione finish reason
4. Aggiungi il ramo mock corrispondente
5. Verifica che nessun dato identificativo finisca nel payload (Regola 1 nel file principale della skill)
6. Se l'output rischia di superare il limite di token, progetta da subito la richiesta come più chiamate mirate (prompt chaining), non come un'unica richiesta grande da ottimizzare dopo

## Errori da evitare

- Usare `callGeminiStructured()` per generare semplice narrativa, o viceversa `callGemini()` quando serve un output strutturato che il codice deve poi parsare
- Bypassare la validazione dello schema con un cast
- Implementare retry o gestione del fallback nei componenti chiamanti invece che nel servizio
- Costruire prompt direttamente nei componenti React
- Affidare a Gemini la costruzione del documento Markdown, di tabelle, o di sezioni deterministiche — quella logica appartiene sempre al client
