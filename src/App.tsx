import React, { useState, useEffect } from 'react';
import { 
  Shield, 
  Coins, 
  MapPin, 
  Clock, 
  Package, 
  Activity, 
  Users, 
  Skull, 
  Briefcase, 
  FlaskConical, 
  MessageSquare,
  Crosshair,
  Home,
  TrendingUp
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// --- Game Data Models ---
type District = 'Residenziale (Cobras)' | 'Commerciale (Vipers)' | 'Industriale (Lawless)';
type TimeOfDay = 'Mattina' | 'Pomeriggio' | 'Sera' | 'Notte';

interface PlayerState {
  health: number;
  maxHealth: number;
  money: number;
  reputation: number;
  district: District;
  time: TimeOfDay;
  career: 'Corriere' | 'Chimico' | 'Negoziatore' | 'Nessuna';
}

interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  type: 'Sostanza' | 'Ingrediente' | 'Arma' | 'Altro';
}

interface LogEntry {
  id: number;
  text: string;
  type: 'info' | 'warning' | 'danger' | 'success';
  timestamp: string;
}

// --- Initial State ---
const initialPlayer: PlayerState = {
  health: 100,
  maxHealth: 100,
  money: 500,
  reputation: 10,
  district: 'Residenziale (Cobras)',
  time: 'Sera',
  career: 'Nessuna'
};

const initialInventory: InventoryItem[] = [
  { id: '1', name: 'Coltello a serramanico', quantity: 1, type: 'Arma' },
  { id: '2', name: 'Sostanza Base', quantity: 5, type: 'Ingrediente' },
  { id: '3', name: 'Kit Medico Clandestino', quantity: 1, type: 'Altro' },
];

