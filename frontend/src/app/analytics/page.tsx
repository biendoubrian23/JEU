"use client";

import { useEffect, useState, useMemo } from "react";
import { getAnalytics, getSessions } from "@/lib/api";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  AreaChart,
  Area,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from "recharts";

interface PlayerData {
  name: string;
  model_id: string;
  role: string;
  survived: boolean;
  won: boolean;
  rounds_survived: number;
}

interface GameData {
  game_id: string;
  session_id: number | null;
  winner: string;
  civil_word: string;
  undercover_word: string;
  rounds_played: number;
  duration_seconds: number;
  player_count: number;
  created_at: string;
  players: PlayerData[];
}

interface ModelData {
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

interface GlobalData {
  total_games: number;
  total_models: number;
  avg_duration: number;
  avg_rounds: number;
  winners: { civil: number; undercover: number; mr_white: number };
  avg_rounds_to_catch_uc: number | null;
  avg_rounds_to_catch_mw: number | null;
}

interface SessionData {
  id: number;
  name: string;
  level: number;
  total_games: number;
  games_played: number;
  created_at: string;
}

const COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
];

const WINNER_COLORS: Record<string, string> = {
  civil: "#3b82f6",
  undercover: "#ef4444",
  mr_white: "#8b5cf6",
};

const shortName = (id: string) =>
  id.split("/").pop()?.replace(":free", "")?.substring(0, 14) || id;

