# Piano Implementativo Routing URL-Based
Versione: 1.0
Data: 2026-07-01

## 1) Obiettivo
Introdurre un sistema di routing lato client che:
- aggiorni l'URL in modo coerente con la pagina visualizzata
- supporti deep-link (apertura diretta di una pagina da URL)
- mantenga compatibilità con sessione utente, mock mode e flussi wizard
- riduca accoppiamento tra stato pagina e logica di navigazione interna

## 2) Stato attuale (as-is)
L'app usa uno stato interno page nel componente principale e navigazione via callback onNav.
Conseguenze:
- URL non riflette la pagina corrente
- refresh/apertura link non ripristina la vista corretta
- impossibile condividere link diretti a viste specifiche (es. archivio, profilo stile)

## 3) Stato target (to-be)
Adozione di routing dichiarativo con React Router, con mappa URL stabile:
- /dashboard
- /import
- /stile
- /professionista
- /archivio
- /nuova
- /risultato
- fallback: * -> /dashboard

Regole aggiuntive:
- utenti non autenticati reindirizzati a /auth
- utenti autenticati reindirizzati da /auth a /dashboard
- preservare flussi wizard/risultato con stato di navigazione e/o query param

## 4) Scelte tecniche
### 4.1 Libreria
Usare react-router-dom (BrowserRouter).

### 4.2 Struttura routing
Creare un modulo router centrale con:
- route pubbliche: /auth
- route protette: shell con sidebar + contenuto
- outlet per pagine interne

### 4.3 Guard di autenticazione
Introdurre ProtectedRoute:
- se sessione assente -> navigate('/auth')
- se sessione presente -> render children

### 4.4 Gestione stato wizard
Per dati complessi non serializzabili completamente in URL:
- usare stato app o store locale per draft wizard
- URL riflette il contesto, non tutto il payload
- opzionale: query param per id relazione in modifica (es. /nuova?relazioneId=...)

### 4.5 Compatibilità deploy
Se deploy su Vercel:
- aggiungere rewrite SPA (tutte le route -> index.html)
- validare hard refresh su route annidate

## 5) Piano di implementazione per fasi
## Fase 1 - Fondazione routing
1. Installare react-router-dom.
2. Introdurre BrowserRouter nel bootstrap.
3. Definire route principali e redirect base.
4. Mantenere il comportamento attuale delle pagine senza cambiare logica interna.

Deliverable:
- navigazione URL funzionante
- accesso diretto a ogni pagina principale

## Fase 2 - Protezione sessione
1. Implementare ProtectedRoute.
2. Spostare controllo sessione su guard e layout route.
3. Definire redirect auth/non-auth.

Deliverable:
- flusso login coerente via URL

## Fase 3 - Sidebar e navigazione semantica
1. Sostituire onNav con link/ navigate.
2. Evidenziare voce attiva usando pathname.
3. Gestire pagina risultato con route dedicata.

Deliverable:
- sidebar allineata al router
- nessuna dipendenza dal vecchio stato page

## Fase 4 - Flussi wizard e archivio
1. Mappare apertura modifica da archivio su URL (es. /nuova?relazioneId=ID).
2. Caricare dati iniziali in base a query param.
3. Gestire passaggio a /risultato dopo generazione con stato navigazione.

Deliverable:
- deep-link dei flussi principali
- riapertura relazione affidabile anche con refresh

## Fase 5 - Hardening e QA
1. Gestire route non trovate.
2. Verificare comportamento refresh su tutte le route.
3. Verificare mock mode e Supabase mode.
4. Validare logout e redirect.

Deliverable:
- routing stabile in sviluppo e produzione

## 6) Impatti sui componenti
- App: da switch su stato page a route tree.
- Sidebar: da callback onNav a Link/NavLink.
- Archivio: navigazione verso /nuova con id in query param.
- WizardNuovaRelazione/RisultatoGenerazione: adattamento al nuovo flusso route-driven.

## 7) Compatibilità e migrazione
Strategia consigliata: migrazione incrementale.
- Step A: introdurre router mantenendo stato page come fallback temporaneo.
- Step B: migrare Sidebar e pagine una per una.
- Step C: rimuovere definitivamente page dal reducer principale.

Rollback semplice:
- mantenere branch separato e feature flag locale durante Fase 1-2.

## 8) Criteri di accettazione
- Ogni voce sidebar cambia URL correttamente.
- Refresh browser mantiene la stessa pagina.
- URL diretto apre la pagina corretta (utente autenticato).
- URL protetti reindirizzano a /auth se sessione assente.
- Wizard e risultato restano funzionanti end-to-end.

## 9) Rischi e mitigazioni
Rischio: perdita stato transient nel passaggio a route.
Mitigazione: usare state di navigazione + persistenza draft già esistente.

Rischio: rottura deep-link in produzione.
Mitigazione: configurare rewrite SPA e testare hard refresh.

Rischio: regressioni su auth.
Mitigazione: test manuale matrix login/logout/refresh su route protette.

## 10) Stima operativa
- Fase 1-2: 0.5-1 giorno
- Fase 3-4: 1-1.5 giorni
- Fase 5 + QA: 0.5 giorno
Totale: circa 2-3 giorni

## 11) Task tecnici sintetici
- [ ] install react-router-dom
- [ ] definire route tree + ProtectedRoute
- [ ] migrare Sidebar a NavLink
- [ ] migrare flusso Archivio -> Nuova (query param)
- [ ] migrare flusso Nuova -> Risultato
- [ ] configurare rewrite SPA
- [ ] QA routing + auth + refresh
