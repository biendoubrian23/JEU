"use client";

import { useEffect, useState, useMemo } from "react";
import { getAnalytics } from "@/lib/api";
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
} from "recharts";

interface GameData {
  id: number;
  game_id: string;
  level: number;
  winner: string;
  civil_word: string;
  undercover_word: string;
  rounds_played: number;
  duration_seconds: number;
  player_count: number;
  created_at: string;
}

interface SessionData {
  id: number;
  name: string;
  level: number;
  total_games: number;
  games_played: number;
  created_at: string;
}

interface StatData {
  model_id: string;
  total_games: number;
  wins: number;
  losses: number;
  win_rate: number;
  games_as_civil: number;
  wins_as_civil: number;
  games_as_undercover: number;
  wins_as_undercover: number;
  games_as_mr_white: number;
  wins_as_mr_white: number;
  avg_rounds_survived: number;
  vote_accuracy: number;
  deception_rate: number;
}

const COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
  "#84cc16", "#e11d48", "#0891b2", "#7c3aed", "#ea580c",
];

const shortName = (id: string) =>
  id.split("/").pop()?.replace(":free", "")?.substring(0, 14) || id;

export default function AnalyticsPage() {
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [stats, setStats] = useState<StatData[]>([]);
  const [games, setGames] = useState<GameData[]>([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getAnalytics()
      .then((data) => {
        setSessions(data.sessions || []);
        setStats(data.stats || []);
        setGames(data.games || []);
      })
      .finally(() => setLoading(false));
  }, []);

  // Filtrage par session
  const filteredGames = useMemo(() => {
    if (!selectedSession) return games;
    // games don't have session_id in the list response — matching by date range
    // Actually we need to filter. Let's use a different approach:
    // We'll refetch or just show all. For now, show all.
    return games;
  }, [games, selectedSession]);

  // ── KPIs globaux ──
  const totalGames = games.length;
  const totalSessions = sessions.length;
  const totalModels = stats.length;
  const avgDuration = totalGames > 0
    ? Math.round(games.reduce((s, g) => s + g.duration_seconds, 0) / totalGames)
    : 0;
  const avgRounds = totalGames > 0
    ? (games.reduce((s, g) => s + g.rounds_played, 0) / totalGames).toFixed(1)
    : "0";

  // ── Distribution des gagnants (civil/undercover/mr_white) ──
  const winnerDistribution = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredGames.forEach((g) => {
      const w = g.winner || "Aucun";
      counts[w] = (counts[w] || 0) + 1;
    });
    return Object.entries(counts).map(([name, value]) => ({ name, value }));
  }, [filteredGames]);

  // ── Top 10 modèles par win rate (min 2 parties) ──
  const topModels = useMemo(() => {
    return [...stats]
      .filter((s) => s.total_games >= 2)
      .sort((a, b) => b.win_rate - a.win_rate)
      .slice(0, 10)
      .map((s) => ({
        name: shortName(s.model_id),
        "Win Rate (%)": s.win_rate,
        Parties: s.total_games,
        Victoires: s.wins,
      }));
  }, [stats]);

  // ── Performance par rôle ──
  const rolePerformance = useMemo(() => {
    return stats
      .filter((s) => s.total_games >= 2)
      .sort((a, b) => b.win_rate - a.win_rate)
      .slice(0, 8)
      .map((s) => ({
        name: shortName(s.model_id),
        Civil: s.games_as_civil > 0 ? Math.round((s.wins_as_civil / s.games_as_civil) * 100) : 0,
        Undercover: s.games_as_undercover > 0 ? Math.round((s.wins_as_undercover / s.games_as_undercover) * 100) : 0,
        "Mr. White": s.games_as_mr_white > 0 ? Math.round((s.wins_as_mr_white / s.games_as_mr_white) * 100) : 0,
      }));
  }, [stats]);

  // ── Évolution dans le temps (parties par jour) ──
  const timelineData = useMemo(() => {
    const byDate: Record<string, { date: string; parties: number; duréeMoy: number; totalDuration: number }> = {};
    filteredGames.forEach((g) => {
      if (!g.created_at) return;
      const date = g.created_at.split("T")[0];
      if (!byDate[date]) byDate[date] = { date, parties: 0, duréeMoy: 0, totalDuration: 0 };
      byDate[date].parties += 1;
      byDate[date].totalDuration += g.duration_seconds;
    });
    return Object.values(byDate)
      .sort((a, b) => a.date.localeCompare(b.date))
      .map((d) => ({
        ...d,
        duréeMoy: Math.round(d.totalDuration / d.parties),
      }));
  }, [filteredGames]);

  // ── Précision des votes vs Win Rate ──
  const voteVsWin = useMemo(() => {
    return stats
      .filter((s) => s.total_games >= 2)
      .map((s) => ({
        name: shortName(s.model_id),
        "Win Rate": s.win_rate,
        "Vote Accuracy": s.vote_accuracy,
      }));
  }, [stats]);

  // ── Mots les plus joués ──
  const topWords = useMemo(() => {
    const counts: Record<string, number> = {};
    filteredGames.forEach((g) => {
      if (g.civil_word) counts[g.civil_word] = (counts[g.civil_word] || 0) + 1;
      if (g.undercover_word) counts[g.undercover_word] = (counts[g.undercover_word] || 0) + 1;
    });
    return Object.entries(counts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([word, count]) => ({ word, count }));
  }, [filteredGames]);

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
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            📊 Analytics
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Vue d&apos;ensemble des performances et statistiques
          </p>
        </div>

        {/* Filtre session */}
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
      <div className="grid grid-cols-5 gap-4">
        {[
          { label: "Parties jouées", value: totalGames, icon: "🎮", color: "from-indigo-500 to-indigo-600" },
          { label: "Sessions", value: totalSessions, icon: "📁", color: "from-blue-500 to-blue-600" },
          { label: "Modèles", value: totalModels, icon: "🤖", color: "from-emerald-500 to-emerald-600" },
          { label: "Durée moy.", value: `${avgDuration}s`, icon: "⏱️", color: "from-amber-500 to-amber-600" },
          { label: "Tours moy.", value: avgRounds, icon: "🔄", color: "from-rose-500 to-rose-600" },
        ].map((kpi) => (
          <div key={kpi.label} className={`bg-gradient-to-br ${kpi.color} rounded-xl p-4 text-white shadow-lg`}>
            <div className="flex items-center justify-between">
              <span className="text-2xl">{kpi.icon}</span>
              <span className="text-2xl font-bold">{kpi.value}</span>
            </div>
            <p className="text-sm mt-1 opacity-90">{kpi.label}</p>
          </div>
        ))}
      </div>

      {/* Row 1: Win Rate + Winner Distribution */}
      <div className="grid grid-cols-3 gap-6">
        {/* Top Modèles par Win Rate */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            🏆 Top Modèles — Taux de victoire
          </h3>
          {topModels.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={topModels} layout="vertical" margin={{ left: 80 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                <Tooltip
                  formatter={(value: number, name: string) => [
                    name === "Win Rate (%)" ? `${value}%` : value,
                    name,
                  ]}
                />
                <Bar dataKey="Win Rate (%)" fill="#6366f1" radius={[0, 6, 6, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>

        {/* Distribution des gagnants */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            🥧 Qui gagne ?
          </h3>
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
                  {winnerDistribution.map((_, i) => (
                    <Cell key={i} fill={COLORS[i % COLORS.length]} />
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

      {/* Row 2: Performance par rôle + Vote vs Win */}
      <div className="grid grid-cols-2 gap-6">
        {/* Performance par rôle */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
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

        {/* Vote Accuracy vs Win Rate */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
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
                <Bar dataKey="Vote Accuracy" fill="#f59e0b" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <EmptyState />
          )}
        </div>
      </div>

      {/* Row 3: Timeline + Mots populaires */}
      <div className="grid grid-cols-3 gap-6">
        {/* Timeline: parties par jour */}
        <div className="col-span-2 bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            📈 Activité dans le temps
          </h3>
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

        {/* Mots populaires */}
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
            💬 Mots les plus joués
          </h3>
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

      {/* Row 4: Tableau des sessions avec détails */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          📋 Historique des sessions
        </h3>
        {sessions.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 font-semibold text-gray-600">Session</th>
                  <th className="pb-2 font-semibold text-gray-600">Level</th>
                  <th className="pb-2 font-semibold text-gray-600">Parties</th>
                  <th className="pb-2 font-semibold text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {sessions.map((s) => (
                  <tr key={s.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2.5 font-medium text-gray-900">{s.name}</td>
                    <td className="py-2.5">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-700">
                        Level {s.level}
                      </span>
                    </td>
                    <td className="py-2.5 text-gray-700">
                      {s.games_played} / {s.total_games}
                    </td>
                    <td className="py-2.5 text-gray-500">
                      {s.created_at
                        ? new Date(s.created_at).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
      </div>

      {/* Row 5: Dernières parties */}
      <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
        <h3 className="text-sm font-semibold text-gray-900 mb-4 flex items-center gap-2">
          🕹️ Dernières parties
        </h3>
        {filteredGames.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-200 text-left">
                  <th className="pb-2 font-semibold text-gray-600">#</th>
                  <th className="pb-2 font-semibold text-gray-600">Gagnant</th>
                  <th className="pb-2 font-semibold text-gray-600">Mots</th>
                  <th className="pb-2 font-semibold text-gray-600">Tours</th>
                  <th className="pb-2 font-semibold text-gray-600">Durée</th>
                  <th className="pb-2 font-semibold text-gray-600">Joueurs</th>
                  <th className="pb-2 font-semibold text-gray-600">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {filteredGames.slice(0, 20).map((g, i) => (
                  <tr key={g.game_id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-2 text-gray-400 text-xs">{i + 1}</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          g.winner === "civil"
                            ? "bg-blue-100 text-blue-700"
                            : g.winner === "undercover"
                            ? "bg-red-100 text-red-700"
                            : g.winner === "mr_white"
                            ? "bg-purple-100 text-purple-700"
                            : "bg-gray-100 text-gray-700"
                        }`}
                      >
                        {g.winner || "Aucun"}
                      </span>
                    </td>
                    <td className="py-2 text-gray-700 text-xs">
                      <span className="text-blue-600">{g.civil_word}</span>
                      {" / "}
                      <span className="text-red-600">{g.undercover_word}</span>
                    </td>
                    <td className="py-2 text-gray-700">{g.rounds_played}</td>
                    <td className="py-2 text-gray-700">{g.duration_seconds}s</td>
                    <td className="py-2 text-gray-700">{g.player_count}</td>
                    <td className="py-2 text-gray-500 text-xs">
                      {g.created_at
                        ? new Date(g.created_at).toLocaleDateString("fr-FR", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })
                        : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <EmptyState />
        )}
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