export default function AnalyticsPage() {
  const [models, setModels] = useState<ModelData[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalData | null>(null);
  const [games, setGames] = useState<GameData[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);

  const loadData = async (sessionId?: number | null) => {
    setLoading(true);
    try {
      const [analytics, sessionsData] = await Promise.all([
        getAnalytics(sessionId || undefined),
        getSessions(),
      ]);
      setModels(analytics.models || []);
      setGlobalStats(analytics.global || null);
      setGames(analytics.games || []);
      setSessions(sessionsData);
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadData(selectedSession);
  }, [selectedSession]);

  const g = globalStats;

  // ── Distribution des gagnants ──
  const winnerDistribution = useMemo(() => {
    if (!g) return [];
    return [
      { name: "Civils", value: g.winners?.civil || 0 },
      { name: "Undercover", value: g.winners?.undercover || 0 },
      { name: "Mr. White", value: g.winners?.mr_white || 0 },
    ].filter((d) => d.value > 0);
  }, [g]);

  // ── Top modèles — Win Rate horizontal bar ──
  const topModelsChart = useMemo(() => {
    return models.slice(0, 10).map((m) => ({
      name: shortName(m.model_id),
      "Win Rate": m.win_rate,
      Instances: m.total_instances,
    }));
  }, [models]);

  // ── Performance par rôle — grouped bar ──
  const rolePerformance = useMemo(() => {
    return models
      .slice(0, 8)
      .map((m) => ({
        name: shortName(m.model_id),
        Civil: m.civil_wr ?? 0,
        Undercover: m.undercover_wr ?? 0,
        "Mr. White": m.mr_white_wr ?? 0,
      }));
  }, [models]);

  // ── Bluff Score comparison ──
  const bluffChart = useMemo(() => {
    return models
      .filter((m) => m.bluff_score_uc != null || m.bluff_score_mw != null)
      .map((m) => ({
        name: shortName(m.model_id),
        "Bluff UC (tours)": m.bluff_score_uc ?? 0,
        "Bluff MW (tours)": m.bluff_score_mw ?? 0,
      }));
  }, [models]);

  // ── Radar chart: top 5 modèles multidimensionnels ──
  const radarData = useMemo(() => {
    const top = models.slice(0, 5);
    if (top.length === 0) return [];
    const metrics = ["Win Rate", "Civil WR", "UC WR", "Vote Acc.", "Survie"];
    return metrics.map((metric) => {
      const entry: Record<string, string | number> = { metric };
      top.forEach((m) => {
        const name = shortName(m.model_id);
        switch (metric) {
          case "Win Rate": entry[name] = m.win_rate; break;
          case "Civil WR": entry[name] = m.civil_wr ?? 0; break;
          case "UC WR": entry[name] = m.undercover_wr ?? 0; break;
          case "Vote Acc.": entry[name] = m.vote_accuracy; break;
          case "Survie": entry[name] = Math.min(100, m.avg_survival * 20); break;
        }
      });
      return entry;
    });
  }, [models]);

  // ── Timeline ──
  const timelineData = useMemo(() => {
    const byDate: Record<string, { date: string; parties: number; totalDuration: number }> = {};
    games.forEach((game) => {
      if (!game.created_at) return;
      const date = game.created_at.split("T")[0];
      if (!byDate[date]) byDate[date] = { date, parties: 0, totalDuration: 0 };
      byDate[date].parties += 1;
      byDate[date].totalDuration += game.duration_seconds;
    });
    return Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({ ...d, duréeMoy: Math.round(d.totalDuration / d.parties) }));
  }, [games]);

  // ── Mots les plus joués ──
  const topWords = useMemo(() => {
    const counts: Record<string, number> = {};
    games.forEach((game) => {
      if (game.civil_word) counts[game.civil_word] = (counts[game.civil_word] || 0) + 1;
      if (game.undercover_word) counts[game.undercover_word] = (counts[game.undercover_word] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([word, count]) => ({ word, count }));
  }, [games]);

  // ── Vote Accuracy vs Win Rate ──
  const voteVsWin = useMemo(() => {
    return models
      .filter((m) => m.total_instances >= 2)
      .map((m) => ({
        name: shortName(m.model_id),
        "Win Rate": m.win_rate,
        "Vote Acc.": m.vote_accuracy,
      }));
  }, [models]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-arena-accent" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-[1400px] mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">📊 Analytics</h1>
          <p className="text-sm text-gray-500 mt-1">
            Analyse approfondie des performances IA
          </p>
        </div>
        <select
          value={selectedSession ?? ""}
          onChange={(e) => setSelectedSession(e.target.value ? Number(e.target.value) : null)}
          title="Filtrer par session"
          className="border border-gray-300 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-arena-accent focus:border-transparent"
        >
          <option value="">Toutes les sessions</option>
          {sessions.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} ({s.games_played} parties)
            </option>
          ))}
        </select>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-7 gap-3">
        {[
          { label: "Parties", value: g?.total_games || 0, icon: "🎮", color: "from-indigo-500 to-indigo-600" },
          { label: "Modèles", value: g?.total_models || 0, icon: "🤖", color: "from-emerald-500 to-emerald-600" },
          { label: "Durée moy.", value: `${g?.avg_duration || 0}s`, icon: "⏱️", color: "from-amber-500 to-amber-600" },
          { label: "Tours moy.", value: g?.avg_rounds || 0, icon: "🔄", color: "from-rose-500 to-rose-600" },
          { label: "👤 Civils", value: g?.winners?.civil || 0, icon: "", color: "from-blue-500 to-blue-600" },
          { label: "🕵️ UC", value: g?.winners?.undercover || 0, icon: "", color: "from-red-500 to-red-600" },
          { label: "👻 MW", value: g?.winners?.mr_white || 0, icon: "", color: "from-purple-500 to-purple-600" },
        ].map((kpi) => (
          <div key={kpi.label} className={`bg-gradient-to-br ${kpi.color} rounded-xl p-3 text-white shadow-lg`}>
            <div className="flex items-center justify-between">
              {kpi.icon && <span className="text-lg">{kpi.icon}</span>}
              <span className="text-xl font-bold ml-auto">{kpi.value}</span>
            </div>
            <p className="text-[11px] mt-1 opacity-90">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Détection speed cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white rounded-xl border border-orange-200 p-4 flex items-center gap-4">
          <span className="text-3xl">🎯</span>
          <div>
            <p className="text-xl font-bold text-orange-600">
              {g?.avg_rounds_to_catch_uc != null ? `${g.avg_rounds_to_catch_uc} tours` : "—"}
            </p>
            <p className="text-xs text-gray-500">Moyenne pour démasquer un Undercover</p>
          </div>
        </div>
        <div className="bg-white rounded-xl border border-pink-200 p-4 flex items-center gap-4">
          <span className="text-3xl">🎯</span>
          <div>
            <p className="text-xl font-bold text-pink-600">
              {g?.avg_rounds_to_catch_mw != null ? `${g.avg_rounds_to_catch_mw} tours` : "—"}
            </p>
            <p className="text-xs text-gray-500">Moyenne pour démasquer un Mr. White</p>
          </div>
        </div>
      </div>

      {/* Row 1: Win Rate + Winner Distribution */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            🏆 Win Rate par modèle
          </h3>
          {topModelsChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topModelsChart} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip formatter={(v: number, name: string) => [name === "Win Rate" ? `${v}%` : v, name]} />
                <Bar dataKey="Win Rate" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">🥧 Qui gagne ?</h3>
          {winnerDistribution.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <PieChart>
                <Pie
                  data={winnerDistribution}
                  cx="50%"
                  cy="50%"
                  innerRadius={55}
                  outerRadius={100}
                  paddingAngle={4}
                  dataKey="value"
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                  labelLine={false}
                >
                  {winnerDistribution.map((d, i) => (
                    <Cell key={i} fill={Object.values(WINNER_COLORS)[i] || COLORS[i]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Row 2: Bluff Score + Radar Chart */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            🎭 Score de Bluff (survie en tours)
          </h3>
          <p className="text-[10px] text-gray-400 mb-4">
            Combien de tours un modèle survit en tant qu&apos;imposteur (UC/MW). Plus c&apos;est haut = meilleur bluffeur.
          </p>
          {bluffChart.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={bluffChart}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Legend />
                <Bar dataKey="Bluff UC (tours)" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Bluff MW (tours)" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-1">
            🕸️ Profil multi-compétences (Top 5)
          </h3>
          <p className="text-[10px] text-gray-400 mb-4">
            Comparaison radar: Win Rate, WR Civil, WR UC, Vote Accuracy, Survie
          </p>
          {radarData.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#e5e7eb" />
                <PolarAngleAxis dataKey="metric" tick={{ fontSize: 10 }} />
                <PolarRadiusAxis domain={[0, 100]} tick={{ fontSize: 9 }} />
                {models.slice(0, 5).map((m, i) => (
                  <Radar
                    key={m.model_id}
                    name={shortName(m.model_id)}
                    dataKey={shortName(m.model_id)}
                    stroke={COLORS[i]}
                    fill={COLORS[i]}
                    fillOpacity={0.1}
                  />
                ))}
                <Legend wrapperStyle={{ fontSize: 10 }} />
                <Tooltip />
              </RadarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Row 3: Role Performance + Vote vs Win */}
      <div className="grid grid-cols-2 gap-6">
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            🎭 Win Rate par rôle (%)
          </h3>
          {rolePerformance.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={rolePerformance}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend />
                <Bar dataKey="Civil" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Undercover" fill="#ef4444" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Mr. White" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            🎯 Précision du vote vs Win Rate
          </h3>
          {voteVsWin.length > 0 ? (
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={voteVsWin}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} />
                <Tooltip formatter={(v: number) => `${v}%`} />
                <Legend />
                <Bar dataKey="Win Rate" fill="#10b981" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Vote Acc." fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Row 4: Timeline + Top Words */}
      <div className="grid grid-cols-3 gap-6">
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">📈 Activité dans le temps</h3>
          {timelineData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <AreaChart data={timelineData}>
                <defs>
                  <linearGradient id="colorParties" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#6366f1" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <Tooltip />
                <Area type="monotone" dataKey="parties" stroke="#6366f1" fillOpacity={1} fill="url(#colorParties)" />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>

        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">💬 Mots les plus joués</h3>
          {topWords.length > 0 ? (
            <div className="space-y-2 max-h-[250px] overflow-y-auto">
              {topWords.map((w, i) => (
                <div key={w.word} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                    <span className="text-sm font-medium text-gray-800">{w.word}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div
                      className="h-2 bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full"
                      style={{ width: `${Math.max(20, (w.count / topWords[0].count) * 80)}px` }}
                    />
                    <span className="text-xs text-gray-500 w-6 text-right">{w.count}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Row 5: Détail des parties avec joueurs */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          🕹️ Détail des parties ({games.length})
        </h3>
        <div className="space-y-2 max-h-[600px] overflow-y-auto">
          {games.slice(0, 30).map((game) => (
            <div key={game.game_id} className="border border-gray-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setExpandedGame(expandedGame === game.game_id ? null : game.game_id)}
                className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex items-center gap-3">
                  <span className="text-lg">
                    {game.winner === "civil" ? "👤" : game.winner === "undercover" ? "🕵️" : "👻"}
                  </span>
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      Partie #{game.game_id}
                    </p>
                    <p className="text-xs text-gray-500">
                      <span className="text-blue-600">{game.civil_word}</span>
                      {" / "}
                      <span className="text-red-600">{game.undercover_word}</span>
                      {" · "}{game.player_count} joueurs
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    game.winner === "civil" ? "bg-blue-100 text-blue-700"
                    : game.winner === "undercover" ? "bg-red-100 text-red-700"
                    : "bg-purple-100 text-purple-700"
                  }`}>{game.winner}</span>
                  <span className="text-xs text-gray-400">{game.rounds_played}t · {game.duration_seconds}s</span>
                  <span className="text-gray-400">{expandedGame === game.game_id ? "▲" : "▼"}</span>
                </div>
              </button>
              {expandedGame === game.game_id && game.players && (
                <div className="border-t border-gray-100 bg-gray-50 p-3">
                  <table className="w-full text-xs">
                    <thead>
                      <tr className="text-gray-500">
                        <th className="text-left py-1">Joueur</th>
                        <th className="text-left py-1">Modèle</th>
                        <th className="text-center py-1">Rôle</th>
                        <th className="text-center py-1">Survécu</th>
                        <th className="text-center py-1">Gagné</th>
                        <th className="text-center py-1">Tours</th>
                      </tr>
                    </thead>
                    <tbody>
                      {game.players.map((p, i) => (
                        <tr key={i} className="border-t border-gray-100">
                          <td className="py-1.5 font-medium text-gray-900">{p.name}</td>
                          <td className="py-1.5 text-gray-600">{shortName(p.model_id)}</td>
                          <td className="py-1.5 text-center">
                            <span className={`px-1.5 py-0.5 rounded-full ${
                              p.role === "civil" ? "bg-blue-100 text-blue-700"
                              : p.role === "undercover" ? "bg-red-100 text-red-700"
                              : "bg-purple-100 text-purple-700"
                            }`}>{p.role}</span>
                          </td>
                          <td className="py-1.5 text-center">{p.survived ? "✅" : "❌"}</td>
                          <td className="py-1.5 text-center">{p.won ? "🏆" : "—"}</td>
                          <td className="py-1.5 text-center text-gray-500">{p.rounds_survived}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ))}
          {games.length === 0 && (
            <p className="text-center text-gray-400 text-sm py-8">Aucune partie</p>
          )}
        </div>
      </div>
    </div>
  );
}

function EmptyState() {
  return (
    <div className="flex items-center justify-center h-[200px] text-gray-400 text-sm">
      <div className="text-center">
        <span className="text-3xl">📭</span>
        <p className="mt-2">Pas encore de données</p>
      </div>
    </div>
  );
}
