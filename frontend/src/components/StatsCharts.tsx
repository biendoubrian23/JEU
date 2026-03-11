"use client";

import { ModelStats } from "@/lib/types";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  PieChart,
  Pie,
  Cell,
} from "recharts";

interface StatsChartsProps {
  stats: ModelStats[];
}

const COLORS = [
  "#6366f1", "#3b82f6", "#10b981", "#f59e0b", "#ef4444",
  "#8b5cf6", "#ec4899", "#14b8a6", "#f97316", "#06b6d4",
];

export default function StatsCharts({ stats }: StatsChartsProps) {
  if (stats.length === 0) {
    return (
      <div className="text-center text-gray-400 py-16">
        <span className="text-4xl">📊</span>
        <p className="mt-3 text-sm">Aucune donnée statistique. Jouez des parties !</p>
      </div>
    );
  }

  // Données pour le graphique de taux de victoire
  const winRateData = stats.map((s) => ({
    name: s.model_id.split("/").pop()?.replace(":free", "") || s.model_id,
    "Taux de victoire": s.win_rate,
    "Précision vote": s.vote_accuracy,
    Parties: s.total_games,
  }));

  // Données par rôle
  const roleData = stats.map((s) => {
    const name = s.model_id.split("/").pop()?.replace(":free", "") || s.model_id;
    const civilWR =
      s.games_as_civil > 0
        ? Math.round((s.wins_as_civil / s.games_as_civil) * 100)
        : 0;
    const ucWR =
      s.games_as_undercover > 0
        ? Math.round((s.wins_as_undercover / s.games_as_undercover) * 100)
        : 0;
    const mwWR =
      s.games_as_mr_white > 0
        ? Math.round((s.wins_as_mr_white / s.games_as_mr_white) * 100)
        : 0;
    return {
      name,
      Civil: civilWR,
      Undercover: ucWR,
      "Mr. White": mwWR,
    };
  });

  // Données radar
  const radarData = stats.map((s) => ({
    subject: s.model_id.split("/").pop()?.replace(":free", "")?.substring(0, 10) || "?",
    Victoire: s.win_rate,
    Vote: s.vote_accuracy,
    Survie: Math.min(s.avg_rounds_survived * 20, 100),
    Déception: s.deception_rate,
  }));

  // Distribution des victoires (pie)
  const pieData = stats
    .filter((s) => s.wins > 0)
    .map((s) => ({
      name: s.model_id.split("/").pop()?.replace(":free", "") || s.model_id,
      value: s.wins,
    }));

  return (
    <div className="space-y-6">
      {/* Taux de victoire global */}
      <div className="bg-white rounded-xl border border-arena-border p-5">
        <h3 className="text-sm font-semibold text-gray-900 mb-4">
          🏆 Taux de victoire global
        </h3>
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={winRateData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
            <XAxis dataKey="name" tick={{ fontSize: 11 }} />
            <YAxis tick={{ fontSize: 11 }} />
            <Tooltip />
            <Legend />
            <Bar dataKey="Taux de victoire" fill="#6366f1" radius={[4, 4, 0, 0]} />
            <Bar dataKey="Précision vote" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Performance par rôle */}
        <div className="bg-white rounded-xl border border-arena-border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            🎭 Victoires par rôle (%)
          </h3>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={roleData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
              <XAxis dataKey="name" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <Tooltip />
              <Legend />
              <Bar dataKey="Civil" fill="#3b82f6" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Undercover" fill="#ef4444" radius={[2, 2, 0, 0]} />
              <Bar dataKey="Mr. White" fill="#8b5cf6" radius={[2, 2, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Distribution des victoires */}
        <div className="bg-white rounded-xl border border-arena-border p-5">
          <h3 className="text-sm font-semibold text-gray-900 mb-4">
            🥧 Distribution des victoires
          </h3>
          {pieData.length > 0 ? (
            <ResponsiveContainer width="100%" height={250}>
              <PieChart>
                <Pie
                  data={pieData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={90}
                  paddingAngle={3}
                  dataKey="value"
                  label={({ name, percent }) =>
                    `${name} ${(percent * 100).toFixed(0)}%`
                  }
                  labelLine={false}
                >
                  {pieData.map((_, index) => (
                    <Cell
                      key={`cell-${index}`}
                      fill={COLORS[index % COLORS.length]}
                    />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex items-center justify-center h-[250px] text-gray-400 text-sm">
              Pas encore de victoires
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
