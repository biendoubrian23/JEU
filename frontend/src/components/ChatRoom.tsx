"use client";

import { GameEvent } from "@/lib/types";
import { clsx } from "clsx";
import { useEffect, useRef } from "react";

interface ChatRoomProps {
  events: GameEvent[];
  showReasoning: boolean;
}

export default function ChatRoom({ events, showReasoning }: ChatRoomProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
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
      <div className="px-4 py-3 border-b border-arena-border flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900">💬 Salon de discussion</h3>
        <span className="text-xs text-gray-500">{events.length} événements</span>
      </div>

      <div
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-3 space-y-2"
        style={{ maxHeight: 500 }}
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
      </div>
    </div>
  );
}
