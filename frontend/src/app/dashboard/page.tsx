"use client";

import { useState, useEffect } from "react";
import { getAnalytics, getGames, getSessions, deleteGame, deleteSession } from "@/lib/api";
import { GameSummary } from "@/lib/types";

interface ModelAnalytics {
  model_id: string;
  total_instances: number;
  unique_games: number;
  wins: number;
  losses: number;
  win_rate: number;
  vote_accuracy: number;
  avg_survival: number;
  games_as_civil: number;
  wins_as_civil: number;
  civil_wr: number | null;
  games_as_undercover: number;
  wins_as_undercover: number;
  undercover_wr: number | null;
  games_as_mr_white: number;
  wins_as_mr_white: number;
  mr_white_wr: number | null;
  bluff_score_uc: number | null;
  bluff_score_mw: number | null;
  caught_at_round_uc: number | null;
  caught_at_round_mw: number | null;
}

interface GlobalAnalytics {
  total_games: number;
  total_models: number;
  avg_duration: number;
  avg_rounds: number;
  winners: { civil: number; undercover: number; mr_white: number };
  avg_rounds_to_catch_uc: number | null;
  avg_rounds_to_catch_mw: number | null;
}

const shortName = (id: string) =>
  id.split("/").pop()?.replace(":free", "")?.substring(0, 18) || id;

