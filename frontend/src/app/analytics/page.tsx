"use client";

import { useEffect, useState, useMemo, ReactNode } from "react";
import { getAnalytics, getExtendedAnalytics, getSessions } from "@/lib/api";
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
  LineChart,
  Line,
  ErrorBar,
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
  ci_low: number | null;
  ci_high: number | null;
  ci_uc_low: number | null;
  ci_uc_high: number | null;
  ci_mw_low: number | null;
  ci_mw_high: number | null;
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

interface SurvivalPoint {
  round: number;
  pct: number;
}

interface DiscourseEntry {
  model_id: string;
  avg_length: number;
  total_messages: number;
  max_length: number;
  min_length: number;
}

interface StyleEntry {
  model_id: string;
  dominant_style: string;
  scores: Record<string, number>;
  raw_counts: Record<string, number>;
}

interface CostEntry {
  model_id: string;
  cost_per_m: number;
  est_cost_per_game: number;
  est_total_cost: number;
  est_cost_per_win: number | null;
  total_games: number;
  wins: number;
}

interface ExtendedData {
  survival_curves: Record<string, { uc?: SurvivalPoint[]; mw?: SurvivalPoint[] }>;
  discourse_stats: DiscourseEntry[];
  style_typology: StyleEntry[];
  cost_data: CostEntry[];
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

// ── Composant ChartSection: section avec onglets de graphiques ──
function ChartSection({
  title,
  charts,
}: {
  title: string;
  charts: { label: string; icon: string; render: () => ReactNode }[];
}) {
  const [active, setActive] = useState(0);
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
        <h3 className="text-sm font-semibold text-gray-900">{title}</h3>
        <div className="flex gap-1 flex-wrap">
          {charts.map((c, i) => (
            <button
              key={i}
              onClick={() => setActive(i)}
              className={`px-3 py-1 text-xs rounded-full transition-colors ${
                active === i
                  ? "bg-indigo-100 text-indigo-700 font-medium"
                  : "text-gray-500 hover:bg-gray-100"
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
      </div>
      {charts[active]?.render()}
    </div>
  );
}

export default function AnalyticsPage() {
  const [models, setModels] = useState<ModelData[]>([]);
  const [globalStats, setGlobalStats] = useState<GlobalData | null>(null);
  const [games, setGames] = useState<GameData[]>([]);
  const [sessions, setSessions] = useState<SessionData[]>([]);
  const [selectedSession, setSelectedSession] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedGame, setExpandedGame] = useState<string | null>(null);
  const [extended, setExtended] = useState<ExtendedData | null>(null);

  const loadData = async (sessionId?: number | null) => {
    setLoading(true);
    try {
      const [analytics, sessionsData, ext] = await Promise.all([
        getAnalytics(sessionId || undefined),
        getSessions(),
        getExtendedAnalytics(sessionId || undefined),
      ]);
      setModels(analytics.models || []);
      setGlobalStats(analytics.global || null);
      setGames(analytics.games || []);
      setSessions(sessionsData);
      setExtended(ext);
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

  // ── Intervalles de confiance (CI) ──
  const confidenceData = useMemo(() => {
    return models
      .filter((m) => m.ci_low != null && m.ci_high != null)
      .slice(0, 10)
      .map((m) => ({
        name: shortName(m.model_id),
        winRate: m.win_rate,
        ciLow: m.ci_low!,
        ciHigh: m.ci_high!,
        errorLow: m.win_rate - m.ci_low!,
        errorHigh: m.ci_high! - m.win_rate,
      }));
  }, [models]);

  // ── Courbes de survie ──
  const survivalChartData = useMemo(() => {
    if (!extended?.survival_curves) return [];
    const curves = extended.survival_curves;
    const modelIds = Object.keys(curves).slice(0, 6);
    const maxRound = Math.max(
      ...modelIds.flatMap((mid) =>
        [...(curves[mid].uc || []), ...(curves[mid].mw || [])].map((p) => p.round)
      ),
      1
    );
    const data = [];
    for (let r = 1; r <= maxRound; r++) {
      const point: Record<string, number> = { round: r };
      modelIds.forEach((mid) => {
        const ucPoint = curves[mid].uc?.find((p) => p.round === r);
        const mwPoint = curves[mid].mw?.find((p) => p.round === r);
        if (ucPoint) point[`${shortName(mid)} UC`] = ucPoint.pct;
        if (mwPoint) point[`${shortName(mid)} MW`] = mwPoint.pct;
      });
      data.push(point);
    }
    return data;
  }, [extended]);

  const survivalKeys = useMemo(() => {
    if (!extended?.survival_curves) return [];
    return Object.keys(extended.survival_curves)
      .slice(0, 6)
      .flatMap((mid) => {
        const keys: string[] = [];
        if (extended.survival_curves[mid].uc) keys.push(`${shortName(mid)} UC`);
        if (extended.survival_curves[mid].mw) keys.push(`${shortName(mid)} MW`);
        return keys;
      });
  }, [extended]);

  // ── Coût par victoire ──
  const costChartData = useMemo(() => {
    if (!extended?.cost_data) return [];
    return extended.cost_data
      .filter((c) => c.est_cost_per_win != null)
      .slice(0, 10)
      .map((c) => ({
        name: shortName(c.model_id),
        "$/victoire": c.est_cost_per_win!,
        "$/partie": c.est_cost_per_game,
        parties: c.total_games,
      }));
  }, [extended]);

  // ── Typologie des styles ──
  const styleChartData = useMemo(() => {
    if (!extended?.style_typology) return [];
    return extended.style_typology.slice(0, 10).map((s) => ({
      name: shortName(s.model_id),
      Manipulateur: s.scores.manipulateur || 0,
      Prudent: s.scores.prudent || 0,
      Agressif: s.scores.agressif || 0,
      Opportuniste: s.scores.opportuniste || 0,
      dominant: s.dominant_style,
    }));
  }, [extended]);

  // ── Longueur du discours ──
  const discourseChartData = useMemo(() => {
    if (!extended?.discourse_stats) return [];
    return extended.discourse_stats.slice(0, 12).map((d) => ({
      name: shortName(d.model_id),
      "Longueur moy.": d.avg_length,
      Messages: d.total_messages,
    }));
  }, [extended]);

  // ── Stabilité temporelle (win rate par session) ──
  const stabilityData = useMemo(() => {
    if (games.length === 0) return [];
    const bySession: Record<string, Record<string, { wins: number; total: number }>> = {};
    games.forEach((game) => {
      const sessionKey = game.session_id ? `S${game.session_id}` : "Sans session";
      if (!bySession[sessionKey]) bySession[sessionKey] = {};
      game.players?.forEach((p) => {
        const mid = shortName(p.model_id);
        if (!bySession[sessionKey][mid]) bySession[sessionKey][mid] = { wins: 0, total: 0 };
        bySession[sessionKey][mid].total += 1;
        if (p.won) bySession[sessionKey][mid].wins += 1;
      });
    });
    return Object.entries(bySession).map(([session, models]) => {
      const point: Record<string, string | number> = { session };
      Object.entries(models).forEach(([mid, { wins, total }]) => {
        point[mid] = total > 0 ? Math.round((wins / total) * 100) : 0;
      });
      return point;
    });
  }, [games]);

  const stabilityKeys = useMemo(() => {
    if (stabilityData.length === 0) return [];
    const keys = new Set<string>();
    stabilityData.forEach((row) => {
      Object.keys(row).forEach((k) => {
        if (k !== "session") keys.add(k);
      });
    });
    return Array.from(keys).slice(0, 8);
  }, [stabilityData]);

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

      {/* ══════════════ Fiche de Performance par Modèle ══════════════ */}
      {models.length > 0 && (
        <div className="bg-white rounded-xl border border-gray-200 p-5 shadow-sm">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">📋 Fiche de Performance par Modèle</h3>
          <div className="space-y-4">
            {models.map((m) => {
              const totalGames = m.games_as_civil + m.games_as_undercover + m.games_as_mr_white;
              return (
                <div key={m.model_id} className="border border-gray-100 rounded-xl overflow-hidden">
                  {/* Model header */}
                  <div className="bg-gradient-to-r from-indigo-50 to-purple-50 px-4 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className="text-lg">🤖</span>
                      <div>
                        <p className="text-sm font-bold text-gray-900">{m.model_id}</p>
                        <p className="text-[11px] text-gray-500">{totalGames} parties jouées · {m.wins} victoires · {m.losses} défaites</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className={`text-xl font-bold ${m.win_rate >= 50 ? "text-emerald-600" : "text-red-500"}`}>{m.win_rate}%</p>
                        <p className="text-[10px] text-gray-400">Win Rate Global</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-amber-600">{m.vote_accuracy}%</p>
                        <p className="text-[10px] text-gray-400">Vote Accuracy</p>
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-bold text-blue-600">{m.avg_survival}</p>
                        <p className="text-[10px] text-gray-400">Tours moy. survie</p>
                      </div>
                    </div>
                  </div>

                  {/* Role breakdown table */}
                  <div className="px-4 py-3">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-gray-400 border-b border-gray-100">
                          <th className="text-left py-1.5 font-medium">Rôle</th>
                          <th className="text-center py-1.5 font-medium">Parties</th>
                          <th className="text-center py-1.5 font-medium">Victoires</th>
                          <th className="text-center py-1.5 font-medium">Défaites</th>
                          <th className="text-center py-1.5 font-medium">Win Rate</th>
                          <th className="text-center py-1.5 font-medium">Bluff Score</th>
                          <th className="text-center py-1.5 font-medium">Détecté en (tours)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {/* Civil */}
                        <tr className="border-b border-gray-50">
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-blue-500" />
                              <span className="font-medium text-gray-700">👤 Civil</span>
                            </span>
                          </td>
                          <td className="text-center text-gray-700 font-medium">{m.games_as_civil}</td>
                          <td className="text-center text-emerald-600 font-medium">{m.wins_as_civil}</td>
                          <td className="text-center text-red-500 font-medium">{m.games_as_civil - m.wins_as_civil}</td>
                          <td className="text-center">
                            {m.civil_wr != null ? (
                              <span className={`px-2 py-0.5 rounded-full font-medium ${
                                m.civil_wr >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                              }`}>{m.civil_wr}%</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-center text-gray-300">—</td>
                          <td className="text-center text-gray-300">—</td>
                        </tr>
                        {/* Undercover */}
                        <tr className="border-b border-gray-50">
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-red-500" />
                              <span className="font-medium text-gray-700">🕵️ Undercover</span>
                            </span>
                          </td>
                          <td className="text-center text-gray-700 font-medium">{m.games_as_undercover}</td>
                          <td className="text-center text-emerald-600 font-medium">{m.wins_as_undercover}</td>
                          <td className="text-center text-red-500 font-medium">{m.games_as_undercover - m.wins_as_undercover}</td>
                          <td className="text-center">
                            {m.undercover_wr != null ? (
                              <span className={`px-2 py-0.5 rounded-full font-medium ${
                                m.undercover_wr >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                              }`}>{m.undercover_wr}%</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-center">
                            {m.bluff_score_uc != null ? (
                              <span className="font-medium text-orange-600">{m.bluff_score_uc} tours</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-center">
                            {m.caught_at_round_uc != null ? (
                              <span className="font-medium text-pink-600">{m.caught_at_round_uc} tours</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                        {/* Mr. White */}
                        <tr>
                          <td className="py-2">
                            <span className="inline-flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-purple-500" />
                              <span className="font-medium text-gray-700">👻 Mr. White</span>
                            </span>
                          </td>
                          <td className="text-center text-gray-700 font-medium">{m.games_as_mr_white}</td>
                          <td className="text-center text-emerald-600 font-medium">{m.wins_as_mr_white}</td>
                          <td className="text-center text-red-500 font-medium">{m.games_as_mr_white - m.wins_as_mr_white}</td>
                          <td className="text-center">
                            {m.mr_white_wr != null ? (
                              <span className={`px-2 py-0.5 rounded-full font-medium ${
                                m.mr_white_wr >= 50 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-600"
                              }`}>{m.mr_white_wr}%</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-center">
                            {m.bluff_score_mw != null ? (
                              <span className="font-medium text-orange-600">{m.bluff_score_mw} tours</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                          <td className="text-center">
                            {m.caught_at_round_mw != null ? (
                              <span className="font-medium text-pink-600">{m.caught_at_round_mw} tours</span>
                            ) : <span className="text-gray-300">—</span>}
                          </td>
                        </tr>
                      </tbody>
                    </table>
                  </div>

                  {/* Visual win rate bar */}
                  <div className="px-4 pb-3">
                    <div className="flex items-center gap-2 text-[10px] text-gray-400 mb-1">
                      <span>Répartition des victoires</span>
                    </div>
                    <div className="flex h-3 rounded-full overflow-hidden bg-gray-100">
                      {m.wins_as_civil > 0 && (
                        <div
                          className="bg-blue-500 transition-all"
                          style={{ width: `${(m.wins_as_civil / Math.max(m.wins, 1)) * 100}%` }}
                          title={`Civil: ${m.wins_as_civil} victoires`}
                        />
                      )}
                      {m.wins_as_undercover > 0 && (
                        <div
                          className="bg-red-500 transition-all"
                          style={{ width: `${(m.wins_as_undercover / Math.max(m.wins, 1)) * 100}%` }}
                          title={`UC: ${m.wins_as_undercover} victoires`}
                        />
                      )}
                      {m.wins_as_mr_white > 0 && (
                        <div
                          className="bg-purple-500 transition-all"
                          style={{ width: `${(m.wins_as_mr_white / Math.max(m.wins, 1)) * 100}%` }}
                          title={`MW: ${m.wins_as_mr_white} victoires`}
                        />
                      )}
                    </div>
                    <div className="flex gap-3 mt-1.5 text-[10px]">
                      {m.wins_as_civil > 0 && <span className="text-blue-600">● Civil {m.wins_as_civil}V</span>}
                      {m.wins_as_undercover > 0 && <span className="text-red-600">● UC {m.wins_as_undercover}V</span>}
                      {m.wins_as_mr_white > 0 && <span className="text-purple-600">● MW {m.wins_as_mr_white}V</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ══════════════ Section 1: Performance Globale ══════════════ */}
      <ChartSection
        title="🏆 Performance Globale"
        charts={[
          {
            label: "Win Rate",
            icon: "📊",
            render: () =>
              topModelsChart.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
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
              ),
          },
          {
            label: "Gagnants",
            icon: "🥧",
            render: () =>
              winnerDistribution.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
                  <PieChart>
                    <Pie
                      data={winnerDistribution}
                      cx="50%"
                      cy="50%"
                      innerRadius={55}
                      outerRadius={110}
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
              ),
          },
          {
            label: "Vote vs Win",
            icon: "🎯",
            render: () =>
              voteVsWin.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
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
              ),
          },
        ]}
      />

      {/* ══════════════ Section 2: Analyse par Rôle ══════════════ */}
      <ChartSection
        title="🎭 Analyse par Rôle"
        charts={[
          {
            label: "WR par rôle",
            icon: "📊",
            render: () =>
              rolePerformance.length > 0 ? (
                <ResponsiveContainer width="100%" height={320}>
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
              ),
          },
          {
            label: "Bluff Score",
            icon: "🃏",
            render: () =>
              bluffChart.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Survie moyenne en tours en tant qu&apos;imposteur — plus c&apos;est haut, meilleur bluffeur
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
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
                </>
              ) : (
                <EmptyState />
              ),
          },
          {
            label: "Courbe de survie",
            icon: "📉",
            render: () =>
              survivalChartData.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    % d&apos;imposteurs encore en vie à chaque tour (UC = Undercover, MW = Mr. White)
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={survivalChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="round" label={{ value: "Tour", position: "insideBottom", offset: -5, fontSize: 10 }} tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} label={{ value: "%", angle: -90, position: "insideLeft", fontSize: 10 }} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {survivalKeys.map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                          strokeDasharray={key.endsWith("MW") ? "5 5" : undefined}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState />
              ),
          },
        ]}
      />

      {/* ══════════════ Section 3: Profil & Confiance ══════════════ */}
      <ChartSection
        title="🕸️ Profil Stratégique"
        charts={[
          {
            label: "Radar",
            icon: "🕸️",
            render: () =>
              radarData.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Comparaison multi-axes: Win Rate, Civil, UC, Vote, Survie (Top 5)
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
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
                </>
              ) : (
                <EmptyState />
              ),
          },
          {
            label: "Confiance (CI)",
            icon: "📐",
            render: () =>
              confidenceData.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Win Rate avec intervalle de confiance Wilson 95% — les barres montrent l&apos;incertitude
                  </p>
                  <ResponsiveContainer width="100%" height={320}>
                    <BarChart data={confidenceData} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" domain={[0, 100]} tick={{ fontSize: 11 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={80} />
                      <Tooltip
                        formatter={(v: unknown, name: string, entry: unknown) => {
                          const val = v as number;
                          const e = entry as { payload?: { ciLow?: number; ciHigh?: number } };
                          if (name === "winRate" && e.payload) return [`${val}% [${e.payload.ciLow}-${e.payload.ciHigh}]`, "Win Rate (CI 95%)"];
                          return [val, name];
                        }}
                      />
                      <Bar dataKey="winRate" fill="#6366f1" radius={[0, 6, 6, 0]}>
                        <ErrorBar dataKey="errorHigh" direction="x" width={4} stroke="#3730a3" />
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState />
              ),
          },
          {
            label: "Détection",
            icon: "🔍",
            render: () => {
              const detectionData = models
                .filter((m) => m.caught_at_round_uc != null || m.caught_at_round_mw != null)
                .slice(0, 10)
                .map((m) => ({
                  name: shortName(m.model_id),
                  "Détecté en UC (tours)": m.caught_at_round_uc ?? 0,
                  "Détecté en MW (tours)": m.caught_at_round_mw ?? 0,
                }));
              return detectionData.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Nombre moyen de tours avant d&apos;être éliminé en tant qu&apos;imposteur (moins = détecté plus vite)
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={detectionData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Détecté en UC (tours)" fill="#f97316" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="Détecté en MW (tours)" fill="#ec4899" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState />
              );
            },
          },
        ]}
      />

      {/* ══════════════ Section 4: Temporel & Coûts ══════════════ */}
      <ChartSection
        title="📈 Temporel & Coûts"
        charts={[
          {
            label: "Timeline",
            icon: "📅",
            render: () =>
              timelineData.length > 0 ? (
                <ResponsiveContainer width="100%" height={300}>
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
              ),
          },
          {
            label: "Coût / Victoire",
            icon: "💰",
            render: () =>
              costChartData.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Estimation basée sur ~300 tokens/phase × 3 phases × tours moyens (modèles payants uniquement)
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={costChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip formatter={(v: number, name: string) => [`$${v.toFixed(4)}`, name]} />
                      <Legend />
                      <Bar dataKey="$/victoire" fill="#f59e0b" radius={[4, 4, 0, 0]} />
                      <Bar dataKey="$/partie" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState />
              ),
          },
          {
            label: "Stabilité",
            icon: "📊",
            render: () =>
              stabilityData.length > 1 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Win Rate par session — montre la stabilité des performances dans le temps
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <LineChart data={stabilityData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="session" tick={{ fontSize: 10 }} />
                      <YAxis domain={[0, 100]} tick={{ fontSize: 10 }} />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      {stabilityKeys.map((key, i) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          stroke={COLORS[i % COLORS.length]}
                          strokeWidth={2}
                          dot={{ r: 3 }}
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState />
              ),
          },
        ]}
      />

      {/* ══════════════ Section 5: Analyse Qualitative ══════════════ */}
      <ChartSection
        title="💬 Analyse Qualitative"
        charts={[
          {
            label: "Mots joués",
            icon: "🔤",
            render: () =>
              topWords.length > 0 ? (
                <div className="space-y-2 max-h-[300px] overflow-y-auto">
                  {topWords.map((w, i) => (
                    <div key={w.word} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-gray-400 w-5">#{i + 1}</span>
                        <span className="text-sm font-medium text-gray-800">{w.word}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <div
                          className="h-2 bg-gradient-to-r from-indigo-400 to-indigo-600 rounded-full"
                          style={{ width: `${Math.max(20, (w.count / topWords[0].count) * 120)}px` }}
                        />
                        <span className="text-xs text-gray-500 w-6 text-right">{w.count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState />
              ),
          },
          {
            label: "Styles de jeu",
            icon: "🧠",
            render: () =>
              styleChartData.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Répartition des styles identifiés dans les raisonnements (manipulateur, prudent, agressif, opportuniste)
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={styleChartData} layout="vertical" margin={{ left: 80 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis type="number" tick={{ fontSize: 10 }} />
                      <YAxis type="category" dataKey="name" tick={{ fontSize: 10 }} width={80} />
                      <Tooltip formatter={(v: number) => `${v}%`} />
                      <Legend wrapperStyle={{ fontSize: 10 }} />
                      <Bar dataKey="Manipulateur" stackId="a" fill="#ef4444" />
                      <Bar dataKey="Prudent" stackId="a" fill="#3b82f6" />
                      <Bar dataKey="Agressif" stackId="a" fill="#f97316" />
                      <Bar dataKey="Opportuniste" stackId="a" fill="#10b981" />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState />
              ),
          },
          {
            label: "Discours",
            icon: "💬",
            render: () =>
              discourseChartData.length > 0 ? (
                <>
                  <p className="text-[10px] text-gray-400 mb-3">
                    Longueur moyenne des messages de discussion par modèle (en caractères)
                  </p>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart data={discourseChartData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                      <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 11 }} />
                      <Tooltip />
                      <Legend />
                      <Bar dataKey="Longueur moy." fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </>
              ) : (
                <EmptyState />
              ),
          },
        ]}
      />

      {/* ══════════════ Détail des parties ══════════════ */}
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
