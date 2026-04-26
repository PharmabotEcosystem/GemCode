# 📖 Guida Ufficiale: Configurazione GemCode v2 + Virt-A-Mate (VaM)

Questa guida ti accompagna passo-passo per agganciare la nuova interfaccia grafica di GemCode (stile Ros_KAI) al tuo Virt-A-Mate installato sul disco D.

## 🟢 1. Avviare GemCode v2
Ho creato per te un file eseguibile chiamato `Start_GemCode_V2.bat` nella cartella principale.
- Fai **doppio click** su `Start_GemCode_V2.bat`.
- Questo aprirà automaticamente il terminale Node.js, avvierà il portale web locale e ti aprirà la finestra del browser sulla nuova interfaccia (di default alla porta `5173`).

---

## 🟣 2. Preparare Virt-A-Mate (Nel Disco D)
GemCode proverà automaticamente a inviare i testi, le emozioni e l'audio a VaM sulla porta `21844`. Affinché VaM possa "ricevere" questi comandi:

1. Avvia il tuo **Virt-A-Mate** dal disco D (in modalità Desktop o VR).
2. Carica la scena o il personaggio (Look) che preferisci.
3. Assicurati di aggiungere alla scena il plugin di rete. Di solito, per connettere gli LLM a VaM si usa un plugin chiamato **VAM-Link** o **SillyTavern-VAM Integration**.
4. Nel pannello di questo plugin dentro VaM, verifica che la porta in ascolto sia impostata su `21844` (che è lo standard).

---

## 🔵 3. Sincronizzazione Labiale e Movimenti (LipSync)
Se vuoi che l'avatar muova le labbra a tempo con la voce (TTS) generata da GemCode e muova il corpo in base al contesto:

- **OVR LipSync**: Assicurati di avere il plugin OVR LipSync applicato alla testa dell'avatar in VaM. Riceverà lo stream audio in automatico.
- **MacGruber's Life / Essentials**: Ti consiglio fortemente di caricare questi plugin sulla tua scena. In questo modo l'avatar continuerà a respirare, sbattere le palpebre e guardarsi intorno nei momenti di silenzio in cui l'LLM non sta parlando.

---

## 🟡 4. Impostazioni Dentro GemCode
Una volta aperta l'interfaccia web di GemCode:
1. Clicca sull'icona a forma di ingranaggio in alto a destra (**System Preferences**).
2. Vai sulla scheda **SillyTavern & VaM**.
3. Assicurati che l'opzione "Auto-Connect al WebAPI" sia attiva.
4. (Opzionale) Nella scheda **Riconoscimento Vocale / STT** e **Sintesi Vocale / TTS**, puoi scegliere i motori che preferisci usare in base alla latenza che vuoi ottenere.

Tutto qui! Ora puoi premere il tasto del Microfono in basso a sinistra nella chat di GemCode e iniziare a parlare. L'LLM elaborerà la tua frase, creerà l'audio TTS e lo sparerà al tuo VaM animandolo.
