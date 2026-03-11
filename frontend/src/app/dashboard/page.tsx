"use client";

import { useState, useEffect } from "react";
import { getRankings, getGames, getSessions, getStats, deleteGame, deleteSession } from "@/lib/api";
import { ModelStats, GameSummary } from "@/lib/types";
import StatsCharts from "@/components/StatsCharts";

export default function DashboardPage() {
  const [stats, setStats] = useState<ModelStats[]>([]);
  const [games, setGames] = useState<GameSummary[]>([]);
  const [sessions, setSessions] = useState<any[]>([]);
  const [selectedLevel, setSelectedLevel] = useState(0);
  const [activeTab, setActiveTab] = useState<"overview" | "history">("overview");
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [selectedLevel]);

  const loadData = async () => {
    setLoading(true);
    try {
      const [statsData, gamesData, sessionsData] = await Promise.all([
        getStats(selectedLevel),
        getGames(100),
        getSessions(),
      ]);
      setStats(statsData);
      setGames(gamesData);
      setSessions(sessionsData);
    } catch (e) {
      console.error("Erreur chargement données:", e);
    }
    setLoading(false);
  };

  // Calcul des KPIs globaux
  const totalGames = games.length;
  const avgDuration = games.length > 0
    ? Math.round(games.reduce((s, g) => s + g.duration_seconds, 0) / games.length)
    : 0;
  const civilWins = games.filter((g) => g.winner === "civil").length;
  const ucWins = games.filter((g) => g.winner === "undercover").length;
  const mwWins = games.filter((g) => g.winner === "mr_white").length;

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
        <div className="flex items-center gap-3">
          <select
            value={selectedLevel}
            onChange={(e) => setSelectedLevel(parseInt(e.target.value))}
            className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm"
            title="Filtrer par niveau"
            aria-label="Filtrer par niveau"
          >
            <option value={0}>Tous les niveaux</option>
            <option value={1}>Niveau 1 - Indépendant</option>
            <option value={2}>Niveau 2 - Mémoire</option>
            <option value={3}>Niveau 3 - Tendances</option>
            <option value={4}>Niveau 4 - Méta</option>
            <option value={5}>Niveau 5 - Tournoi</option>
          </select>
          <button
            onClick={loadData}
            className="px-3 py-1.5 bg-arena-accent text-white rounded-lg text-sm font-medium hover:bg-indigo-700 transition-colors"
          >
            🔄 Refresh
          </button>
        </div>
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
          {/* KPIs */}
          <div className="grid grid-cols-5 gap-4">
            <div className="bg-white rounded-xl border border-arena-border p-4 text-center card-hover">
              <p className="text-2xl font-bold text-gray-900">{totalGames}</p>
              <p className="text-xs text-gray-500">Parties jouées</p>
            </div>
            <div className="bg-white rounded-xl border border-arena-border p-4 text-center card-hover">
              <p className="text-2xl font-bold text-gray-900">{avgDuration}s</p>
              <p className="text-xs text-gray-500">Durée moyenne</p>
            </div>
            <div className="bg-white rounded-xl border border-blue-200 p-4 text-center card-hover">
              <p className="text-2xl font-bold text-blue-600">{civilWins}</p>
              <p className="text-xs text-gray-500">Victoires Civils</p>
            </div>
            <div className="bg-white rounded-xl border border-red-200 p-4 text-center card-hover">
              <p className="text-2xl font-bold text-red-600">{ucWins}</p>
              <p className="text-xs text-gray-500">Victoires Undercover</p>
            </div>
            <div className="bg-white rounded-xl border border-purple-200 p-4 text-center card-hover">
              <p className="text-2xl font-bold text-purple-600">{mwWins}</p>
              <p className="text-xs text-gray-500">Victoires Mr. White</p>
            </div>
          </div>

          {/* Classement */}
          <div className="bg-white rounded-xl border border-arena-border p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-4">
              🏅 Classement des modèles
            </h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">#</th>
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Modèle</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Parties</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Victoires</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Taux V.</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Civil</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">UC</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">MW</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Précision</th>
                    <th className="text-center py-2 px-3 text-gray-500 font-medium">Survie moy.</th>
                  </tr>
                </thead>
                <tbody>
                  {stats
                    .sort((a, b) => b.win_rate - a.win_rate)
                    .map((s, i) => (
                      <tr
                        key={s.model_id}
                        className="border-b border-gray-50 hover:bg-gray-50 transition-colors"
                      >
                        <td className="py-2.5 px-3 font-bold text-gray-400">
                          {i === 0 ? "🥇" : i === 1 ? "🥈" : i === 2 ? "🥉" : i + 1}
                        </td>
                        <td className="py-2.5 px-3 font-medium text-gray-900">
                          {s.model_id.split("/").pop()?.replace(":free", "") || s.model_id}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-600">{s.total_games}</td>
                        <td className="py-2.5 px-3 text-center font-medium text-green-600">{s.wins}</td>
                        <td className="py-2.5 px-3 text-center">
                          <span
                            className={`px-2 py-0.5 rounded-full text-xs font-bold ${
                              s.win_rate >= 60
                                ? "bg-green-100 text-green-700"
                                : s.win_rate >= 40
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }`}
                          >
                            {s.win_rate}%
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center text-blue-600">
                          {s.games_as_civil > 0
                            ? `${Math.round((s.wins_as_civil / s.games_as_civil) * 100)}%`
                            : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-center text-red-600">
                          {s.games_as_undercover > 0
                            ? `${Math.round((s.wins_as_undercover / s.games_as_undercover) * 100)}%`
                            : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-center text-purple-600">
                          {s.games_as_mr_white > 0
                            ? `${Math.round((s.wins_as_mr_white / s.games_as_mr_white) * 100)}%`
                            : "-"}
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-600">
                          {s.vote_accuracy}%
                        </td>
                        <td className="py-2.5 px-3 text-center text-gray-600">
                          {s.avg_rounds_survived}
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
            {stats.length === 0 && (
              <p className="text-center text-gray-400 text-sm py-8">
                Aucune statistique disponible. Jouez des parties !
              </p>
            )}
          </div>

          {/* Graphiques */}
          <StatsCharts stats={stats} />
        </>
      ) : (
        /* Onglet Historique */
        <div className="space-y-4">
          {/* Sessions */}
          {sessions.length > 0 && (
            <div className="bg-white rounded-xl border border-arena-border p-5">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">📁 Sessions</h3>
              <div className="grid grid-cols-3 gap-3">
                {sessions.map((s) => (
                  <div
                    key={s.id}
                    className="bg-gray-50 rounded-lg p-3 card-hover group relative"
                  >
                    <button
                      title={`Supprimer la session "${s.name}"`}
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (!confirm(`Supprimer la session "${s.name}" et toutes ses ${s.games_played} parties ?`)) return;
                        setDeleting(`s-${s.id}`);
                        try {
                          await deleteSession(s.id);
                          await loadData();
                        } catch (err) {
                          console.error(err);
                        }
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
                      <span>
                        {s.games_played}/{s.total_games} parties
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Liste des parties */}
          <div className="bg-white rounded-xl border border-arena-border p-5">
            <h3 className="text-sm font-semibold text-gray-900 mb-3">
              📜 Historique des parties ({games.length})
            </h3>
            <div className="space-y-2 max-h-[600px] overflow-y-auto">
              {games.map((g) => (
                <div
                  key={g.game_id}
                  className="flex items-center justify-between bg-gray-50 rounded-lg p-3 hover:bg-gray-100 transition-colors group"
                >
                  <div className="flex items-center gap-3">
                    <span className="text-lg">
                      {g.winner === "civil"
                        ? "👤"
                        : g.winner === "undercover"
                        ? "🕵️"
                        : "👻"}
                    </span>
                    <div>
                      <p className="text-sm font-medium text-gray-900">
                        Partie #{g.game_id}
                      </p>
                      <p className="text-xs text-gray-500">
                        {g.civil_word} / {g.undercover_word} · {g.player_count} joueurs
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="text-right">
                      <span
                        className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                          g.winner === "civil"
                            ? "bg-blue-100 text-blue-700"
                            : g.winner === "undercover"
                            ? "bg-red-100 text-red-700"
                            : "bg-purple-100 text-purple-700"
                        }`}
                      >
                        {g.winner}
                      </span>
                      <p className="text-xs text-gray-400 mt-0.5">
                        {g.rounds_played} tours · {g.duration_seconds}s
                      </p>
                    </div>
                    <button
                      title={`Supprimer la partie #${g.game_id}`}
                      onClick={async () => {
                        if (!confirm(`Supprimer la partie #${g.game_id} ?`)) return;
                        setDeleting(g.game_id);
                        try {
                          await deleteGame(g.game_id);
                          await loadData();
                        } catch (err) {
                          console.error(err);
                        }
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
                <p className="text-center text-gray-400 text-sm py-8">
                  Aucune partie dans l&apos;historique
                </p>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
