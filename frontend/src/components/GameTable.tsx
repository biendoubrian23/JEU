"use client";

import { ActivePlayer, GameEvent } from "@/lib/types";
import PlayerCard from "./PlayerCard";

interface GameTableProps {
  players: ActivePlayer[];
  currentPhase: string;
  currentRound: number;
  events: GameEvent[];
  gameId: string | null;
  gameWords?: { civil: string; undercover: string };
  batchProgress?: { current: number; total: number };
  onPlayerClick?: (playerName: string) => void;
}

export default function GameTable({
  players,
  currentPhase,
  currentRound,
  events,
  gameId,
  gameWords,
  batchProgress,
  onPlayerClick,
}: GameTableProps) {
  // Positionner les joueurs en cercle
  const radius = 200;
  const centerX = 250;
  const centerY = 250;

  const getPosition = (index: number, total: number) => {
    const angle = (2 * Math.PI * index) / total - Math.PI / 2;
    return {
      x: centerX + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    };
  };

  const phaseLabels: Record<string, string> = {
    config: "Configuration",
    setup: "Préparation",
    clue: "🔍 Phase d'indices",
    discussion: "💬 Discussion",
    vote: "🗳️ Vote",
    elimination: "💀 Élimination",
    mr_white_guess: "🎭 Mr. White devine",
    ended: "🏆 Terminé",
  };

  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  return (
    <div className="bg-white rounded-xl border border-arena-border p-6">
      {/* Header du jeu */}
      <div className="flex items-center justify-between mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">
            🎮 Table de jeu
          </h2>
          {gameId && (
            <p className="text-xs text-gray-500">
              Partie #{gameId} · Tour {currentRound}
            </p>
          )}
        </div>
        <div className="flex items-center gap-3">
          {batchProgress && (
            <span className="text-xs bg-indigo-100 text-indigo-700 px-3 py-1 rounded-full font-medium">
              Partie {batchProgress.current}/{batchProgress.total}
            </span>
          )}
          <span
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              currentPhase === "ended"
                ? "bg-green-100 text-green-700"
                : currentPhase === "config"
                ? "bg-gray-100 text-gray-600"
                : "bg-amber-100 text-amber-700 animate-pulse-slow"
            }`}
          >
            {phaseLabels[currentPhase] || currentPhase}
          </span>
        </div>
      </div>

      {/* Table circulaire */}
      {players.length > 0 ? (
        <div className="relative mx-auto" style={{ width: 500, height: 500 }}>
          {/* Cercle central (table) */}
          <div
            className="absolute rounded-full bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-100 flex items-center justify-center"
            style={{
              width: 200,
              height: 200,
              left: centerX - 100,
              top: centerY - 100,
            }}
          >
            <div className="text-center">
              <span className="text-3xl">🕵️</span>
              <p className="text-xs text-gray-500 mt-1 font-medium">UNDERCOVER</p>
              {gameWords && (
                <div className="mt-1.5 space-y-0.5">
                  <p className="text-[10px] font-semibold text-blue-600 bg-blue-50 rounded px-1.5 py-0.5">👤 {gameWords.civil}</p>
                  <p className="text-[10px] font-semibold text-red-600 bg-red-50 rounded px-1.5 py-0.5">🕵️ {gameWords.undercover}</p>
                </div>
              )}
              {!gameWords && currentPhase !== "config" && currentPhase !== "ended" && (
                <p className="text-xs text-indigo-600 mt-0.5">Tour {currentRound}</p>
              )}
            </div>
          </div>

          {/* Joueurs autour de la table */}
          {players.map((player, i) => {
            const pos = getPosition(i, players.length);
            return (
              <div
                key={player.name}
                className="player-seat cursor-pointer"
                style={{ left: pos.x, top: pos.y }}
                onClick={() => onPlayerClick?.(player.name)}
              >
                <PlayerCard
                  player={player}
                  isActive={
                    lastEvent?.player === player.name &&
                    currentPhase !== "ended"
                  }
                />
              </div>
            );
          })}

          {/* Lignes de connexion (optionnel, pour le vote) */}
          {currentPhase === "vote" && (
            <svg
              className="absolute inset-0 pointer-events-none"
              width={500}
              height={500}
            >
              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="8"
                  markerHeight="6"
                  refX="8"
                  refY="3"
                  orient="auto"
                >
                  <polygon points="0 0, 8 3, 0 6" fill="#ef4444" opacity="0.7" />
                </marker>
              </defs>
              {players
                .filter((p) => p.votedFor)
                .map((voter, i) => {
                  const voterPos = getPosition(
                    players.indexOf(voter),
                    players.length
                  );
                  const target = players.find((p) => p.name === voter.votedFor);
                  if (!target) return null;
                  const targetPos = getPosition(
                    players.indexOf(target),
                    players.length
                  );
                  // Raccourcir la ligne pour que la flèche pointe vers le bord de la carte
                  const dx = targetPos.x - voterPos.x;
                  const dy = targetPos.y - voterPos.y;
                  const dist = Math.sqrt(dx * dx + dy * dy);
                  const shortenBy = 45;
                  const endX = dist > shortenBy ? targetPos.x - (dx / dist) * shortenBy : targetPos.x;
                  const endY = dist > shortenBy ? targetPos.y - (dy / dist) * shortenBy : targetPos.y;
                  return (
                    <line
                      key={i}
                      x1={voterPos.x}
                      y1={voterPos.y}
                      x2={endX}
                      y2={endY}
                      stroke="#ef4444"
                      strokeWidth={1.5}
                      strokeDasharray="4 4"
                      opacity={0.5}
                      markerEnd="url(#arrowhead)"
                    />
                  );
                })}
            </svg>
          )}
        </div>
      ) : (
        <div className="flex items-center justify-center h-96 text-gray-400">
          <div className="text-center">
            <span className="text-6xl">🎭</span>
            <p className="mt-4 text-sm">
              Configurez les joueurs et lancez une partie
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
