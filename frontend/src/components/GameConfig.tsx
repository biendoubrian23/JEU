"use client";

import { useState, useEffect, useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { PlayerConfig, RecommendedModels } from "@/lib/types";
import { getOllamaModels, getRecommendedModels, getRoleDistribution, pingAllModels } from "@/lib/api";

// ─── Dropdown custom pour les modèles ─────────────────────────────────────────
interface ModelOption {
  id: string;
  provider: "ollama" | "openrouter";
  label: string;
  badge?: string;
  badgeColor?: string;
}

interface ModelGroup {
  label: string;
  models: ModelOption[];
}

function ModelSelect({
  value,
  onChange,
  groups,
  placeholder = "Choisir un modèle",
}: {
  value: string;
  onChange: (id: string, provider: "ollama" | "openrouter") => void;
  groups: ModelGroup[];
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const selected = groups.flatMap((g) => g.models).find((m) => m.id === value);

  useEffect(() => { setMounted(true); }, []);

  // Positionner le menu via DOM impératif (pas d'inline styles JSX)
  useLayoutEffect(() => {
    if (!open || !menuRef.current || !btnRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const el = menuRef.current;
    const spaceBelow = window.innerHeight - r.bottom;
    const menuH = 288;
    el.style.position = "fixed";
    el.style.left = `${r.left}px`;
    el.style.width = `${Math.max(r.width, 280)}px`;
    if (spaceBelow < menuH && r.top > menuH) {
      el.style.top = `${r.top - menuH - 4}px`;
    } else {
      el.style.top = `${r.bottom + 4}px`;
    }
  }, [open]);

  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (btnRef.current?.contains(e.target as Node)) return;
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const closeOnScroll = (e: Event) => {
      // Ne pas fermer si le scroll vient du menu lui-même
      if (menuRef.current?.contains(e.target as Node)) return;
      setOpen(false);
    };
    const closeOnResize = () => setOpen(false);
    document.addEventListener("mousedown", close);
    window.addEventListener("scroll", closeOnScroll, true);
    window.addEventListener("resize", closeOnResize);
    return () => {
      document.removeEventListener("mousedown", close);
      window.removeEventListener("scroll", closeOnScroll, true);
      window.removeEventListener("resize", closeOnResize);
    };
  }, []);

  const menu = (
    <div
      ref={menuRef}
      className="z-[9999] bg-white border border-gray-200 rounded-xl shadow-2xl overflow-hidden max-h-72 overflow-y-auto"
    >
      {groups.map((group) => (
        <div key={group.label}>
          <div className="px-3 py-1.5 text-[11px] font-semibold text-gray-400 uppercase tracking-wider bg-gray-50 border-b border-gray-100 sticky top-0">
            {group.label}
          </div>
          {group.models.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => { onChange(m.id, m.provider); setOpen(false); }}
              className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-sm text-left hover:bg-indigo-50 transition-colors ${value === m.id ? "bg-indigo-50 text-indigo-700" : "text-gray-800"}`}
            >
              <span className="truncate">{m.label}</span>
              {m.badge && (
                <span className={`shrink-0 text-xs font-medium px-2 py-0.5 rounded-full ${m.badgeColor}`}>
                  {m.badge}
                </span>
              )}
            </button>
          ))}
        </div>
      ))}
    </div>
  );

  return (
    <div className="relative w-full">
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-left hover:border-indigo-300 transition-colors"
      >
        <span className={selected ? "text-gray-900 truncate" : "text-gray-400"}>
          {selected ? selected.label : placeholder}
        </span>
        {selected?.badge && (
          <span className={`shrink-0 text-xs font-medium px-1.5 py-0.5 rounded-full ${selected.badgeColor}`}>
            {selected.badge}
          </span>
        )}
        <svg className={`shrink-0 w-4 h-4 text-gray-400 transition-transform ${open ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {mounted && open && createPortal(menu, document.body)}
    </div>
  );
}

interface GameConfigProps {
  onStart: (config: {
    players: PlayerConfig[];
    level: number;
    numGames: number;
    sessionName: string;
  }) => void;
  disabled: boolean;
}

export default function GameConfig({ onStart, disabled }: GameConfigProps) {
  const [players, setPlayers] = useState<PlayerConfig[]>([]);
  const [level, setLevel] = useState(1);
  const [numGames, setNumGames] = useState(5);
  const [sessionName, setSessionName] = useState("Session test");
  const [ollamaModels, setOllamaModels] = useState<string[]>([]);
  const [recommended, setRecommended] = useState<RecommendedModels | null>(null);
  const [roleDist, setRoleDist] = useState({ civils: 0, undercover: 0, mr_white: 0 });
  const [quickSetupModel, setQuickSetupModel] = useState("");
  const [quickSetupCount, setQuickSetupCount] = useState(6);
  const [quickSetupProvider, setQuickSetupProvider] = useState<"ollama" | "openrouter">("ollama");
  const [pinging, setPinging] = useState(false);
  const [pingResult, setPingResult] = useState<{ alive: number; dead: number } | null>(null);

  const refreshModels = () => {
    getOllamaModels().then((data) => {
      if (data.models) setOllamaModels(data.models);
    }).catch(() => {});
    getRecommendedModels().then(setRecommended).catch(() => {});
  };

  useEffect(() => {
    refreshModels();
  }, []);

  useEffect(() => {
    if (players.length >= 3) {
      getRoleDistribution(players.length).then(setRoleDist).catch(() => {});
    }
  }, [players.length]);

  const addPlayer = () => {
    const num = players.length + 1;
    setPlayers([
      ...players,
      { name: `Joueur-${num}`, model_id: "", provider: "ollama" },
    ]);
  };

  const removePlayer = (index: number) => {
    setPlayers(players.filter((_, i) => i !== index));
  };

  const updatePlayer = (index: number, field: keyof PlayerConfig, value: string) => {
    const updated = [...players];
    updated[index] = { ...updated[index], [field]: value };
    // Auto-nommer si model change
    if (field === "model_id" && value) {
      const shortName = value.split("/").pop()?.replace(":free", "") || value;
      const count = updated.filter((p, i) => i < index && p.model_id === value).length + 1;
      updated[index].name = `${shortName}-${count}`;
    }
    setPlayers(updated);
  };

  const quickSetup = () => {
    if (!quickSetupModel) return;
    const newPlayers: PlayerConfig[] = [];
    const shortName = quickSetupModel.split("/").pop()?.replace(":free", "") || quickSetupModel;
    for (let i = 0; i < quickSetupCount; i++) {
      newPlayers.push({
        name: `${shortName}-${i + 1}`,
        model_id: quickSetupModel,
        provider: quickSetupProvider,
      });
    }
    setPlayers(newPlayers);
  };

  const allModels = [
    ...ollamaModels.map((m) => ({ id: m, provider: "ollama" as const, label: `🖥️ ${m}` })),
    ...(recommended?.openrouter_free?.models || []).map((m) => ({
      id: m.id,
      provider: "openrouter" as const,
      label: `☁️ ${m.name} (Gratuit)`,
    })),
    ...(recommended?.openrouter_cheap?.models || []).map((m) => ({
      id: m.id,
      provider: "openrouter" as const,
      label: `☁️ ${m.name} (${m.cost})`,
    })),
  ];

  const ollamaGroup: ModelGroup = {
    label: "🖥️ Local — Ollama (gratuit)",
    models: ollamaModels.map((m) => ({
      id: m, provider: "ollama" as const, label: m,
      badge: "local", badgeColor: "bg-green-100 text-green-700",
    })),
  };

  const freeGroup: ModelGroup = {
    label: "☁️ OpenRouter — Gratuit",
    models: (recommended?.openrouter_free?.models || []).map((m) => ({
      id: m.id, provider: "openrouter" as const, label: m.name,
      badge: "Gratuit", badgeColor: "bg-emerald-100 text-emerald-700",
    })),
  };

  const cheapGroup: ModelGroup = {
    label: "☁️ OpenRouter — Payant",
    models: (recommended?.openrouter_cheap?.models || []).map((m) => ({
      id: m.id, provider: "openrouter" as const, label: m.name,
      badge: m.cost, badgeColor: "bg-amber-100 text-amber-700",
    })),
  };

  const ollamaGroups: ModelGroup[] = [ollamaGroup].filter((g) => g.models.length > 0);
  const openrouterGroups: ModelGroup[] = [freeGroup, cheapGroup].filter((g) => g.models.length > 0);
  const allGroups: ModelGroup[] = [...ollamaGroups, ...openrouterGroups];

  const canStart = players.length >= 3 && players.every((p) => p.model_id);

  return (
    <div className="bg-white rounded-xl border border-arena-border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">⚙️ Configuration</h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {players.length} joueur{players.length > 1 ? "s" : ""}
          </span>
          {players.length >= 3 && (
            <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
              {roleDist.civils}C / {roleDist.undercover}U / {roleDist.mr_white}MW
            </span>
          )}
        </div>
      </div>

      {/* Ping des modèles */}
      <div className="flex items-center gap-3">
        <button
          onClick={async () => {
            setPinging(true);
            setPingResult(null);
            try {
              const res = await pingAllModels();
              setPingResult({ alive: res.alive, dead: res.dead });
              refreshModels();
            } catch {
              setPingResult(null);
            } finally {
              setPinging(false);
            }
          }}
          disabled={pinging}
          className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${
            pinging
              ? "bg-gray-100 text-gray-400 cursor-wait"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
          }`}
        >
          {pinging ? "⏳ Test en cours..." : "🏓 Tester les modèles"}
        </button>
        {pingResult && (
          <span className="text-xs text-gray-500">
            ✅ {pingResult.alive} OK · ❌ {pingResult.dead} KO
          </span>
        )}
      </div>

      {/* Setup rapide */}
      <div className="bg-indigo-50 rounded-lg p-4 space-y-3">
        <h3 className="text-sm font-medium text-indigo-900">⚡ Setup rapide</h3>
        <div className="flex gap-2">
          <div className="flex-1 min-w-0">
            <ModelSelect
              value={quickSetupModel}
              onChange={(id, provider) => { setQuickSetupModel(id); setQuickSetupProvider(provider); }}
              groups={allGroups}
              placeholder="Choisir un modèle..."
            />
          </div>
          <input
            type="number"
            min={3}
            max={12}
            value={quickSetupCount}
            onChange={(e) => setQuickSetupCount(parseInt(e.target.value) || 6)}
            className="w-16 shrink-0 rounded-lg border border-indigo-200 px-2 py-2 text-sm bg-white text-center"
            title="Nombre de joueurs"
            aria-label="Nombre de joueurs"
          />
        </div>
        <button
          onClick={quickSetup}
          className="w-full bg-indigo-600 text-white rounded-lg px-4 py-2.5 text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          Créer
        </button>
      </div>

      {/* Liste des joueurs */}
      <div className="space-y-2 max-h-64 overflow-y-auto">
        {players.map((player, i) => (
          <div
            key={i}
            className="flex items-center gap-2 bg-gray-50 rounded-lg p-2 animate-fade-in"
          >
            <input
              type="text"
              value={player.name}
              onChange={(e) => updatePlayer(i, "name", e.target.value)}
              className="w-28 shrink-0 rounded border border-gray-200 px-2 py-1.5 text-sm"
              placeholder="Nom"
            />
            <div className="flex-1 min-w-0">
              <ModelSelect
                value={player.model_id}
                onChange={(id, provider) => {
                  const updated = [...players];
                  const shortName = id.split("/").pop()?.replace(":free", "") || id;
                  const count = updated.filter((p, j) => j < i && p.model_id === id).length + 1;
                  updated[i] = { ...updated[i], model_id: id, provider, name: `${shortName}-${count}` };
                  setPlayers(updated);
                }}
                groups={allGroups}
                placeholder="Choisir un modèle..."
              />
            </div>
            <button
              onClick={() => removePlayer(i)}
              className="shrink-0 text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"
            >
              ✕
            </button>
          </div>
        ))}
      </div>

      <button
        onClick={addPlayer}
        className="w-full border-2 border-dashed border-gray-300 text-gray-500 rounded-lg py-2 text-sm hover:border-arena-accent hover:text-arena-accent transition-colors"
      >
        + Ajouter un joueur
      </button>

      {/* Paramètres de session */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Niveau</label>
          <select
            value={level}
            onChange={(e) => setLevel(parseInt(e.target.value))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            title="Niveau de jeu"
            aria-label="Niveau de jeu"
          >
            <option value={1}>1 - Indépendant</option>
            <option value={2}>2 - Mémoire</option>
            <option value={3}>3 - Tendances</option>
            <option value={4}>4 - Méta-stratégie</option>
            <option value={5}>5 - Tournoi</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nb parties</label>
          <input
            type="number"
            min={1}
            max={200}
            value={numGames}
            onChange={(e) => setNumGames(parseInt(e.target.value) || 1)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            title="Nombre de parties"
            aria-label="Nombre de parties"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-600 mb-1">Nom session</label>
          <input
            type="text"
            value={sessionName}
            onChange={(e) => setSessionName(e.target.value)}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
            title="Nom de la session"
            placeholder="Nom de la session"
          />
        </div>
      </div>

      {/* Légende des niveaux */}
      <div className="text-xs text-gray-500 bg-gray-50 rounded-lg p-3 space-y-1">
        <p><strong>Niv.1</strong> : Parties indépendantes, aucune mémoire entre les jeux</p>
        <p><strong>Niv.2</strong> : Les IA connaissent les résultats des parties passées</p>
        <p><strong>Niv.3</strong> : Les IA reçoivent les tendances comportementales des adversaires</p>
        <p><strong>Niv.4</strong> : Accès complet aux statistics et classements</p>
        <p><strong>Niv.5</strong> : Mode tournoi avec matchs ciblés</p>
      </div>

      {/* Bouton Start */}
      <button
        onClick={() =>
          onStart({
            players,
            level,
            numGames,
            sessionName,
          })
        }
        disabled={!canStart || disabled}
        className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
          canStart && !disabled
            ? "bg-arena-accent text-white hover:bg-indigo-700 shadow-lg shadow-indigo-200"
            : "bg-gray-200 text-gray-400 cursor-not-allowed"
        }`}
      >
        {disabled ? "⏳ Partie en cours..." : `▶ Lancer ${numGames} partie${numGames > 1 ? "s" : ""}`}
      </button>
    </div>
  );
}
