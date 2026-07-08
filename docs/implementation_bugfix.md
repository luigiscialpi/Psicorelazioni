# Fix: narrativa sottogruppi CBCL posizionata sotto la rispettiva tabella nel DOCX

## Problema

Quando Gemini genera la narrativa per test con gruppi secondari (es. CBCL con "Scale Sindromiche" e "Scale DSM Oriented"), il DOCX finale ha questa struttura errata:

```
[Tabella principale CBCL]
[Nota range]
[TUTTA la narrativa in un blocco unico]  ← include analisi Sindromiche + DSM
[Tabella Scale Sindromiche]               ← arriva DOPO il testo che la descrive
[Tabella Scale DSM Oriented]              ← idem
```

L'utente si aspetta:

```
[Tabella principale CBCL]
[Nota range]
[Narrativa generale]
[Tabella Scale Sindromiche]
[Narrativa specifica Scale Sindromiche]
[Tabella Scale DSM Oriented]
[Narrativa specifica Scale DSM Oriented]
```

## Causa

Due fattori contribuiscono:

1. **`assemblaDocumentoMarkdown`** in [wizardToText.ts](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/services/wizardToText.ts#L417-L427) inserisce prima `generaTabella()` (che include tutte le tabelle secondarie), poi la narrativa di Gemini in blocco — il markdown è già strutturato male
2. **`flushDinamica`** in [exportDocx.ts](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/services/exportDocx.ts#L559-L653) tenta di spezzare la narrativa cercando tag `=== SOTTOSEZIONE: ... ===` o intestazioni `**Scale Sindromiche**` su riga a sé (riga 575-577). Ma Gemini non usa questi tag — menziona i nomi dei gruppi *inline* nel testo (es. "Dall'analisi dettagliata delle Scale Sindromiche, ...")

## Proposta

Intervenire su **`flushDinamica` in `exportDocx.ts`** per rendere lo split della narrativa più robusto, usando i nomi reali dei gruppi secondari del template come punti di spezzatura **anche quando compaiono inline** nel testo narrativo:

### [MODIFY] [exportDocx.ts](file:///Users/lscialpi/Downloads/Altro/psicorelazioni/src/services/exportDocx.ts)

Nella funzione `flushDinamica` (righe 559-653), dopo il tentativo con i tag formali (`=== SOTTOSEZIONE ===`, `### ...`, `**...**`), aggiungere un **fallback**: se la `narrativaSpezzata` contiene solo la chiave `'generale'` (cioè i tag non sono stati trovati), scorrere i nomi dei `gruppiSecondari` del template e cercare nel testo narrativo frasi che contengono il nome del gruppo (es. "Scale Sindromiche", "Scale DSM Oriented", "Scale DSM-Oriented"). Quando trovata, spezzare la narrativa a quel punto.

In dettaglio:
- Dopo riga 593 (fine del parsing con tag), controllare se `narrativaSpezzata` ha solo la chiave `'generale'` e se il template ha `gruppiSecondari`
- Se sì, ripercorrere le righe della narrativa cercando riferimenti ai nomi dei gruppi con un match fuzzy (case-insensitive, trattino opzionale)
- Spezzare la narrativa assegnando le righe successive al gruppo trovato
- Il risultato è che la narrativa viene correttamente suddivisa e posizionata sotto ogni tabella secondaria

## Verification Plan

### Manual Verification
- Riesportare il DOCX della relazione corrente e verificare che le tabelle Scale Sindromiche e Scale DSM Oriented abbiano ciascuna la propria narrativa subito sotto
- Verificare che il caso senza gruppi secondari (es. test senza sottogruppi) non sia regredito
