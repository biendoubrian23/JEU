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
  onStartExperiment?: (config: {
    target: PlayerConfig;
    opponents: PlayerConfig[];
    gamesAsUc: number;
    gamesAsMw: number;
    level: number;
    sessionName: string;
  }) => void;
  disabled: boolean;
}

export default function GameConfig({ onStart, onStartExperiment, disabled }: GameConfigProps) {
  const [mode, setMode] = useState<"normal" | "experiment">("normal");
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

  // Experiment mode state
  const [expTarget, setExpTarget] = useState<PlayerConfig>({ name: "Cible", model_id: "", provider: "ollama" });
  const [expOpponents, setExpOpponents] = useState<PlayerConfig[]>([]);
  const [expGamesUc, setExpGamesUc] = useState(100);
  const [expGamesMw, setExpGamesMw] = useState(100);
  const [expQuickModel, setExpQuickModel] = useState("");
  const [expQuickProvider, setExpQuickProvider] = useState<"ollama" | "openrouter">("ollama");
  const [expQuickCount, setExpQuickCount] = useState(5);

  const refreshModels = () => {
    getOllamaModels().then((data) => {
      if (data.models) {
        // models peut être string[] ou {name, size, size_bytes}[]
        const names = data.models.map((m: string | { name: string }) =>
          typeof m === "string" ? m : m.name
        );
        setOllamaModels(names);
      }
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
    ...(recommended?.openrouter_premium?.models || []).map((m) => ({
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

  const premiumGroup: ModelGroup = {
    label: "💎 OpenRouter — Premium",
    models: (recommended?.openrouter_premium?.models || []).map((m) => ({
      id: m.id, provider: "openrouter" as const, label: m.name,
      badge: m.cost, badgeColor: "bg-red-100 text-red-700",
    })),
  };

  const ollamaGroups: ModelGroup[] = [ollamaGroup].filter((g) => g.models.length > 0);
  const openrouterGroups: ModelGroup[] = [freeGroup, cheapGroup, premiumGroup].filter((g) => g.models.length > 0);
  const allGroups: ModelGroup[] = [...ollamaGroups, ...openrouterGroups];

  const canStart = players.length >= 3 && players.every((p) => p.model_id);
  const canStartExp = expTarget.model_id && expOpponents.length >= 2 && expOpponents.every((p) => p.model_id) && (expGamesUc > 0 || expGamesMw > 0);

  const addExpOpponent = () => {
    const num = expOpponents.length + 1;
    setExpOpponents([...expOpponents, { name: `Adversaire-${num}`, model_id: "", provider: "ollama" }]);
  };

  const expQuickSetup = () => {
    if (!expQuickModel) return;
    const shortName = expQuickModel.split("/").pop()?.replace(":free", "") || expQuickModel;
    const opponents: PlayerConfig[] = [];
    for (let i = 0; i < expQuickCount; i++) {
      opponents.push({ name: `${shortName}-${i + 1}`, model_id: expQuickModel, provider: expQuickProvider });
    }
    setExpOpponents(opponents);
  };

  return (
    <div className="bg-white rounded-xl border border-arena-border p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">⚙️ Configuration</h2>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex bg-gray-100 rounded-lg p-0.5">
            <button
              onClick={() => setMode("normal")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === "normal" ? "bg-white text-gray-900 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              🎮 Partie libre
            </button>
            <button
              onClick={() => setMode("experiment")}
              className={`px-3 py-1 text-xs font-medium rounded-md transition-colors ${
                mode === "experiment" ? "bg-white text-indigo-700 shadow-sm" : "text-gray-500 hover:text-gray-700"
              }`}
            >
              🧪 Expérience
            </button>
          </div>
          {mode === "normal" && (
            <span className="text-xs text-gray-500">
              {players.length} joueur{players.length > 1 ? "s" : ""}
              {players.length >= 3 && (
                <span className="ml-1 bg-gray-100 px-1.5 py-0.5 rounded">
                  {roleDist.civils}C / {roleDist.undercover}U / {roleDist.mr_white}MW
                </span>
              )}
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

      {mode === "normal" ? (
        /* ── MODE NORMAL ── */
        <>
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
        </>
      ) : (
        /* ── MODE EXPÉRIENCE ── */
        <>
          <div className="bg-purple-50 rounded-lg p-4 space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-lg">🧪</span>
              <div>
                <h3 className="text-sm font-semibold text-purple-900">Mode Expérience</h3>
                <p className="text-[10px] text-purple-600">
                  Force un modèle dans un rôle spécifique pour accumuler des statistiques ciblées
                </p>
              </div>
            </div>

            {/* Modèle cible */}
            <div>
              <label className="block text-xs font-medium text-purple-800 mb-1">🎯 Modèle cible à étudier</label>
              <ModelSelect
                value={expTarget.model_id}
                onChange={(id, provider) => {
                  const shortName = id.split("/").pop()?.replace(":free", "") || id;
                  setExpTarget({ name: `⭐${shortName}`, model_id: id, provider });
                }}
                groups={allGroups}
                placeholder="Choisir le modèle cible..."
              />
            </div>

            {/* Nombre de parties par rôle */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-red-700 mb-1">🕵️ Parties en Undercover</label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={expGamesUc}
                  onChange={(e) => setExpGamesUc(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-red-200 px-3 py-2 text-sm bg-white"
                  title="Nombre de parties en tant qu'Undercover"
                  aria-label="Parties en tant qu'Undercover"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-purple-700 mb-1">👻 Parties en Mr. White</label>
                <input
                  type="number"
                  min={0}
                  max={500}
                  value={expGamesMw}
                  onChange={(e) => setExpGamesMw(parseInt(e.target.value) || 0)}
                  className="w-full rounded-lg border border-purple-200 px-3 py-2 text-sm bg-white"
                  title="Nombre de parties en tant que Mr. White"
                  aria-label="Parties en tant que Mr. White"
                />
              </div>
            </div>
          </div>

          {/* Adversaires */}
          <div className="space-y-3">
            <h3 className="text-sm font-medium text-gray-700">👥 Adversaires ({expOpponents.length})</h3>

            {/* Setup rapide adversaires */}
            <div className="bg-gray-50 rounded-lg p-3 space-y-2">
              <div className="flex gap-2">
                <div className="flex-1 min-w-0">
                  <ModelSelect
                    value={expQuickModel}
                    onChange={(id, provider) => { setExpQuickModel(id); setExpQuickProvider(provider); }}
                    groups={allGroups}
                    placeholder="Modèle adversaire..."
                  />
                </div>
                <input
                  type="number"
                  min={2}
                  max={12}
                  value={expQuickCount}
                  onChange={(e) => setExpQuickCount(parseInt(e.target.value) || 5)}
                  className="w-16 shrink-0 rounded-lg border border-gray-200 px-2 py-2 text-sm bg-white text-center"
                  title="Nombre d'adversaires"
                  aria-label="Nombre d'adversaires"
                />
              </div>
              <button
                onClick={expQuickSetup}
                className="w-full bg-gray-600 text-white rounded-lg px-3 py-2 text-xs font-medium hover:bg-gray-700 transition-colors"
              >
                Créer adversaires
              </button>
            </div>

            {/* Liste adversaires */}
            <div className="space-y-2 max-h-48 overflow-y-auto">
              {expOpponents.map((opp, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 rounded-lg p-2">
                  <input
                    type="text"
                    value={opp.name}
                    onChange={(e) => {
                      const updated = [...expOpponents];
                      updated[i] = { ...updated[i], name: e.target.value };
                      setExpOpponents(updated);
                    }}
                    className="w-28 shrink-0 rounded border border-gray-200 px-2 py-1.5 text-sm"
                    placeholder="Nom"
                  />
                  <div className="flex-1 min-w-0">
                    <ModelSelect
                      value={opp.model_id}
                      onChange={(id, provider) => {
                        const updated = [...expOpponents];
                        const shortName = id.split("/").pop()?.replace(":free", "") || id;
                        const count = updated.filter((p, j) => j < i && p.model_id === id).length + 1;
                        updated[i] = { ...updated[i], model_id: id, provider, name: `${shortName}-${count}` };
                        setExpOpponents(updated);
                      }}
                      groups={allGroups}
                      placeholder="Modèle..."
                    />
                  </div>
                  <button
                    onClick={() => setExpOpponents(expOpponents.filter((_, j) => j !== i))}
                    className="shrink-0 text-red-400 hover:text-red-600 p-1 hover:bg-red-50 rounded transition-colors"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
            <button
              onClick={addExpOpponent}
              className="w-full border-2 border-dashed border-gray-300 text-gray-500 rounded-lg py-1.5 text-xs hover:border-purple-400 hover:text-purple-500 transition-colors"
            >
              + Ajouter un adversaire
            </button>
          </div>

          {/* Paramètres */}
          <div className="grid grid-cols-2 gap-4">
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
              <label className="block text-xs font-medium text-gray-600 mb-1">Nom session</label>
              <input
                type="text"
                value={sessionName}
                onChange={(e) => setSessionName(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                title="Nom de la session"
                placeholder="Exp. GPT-4o vs Llama"
              />
            </div>
          </div>

          {/* Résumé */}
          {expTarget.model_id && (
            <div className="bg-indigo-50 rounded-lg p-3 text-xs text-indigo-800">
              <p className="font-medium">📋 Résumé de l&apos;expérience :</p>
              <p className="mt-1">
                <strong>{expTarget.model_id.split("/").pop()}</strong> jouera{" "}
                {expGamesUc > 0 && <span className="text-red-700">{expGamesUc}× en Undercover</span>}
                {expGamesUc > 0 && expGamesMw > 0 && " + "}
                {expGamesMw > 0 && <span className="text-purple-700">{expGamesMw}× en Mr. White</span>}
                {" "}contre {expOpponents.length} adversaire{expOpponents.length > 1 ? "s" : ""}
                {" "}= <strong>{expGamesUc + expGamesMw} parties</strong> au total.
              </p>
            </div>
          )}

          {/* Bouton Start Expérience */}
          <button
            onClick={() =>
              onStartExperiment?.({
                target: expTarget,
                opponents: expOpponents,
                gamesAsUc: expGamesUc,
                gamesAsMw: expGamesMw,
                level,
                sessionName,
              })
            }
            disabled={!canStartExp || disabled}
            className={`w-full py-3 rounded-xl text-sm font-bold transition-all ${
              canStartExp && !disabled
                ? "bg-purple-600 text-white hover:bg-purple-700 shadow-lg shadow-purple-200"
                : "bg-gray-200 text-gray-400 cursor-not-allowed"
            }`}
          >
            {disabled ? "⏳ Expérience en cours..." : `🧪 Lancer l'expérience (${expGamesUc + expGamesMw} parties)`}
          </button>
        </>
      )}
    </div>
  );
}
