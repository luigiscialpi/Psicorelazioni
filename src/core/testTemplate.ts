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

export const TestTemplateSchema = z.object({
  id: z.string(),                 // slug stabile: 'wisc-iv', 'nepsy-ii', o UUID per i custom
  nome: z.string(),               // "WISC-IV", visualizzato ovunque
  categoria: z.enum(['cognitivo', 'nepsy', 'apprendimenti', 'questionari', 'altro']),
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
});

// Estrazione tipi TypeScript dagli schemi Zod
export type TipoScala = z.infer<typeof TipoScalaSchema>;
export type SogliaCustom = z.infer<typeof SogliaCustomSchema>;
export type ScalaPunteggio = z.infer<typeof ScalaPunteggioSchema>;
export type CampoTest = z.infer<typeof CampoTestSchema>;
export type GruppoTest = z.infer<typeof GruppoTestSchema>;
export type TestTemplate = z.infer<typeof TestTemplateSchema>;

// Risultato di un test compilato nel wizard
export type RisultatoTest = {
  somministrato?: boolean
  punteggi: Record<string, string | number>              // chiave = CampoTest.key dei campiPrincipali
  punteggiSecondari?: Record<string, string | number>       // chiave = CampoTest.key dentro i gruppiSecondari
  interpretabilita?: Record<string, boolean>                  // solo per campiPrincipali, default true se assente
  includiNotaRange?: boolean
  etaValutazione?: string
  strumentiUtilizzati?: string
  noteCliniche?: string
}
