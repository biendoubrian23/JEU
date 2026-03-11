"use client";

import { GameEvent, PlayerResult } from "@/lib/types";

interface ReasoningPanelProps {
  players: PlayerResult[];
  selectedPlayer: string | null;
  onSelectPlayer: (name: string) => void;
}

export default function ReasoningPanel({
  players,
  selectedPlayer,
  onSelectPlayer,
}: ReasoningPanelProps) {
  const selected = players.find((p) => p.name === selectedPlayer);

  const roleColors: Record<string, string> = {
    civil: "bg-blue-100 text-blue-800",
    undercover: "bg-red-100 text-red-800",
    mr_white: "bg-purple-100 text-purple-800",
  };

  return (
    <div className="bg-white rounded-xl border border-arena-border p-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">
        🧠 Raisonnement privé
      </h3>

      {/* Sélecteur de joueur */}
      <div className="flex flex-wrap gap-1.5 mb-4">
        {players.map((p) => (
          <button
            key={p.name}
            onClick={() => onSelectPlayer(p.name)}
            className={`px-2.5 py-1 rounded-full text-xs font-medium transition-colors ${
              selectedPlayer === p.name
                ? "bg-arena-accent text-white"
                : "bg-gray-100 text-gray-600 hover:bg-gray-200"
            }`}
          >
            {p.name}
            {p.role && (
              <span className={`ml-1 px-1 rounded ${roleColors[p.role] || ""}`}>
                {p.role === "mr_white" ? "MW" : p.role?.charAt(0).toUpperCase()}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Log de raisonnement */}
      {selected ? (
        <div className="space-y-2 max-h-80 overflow-y-auto">
          {selected.reasoning_log && selected.reasoning_log.length > 0 ? (
            selected.reasoning_log.map((log, i) => (
              <div
                key={i}
                className="bg-gray-50 rounded-lg p-3 text-xs space-y-1"
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-gray-700">
                    Tour {log.round} — {log.phase}
                  </span>
                  {log.target && (
                    <span className="text-red-600 font-medium">
                      → {log.target}
                    </span>
                  )}
                </div>
                <p className="text-gray-600 italic">{log.reasoning || "Pas de raisonnement explicite"}</p>
              </div>
            ))
          ) : (
            <p className="text-sm text-gray-400 text-center py-4">
              Raisonnement disponible après la partie
            </p>
          )}

          {/* Résumé du joueur */}
          <div className="border-t pt-2 mt-2 grid grid-cols-3 gap-2 text-xs">
            <div className="text-center">
              <p className="text-gray-500">Indices</p>
              <p className="font-bold text-gray-800">
                {selected.clues_given?.join(", ") || "-"}
              </p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">Votes corrects</p>
              <p className="font-bold text-gray-800">{selected.correct_votes || 0}</p>
            </div>
            <div className="text-center">
              <p className="text-gray-500">Survie</p>
              <p className="font-bold text-gray-800">{selected.rounds_survived} tours</p>
            </div>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400 text-center py-8">
          Sélectionnez un joueur pour voir son raisonnement
        </p>
      )}
    </div>
  );
}
