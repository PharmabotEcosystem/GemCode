# 🧬 Guida alla Conversione Automatica VaM -> GemCode

Questa guida spiega come utilizzare la pipeline integrata per portare i tuoi personaggi personalizzati di Virt-A-Mate (VaM) direttamente nel portale GemCode.

## 📋 Prerequisiti
1. **Virt-A-Mate** installato.
2. **GemCode Web Portal** attivo.
3. **VaM AI Bridge** attivo (eseguire `D:\Custom\Scripts\SPQR\VaM_AI_Bridge.py`).
4. **GemCode Converter Worker** attivo (eseguire `python D:\Custom\Scripts\GemCode\converter.py`).

---

## 🛠️ Configurazione Iniziale (Una Tantum)
1. Apri VaM.
2. Carica il tuo personaggio (`Person`).
3. Vai nel tab **Plugins** dell'atomo Person.
4. Clicca su **Add Plugin** e seleziona il file:
   `D:\Custom\Scripts\GemCode\GemCodeExporter.cs`

---

## 🔄 Flusso di Lavoro (Sincronizzazione)

### 1. Personalizzazione in VaM
Puoi modificare qualsiasi aspetto del personaggio in VaM:
*   Cambiare vestiti e accessori.
*   Modificare morph del corpo (seno, altezza, proporzioni).
*   Cambiare capelli o skin (inclusi tatuaggi e peli).

### 2. Esportazione
Esistono due modi per sincronizzare:
*   **Dal Portale GemCode**: Vai in *Impostazioni > Avatar 3D* e clicca su **Sync from VaM**. Il sistema invierà un segnale a VaM per avviare l'export automatico.
*   **Da VaM**: Nel pannello del plugin GemCodeExporter, clicca sul pulsante **EXPORT TO GEMCODE**.

### 3. Risultato
Il worker rileverà l'export, lo convertirà in formato GLB ottimizzato e lo caricherà automaticamente nel Companion 3D di GemCode.

---

## 🔒 Sicurezza e Performance
*   Il sistema utilizza un bridge locale (`127.0.0.1`) per la massima velocità e privacy.
*   Le texture vengono "cotte" (baked) per garantire che tutti i dettagli della pelle (tatuaggi, peli) siano mantenuti senza appesantire il rendering web.
*   Il file finale `latest_export.glb` viene salvato in `D:\Avatar3D\`.

---

## ❓ Risoluzione Problemi
*   **L'avatar non si aggiorna**: Assicurati che il file `converter.py` sia in esecuzione.
*   **Errore nel plugin VaM**: Verifica che l'atomo selezionato sia di tipo `Person`.
*   **Texture mancanti**: L'exporter tenta di rendere leggibili le texture; se alcune sono protette, il baking potrebbe saltarle.
