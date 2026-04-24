import React, { useRef } from 'react';
import { Upload, Trash2, User, Info, RefreshCw, Smartphone, Monitor, UserCircle, UploadCloud } from 'lucide-react';
import type { AppSettings } from '../../types';
import { SettingsSection, SettingsSubsection } from '../ui/SettingsSection';

interface Props {
  settings: AppSettings;
  setSettings: React.Dispatch<React.SetStateAction<AppSettings>>;
}

export function AvatarTab({ settings, setSettings }: Props) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Create a local blob URL for the uploaded VRM file
    const url = URL.createObjectURL(file);
    setSettings(s => ({ ...s, companionVrmUrl: url }));
    
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const clearModel = () => {
    if (settings.companionVrmUrl?.startsWith('blob:')) {
      URL.revokeObjectURL(settings.companionVrmUrl);
    }
    setSettings(s => ({ ...s, companionVrmUrl: undefined }));
  };

  const handleSyncVam = async () => {
    try {
      const response = await fetch('http://localhost:10301/sync-vam', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({})
      });
      if (response.ok) {
        // Wait for conversion and refresh model
        setTimeout(() => {
          onSettingsChange({
            ...settings,
            companionVrmUrl: `http://localhost:10301/models/latest_export.glb?t=${Date.now()}`
          });
        }, 3000);
      }
    } catch (error) {
      console.error("Sync VaM Error:", error);
    }
  };

  return (
    <div className="space-y-8">
      <SettingsSection 
        title="Desktop Companion 3D" 
        description="Gestisci l'Avatar VRM (Virtual Reality Model) che fa da assistente visivo."
        icon={<User className="w-5 h-5" />}
      >
        <div className="space-y-6">
          {/* Local Sync Section */}
          <div className="p-4 rounded-xl bg-accent/5 border border-accent/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Monitor className="w-4 h-4 text-accent" />
                <h4 className="text-sm font-semibold text-primary">Sincronizzazione Locale (VaM)</h4>
              </div>
              <span className="px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 text-[10px] font-bold uppercase tracking-wider">Attivo</span>
            </div>
            <p className="text-xs text-secondary leading-relaxed">
              Il convertitore GemCode rileverà automaticamente gli export da Virt-A-Mate. 
              Premi il tasto <b>EXPORT TO GEMCODE</b> nel plugin su VaM per aggiornare l'avatar.
            </p>
            <button 
              onClick={handleSyncVam}
              className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-accent/10 hover:bg-accent/20 border border-accent/20 rounded-lg text-sm font-medium text-accent transition-all"
            >
              <RefreshCw className="w-4 h-4" /> Sync from VaM
            </button>
          </div>

          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-muted" />
              <h4 className="text-sm font-medium text-primary">Modello VRM Attivo</h4>
            </div>

            {settings.companionVrmUrl ? (
              <div className="flex items-center justify-between p-4 bg-elevated border border-border rounded-xl">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-accent/20 flex items-center justify-center">
                    <UserCircle className="w-5 h-5 text-accent" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-primary">Modello Caricato</p>
                    <p className="text-xs text-muted">Pronto per la visualizzazione 3D.</p>
                  </div>
                </div>
                <button 
                  onClick={clearModel}
                  className="p-2 text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                  title="Rimuovi modello"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <div className="text-center p-8 border-2 border-dashed border-border/50 rounded-xl bg-surface/30">
                <UploadCloud className="w-8 h-8 text-muted mx-auto mb-3" />
                <p className="text-sm text-primary mb-1">Nessun Modello VRM selezionato</p>
                <p className="text-xs text-muted mb-4 max-w-[250px] mx-auto">
                  Carica un file .vrm (es. generato con VRoid Studio) per usarlo come Companion 3D.
                </p>
                <button 
                  onClick={() => fileInputRef.current?.click()}
                  className="px-4 py-2 bg-accent text-background text-sm font-medium rounded-lg hover:brightness-110 transition-all shadow-lg shadow-accent/20"
                >
                  Sfoglia file .vrm
                </button>
                <input 
                  type="file" 
                  accept=".vrm" 
                  ref={fileInputRef} 
                  onChange={handleFileUpload}
                  className="hidden" 
                />
              </div>
            )}
            
            <div className="text-xs text-muted p-3 bg-surface border border-border/50 rounded-lg">
              <p className="font-semibold text-secondary mb-1">💡 Suggerimento su Virt-A-Mate (VaM)</p>
              <p>
                I pacchetti `.var` e i modelli di VaM non sono compatibili con il web. Per avere un avatar altamente personalizzabile (vestiti, capelli, smorfie), utilizza <strong>VRoid Studio</strong>, esporta il personaggio in formato `.vrm` e caricalo qui.
              </p>
            </div>

          </div>
        </SettingsSubsection>
      </SettingsSection>
    </div>
  );
}
