-- Tabella per i template dei test dinamici
CREATE TABLE IF NOT EXISTS test_templates (
  id TEXT PRIMARY KEY,
  nome TEXT NOT NULL,
  categoria TEXT NOT NULL,
  scala_default JSONB NOT NULL,
  campi_principali JSONB NOT NULL,
  gruppi_secondari JSONB,
  nota_range TEXT,
  richiede_eta_valutazione BOOLEAN DEFAULT false,
  richiede_strumenti_utilizzati BOOLEAN DEFAULT false,
  built_in BOOLEAN DEFAULT false,
  attivo BOOLEAN DEFAULT true,
  schema_version INTEGER DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- RLS
ALTER TABLE test_templates ENABLE ROW LEVEL SECURITY;

-- Tutti gli utenti autenticati possono leggere i test templates
CREATE POLICY "Utenti autenticati possono leggere test_templates" 
ON test_templates FOR SELECT 
TO authenticated 
USING (true);

-- Solo in locale/demo/admin si dovrebbe poter scrivere (per ora chiunque autenticato può crearli)
-- Nel dubbio, un utente può creare custom template
CREATE POLICY "Utenti autenticati possono creare test_templates custom" 
ON test_templates FOR INSERT 
TO authenticated 
WITH CHECK (true);

CREATE POLICY "Utenti autenticati possono aggiornare test_templates" 
ON test_templates FOR UPDATE 
TO authenticated 
USING (true);

-- Dati di base per WISC-IV e NEPSY-II
INSERT INTO test_templates (id, nome, categoria, scala_default, campi_principali, gruppi_secondari, nota_range, richiede_eta_valutazione, richiede_strumenti_utilizzati, built_in, attivo, schema_version)
VALUES ('wisc-iv', 'WISC-IV', 'cognitivo', '{"tipo":"qi_wisc"}', '[{"key":"icv","label":"Comprensione Verbale (ICV)","descr":"L''Indice di Comprensione Verbale (ICV) offre una misura della formazione di concetti verbali, del ragionamento e della conoscenza acquisita dall''ambiente."},{"key":"rp","label":"Ragionamento Visuo-Percettivo (RP)","descr":"L''Indice di Ragionamento Visuo-Percettivo (RP) offre una misura del ragionamento fluido nel dominio percettivo, con particolare attenzione all''elaborazione simultanea dell''informazione visuo-spaziale."},{"key":"iml","label":"Memoria di Lavoro (IML)","descr":"L''Indice di Memoria di Lavoro (IML) offre una misura della capacità di mantenere temporaneamente le informazioni in memoria, eseguire operazioni mentali su di esse e produrre un risultato."},{"key":"ve","label":"Velocità di Elaborazione (VE)","descr":"L''Indice di Velocità di Elaborazione (VE) offre una misura della velocità e accuratezza nell''elaborazione dell''informazione visiva semplice o routinaria."},{"key":"qit","label":"Totale (QI)","descr":"Il Quoziente Intellettivo Totale (QIT) rappresenta una stima globale del funzionamento cognitivo, derivata dall''integrazione dei quattro indici principali."},{"key":"iag","label":"Indice di Abilità Generale (IAG)","descr":"L''Indice di Abilità Generale (IAG) offre una misura del funzionamento cognitivo generale meno sensibile alle componenti di memoria di lavoro e velocità di elaborazione."},{"key":"icc","label":"Indice di Efficienza Cognitiva (ICC)","descr":"L''Indice di Efficienza Cognitiva (ICC) offre una misura dell''efficienza con cui il soggetto elabora le informazioni, integrando memoria di lavoro e velocità di elaborazione."}]', '[{"key":"icv","label":"Comprensione Verbale (ICV)","scalaDefault":{"tipo":"scalare"},"campi":[{"key":"so","label":"Somiglianze (SO)"},{"key":"vc","label":"Vocabolario (VC)"},{"key":"co","label":"Comprensione (CO)"}]},{"key":"rp","label":"Ragionamento Visuo-Percettivo (RP)","scalaDefault":{"tipo":"scalare"},"campi":[{"key":"dc","label":"Disegno con i Cubi (DC)"},{"key":"ci","label":"Concetti Illustrati (CI)"},{"key":"rm","label":"Ragionamento con le Matrici (RM)"}]},{"key":"iml","label":"Memoria di Lavoro (IML)","scalaDefault":{"tipo":"scalare"},"campi":[{"key":"mc","label":"Memoria di Cifre (MC)"},{"key":"rln","label":"Riordinamento di Lettere e Numeri (RLN)"},{"key":"ar","label":"Aritmetica (AR) — supplementare"}]},{"key":"ve","label":"Velocità di Elaborazione (VE)","scalaDefault":{"tipo":"scalare"},"campi":[{"key":"cf","label":"Cifrario (CF)"},{"key":"rs","label":"Ricerca di Simboli (RS)"},{"key":"ca","label":"Cancellazione (CA) — supplementare"}]}]', '*WISC-IV: QI >129 molto superiore, 120-129 superiore, 110-119 medio-superiore, 90-109 media, 80-89 media inferiore, 70-79 inferiore alla media, <69 molto inferiore alla norma.*', true, true, true, true, 1);

INSERT INTO test_templates (id, nome, categoria, scala_default, campi_principali, gruppi_secondari, nota_range, richiede_eta_valutazione, richiede_strumenti_utilizzati, built_in, attivo, schema_version)
VALUES ('nepsy-ii', 'NEPSY-II', 'nepsy', '{"tipo":"scalare"}', '[{"key":"attenzione_uditiva","label":"Attenzione Uditiva (Attenzione e Funzioni Esecutive)"},{"key":"risposte_associate","label":"Risposte Associate (Attenzione e Funzioni Esecutive)"},{"key":"inibizione","label":"Inibizione (Attenzione e Funzioni Esecutive)"},{"key":"fluenza_disegno","label":"Fluenza nel Disegno (Attenzione e Funzioni Esecutive)"},{"key":"memoria_facce","label":"Memoria di Facce (Memoria e Apprendimento)"},{"key":"memoria_narrativa","label":"Memoria Narrativa (Memoria e Apprendimento)"},{"key":"liste_parole","label":"Apprendimento di Liste di Parole (Memoria e Apprendimento)"},{"key":"denominazione","label":"Denominazione Rapida Automatizzata (Linguaggio)"},{"key":"comprensione_istr","label":"Comprensione di Istruzioni (Linguaggio)"},{"key":"fluenza_fonemica","label":"Fluenza Fonemica (Linguaggio)"},{"key":"riconoscimento_emozioni","label":"Riconoscimento delle Emozioni (Percezione Sociale)"},{"key":"teoria_mente","label":"Teoria della Mente (ToM) (Percezione Sociale)"},{"key":"copia_figure","label":"Copia di Figure (Visuospaziale)"},{"key":"orientamento_linee","label":"Giudizio di Orientamento delle Linee (Visuospaziale)"}]', NULL, '*NEPSY-II: punteggi scalari con media 10 e DS 3; valori più alti indicano prestazioni migliori. Interpretazione contestualizzata al dominio valutato.*', false, true, true, true, 1);

