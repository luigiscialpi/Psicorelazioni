import { z } from 'zod';

export const TipoScalaSchema = z.enum([
  'qi_wisc',        // media 100, DS 15 — riusa fasciaWISC() esistente
  'scalare',        // media 10, DS 3 — riusa fasciaScalare() esistente
  'soglie_custom'   // scala propria del test (percentili, z-score, cut-off clinici...)
]);

export const SogliaCustomSchema = z.object({
  min: z.number(),                // inclusivo
  max: z.number().nullable(),     // inclusivo, null = nessun limite superiore (infinito)
  etichetta: z.string(),          // es. "Deficitario", "Adeguato"
});

export const ScalaPunteggioSchema = z.discriminatedUnion('tipo', [
  z.object({ tipo: z.literal('qi_wisc') }),
  z.object({ tipo: z.literal('scalare') }),
  z.object({ 
    tipo: z.literal('soglie_custom'), 
    soglie: z.array(SogliaCustomSchema) 
  }),
]);

export const CampoTestSchema = z.object({
  key: z.string(),                // slug univoco nel template, es. 'icv', 'attenzione_uditiva'
  label: z.string(),              // es. "Comprensione Verbale (ICV)"
  descr: z.string().optional(),   // frase-cornice descrittiva, usata nella narrativa (facoltativa)
  scala: ScalaPunteggioSchema.optional(), // eredita da GruppoTest o TestTemplate se assente
});

export const GruppoTestSchema = z.object({
  key: z.string(),                // es. 'icv'
  label: z.string(),              // es. "Comprensione Verbale (ICV)" — intestazione accordion
  scalaDefault: ScalaPunteggioSchema.optional(),
  campi: z.array(CampoTestSchema), // subtest del gruppo (narrativa, mai tabella)
});

export const FormulaCalcoloSchema = z.object({
  targetKey: z.string(),          // chiave del campo da calcolare (es. 'totale', 'iag')
  espressione: z.string(),        // espressione matematica, es. '{cf} + {rs}' o '({icv} + {irp}) / 2'
  descrizione: z.string().optional(),
});

export const CategoriaTestSchema = z.enum(['cognitivo', 'nepsy', 'apprendimenti', 'questionari', 'altro']);

export const TestTemplateSchema = z.object({
  id: z.string(),                 // slug stabile: 'wisc-iv', 'nepsy-ii', o UUID per i custom
  nome: z.string(),               // "WISC-IV", visualizzato ovunque
  categoria: CategoriaTestSchema,
  scalaDefault: ScalaPunteggioSchema,
  campiPrincipali: z.array(CampoTestSchema),
  gruppiSecondari: z.array(GruppoTestSchema).optional(),
  notaRange: z.string().optional(),
  richiedeEtaValutazione: z.boolean().default(false),
  richiedeStrumentiUtilizzati: z.boolean().default(false),
  builtIn: z.boolean().default(false),
  attivo: z.boolean().default(true),
  schemaVersion: z.number().default(1), // Gestione compatibilità schemi futuri
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  // Estensioni per unificazione e flessibilità
  colonne: z.array(z.string()).default(['Punteggio']), // Intestazioni colonne punteggio, es. ['Punti T', 'Percentile']
  formule: z.array(FormulaCalcoloSchema).optional(),  // Formule di calcolo per indici sintetici/totale
});

// Sottoinsieme di TestTemplate che ha senso far generare a un LLM: niente
// campi gestiti dall'app (id, builtIn, attivo, schemaVersion, timestamp) né
// colonne/formule, che restano configurazione manuale in "Gestione Test".
// Usato come responseSchema strutturato in geminiService.ts#generaTemplateTest.
export const GeneratedTestTemplateSchema = TestTemplateSchema.omit({
  id: true, builtIn: true, attivo: true, schemaVersion: true, createdAt: true, updatedAt: true,
  colonne: true, formule: true,
});

// Estrazione tipi TypeScript dagli schemi Zod
export type TipoScala = z.infer<typeof TipoScalaSchema>;
export type SogliaCustom = z.infer<typeof SogliaCustomSchema>;
export type ScalaPunteggio = z.infer<typeof ScalaPunteggioSchema>;
export type CampoTest = z.infer<typeof CampoTestSchema>;
export type GruppoTest = z.infer<typeof GruppoTestSchema>;
export type FormulaCalcolo = z.infer<typeof FormulaCalcoloSchema>;
export type TestTemplate = z.infer<typeof TestTemplateSchema>;
export type GeneratedTestTemplate = z.infer<typeof GeneratedTestTemplateSchema>;

// Risultato di un test compilato nel wizard
export type RisultatoTest = {
  somministrato?: boolean
  // I punteggi della colonna principale (la prima in template.colonne) sono salvati con chiave campoKey.
  // I punteggi delle colonne successive sono salvati con chiave campoKey + '_' + nomeColonna (es. 'esternalizzazione_Percentile').
  punteggi: Record<string, string | number>              // chiave = CampoTest.key dei campiPrincipali
  punteggiSecondari?: Record<string, string | number>       // chiave = CampoTest.key dentro i gruppiSecondari
  interpretabilita?: Record<string, boolean>                  // solo per campiPrincipali, default true se assente
  includiNotaRange?: boolean
  etaValutazione?: string
  strumentiUtilizzati?: string
  noteCliniche?: string
}