export default function DashboardPage() {
  const [models, setModels] = useState<ModelAnalytics[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalAnalytics | null>(null);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [analytics, gamesData, sessionsData] = await Promise.all([
        getAnalytics(),
        getGames(100),
        getSessions(),
      ]);
      setModels(analytics.models || []);
      setGlobalStats(analytics.global || null);
      setGames(gamesData);
      setSessions(sessionsData);
    } catch (e) {
      console.error("Erreur chargement données:", e);
    }
    setLoading(false);
  };

  const g = globalStats;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 Dashboard</h1>
          <p className="text-sm text-gray-500">
            Statistiques et classements des modèles IA
          </p>
        </div>
        <button
          onClick={loadData}
          className="px-3 py-1.5 bg-arena-accent text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
        >
          🔄 Refresh
        </button>
      </div>

      {/* Onglets */}
      <div className="flex gap-1 bg-gray-100 rounded-lg p-1 w-fit">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "overview"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          📈 Vue d&apos;ensemble
        </button>
        <button
          onClick={() => setActiveTab("history")}
          className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            activeTab === "history"
              ? "bg-white text-gray-900 shadow-sm"
              : "text-gray-600 hover:text-gray-900"
          }`}
        >
          📜 Historique
        </button>
      </div>

      {loading ? (
        <div className="text-center py-16 text-gray-400">
          <div className="animate-spin text-4xl mb-3">⏳</div>
          <p className="text-sm">Chargement des données...</p>
        </div>
      ) : activeTab === "overview" ? (
        <>
          {/* KPIs row 1 */}
          <div className="grid grid-cols-4 gap-4">
            <div className="bg-white rounded-xl border border-arena-border p-4 text-center card-hover">
              <p className="text-2xl font-bold text-gray-900">{g?.total_games || 0}</p>
              <p className="text-xs text-gray-500">Parties jouées</p>
            </div>
            <div className="bg-white rounded-xl border border-arena-border p-4 text-center card-hover">
              <p className="text-2xl font-bold text-gray-900">{g?.total_models || 0}</p>
              <p className="text-xs text-gray-500">Modèles testés</p>
            </div>
            <div className="bg-white rounded-xl border border-arena-border p-4 text-center card-hover">
              <p className="text-2xl font-bold text-gray-900">{g?.avg_duration || 0}s</p>
              <p className="text-xs text-gray-500">Durée moyenne</p>
            </div>
            <div className="bg-white rounded-xl border border-arena-border p-4 text-center card-hover">
              <p className="text-2xl font-bold text-gray-900">{g?.avg_rounds || 0}</p>
              <p className="text-xs text-gray-500">Tours moyens</p>
            </div>
          </div>

          {/* KPIs row 2 — victoires + détection */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border border-blue-200 p-3 text-center card-hover">
              <p className="text-xl font-bold text-blue-600">{g?.winners?.civil || 0}</p>
              <p className="text-[10px] text-gray-500">👤 Victoires Civils</p>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-3 text-center card-hover">
              <p className="text-xl font-bold text-red-600">{g?.winners?.undercover || 0}</p>
              <p className="text-[10px] text-gray-500">🕵️ Victoires UC</p>
            </div>
            <div className="bg-white rounded-xl border border-purple-200 p-3 text-center card-hover">
              <p className="text-xl font-bold text-purple-600">{g?.winners?.mr_white || 0}</p>
              <p className="text-[10px] text-gray-500">👻 Victoires MW</p>
            </div>
            <div className="bg-white rounded-xl border border-orange-200 p-3 text-center card-hover">
              <p className="text-xl font-bold text-orange-600">
                {g?.avg_rounds_to_catch_uc != null ? `${g.avg_rounds_to_catch_uc}t` : "—"}
              </p>
              <p className="text-[10px] text-gray-500">🎯 Tours pour attraper UC</p>
            </div>
            <div className="bg-white rounded-xl border border-pink-200 p-3 text-center card-hover">
              <p className="text-xl font-bold text-pink-600">
                {g?.avg_rounds_to_catch_mw != null ? `${g.avg_rounds_to_catch_mw}t` : "—"}
              </p>
              <p className="text-[10px] text-gray-500">🎯 Tours pour attraper MW</p>
            </div>
          </div>

          {/* Classement des modèles */}
          <div className="bg-white rounded-xl border border-arena-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-gray-900">
                🏅 Classement des modèles
              </h3>
              {models.some((m) => m.total_instances > m.unique_games) && (
                <span className="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
                  💡 Instances = même modèle joué par plusieurs joueurs
                </span>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-2 text-gray-500 font-medium text-xs">#</th>
                    <th className="text-left py-2 px-2 text-gray-500 font-medium text-xs">Modèle</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium text-xs" title="Nombre d'instances jouées">Inst.</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium text-xs">Win Rate</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium text-xs" title="Win rate en tant que Civil">👤 Civil</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium text-xs" title="Win rate en tant qu Undercover">🕵️ UC</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium text-xs" title="Win rate en tant que Mr. White">👻 MW</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium text-xs" title="Score de bluff: tours moyens de survie en tant qu UC">🎭 Bluff</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium text-xs" title="Précision du vote">🎯 Vote</th>
                    <th className="text-center py-2 px-2 text-gray-500 font-medium text-xs" title="Survie moyenne en tours">❤️ Survie</th>
                  </tr>
                </thead>
                <tbody>
                  {models.map((m, i) => (
                    <tr
                      key={m.model_id}
                      className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                    >
                      <td className="py-2.5 px-2 font-bold text-gray-400">
                        {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                      </td>
                      <td className="py-2.5 px-2">
                        <p className="font-medium text-gray-900 text-xs">{shortName(m.model_id)}</p>
                        <p className="text-[10px] text-gray-400">
                          {m.wins}V / {m.losses}D
                        </p>
                      </td>
                      <td className="py-2.5 px-2 text-center text-gray-500 text-xs">
                        {m.total_instances}
                        {m.total_instances > m.unique_games && (
                          <span className="text-[9px] text-orange-500 block">
                            ({m.unique_games} parties)
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                            m.win_rate >= 50
                              ? "bg-green-100 text-green-700"
                              : m.win_rate >= 30
                              ? "bg-yellow-100 text-yellow-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {m.win_rate}%
                        </span>
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-blue-600">
                        {m.civil_wr != null ? `${m.civil_wr}%` : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-red-600">
                        {m.undercover_wr != null ? `${m.undercover_wr}%` : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-purple-600">
                        {m.mr_white_wr != null ? `${m.mr_white_wr}%` : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs">
                        {m.bluff_score_uc != null ? (
                          <span className="text-orange-600 font-medium">
                            {m.bluff_score_uc}t
                          </span>
                        ) : (
                          <span className="text-gray-300">—</span>
                        )}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-emerald-600">
                        {m.vote_accuracy > 0 ? `${m.vote_accuracy}%` : "—"}
                      </td>
                      <td className="py-2.5 px-2 text-center text-xs text-gray-600">
                        {m.avg_survival}t
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {models.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">
                Aucune statistique disponible. Jouez des parties !
              </p>
            )}
          </div>

          {/* Légende */}
          <div className="bg-gray-50 rounded-lg p-3 text-[10px] text-gray-500 grid grid-cols-3 gap-2">
            <p><strong>🎭 Bluff</strong> — Tours moyens de survie en tant qu&apos;Undercover. Plus élevé = meilleur bluffeur.</p>
            <p><strong>🎯 Vote</strong> — % de votes correctement dirigés contre les imposteurs (UC + MW).</p>
            <p><strong>Inst.</strong> — Quand un même modèle a plusieurs joueurs, chaque joueur = 1 instance.</p>
          </div>
        </>
      ) : (
        /* Onglet Historique */
        <div className="space-y-4">
          {sessions.length > 0 && (
            <div className="bg-white rounded-xl border border-arena-border p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">📁 Sessions</h3>
              <div className="grid grid-cols-3 gap-3">
                {sessions.map((s) => (
                  <div key={s.id} className="bg-gray-50 rounded-lg p-3 card-hover group relative">
                    <button
                      title={`Supprimer la session "${s.name}"`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Supprimer la session "${s.name}" et toutes ses ${s.games_played} parties ?`)) return;
                        setDeleting(`s-${s.id}`);
                        try { await deleteSession(s.id); await loadData(); } catch (err) { console.error(err); }
                        setDeleting(null);
                      }}
                      disabled={deleting === `s-${s.id}`}
                      className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 p-1 rounded-md hover:bg-red-100 text-gray-400 hover:text-red-600 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                    <p className="font-medium text-sm text-gray-900">{s.name}</p>
                    <div className="flex items-center gap-3 mt-1 text-xs text-gray-500">
                      <span>Niv. {s.level}</span>
                      <span>{s.games_played}/{s.total_games} parties</span>
                    </div>
                    {s.created_at && (
                      <p className="text-[10px] text-gray-400 mt-1">
                        {new Date(s.created_at).toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric" })}
                        {" à "}
                        {new Date(s.created_at).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="bg-white rounded-xl border border-arena-border p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              📜 Historique des parties ({games.length})
            </h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {games.map((g) => (
                <div key={g.game_id} className="flex items-center justify-between bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors group">
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {g.winner === "civil" ? "👤" : g.winner === "undercover" ? "🕵️" : "👻"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">Partie #{g.game_id}</p>
                      <p className="text-xs text-gray-500">{g.civil_word} / {g.undercover_word} · {g.player_count} joueurs</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                        g.winner === "civil" ? "bg-blue-100 text-blue-700" : g.winner === "undercover" ? "bg-red-100 text-red-700" : "bg-purple-100 text-purple-700"
                      }`}>{g.winner}</span>
                      <p className="text-xs text-gray-400 mt-0.5">{g.rounds_played} tours · {g.duration_seconds}s</p>
                    </div>
                    <button
                      title={`Supprimer la partie #${g.game_id}`}
                      onClick={async () => {
                        if (!confirm(`Supprimer la partie #${g.game_id} ?`)) return;
                        setDeleting(g.game_id);
                        try { await deleteGame(g.game_id); await loadData(); } catch (err) { console.error(err); }
                        setDeleting(null);
                      }}
                      disabled={deleting === g.game_id}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded-md hover:bg-red-100 text-gray-400 hover:text-red-600 transition-all"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" d="m14.74 9-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 0 1-2.244 2.077H8.084a2.25 2.25 0 0 1-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 0 0-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 0 1 3.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 0 0-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 0 0-7.5 0" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              {games.length === 0 && (
                <p className="text-center text-gray-400 text-sm py-8">Aucune partie dans l&apos;historique</p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
