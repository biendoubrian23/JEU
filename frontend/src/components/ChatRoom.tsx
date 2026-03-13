"use client";

import { GameEvent } from "@/lib/types";
import { getGamesPaginated, getGameByNumber } from "@/lib/api";
import { clsx } from "clsx";
import { useEffect, useRef, useCallback, useState } from "react";

interface GameListItem {
  game_id: string;
  game_number: number;
  winner: string;
  civil_word: string;
  undercover_word: string;
  rounds_played: number;
  player_count: number;
  created_at: string;
}

interface ChatRoomProps {
  events: GameEvent[];
  showReasoning: boolean;
}

export default function ChatRoom({ events, showReasoning }: ChatRoomProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const isNearBottom = useRef(true);
  const [activeTab, setActiveTab] = useState<"live" | "history">("live");

  // ─── History state ───
  const [totalGames, setTotalGames] = useState(0);
  const [gamesList, setGamesList] = useState<GameListItem[]>([]);
  const [selectedGameEvents, setSelectedGameEvents] = useState<GameEvent[]>([]);
  const [selectedGameNumber, setSelectedGameNumber] = useState<number | null>(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const DROPDOWN_LIMIT = 15;

  // Load games list when switching to history tab
  useEffect(() => {
    if (activeTab === "history") {
      loadGamesList();
    }
  }, [activeTab]);

  const loadGamesList = async () => {
    try {
      const data = await getGamesPaginated(1, 500);
      setTotalGames(data.total);
      setGamesList(data.games);
    } catch {
      setTotalGames(0);
      setGamesList([]);
    }
  };

  const loadGameByNumber = async (num: number) => {
    if (num < 1 || num > totalGames) return;
    setLoadingHistory(true);
    setSelectedGameNumber(num);
    try {
      const detail = await getGameByNumber(num);
      setSelectedGameEvents(detail.events || []);
    } catch {
      setSelectedGameEvents([]);
    }
    setLoadingHistory(false);
  };

  const handleNumberSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const num = parseInt(numberInput, 10);
    if (!isNaN(num)) {
      loadGameByNumber(num);
      setNumberInput("");
    }
  };

  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    // Consider "near bottom" if within 120px of the bottom
    isNearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (scrollRef.current && isNearBottom.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [events]);

  const eventIcons: Record<string, string> = {
    clue: "🔍",
    discussion: "💬",
    vote: "🗳️",
    elimination: "💀",
    mr_white_guess: "🎭",
    game_end: "🏆",
    system: "📢",
    batch_progress: "📊",
    batch_complete: "✅",
    error: "❌",
  };

  const eventColors: Record<string, string> = {
    clue: "border-l-blue-400",
    discussion: "border-l-green-400",
    vote: "border-l-amber-400",
    elimination: "border-l-red-400",
    mr_white_guess: "border-l-purple-400",
    game_end: "border-l-emerald-400",
    system: "border-l-gray-400",
    error: "border-l-red-600",
  };

  const formatEvent = (event: GameEvent): { main: string; detail?: string } => {
    const d = event.data;
    switch (event.event_type) {
      case "clue":
        return {
          main: `${event.player} donne l'indice : "${d.clue}"`,
          detail: showReasoning ? d.reasoning : undefined,
        };
      case "discussion":
        return {
          main: `${event.player}: ${d.message}`,
          detail: showReasoning ? d.reasoning : undefined,
        };
      case "vote":
        return {
          main: `${event.player} vote contre ${d.vote}`,
          detail: showReasoning ? d.reasoning : undefined,
        };
      case "elimination":
        return {
          main: `${d.player} est éliminé ! (${d.role}) — ${d.votes} vote${d.votes > 1 ? "s" : ""}`,
        };
      case "mr_white_guess":
        return {
          main: `${event.player} tente de deviner : "${d.guess}" ${d.correct ? "✅ CORRECT !" : "❌ Raté !"}`,
          detail: d.correct ? undefined : `Le mot était : ${d.actual_word}`,
        };
      case "game_end":
        return {
          main: `Partie terminée ! Victoire : ${d.winner} (${d.rounds_played} tours, ${Math.round(d.duration)}s)`,
        };
      case "system":
        return { main: d.message };
      case "batch_progress":
        return { main: `Partie ${d.current_game}/${d.total_games} en cours...` };
      case "batch_complete":
        return { main: `Batch terminé ! ${d.total_games} parties jouées.` };
      case "error":
        return { main: `Erreur : ${d.message}` };
      default:
        return { main: JSON.stringify(d) };
    }
  };

  return (
    <div className="bg-white rounded-xl border border-arena-border flex flex-col h-full">
      {/* Tab header */}
      <div className="px-4 py-2 border-b border-arena-border">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setActiveTab("live")}
            className={clsx(
              "text-sm font-semibold pb-1 border-b-2 transition-colors",
              activeTab === "live"
                ? "border-arena-accent text-arena-accent"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            💬 Salon de discussion
          </button>
          <button
            onClick={() => setActiveTab("history")}
            className={clsx(
              "text-sm font-semibold pb-1 border-b-2 transition-colors",
              activeTab === "history"
                ? "border-arena-accent text-arena-accent"
                : "border-transparent text-gray-500 hover:text-gray-700"
            )}
          >
            📂 Parties
          </button>
          <span className="ml-auto text-xs text-gray-500">
            {activeTab === "live"
              ? `${events.length} événements`
              : `${totalGames} partie${totalGames > 1 ? "s" : ""}`}
          </span>
        </div>
      </div>

      {/* ─── LIVE TAB ─── */}
      {activeTab === "live" && (
        <div className="relative flex-1" style={{ maxHeight: 720 }}>
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="overflow-y-auto p-3 space-y-2 h-full"
            style={{ overscrollBehavior: "contain" }}
          >
            {events.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-8">
                Les messages apparaîtront ici pendant la partie...
              </div>
            ) : (
              events.map((event, i) => {
                const { main, detail } = formatEvent(event);
                return (
                  <div
                    key={i}
                    className={clsx(
                      "border-l-3 pl-3 py-1.5 animate-slide-up",
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
                          <p className="text-xs text-gray-500 mt-0.5 italic">
                            💭 {detail}
                          </p>
                        )}
                        {event.round > 0 && (
                          <span className="text-[10px] text-gray-400">
                            Tour {event.round}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
            <div className="h-10" />
          </div>
          <div
            className="absolute bottom-0 left-0 right-0 h-16 pointer-events-none rounded-b-xl"
            style={{
              background: "linear-gradient(to top, rgba(255,255,255,0.95) 0%, rgba(255,255,255,0.7) 40%, rgba(255,255,255,0) 100%)",
              backdropFilter: "blur(4px)",
              WebkitBackdropFilter: "blur(4px)",
            }}
          />
        </div>
      )}

      {/* ─── HISTORY TAB ─── */}
      {activeTab === "history" && (
        <div className="flex-1 flex flex-col overflow-hidden" style={{ maxHeight: 720 }}>
          {/* Game selector */}
          <div className="px-3 py-2 border-b border-gray-100 space-y-2">
            {totalGames === 0 ? (
              <p className="text-xs text-gray-400 text-center py-2">Aucune partie enregistrée</p>
            ) : totalGames <= DROPDOWN_LIMIT ? (
              <select
                className="w-full text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-arena-accent/30"
                value={selectedGameNumber ?? ""}
                onChange={(e) => {
                  const num = parseInt(e.target.value, 10);
                  if (!isNaN(num)) loadGameByNumber(num);
                }}
              >
                <option value="">Sélectionner une partie...</option>
                {gamesList.map((g) => (
                  <option key={g.game_number} value={g.game_number}>
                    Partie {g.game_number} — {g.winner || "?"} ({g.civil_word}/{g.undercover_word})
                  </option>
                ))}
              </select>
            ) : (
              <form onSubmit={handleNumberSubmit} className="flex items-center gap-2">
                <span className="text-xs text-gray-500 whitespace-nowrap">{totalGames} parties</span>
                <input
                  type="number"
                  min={1}
                  max={totalGames}
                  value={numberInput}
                  onChange={(e) => setNumberInput(e.target.value)}
                  placeholder={`N° (1-${totalGames})`}
                  className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-arena-accent/30"
                />
                <button
                  type="submit"
                  className="px-3 py-1.5 text-sm bg-arena-accent text-white rounded-lg hover:bg-arena-accent/90 transition-colors"
                >
                  Voir
                </button>
              </form>
            )}
          </div>

          {/* Events display */}
          <div className="flex-1 overflow-y-auto p-3 space-y-2">
            {loadingHistory ? (
              <div className="text-center text-gray-400 text-sm py-8">Chargement...</div>
            ) : selectedGameNumber === null ? (
              <div className="text-center text-gray-400 text-sm py-8">
                Sélectionnez une partie pour voir les discussions
              </div>
            ) : selectedGameEvents.length === 0 ? (
              <div className="text-center text-gray-400 text-sm py-8">
                Aucun événement pour cette partie
              </div>
            ) : (
              <>
                <div className="text-xs text-gray-500 text-center mb-2 font-medium">
                  Partie {selectedGameNumber}
                </div>
                {selectedGameEvents.map((event, i) => {
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
                            <p className="text-xs text-gray-500 mt-0.5 italic">
                              💭 {detail}
                            </p>
                          )}
                          {event.round > 0 && (
                            <span className="text-[10px] text-gray-400">
                              Tour {event.round}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