export default function App() {
  const [player, setPlayer] = useState<PlayerState>(initialPlayer);
  const [inventory, setInventory] = useState<InventoryItem[]>(initialInventory);
  const [logs, setLogs] = useState<LogEntry[]>([
    { id: 1, text: "Benvenuto nelle strade. Non fidarti di nessuno.", type: 'warning', timestamp: "20:00" }
  ]);
  const [activeTab, setActiveTab] = useState<'strada' | 'inventario' | 'mercato' | 'crew'>('strada');

  const addLog = (text: string, type: LogEntry['type'] = 'info') => {
    const now = new Date();
    const timeStr = `${now.getHours().toString().padStart(2, '0')}:${now.getMinutes().toString().padStart(2, '0')}`;
    setLogs(prev => [{ id: Date.now(), text, type, timestamp: timeStr }, ...prev].slice(0, 50));
  };

  const handleMove = () => {
    const districts: District[] = ['Residenziale (Cobras)', 'Commerciale (Vipers)', 'Industriale (Lawless)'];
    const nextDistrict = districts[(districts.indexOf(player.district) + 1) % districts.length];
    setPlayer(prev => ({ ...prev, district: nextDistrict }));
    addLog(`Ti sei spostato nel distretto: ${nextDistrict}`, 'info');
  };

  const handleScavenge = () => {
    const found = Math.random() > 0.5;
    if (found) {
      const amount = Math.floor(Math.random() * 50) + 10;
      setPlayer(prev => ({ ...prev, money: prev.money + amount }));
      addLog(`Hai trovato ${amount} crediti frugando in un vicolo.`, 'success');
    } else {
      const damage = Math.floor(Math.random() * 15) + 5;
      setPlayer(prev => ({ ...prev, health: Math.max(0, prev.health - damage) }));
      addLog(`Un tossico ti ha aggredito! Hai perso ${damage} HP.`, 'danger');
    }
  };

  return (
    <div className="min-h-screen bg-dark-bg text-gray-300 font-sans flex flex-col overflow-hidden selection:bg-neon-purple selection:text-white">
      {/* Top Bar - Player Stats */}
      <header className="bg-dark-surface border-b border-dark-border p-4 flex flex-wrap items-center justify-between gap-4 shrink-0 z-10 shadow-md">
        <div className="flex items-center gap-6 overflow-x-auto pb-2 sm:pb-0 w-full sm:w-auto hide-scrollbar">
          <div className="flex items-center gap-2">
            <Activity className="w-5 h-5 text-neon-red" />
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-mono">Salute</span>
              <span className="font-display font-bold text-white">{player.health}/{player.maxHealth}</span>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <Coins className="w-5 h-5 text-yellow-500" />
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-mono">Crediti</span>
              <span className="font-display font-bold text-white">¤{player.money}</span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-neon-blue" />
            <div className="flex flex-col">
              <span className="text-xs text-gray-500 uppercase tracking-wider font-mono">Reputazione</span>
              <span className="font-display font-bold text-white">{player.reputation}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2 bg-dark-bg px-3 py-1.5 rounded-md border border-dark-border">
            <MapPin className="w-4 h-4 text-neon-green" />
            <span className="text-sm font-medium text-gray-200">{player.district}</span>
          </div>
          <div className="flex items-center gap-2 bg-dark-bg px-3 py-1.5 rounded-md border border-dark-border">
            <Clock className="w-4 h-4 text-gray-400" />
            <span className="text-sm font-medium text-gray-200">{player.time}</span>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 flex flex-col lg:flex-row overflow-hidden">
        
        {/* Left Sidebar - Navigation & Quick Actions */}
        <aside className="w-full lg:w-64 bg-dark-surface border-r border-dark-border flex flex-col shrink-0">
          <div className="p-4 border-b border-dark-border">
            <h2 className="text-xs uppercase tracking-widest text-gray-500 font-mono mb-4">Terminale</h2>
            <nav className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0">
              <NavButton 
                active={activeTab === 'strada'} 
                onClick={() => setActiveTab('strada')} 
                icon={<Crosshair className="w-4 h-4" />} 
                label="La Strada" 
              />
              <NavButton 
                active={activeTab === 'inventario'} 
                onClick={() => setActiveTab('inventario')} 
                icon={<Package className="w-4 h-4" />} 
                label="Inventario" 
              />
              <NavButton 
                active={activeTab === 'mercato'} 
                onClick={() => setActiveTab('mercato')} 
                icon={<TrendingUp className="w-4 h-4" />} 
                label="Mercato Nero" 
              />
              <NavButton 
                active={activeTab === 'crew'} 
                onClick={() => setActiveTab('crew')} 
                icon={<Users className="w-4 h-4" />} 
                label="La tua Crew" 
              />
            </nav>
          </div>
          
          <div className="p-4 flex-1 hidden lg:block">
            <h2 className="text-xs uppercase tracking-widest text-gray-500 font-mono mb-4">Status</h2>
            <div className="space-y-4">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Carriera</span>
                  <span className="text-neon-purple font-medium">{player.career}</span>
                </div>
                <div className="h-1.5 w-full bg-dark-bg rounded-full overflow-hidden">
                  <div className="h-full bg-neon-purple w-0"></div>
                </div>
              </div>
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-gray-400">Ricercato</span>
                  <span className="text-gray-300">Basso</span>
                </div>
                <div className="h-1.5 w-full bg-dark-bg rounded-full overflow-hidden">
                  <div className="h-full bg-neon-red w-1/4"></div>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Center - Dynamic Content */}
        <section className="flex-1 flex flex-col bg-dark-bg relative overflow-hidden">
          {/* Content Area */}
          <div className="flex-1 overflow-y-auto p-4 lg:p-8">
            <AnimatePresence mode="wait">
              {activeTab === 'strada' && (
                <motion.div 
                  key="strada"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-3xl mx-auto space-y-8"
                >
                  <div className="bg-dark-surface border border-dark-border rounded-lg p-6 relative overflow-hidden">
                    <div className="absolute top-0 left-0 w-1 h-full bg-neon-green"></div>
                    <h2 className="text-2xl font-display font-bold text-white mb-2">{player.district}</h2>
                    <p className="text-gray-400 leading-relaxed">
                      Le strade sono sporche e illuminate a intermittenza dai neon sfarfallanti. 
                      Senti il rumore di sirene in lontananza. Qualcuno ti osserva da un vicolo.
                    </p>
                    
                    <div className="mt-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <ActionButton 
                        icon={<MapPin className="w-5 h-5" />} 
                        label="Spostati in un altro distretto" 
                        onClick={handleMove}
                      />
                      <ActionButton 
                        icon={<Activity className="w-5 h-5" />} 
                        label="Cerca risorse nei vicoli" 
                        onClick={handleScavenge}
                      />
                      <ActionButton 
                        icon={<FlaskConical className="w-5 h-5" />} 
                        label="Cerca un laboratorio" 
                        onClick={() => addLog("Non hai ancora trovato un laboratorio sicuro.", "warning")}
                      />
                      <ActionButton 
                        icon={<Home className="w-5 h-5" />} 
                        label="Torna al rifugio" 
                        onClick={() => addLog("Non possiedi ancora un rifugio.", "warning")}
                      />
                    </div>
                  </div>

                  {/* Nearby NPCs / Events */}
                  <div>
                    <h3 className="text-sm font-mono text-gray-500 uppercase tracking-widest mb-4">Eventi Locali</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="bg-dark-surface border border-dark-border rounded-lg p-4 flex items-start gap-4 hover:border-gray-600 transition-colors cursor-pointer">
                        <div className="p-2 bg-dark-bg rounded-md text-neon-blue">
                          <MessageSquare className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-200">Spacciatore Nervoso</h4>
                          <p className="text-sm text-gray-500 mt-1">Cerca qualcuno per piazzare della roba velocemente.</p>
                        </div>
                      </div>
                      <div className="bg-dark-surface border border-dark-border rounded-lg p-4 flex items-start gap-4 hover:border-gray-600 transition-colors cursor-pointer">
                        <div className="p-2 bg-dark-bg rounded-md text-neon-red">
                          <Skull className="w-5 h-5" />
                        </div>
                        <div>
                          <h4 className="font-medium text-gray-200">Pattuglia Corrotta</h4>
                          <p className="text-sm text-gray-500 mt-1">Stanno fermando chiunque sembri sospetto.</p>
                        </div>
                      </div>
                    </div>
                  </div>
                </motion.div>
              )}

              {activeTab === 'inventario' && (
                <motion.div 
                  key="inventario"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-3xl mx-auto"
                >
                  <h2 className="text-2xl font-display font-bold text-white mb-6">Il tuo Zaino</h2>
                  <div className="bg-dark-surface border border-dark-border rounded-lg overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-dark-bg border-b border-dark-border text-gray-500 font-mono uppercase text-xs">
                        <tr>
                          <th className="px-4 py-3 font-medium">Oggetto</th>
                          <th className="px-4 py-3 font-medium">Tipo</th>
                          <th className="px-4 py-3 font-medium text-right">Q.tà</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-border">
                        {inventory.map(item => (
                          <tr key={item.id} className="hover:bg-dark-bg/50 transition-colors">
                            <td className="px-4 py-3 font-medium text-gray-200">{item.name}</td>
                            <td className="px-4 py-3 text-gray-500">{item.type}</td>
                            <td className="px-4 py-3 text-right font-mono text-neon-blue">{item.quantity}</td>
                          </tr>
                        ))}
                        {inventory.length === 0 && (
                          <tr>
                            <td colSpan={3} className="px-4 py-8 text-center text-gray-500">
                              Inventario vuoto.
                            </td>
                          </tr>
                        )}
                      </tbody>
                    </table>
                  </div>
                </motion.div>
              )}
              
              {/* Other tabs placeholders */}
              {(activeTab === 'mercato' || activeTab === 'crew') && (
                <motion.div 
                  key="placeholder"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="max-w-3xl mx-auto flex flex-col items-center justify-center py-20 text-center"
                >
                  <Briefcase className="w-12 h-12 text-gray-600 mb-4" />
                  <h2 className="text-xl font-display font-bold text-gray-400 mb-2">Modulo Offline</h2>
                  <p className="text-gray-500 max-w-md">
                    Questa sezione del terminale non è ancora accessibile. Aumenta la tua reputazione per sbloccarla.
                  </p>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Action Log (Bottom of Center Panel) */}
          <div className="h-48 bg-dark-surface border-t border-dark-border flex flex-col shrink-0">
            <div className="px-4 py-2 border-b border-dark-border bg-dark-bg/50 flex justify-between items-center">
              <span className="text-xs uppercase tracking-widest text-gray-500 font-mono">Log di Sistema</span>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-2 font-mono text-sm">
              <AnimatePresence initial={false}>
                {logs.map((log) => (
                  <motion.div 
                    key={log.id}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className="flex gap-3"
                  >
                    <span className="text-gray-600 shrink-0">[{log.timestamp}]</span>
                    <span className={`
                      ${log.type === 'info' ? 'text-gray-300' : ''}
                      ${log.type === 'warning' ? 'text-yellow-500' : ''}
                      ${log.type === 'danger' ? 'text-neon-red' : ''}
                      ${log.type === 'success' ? 'text-neon-green' : ''}
                    `}>
                      {log.text}
                    </span>
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

// --- Helper Components ---

function NavButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`
        flex items-center gap-3 px-4 py-3 rounded-md transition-all duration-200 text-sm font-medium whitespace-nowrap
        ${active 
          ? 'bg-dark-bg text-white border border-dark-border shadow-[0_0_15px_rgba(176,38,255,0.1)]' 
          : 'text-gray-500 hover:text-gray-300 hover:bg-dark-bg/50 border border-transparent'
        }
      `}
    >
      <span className={active ? 'text-neon-purple' : ''}>{icon}</span>
      {label}
    </button>
  );
}

function ActionButton({ icon, label, onClick }: { icon: React.ReactNode, label: string, onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="group flex flex-col items-center justify-center gap-3 p-4 bg-dark-bg border border-dark-border rounded-lg hover:border-gray-500 transition-all duration-200 active:scale-[0.98]"
    >
      <div className="text-gray-400 group-hover:text-white transition-colors">
        {icon}
      </div>
      <span className="text-sm font-medium text-gray-300 group-hover:text-white text-center">
        {label}
      </span>
    </button>
  );
}
