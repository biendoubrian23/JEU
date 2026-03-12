"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import GameConfig from "@/components/GameConfig";
import GameTable from "@/components/GameTable";
import ChatRoom from "@/components/ChatRoom";
import ReasoningPanel from "@/components/ReasoningPanel";
import { startGame, startExperiment, createWebSocket, stopGame, pauseGame, stopAllGames } from "@/lib/api";
import { GameEvent, ActivePlayer, PlayerConfig, PlayerResult } from "@/lib/types";

export default function HomePage() {
  const [gameRunning, setGameRunning] = useState(false);
  const [events, setEvents] = useState<GameEvent[]>([]);
  const [players, setPlayers] = useState<ActivePlayer[]>([]);
  const [currentPhase, setCurrentPhase] = useState("config");
  const [currentRound, setCurrentRound] = useState(0);
  const [gameId, setGameId] = useState<string | null>(null);
  const [gameWords, setGameWords] = useState<{ civil: string; undercover: string } | null>(null);
  const [showReasoning, setShowReasoning] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState<string | null>(null);
  const [finishedPlayers, setFinishedPlayers] = useState<PlayerResult[]>([]);
  const [batchProgress, setBatchProgress] = useState<{ current: number; total: number } | null>(null);
  const [paused, setPaused] = useState(false);
  const [reasoningModalPlayer, setReasoningModalPlayer] = useState<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const handleEvent = useCallback((event: GameEvent) => {
    setEvents((prev) => [...prev, event]);

    switch (event.event_type) {
      case "system":
        if (event.data.players) {
          setPlayers(
            event.data.players.map((p: any) => ({
              name: p.name,
              model_id: p.model,
              provider: "",
              alive: true,
              role: p.role,
              word: p.word || "",
            }))
          );
        }
        if (event.data.civil_word && event.data.civil_word !== "***") {
          setGameWords({ civil: event.data.civil_word, undercover: event.data.undercover_word });
        }
        break;

      case "clue":
        setCurrentPhase("clue");
        setCurrentRound(event.round);
        setPlayers((prev) =>
          prev.map((p) =>
            p.name === event.player
              ? { ...p, currentClue: event.data.clue }
              : p
          )
        );
        break;

      case "discussion":
        setCurrentPhase("discussion");
        setPlayers((prev) =>
          prev.map((p) =>
            p.name === event.player
              ? { ...p, lastMessage: event.data.message }
              : p
          )
        );
        break;

      case "vote":
        setCurrentPhase("vote");
        setPlayers((prev) =>
          prev.map((p) =>
            p.name === event.player
              ? { ...p, votedFor: event.data.vote }
              : p
          )
        );
        break;

      case "elimination":
        setCurrentPhase("elimination");
        setPlayers((prev) =>
          prev.map((p) =>
            p.name === event.data.player
              ? { ...p, alive: false, role: event.data.role }
              : p
          )
        );
        break;

      case "mr_white_guess":
        setCurrentPhase("mr_white_guess");
        break;

      case "game_end":
        setCurrentPhase("ended");
        // Révéler tous les rôles
        if (event.data.players) {
          setPlayers((prev) =>
            prev.map((p) => {
              const pd = event.data.players.find(
                (ep: any) => ep.name === p.name
              );
              return pd ? { ...p, role: pd.role, alive: pd.alive } : p;
            })
          );
          setFinishedPlayers(
            event.data.players.map((p: any) => ({
              name: p.name,
              model_id: p.model,
              role: p.role,
              survived: p.alive,
              won: false,
              rounds_survived: 0,
              clues_given: p.clues || [],
              votes_cast: [],
              correct_votes: 0,
              reasoning_log: [],
            }))
          );
        }
        break;

      case "batch_progress":
        setBatchProgress({
          current: event.data.current_game,
          total: event.data.total_games,
        });
        // Reset pour la nouvelle partie
        if (event.data.current_game > 1) {
          setEvents([]);
          setPlayers([]);
          setCurrentPhase("setup");
          setCurrentRound(0);
          setFinishedPlayers([]);
          setGameWords(null);
        }
        setGameId(event.data.game_id);
        break;

      case "batch_complete":
        setGameRunning(false);
        setBatchProgress(null);
        break;

      case "error":
        console.error("Game error:", event.data.message);
        break;
    }
  }, []);

  // Connecter le WebSocket au montage (un seul à la fois)
  useEffect(() => {
    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (cancelled) return;
      const ws = createWebSocket(handleEvent);
      wsRef.current = ws;

      ws.onclose = () => {
        if (cancelled) return;
        // Reconnexion automatique après 2s
        reconnectTimer = setTimeout(connect, 2000);
      };
    }

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      wsRef.current?.close();
    };
  }, [handleEvent]);

  const handleStart = async (config: {
    players: PlayerConfig[];
    level: number;
    numGames: number;
    sessionName: string;
  }) => {
    try {
      setGameRunning(true);
      setEvents([]);
      setPlayers([]);
      setCurrentPhase("setup");
      setCurrentRound(0);
      setFinishedPlayers([]);
      setGameId(null);
      setGameWords(null);

      await startGame({
        players: config.players,
        level: config.level,
        num_games: config.numGames,
        session_name: config.sessionName,
      });
    } catch (error) {
      console.error("Failed to start game:", error);
      setGameRunning(false);
      alert("Erreur lors du lancement de la partie. Vérifiez que le backend est démarré.");
    }
  };

  const handleStartExperiment = async (config: {
    target: PlayerConfig;
    opponents: PlayerConfig[];
    gamesAsUc: number;
    gamesAsMw: number;
    level: number;
    sessionName: string;
  }) => {
    try {
      setGameRunning(true);
      setEvents([]);
      setPlayers([]);
      setCurrentPhase("setup");
      setCurrentRound(0);
      setFinishedPlayers([]);
      setGameId(null);
      setGameWords(null);

      await startExperiment({
        target: config.target,
        opponents: config.opponents,
        games_as_uc: config.gamesAsUc,
        games_as_mw: config.gamesAsMw,
        level: config.level,
        session_name: config.sessionName,
      });
    } catch (error) {
      console.error("Failed to start experiment:", error);
      setGameRunning(false);
      alert("Erreur lors du lancement de l'expérience. Vérifiez que le backend est démarré.");
    }
  };

  const handlePause = async () => {
    if (gameId) {
      const res = await pauseGame(gameId);
      setPaused(res.status === "paused");
    }
  };

  const handleStop = async () => {
    await stopAllGames();
    setGameRunning(false);
    setBatchProgress(null);
    setPaused(false);
  };

  const handlePlayerClick = (playerName: string) => {
    setReasoningModalPlayer(playerName);
  };

  // Récupérer le raisonnement du joueur sélectionné
  const modalPlayerEvents = reasoningModalPlayer
    ? events.filter(
        (e) =>
          e.player === reasoningModalPlayer &&
          (e.event_type === "clue" || e.event_type === "discussion" || e.event_type === "vote")
      )
    : [];

  return (
    <div className="space-y-6">
      {/* Titre */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            🕵️ Partie Undercover
          </h1>
          <p className="text-sm text-gray-500">
            Configurez les joueurs IA et lancez une partie
          </p>
        </div>
        <div className="flex items-center gap-3">
          {gameRunning && (
            <>
              <button
                onClick={handlePause}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  paused
                    ? "bg-green-100 text-green-700 hover:bg-green-200"
                    : "bg-amber-100 text-amber-700 hover:bg-amber-200"
                }`}
              >
                {paused ? (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
                    Reprendre
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/></svg>
                    Pause
                  </>
                )}
              </button>
              <button
                onClick={handleStop}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium bg-red-100 text-red-700 hover:bg-red-200 transition-colors"
              >
                <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24"><path d="M6 6h12v12H6z"/></svg>
                Stop
              </button>
            </>
          )}
          <label className="flex items-center gap-2 text-sm text-gray-600">
            <input
              type="checkbox"
              checked={showReasoning}
              onChange={(e) => setShowReasoning(e.target.checked)}
              className="rounded border-gray-300"
            />
            Voir le raisonnement
          </label>
        </div>
      </div>

      <div className="grid grid-cols-12 gap-6">
        {/* Colonne gauche : Config + Raisonnement */}
        <div className="col-span-4 space-y-6">
          <GameConfig onStart={handleStart} onStartExperiment={handleStartExperiment} disabled={gameRunning} />
          {finishedPlayers.length > 0 && (
            <ReasoningPanel
              players={finishedPlayers}
              selectedPlayer={selectedPlayer}
              onSelectPlayer={setSelectedPlayer}
            />
          )}
        </div>

        {/* Colonne centrale : Table de jeu */}
        <div className="col-span-4">
          <GameTable
            players={players}
            currentPhase={currentPhase}
            currentRound={currentRound}
            events={events}
            gameId={gameId}
            gameWords={gameWords || undefined}
            batchProgress={batchProgress || undefined}
            onPlayerClick={handlePlayerClick}
          />
        </div>

        {/* Colonne droite : Chat */}
        <div className="col-span-4">
          <ChatRoom events={events} showReasoning={showReasoning} />
        </div>
      </div>

      {/* Modal Raisonnement Joueur */}
      {reasoningModalPlayer && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={() => setReasoningModalPlayer(null)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-100">
              <div>
                <h3 className="text-lg font-bold text-gray-900">
                  🧠 Raisonnement — {reasoningModalPlayer}
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {players.find((p) => p.name === reasoningModalPlayer)?.model_id?.split("/").pop()?.replace(":free", "")}
                  {" · "}
                  {players.find((p) => p.name === reasoningModalPlayer)?.role && (
                    <span className="font-medium capitalize">
                      {players.find((p) => p.name === reasoningModalPlayer)?.role}
                    </span>
                  )}
                </p>
              </div>
              <button
                onClick={() => setReasoningModalPlayer(null)}
                className="p-1.5 rounded-lg hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors"
                title="Fermer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto p-5 space-y-3">
              {modalPlayerEvents.length === 0 ? (
                <p className="text-sm text-gray-400 text-center py-8">
                  Aucun raisonnement disponible pour le moment.
                </p>
              ) : (
                modalPlayerEvents.map((evt, i) => {
                  const phaseIcons: Record<string, string> = {
                    clue: "🔍",
                    discussion: "💬",
                    vote: "🗳️",
                  };
                  const phaseLabels: Record<string, string> = {
                    clue: "Indice",
                    discussion: "Discussion",
                    vote: "Vote",
                  };
                  return (
                    <div key={i} className="rounded-lg border border-gray-100 p-3">
                      <div className="flex items-center gap-2 mb-1.5">
                        <span className="text-sm">{phaseIcons[evt.event_type] || "📝"}</span>
                        <span className="text-xs font-semibold text-gray-700">
                          Tour {evt.round} — {phaseLabels[evt.event_type] || evt.event_type}
                        </span>
                        {evt.event_type === "vote" && evt.data.vote && (
                          <span className="text-[10px] bg-red-50 text-red-600 px-1.5 py-0.5 rounded-full">
                            → {evt.data.vote}
                          </span>
                        )}
                        {evt.event_type === "clue" && evt.data.clue && (
                          <span className="text-[10px] bg-indigo-50 text-indigo-600 px-1.5 py-0.5 rounded-full">
                            &quot;{evt.data.clue}&quot;
                          </span>
                        )}
                      </div>
                      {evt.data.reasoning ? (
                        <p className="text-xs text-gray-600 leading-relaxed whitespace-pre-wrap">
                          {evt.data.reasoning}
                        </p>
                      ) : (
                        <p className="text-xs text-gray-400 italic">Pas de raisonnement explicite</p>
                      )}
                      {evt.event_type === "discussion" && evt.data.message && (
                        <p className="mt-1.5 text-xs text-gray-800 bg-gray-50 rounded px-2 py-1">
                          💬 {evt.data.message}
                        </p>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
