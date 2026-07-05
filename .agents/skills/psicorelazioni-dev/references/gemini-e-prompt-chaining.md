# Gemini e prompt chaining — approfondimento

## `callGemini` — cosa fa già per te

Tutte le chiamate a Gemini passano da `callGemini(systemPrompt, userPrompt, options)` in `geminiService.ts`. Non reinventarlo con un fetch diretto: gestisce già

- **Fallback modelli**: se un modello è in quota esaurita (429 con messaggio di quota) o non disponibile (400/404 "model not found"), passa automaticamente al modello successivo in `MODEL_CANDIDATES`
- **Retry con backoff esponenziale**: su 429/5xx, fino a 3 tentativi per modello, attesa 4s → 8s → 16s
- **Degradazione controllata su `MAX_TOKENS`**: non lancia un'eccezione, ritorna il testo parziale ricevuto (con una nota se non sembra JSON) — un profilo troncato è comunque più utile di un errore secco
- **Opzioni**: `maxOutputTokens` (default 4096), `temperature` (default 0.7), `thinkingBudget` (default 0)

## Limiti fisici e hardcoded da conoscere

- Output massimo fisico di Gemini Flash: **8192 token**, non configurabile più in alto
- `MAX_CORPUS_CHARS = 240000`, `MAX_RELATION_CHARS = 90000` in `geminiService.ts` — limiti di caratteri applicati quando si costruisce il corpus per l'analisi di stile (`costruisciCorpus`), con troncamento per singola relazione e cap sul corpus totale
- Contesto Gemini 2.0 Flash: 1M token — abbondante in input; il vincolo reale è quasi sempre l'**output**, non l'input

## Quando dividere in più chiamate (split-prompt chaining)

Regola pratica: se un prompt rischia di richiedere più di ~6-7k token stimati di output strutturato, dividi. Due esempi già implementati, da usare come modello:

**Profilo di Stile** (`analizzaStile` / `aggiornaProfiloIncrementale`): 2 chiamate parallele — stile/sezioni 1-6 (~3000 token) e test clinici/sezione 7 (~3500 token) — concatenate lato client. `splitProfilo(profilo)` divide un profilo esistente al marker `## 7. Analisi dei Test Clinici` per l'aggiornamento incrementale.

**Estrazione template test** (`rilevaNomiTestDaProfilo` → `generaTemplateTest`): prima una chiamata leggerissima che estrae solo nomi+categorie dei test menzionati nel profilo (~100 token), poi — solo quando l'utente sceglie una card specifica — una chiamata dedicata che genera il template completo per quel singolo test (~500 token). Non generare mai "tutto per tutti" in una chiamata sola se puoi far scegliere all'utente cosa gli serve davvero.

## Formato prompt e parsing

Il prompt di generazione è gerarchico:

```
[SYSTEM — fisso]
[PROFILO DI STILE — dinamico]
[ESEMPI FEW-SHOT — dinamico]
[DATI WIZARD — dinamico]
[ISTRUZIONE FINALE]
```

Il Profilo di Stile ha sempre precedenza sugli esempi few-shot in caso di conflitto — dichiaralo esplicitamente nel system prompt se aggiungi una nuova fonte di contesto.

Per generare più sezioni in una chiamata, il pattern usato è delimitare ogni sezione nella risposta con `=== SEZIONE: nome ===` e fare il parsing con una regex (`generaNarrativaSezioni`). Se aggiungi una nuova sezione generata, mantieni lo stesso delimitatore: un parsing diverso per ogni funzione sarebbe un'inconsistenza silenziosa difficile da notare (oggi il fallback si limita a un `console.warn` se zero sezioni fanno match).

## Selezione delle relazioni few-shot

Non si manda mai tutto l'archivio come esempio. Logica in ordine:
1. Filtra per stesso `tipo_relazione` del caso corrente
2. Filtra per match sui `tag`
3. Ordina per anno (più recenti prima)
4. Prendi le prime 2-3 che rientrano nel budget (~2000 token/relazione stimati)

Zero relazioni simili → generazione zero-shot con solo il Profilo di Stile.

## Modalità mock (`USE_MOCK_AI`)

Ogni funzione esportata da `geminiService.ts` ha un ramo mock che restituisce dati plausibili senza chiamare la rete (vedi l'inizio di `generaRelazione` o `rigeneraSezione`). Serve a sviluppare/testare la UI senza consumare quota Gemini o richiedere una API key configurata. Se aggiungi una nuova funzione che chiama Gemini, il ramo mock non è opzionale: è lo stesso pattern per ogni funzione esistente nel file.
