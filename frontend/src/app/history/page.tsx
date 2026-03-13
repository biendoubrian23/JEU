"use client";

import { useState, useEffect, useCallback } from "react";
import { getGamesPaginated, getGameByNumber } from "@/lib/api";
import { GameEvent } from "@/lib/types";
import { clsx } from "clsx";

interface GameListItem {
  game_id: string;
  game_number: number;
  level: number;
  winner: string;
  civil_word: string;
  undercover_word: string;
  rounds_played: number;
  duration_seconds: number;
  player_count: number;
  created_at: string;
}

interface GameDetail {
  game_id: string;
  level: number;
  winner: string;
  civil_word: string;
  undercover_word: string;
  rounds_played: number;
  duration_seconds: number;
  players: Array<{
    name: string;
    model_id: string;
    role: string;
    survived: boolean;
    won: boolean;
  }>;
  events: GameEvent[];
}

const SIDEBAR_LIMIT = 30;

export default function HistoryPage() {
  const [totalGames, setTotalGames] = useState(0);
  const [gamesList, setGamesList] = useState<GameListItem[]>([]);
  const [selectedGameNumber, setSelectedGameNumber] = useState<number | null>(null);
  const [gameDetail, setGameDetail] = useState<GameDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [sidebarPage, setSidebarPage] = useState(1);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      const data = await getGamesPaginated(1, 500);
      setTotalGames(data.total);
      setGamesList(data.games);
    } catch {
      setTotalGames(0);
      setGamesList([]);
    }
  };

  const selectGame = useCallback(async (num: number) => {
    if (num < 1) return;
    setLoading(true);
    setSelectedGameNumber(num);
    try {
      const detail = await getGameByNumber(num);
      setGameDetail(detail);
    } catch {
      setGameDetail(null);
    }
    setLoading(false);
  }, []);

  const handleNumberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(numberInput, 10);
    if (!isNaN(num) && num >= 1 && num <= totalGames) {
      selectGame(num);
      setNumberInput("");
    }
  };

  const eventIcons: Record<string, string> = {
    clue: "🔍",
    discussion: "💬",
    vote: "🗳️",
    elimination: "💀",
    mr_white_guess: "🎭",
    game_end: "🏆",
    system: "📢",
  };

  const eventColors: Record<string, string> = {
    clue: "border-l-blue-400",
    discussion: "border-l-green-400",
    vote: "border-l-amber-400",
    elimination: "border-l-red-400",
    mr_white_guess: "border-l-purple-400",
    game_end: "border-l-emerald-400",
    system: "border-l-gray-400",
  };

  const formatEvent = (event: GameEvent): { main: string; detail?: string } => {
    const d = event.data;
    switch (event.event_type) {
      case "clue":
        return { main: `${event.player} donne l'indice : "${d.clue}"` };
      case "discussion":
        return { main: `${event.player}: ${d.message}` };
      case "vote":
        return { main: `${event.player} vote contre ${d.vote}` };
      case "elimination":
        return { main: `${d.player} est éliminé ! (${d.role}) — ${d.votes} vote${d.votes > 1 ? "s" : ""}` };
      case "mr_white_guess":
        return { main: `${event.player} tente de deviner : "${d.guess}" ${d.correct ? "✅ CORRECT !" : "❌ Raté !"}` };
      case "game_end":
        return { main: `Partie terminée ! Victoire : ${d.winner} (${d.rounds_played} tours, ${Math.round(d.duration)}s)` };
      case "system":
        return { main: d.message };
      default:
        return { main: JSON.stringify(d) };
    }
  };

  const roleColors: Record<string, string> = {
    civil: "bg-blue-100 text-blue-700",
    undercover: "bg-red-100 text-red-700",
    mr_white: "bg-purple-100 text-purple-700",
  };

  // Visible sidebar items
  const visibleGames = totalGames <= SIDEBAR_LIMIT
    ? gamesList
    : gamesList.slice((sidebarPage - 1) * SIDEBAR_LIMIT, sidebarPage * SIDEBAR_LIMIT);
  const totalSidebarPages = Math.ceil(totalGames / SIDEBAR_LIMIT);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">📜 Historique des parties</h1>
        <p className="text-sm text-gray-500">
          Consultez les discussions de chaque partie — {totalGames} partie{totalGames > 1 ? "s" : ""} enregistrée{totalGames > 1 ? "s" : ""}
        </p>
      </div>

      <div className="flex gap-4" style={{ height: "calc(100vh - 160px)" }}>
        {/* ─── Sidebar ─── */}
        <div className="w-72 flex-shrink-0 bg-white rounded-xl border border-arena-border flex flex-col overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-100 flex items-center justify-between">
            <span className="text-xs font-semibold text-gray-700">
              Parties ({totalGames})
            </span>
            {totalGames > SIDEBAR_LIMIT && (
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setSidebarPage((p) => Math.max(1, p - 1))}
                  disabled={sidebarPage === 1}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  ◀
                </button>
                <span className="text-[10px] text-gray-400">
                  {sidebarPage}/{totalSidebarPages}
                </span>
                <button
                  onClick={() => setSidebarPage((p) => Math.min(totalSidebarPages, p + 1))}
                  disabled={sidebarPage === totalSidebarPages}
                  className="p-0.5 rounded text-gray-400 hover:text-gray-600 disabled:opacity-30"
                >
                  ▶
                </button>
              </div>
            )}
          </div>

          {/* Number input for large counts */}
          {totalGames > SIDEBAR_LIMIT && (
            <form onSubmit={handleNumberSubmit} className="px-3 py-2 border-b border-gray-100 flex gap-1.5">
              <input
                type="number"
                min={1}
                max={totalGames}
                value={numberInput}
                onChange={(e) => setNumberInput(e.target.value)}
                placeholder={`N° (1-${totalGames})`}
                className="flex-1 text-xs border border-gray-200 rounded px-2 py-1 focus:outline-none focus:ring-1 focus:ring-arena-accent/30"
              />
              <button
                type="submit"
                className="px-2 py-1 text-xs bg-arena-accent text-white rounded hover:bg-arena-accent/90"
              >
                →
              </button>
            </form>
          )}

          {/* Games list */}
          <div className="flex-1 overflow-y-auto">
            {totalGames === 0 ? (
              <p className="text-xs text-gray-400 text-center py-6">Aucune partie</p>
            ) : (
              visibleGames.map((g) => (
                <button
                  key={g.game_number}
                  onClick={() => selectGame(g.game_number)}
                  className={clsx(
                    "w-full text-left px-3 py-2 border-b border-gray-50 hover:bg-gray-50 transition-colors",
                    selectedGameNumber === g.game_number && "bg-arena-accent/5 border-l-2 border-l-arena-accent"
                  )}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-gray-800">
                      Partie {g.game_number}
                    </span>
                    <span className={clsx(
                      "text-[10px] px-1.5 py-0.5 rounded-full font-medium",
                      g.winner === "civil" ? "bg-blue-100 text-blue-700"
                        : g.winner === "undercover" ? "bg-red-100 text-red-700"
                        : "bg-purple-100 text-purple-700"
                    )}>
                      {g.winner || "?"}
                    </span>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-0.5">
                    {g.civil_word} / {g.undercover_word} · {g.rounds_played} tours · {g.player_count}j
                  </p>
                </button>
              ))
            )}
          </div>
        </div>

        {/* ─── Main content: Events ─── */}
        <div className="flex-1 bg-white rounded-xl border border-arena-border flex flex-col overflow-hidden">
          {loading ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              Chargement...
            </div>
          ) : !gameDetail || selectedGameNumber === null ? (
            <div className="flex-1 flex items-center justify-center text-gray-400 text-sm">
              ← Sélectionnez une partie pour voir les discussions
            </div>
          ) : (
            <>
              {/* Game header */}
              <div className="px-4 py-3 border-b border-gray-100">
                <div className="flex items-center justify-between">
                  <h2 className="text-lg font-bold text-gray-900">
                    Partie {selectedGameNumber}
                  </h2>
                  <div className="flex items-center gap-2">
                    <span className={clsx(
                      "text-xs px-2 py-0.5 rounded-full font-medium",
                      roleColors[gameDetail.winner] || "bg-gray-100 text-gray-700"
                    )}>
                      Victoire : {gameDetail.winner}
                    </span>
                    <span className="text-xs text-gray-400">
                      Niv. {gameDetail.level} · {gameDetail.rounds_played} tours · {Math.round(gameDetail.duration_seconds)}s
                    </span>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-3 text-xs text-gray-500">
                  <span>Mots : <strong>{gameDetail.civil_word}</strong> / <strong>{gameDetail.undercover_word}</strong></span>
                </div>
                {/* Players chips */}
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {gameDetail.players.map((p) => (
                    <span
                      key={p.name}
                      className={clsx(
                        "text-[10px] px-2 py-0.5 rounded-full font-medium",
                        roleColors[p.role] || "bg-gray-100 text-gray-700",
                        !p.survived && "opacity-50 line-through"
                      )}
                    >
                      {p.name} ({p.role})
                    </span>
                  ))}
                </div>
              </div>

              {/* Events scroll */}
              <div className="flex-1 overflow-y-auto p-4 space-y-2">
                {gameDetail.events.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">
                    Aucun événement enregistré
                  </p>
                ) : (
                  gameDetail.events.map((event, i) => {
                    const { main, detail } = formatEvent(event);
                    return (
                      <div
                        key={i}
                        className={clsx(
                          "border-l-3 pl-3 py-1.5",
                          eventColors[event.event_type] || "border-l-gray-300"
                        )}
                        style={{ borderLeftWidth: 3 }}
                      >
                        <div className="flex items-start gap-1.5">
                          <span className="text-sm flex-shrink-0">
                            {eventIcons[event.event_type] || "•"}
                          </span>
                          <div className="min-w-0">
                            <p className="text-sm text-gray-800">{main}</p>
                            {detail && (
                              <p className="text-xs text-gray-500 mt-0.5 italic">💭 {detail}</p>
                            )}
                            {event.round > 0 && (
                              <span className="text-[10px] text-gray-400">Tour {event.round}</span>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
