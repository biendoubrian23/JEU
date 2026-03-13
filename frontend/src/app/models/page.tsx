"use client";

import { useState, useEffect, useMemo } from "react";
import {
  getModelCatalog,
  getEnabledModels,
  addEnabledModel,
  removeEnabledModel,
  pingOneModel,
  pingAllModels,
  getOllamaModels,
} from "@/lib/api";
import type { CatalogModel, EnabledModel, OllamaModelDetail } from "@/lib/types";

type PingResult = { ok: boolean; latency_ms: number; error: string };

type Category = "all" | "free" | "cheap" | "premium";

export default function ModelsPage() {
  const [catalog, setCatalog] = useState<{ free: CatalogModel[]; cheap: CatalogModel[]; premium: CatalogModel[] }>({ free: [], cheap: [], premium: [] });
  const [enabledIds, setEnabledIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<Category>("all");
  const [pingResults, setPingResults] = useState<Record<string, PingResult>>({});
  const [pingingId, setPingingId] = useState<string | null>(null);
  const [pingAllRunning, setPingAllRunning] = useState(false);
  const [ollamaModels, setOllamaModels] = useState<OllamaModelDetail[]>([]);
  const [ollamaAvailable, setOllamaAvailable] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [catalogData, enabledData, ollamaData] = await Promise.all([
        getModelCatalog(),
        getEnabledModels(),
        getOllamaModels(),
      ]);
      setCatalog(catalogData);
      setEnabledIds(new Set((enabledData as EnabledModel[]).map((m) => m.model_id)));
      setOllamaModels(ollamaData.models || []);
      setOllamaAvailable(ollamaData.available ?? false);
    } catch (e) {
      console.error("Erreur chargement modèles:", e);
    }
    setLoading(false);
  };

  const allModels = useMemo(() => {
    const free = (catalog.free || []).map((m) => ({ ...m, category: "free" as const }));
    const cheap = (catalog.cheap || []).map((m) => ({ ...m, category: "cheap" as const }));
    const premium = (catalog.premium || []).map((m) => ({ ...m, category: "premium" as const }));
    return [...free, ...cheap, ...premium];
  }, [catalog]);

  const filtered = useMemo(() => {
    return allModels.filter((m) => {
      if (category !== "all" && m.category !== category) return false;
      if (search) {
        const q = search.toLowerCase();
        return (
          m.name.toLowerCase().includes(q) ||
          m.model_id.toLowerCase().includes(q) ||
          m.params_info.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [allModels, category, search]);

  const stats = useMemo(() => {
    const enabledFree = allModels.filter((m) => m.category === "free" && enabledIds.has(m.model_id)).length;
    const enabledCheap = allModels.filter((m) => m.category === "cheap" && enabledIds.has(m.model_id)).length;
    const enabledPremium = allModels.filter((m) => m.category === "premium" && enabledIds.has(m.model_id)).length;
    const anyOllamaInDB = ollamaModels.some((m) => enabledIds.has(m.name));
    const enabledLocal = anyOllamaInDB
      ? ollamaModels.filter((m) => enabledIds.has(m.name)).length
      : ollamaModels.length;
    return {
      totalFree: catalog.free?.length || 0,
      totalCheap: catalog.cheap?.length || 0,
      totalPremium: catalog.premium?.length || 0,
      totalLocal: ollamaModels.length,
      enabledFree,
      enabledCheap,
      enabledPremium,
      enabledLocal,
      total: enabledFree + enabledCheap + enabledPremium + enabledLocal,
    };
  }, [allModels, enabledIds, catalog, ollamaModels]);

  const handleToggle = async (model: CatalogModel & { category: string }) => {
    const id = model.model_id;
    setToggling(id);
    try {
      if (enabledIds.has(id)) {
        await removeEnabledModel(id);
        setEnabledIds((prev) => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } else {
        await addEnabledModel({
          model_id: id,
          name: model.name,
          provider: "openrouter",
          category: model.category,
          cost: model.cost,
          context_length: model.context_length,
          params_info: model.params_info,
        });
        setEnabledIds((prev) => new Set(prev).add(id));
      }
    } catch (e) {
      console.error("Erreur toggle modèle:", e);
    }
    setToggling(null);
  };

  const enableAll = async (cat: "free" | "cheap" | "premium") => {
    const models = allModels.filter((m) => m.category === cat && !enabledIds.has(m.model_id));
    for (const model of models) {
      await addEnabledModel({
        model_id: model.model_id,
        name: model.name,
        provider: "openrouter",
        category: cat,
        cost: model.cost,
        context_length: model.context_length,
        params_info: model.params_info,
      });
    }
    setEnabledIds((prev) => {
      const next = new Set(prev);
      models.forEach((m) => next.add(m.model_id));
      return next;
    });
  };

  const disableAll = async (cat: "free" | "cheap" | "premium") => {
    const models = allModels.filter((m) => m.category === cat && enabledIds.has(m.model_id));
    for (const model of models) {
      await removeEnabledModel(model.model_id);
    }
    setEnabledIds((prev) => {
      const next = new Set(prev);
      models.forEach((m) => next.delete(m.model_id));
      return next;
    });
  };

  const ollamaHasAnyEnabled = ollamaModels.some((m) => enabledIds.has(m.name));
  const isOllamaEnabled = (name: string) => ollamaHasAnyEnabled ? enabledIds.has(name) : true;

  const handleOllamaToggle = async (om: OllamaModelDetail) => {
    const id = om.name;
    setToggling(id);
    try {
      if (!ollamaHasAnyEnabled) {
        // Première interaction : activer tous les autres, désactiver celui-ci
        for (const other of ollamaModels) {
          if (other.name !== id) {
            await addEnabledModel({ model_id: other.name, name: other.name, provider: "ollama", category: "local", cost: "Gratuit", params_info: other.size });
          }
        }
        setEnabledIds((prev) => {
          const next = new Set(prev);
          ollamaModels.forEach((other) => { if (other.name !== id) next.add(other.name); });
          return next;
        });
      } else if (enabledIds.has(id)) {
        await removeEnabledModel(id);
        setEnabledIds((prev) => { const next = new Set(prev); next.delete(id); return next; });
      } else {
        await addEnabledModel({ model_id: id, name: id, provider: "ollama", category: "local", cost: "Gratuit", params_info: om.size });
        setEnabledIds((prev) => new Set(prev).add(id));
      }
    } catch (e) {
      console.error("Erreur toggle Ollama:", e);
    }
    setToggling(null);
  };

  const ollamaEnableAll = async () => {
    for (const om of ollamaModels) {
      if (!enabledIds.has(om.name)) {
        await addEnabledModel({ model_id: om.name, name: om.name, provider: "ollama", category: "local", cost: "Gratuit", params_info: om.size });
      }
    }
    setEnabledIds((prev) => {
      const next = new Set(prev);
      ollamaModels.forEach((om) => next.add(om.name));
      return next;
    });
  };

  const ollamaDisableAll = async () => {
    for (const om of ollamaModels) {
      if (enabledIds.has(om.name) || !ollamaHasAnyEnabled) {
        await removeEnabledModel(om.name).catch(() => null);
      }
    }
    setEnabledIds((prev) => {
      const next = new Set(prev);
      ollamaModels.forEach((om) => next.delete(om.name));
      return next;
    });
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-arena-accent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestion des Modèles</h1>
        <p className="text-sm text-gray-500 mt-1">
          Activez ou désactivez les modèles OpenRouter qui apparaîtront dans la sélection des joueurs.
        </p>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
        <div className="bg-white rounded-xl border border-arena-border p-4">
          <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Modèles activés</div>
          <div className="mt-1 text-2xl font-bold text-arena-accent">{stats.total}</div>
          <div className="text-xs text-gray-400 mt-0.5">sur {stats.totalFree + stats.totalCheap + stats.totalPremium + stats.totalLocal} disponibles</div>
        </div>
        <div className="bg-white rounded-xl border border-arena-border p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Locaux</div>
            <div className="flex gap-1">
              <button onClick={ollamaEnableAll} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors">Tout</button>
              <button onClick={ollamaDisableAll} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Aucun</button>
            </div>
          </div>
          <div className="mt-1 text-2xl font-bold text-purple-600">{stats.enabledLocal}</div>
          <div className="text-xs text-gray-400 mt-0.5">sur {stats.totalLocal} installés</div>
        </div>
        <div className="bg-white rounded-xl border border-arena-border p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Gratuits</div>
            <div className="flex gap-1">
              <button onClick={() => enableAll("free")} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors">Tout</button>
              <button onClick={() => disableAll("free")} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Aucun</button>
            </div>
          </div>
          <div className="mt-1 text-2xl font-bold text-green-600">{stats.enabledFree}</div>
          <div className="text-xs text-gray-400 mt-0.5">sur {stats.totalFree} gratuits</div>
        </div>
        <div className="bg-white rounded-xl border border-arena-border p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Économiques</div>
            <div className="flex gap-1">
              <button onClick={() => enableAll("cheap")} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors">Tout</button>
              <button onClick={() => disableAll("cheap")} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Aucun</button>
            </div>
          </div>
          <div className="mt-1 text-2xl font-bold text-blue-600">{stats.enabledCheap}</div>
          <div className="text-xs text-gray-400 mt-0.5">sur {stats.totalCheap} payants économiques</div>
        </div>
        <div className="bg-white rounded-xl border border-arena-border p-4">
          <div className="flex items-center justify-between">
            <div className="text-xs font-medium text-gray-500 uppercase tracking-wide">Premium</div>
            <div className="flex gap-1">
              <button onClick={() => enableAll("premium")} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors">Tout</button>
              <button onClick={() => disableAll("premium")} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Aucun</button>
            </div>
          </div>
          <div className="mt-1 text-2xl font-bold text-amber-600">{stats.enabledPremium}</div>
          <div className="text-xs text-gray-400 mt-0.5">sur {stats.totalPremium} premium haut de gamme</div>
        </div>
      </div>

      {/* Modèles locaux — Ollama */}
      <div className="bg-white rounded-xl border border-arena-border overflow-hidden">
        <div className="px-4 py-3 bg-purple-50 border-b border-arena-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full flex-shrink-0 ${ollamaAvailable ? "bg-green-400" : "bg-red-400"}`} />
            <span className="text-sm font-semibold text-gray-800">Modèles locaux — Ollama</span>
            <span className="text-xs text-gray-500 ml-1">
              {ollamaAvailable ? `${ollamaModels.length} installé(s)` : "Non disponible"}
            </span>
          </div>
          {ollamaAvailable && ollamaModels.length > 0 && (
            <div className="flex gap-1">
              <button onClick={ollamaEnableAll} className="text-[10px] px-1.5 py-0.5 rounded bg-green-50 text-green-600 hover:bg-green-100 transition-colors">Tout activer</button>
              <button onClick={ollamaDisableAll} className="text-[10px] px-1.5 py-0.5 rounded bg-red-50 text-red-600 hover:bg-red-100 transition-colors">Tout désactiver</button>
            </div>
          )}
        </div>
        {!ollamaAvailable ? (
          <div className="px-4 py-6 text-sm text-gray-400 text-center">
            Ollama n&apos;est pas en cours d&apos;exécution. Lancez{" "}
            <code className="bg-gray-100 px-1 rounded font-mono text-xs">ollama serve</code>.
          </div>
        ) : ollamaModels.length === 0 ? (
          <div className="px-4 py-6 text-sm text-gray-400 text-center">
            Aucun modèle installé. Lancez{" "}
            <code className="bg-gray-100 px-1 rounded font-mono text-xs">ollama pull llama3.2:3b</code>.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-[1fr_100px_110px_80px] gap-4 px-4 py-3 bg-gray-50 border-b border-arena-border text-xs font-medium text-gray-500 uppercase tracking-wide">
              <div>Modèle</div>
              <div>Taille</div>
              <div className="text-center">
                <button
                  onClick={async () => {
                    setPingAllRunning(true);
                    for (const om of ollamaModels) {
                      setPingingId(om.name);
                      try {
                        const res = await pingOneModel(om.name);
                        setPingResults((prev) => ({ ...prev, [om.name]: res }));
                      } catch { /* ignore */ }
                    }
                    setPingingId(null);
                    setPingAllRunning(false);
                  }}
                  disabled={pingAllRunning}
                  className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                    pingAllRunning ? "bg-gray-200 text-gray-400 cursor-wait" : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
                  }`}
                >
                  {pingAllRunning ? "⏳..." : "🏓 Ping tout"}
                </button>
              </div>
              <div className="text-right">Actif</div>
            </div>
            <div className="divide-y divide-gray-100">
              {ollamaModels.map((om) => {
                const active = isOllamaEnabled(om.name);
                const isTogglingThis = toggling === om.name;
                const ping = pingResults[om.name];
                const isPinging = pingingId === om.name;
                return (
                  <div
                    key={om.name}
                    className={`grid grid-cols-[1fr_100px_110px_80px] gap-4 px-4 py-3 items-center transition-colors ${
                      active ? "bg-white" : "bg-gray-50/50"
                    } hover:bg-purple-50/30`}
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="inline-block w-2 h-2 rounded-full flex-shrink-0 bg-purple-400" />
                        <span className={`text-sm font-medium truncate ${active ? "text-gray-900" : "text-gray-400"}`}>
                          {om.name.includes(":") ? om.name.split(":")[0] : om.name}
                        </span>
                        {om.name.includes(":") && (
                          <span className="text-[11px] text-gray-400 flex-shrink-0">{om.name.split(":")[1]}</span>
                        )}
                      </div>
                      <div className="text-[11px] text-gray-400 truncate mt-0.5 pl-4">{om.name}</div>
                    </div>
                    <div className="text-xs font-medium text-purple-700">{om.size}</div>
                    <div className="flex justify-center">
                      <button
                        onClick={async () => {
                          setPingingId(om.name);
                          try {
                            const res = await pingOneModel(om.name);
                            setPingResults((prev) => ({ ...prev, [om.name]: res }));
                          } catch { /* ignore */ }
                          setPingingId(null);
                        }}
                        disabled={isPinging}
                        className={`text-xs px-2 py-1 rounded-lg transition-all ${
                          isPinging
                            ? "bg-gray-100 text-gray-400 cursor-wait"
                            : ping
                            ? ping.ok
                              ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                              : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                            : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                        }`}
                        title={ping?.error || (ping?.ok ? `OK en ${ping.latency_ms}ms` : "Tester ce modèle")}
                      >
                        {isPinging ? "⏳" : ping ? ping.ok ? `✅ ${ping.latency_ms}ms` : "❌ KO" : "🏓 Test"}
                      </button>
                    </div>
                    <div className="flex justify-end">
                      <button
                        onClick={() => handleOllamaToggle(om)}
                        disabled={isTogglingThis}
                        title={active ? `Désactiver ${om.name}` : `Activer ${om.name}`}
                        className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-purple-500/20 ${
                          active ? "bg-purple-500" : "bg-gray-300"
                        } ${isTogglingThis ? "opacity-50" : ""}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                            active ? "translate-x-5" : "translate-x-0"
                          }`}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Filtres */}
      <div className="flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" d="m21 21-5.197-5.197m0 0A7.5 7.5 0 1 0 5.196 5.196a7.5 7.5 0 0 0 10.607 10.607Z" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Rechercher un modèle..."
            className="w-full pl-9 pr-4 py-2 text-sm border border-arena-border rounded-lg focus:outline-none focus:ring-2 focus:ring-arena-accent/20 focus:border-arena-accent"
          />
        </div>
        <div className="flex rounded-lg border border-arena-border overflow-hidden">
          {(["all", "free", "cheap", "premium"] as Category[]).map((cat) => (
            <button
              key={cat}
              onClick={() => setCategory(cat)}
              className={`px-4 py-2 text-sm font-medium transition-colors ${
                category === cat
                  ? "bg-arena-accent text-white"
                  : "bg-white text-gray-600 hover:bg-gray-50"
              }`}
            >
              {cat === "all" ? "Tous" : cat === "free" ? "Gratuits" : cat === "cheap" ? "Économiques" : "Premium"}
            </button>
          ))}
        </div>
      </div>

      {/* Liste des modèles */}
      <div className="bg-white rounded-xl border border-arena-border overflow-hidden">
        <div className="grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_100px_110px_80px] gap-4 px-4 py-3 bg-gray-50 border-b border-arena-border text-xs font-medium text-gray-500 uppercase tracking-wide">
          <div>Modèle</div>
          <div className="hidden sm:block">Paramètres</div>
          <div className="hidden sm:block">Contexte</div>
          <div className="hidden sm:block">Coût</div>
          <div className="hidden sm:block text-center">
            <button
              onClick={async () => {
                setPingAllRunning(true);
                try {
                  const res = await pingAllModels();
                  if (res.models) setPingResults(res.models);
                } catch { /* ignore */ }
                setPingAllRunning(false);
              }}
              disabled={pingAllRunning}
              className={`text-[10px] px-2 py-0.5 rounded transition-colors ${
                pingAllRunning
                  ? "bg-gray-200 text-gray-400 cursor-wait"
                  : "bg-amber-50 text-amber-700 hover:bg-amber-100 border border-amber-200"
              }`}
              title="Tester tous les modèles"
            >
              {pingAllRunning ? "⏳..." : "🏓 Ping tout"}
            </button>
          </div>
          <div className="text-right">Actif</div>
        </div>

        <div className="divide-y divide-gray-100 max-h-[calc(100vh-480px)] overflow-y-auto">
          {filtered.map((model, index) => {
            const isEnabled = enabledIds.has(model.model_id);
            const isToggling = toggling === model.model_id;

            return (
              <div
                key={`${model.category}-${model.model_id}`}
                className={`grid grid-cols-[1fr_auto] sm:grid-cols-[1fr_120px_100px_100px_110px_80px] gap-4 px-4 py-3 items-center transition-colors ${
                  isEnabled ? "bg-white" : "bg-gray-50/50"
                } hover:bg-arena-accent/5`}
              >
                {/* Nom + provider */}
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full flex-shrink-0 ${
                        model.category === "free" ? "bg-green-400" : model.category === "premium" ? "bg-amber-400" : "bg-blue-400"
                      }`}
                    />
                    <span className={`text-sm font-medium truncate ${isEnabled ? "text-gray-900" : "text-gray-400"}`}>
                      {model.name}
                    </span>
                  </div>
                  <div className="text-[11px] text-gray-400 truncate mt-0.5 pl-4">
                    {model.model_id}
                  </div>
                </div>

                {/* Params */}
                <div className="hidden sm:block text-xs text-gray-500">
                  {model.params_info || "—"}
                </div>

                {/* Context */}
                <div className="hidden sm:block text-xs text-gray-500">
                  {model.context_length >= 1000000
                    ? `${(model.context_length / 1000000).toFixed(1)}M`
                    : model.context_length >= 1000
                    ? `${Math.round(model.context_length / 1000)}K`
                    : model.context_length}
                </div>

                {/* Cost */}
                <div className="hidden sm:block">
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium ${
                      model.category === "free"
                        ? "bg-green-50 text-green-700"
                        : model.category === "premium"
                        ? "bg-amber-50 text-amber-700"
                        : "bg-blue-50 text-blue-700"
                    }`}
                  >
                    {model.cost}
                  </span>
                </div>

                {/* Ping */}
                <div className="hidden sm:flex justify-center">
                  {(() => {
                    const ping = pingResults[model.model_id];
                    const isPinging = pingingId === model.model_id;
                    return (
                      <button
                        onClick={async () => {
                          setPingingId(model.model_id);
                          try {
                            const res = await pingOneModel(model.model_id);
                            setPingResults((prev) => ({ ...prev, [model.model_id]: res }));
                          } catch { /* ignore */ }
                          setPingingId(null);
                        }}
                        disabled={isPinging}
                        className={`text-xs px-2 py-1 rounded-lg transition-all ${
                          isPinging
                            ? "bg-gray-100 text-gray-400 cursor-wait"
                            : ping
                            ? ping.ok
                              ? "bg-green-50 text-green-700 border border-green-200 hover:bg-green-100"
                              : "bg-red-50 text-red-600 border border-red-200 hover:bg-red-100"
                            : "bg-gray-50 text-gray-500 border border-gray-200 hover:bg-gray-100"
                        }`}
                        title={ping?.error || (ping?.ok ? `OK en ${ping.latency_ms}ms` : "Tester ce modèle")}
                      >
                        {isPinging
                          ? "⏳"
                          : ping
                          ? ping.ok
                            ? `✅ ${ping.latency_ms}ms`
                            : "❌ KO"
                          : "🏓 Test"}
                      </button>
                    );
                  })()}
                </div>

                {/* Toggle */}
                <div className="flex justify-end">
                  <button
                    onClick={() => handleToggle(model)}
                    disabled={isToggling}
                    title={isEnabled ? `Désactiver ${model.name}` : `Activer ${model.name}`}
                    className={`relative w-11 h-6 rounded-full transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-arena-accent/20 ${
                      isEnabled ? "bg-arena-accent" : "bg-gray-300"
                    } ${isToggling ? "opacity-50" : ""}`}
                  >
                    <span
                      className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform duration-200 ${
                        isEnabled ? "translate-x-5" : "translate-x-0"
                      }`}
                    />
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {filtered.length === 0 && (
          <div className="px-4 py-12 text-center text-sm text-gray-400">
            Aucun modèle ne correspond à votre recherche.
          </div>
        )}
      </div>

      {/* Footer info */}
      <p className="text-xs text-gray-400 text-center">
        Les modèles activés apparaîtront dans le sélecteur de la page Partie. Les modèles Ollama locaux sont toujours disponibles.
      </p>
    </div>
  );
}
