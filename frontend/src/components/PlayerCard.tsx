"use client";

import { ActivePlayer } from "@/lib/types";
import { clsx } from "clsx";

interface PlayerCardProps {
  player: ActivePlayer;
  isActive: boolean;
}

export default function PlayerCard({ player, isActive }: PlayerCardProps) {
  const roleColors: Record<string, string> = {
    civil: "border-blue-400 bg-blue-50",
    undercover: "border-red-400 bg-red-50",
    mr_white: "border-purple-400 bg-purple-50",
  };

  const roleEmojis: Record<string, string> = {
    civil: "👤",
    undercover: "🕵️",
    mr_white: "👻",
  };

  const modelShortName = player.model_id
    .split("/")
    .pop()
    ?.replace(":free", "")
    ?.substring(0, 12) || "?";

  return (
    <div
      className={clsx(
        "w-28 rounded-xl border-2 p-2 text-center transition-all duration-300 shadow-sm",
        !player.alive && "opacity-40 grayscale",
        isActive && "ring-2 ring-arena-accent ring-offset-2 scale-110",
        player.role ? roleColors[player.role] : "border-gray-200 bg-white"
      )}
    >
      {/* Avatar */}
      <div className="text-2xl mb-0.5">
        {!player.alive
          ? "💀"
          : player.role
          ? roleEmojis[player.role]
          : "🤖"}
      </div>

      {/* Nom */}
      <p className="text-xs font-bold text-gray-900 truncate">{player.name}</p>

      {/* Modèle */}
      <p className="text-[10px] text-gray-500 truncate">{modelShortName}</p>

      {/* Mot secret (pour l'observateur) */}
      {player.word && (
        <p className="text-[9px] text-gray-400 truncate italic">
          « {player.word} »
        </p>
      )}

      {/* Dernier indice */}
      {player.currentClue && (
        <p className="mt-1 text-xs font-medium text-indigo-700 bg-indigo-100 rounded px-1 py-0.5 truncate">
          &quot;{player.currentClue}&quot;
        </p>
      )}

      {/* Rôle (si révélé) */}
      {player.role && (
        <span
          className={clsx("mt-1 inline-block text-[10px] font-medium px-1.5 py-0.5 rounded-full", {
            "bg-blue-200 text-blue-800": player.role === "civil",
            "bg-red-200 text-red-800": player.role === "undercover",
            "bg-purple-200 text-purple-800": player.role === "mr_white",
          })}
        >
          {player.role === "mr_white" ? "Mr. White" : player.role}
        </span>
      )}
    </div>
  );
}
