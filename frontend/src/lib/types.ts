// Types de données pour Undercover AI Arena

export interface PlayerConfig {
  name: string;
  model_id: string;
  provider: "ollama" | "openrouter";
}

export interface GameConfig {
  players: PlayerConfig[];
  level: number;
  num_games: number;
  session_name: string;
}

export interface GameEvent {
  timestamp: number;
  event_type:
    | "clue"
    | "discussion"
    | "vote"
    | "elimination"
    | "mr_white_guess"
    | "game_end"
    | "system"
    | "batch_progress"
    | "batch_complete"
    | "error";
  round: number;
  player: string | null;
  data: Record<string, any>;
}

export interface PlayerResult {
  name: string;
  model_id: string;
  role: "civil" | "undercover" | "mr_white";
  survived: boolean;
  won: boolean;
  rounds_survived: number;
  clues_given: string[];
  votes_cast: string[];
  correct_votes: number;
  reasoning_log: Array<{
    round: number;
    phase: string;
    reasoning: string;
    target?: string;
  }>;
}

export interface GameDetail {
  game_id: string;
  level: number;
  winner: string;
  civil_word: string;
  undercover_word: string;
  rounds_played: number;
  duration_seconds: number;
  players: PlayerResult[];
  events: GameEvent[];
}

export interface ModelStats {
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
  mr_white_correct_guesses: number;
  avg_rounds_survived: number;
  vote_accuracy: number;
  deception_rate: number;
}

export interface GameSummary {
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

export interface ModelInfo {
  id: string;
  name: string;
  size?: string;
  cost?: string;
  quality?: string;
}

export interface RecommendedModels {
  ollama: { description: string; models: ModelInfo[] };
  openrouter_free: { description: string; models: ModelInfo[] };
  openrouter_cheap: { description: string; models: ModelInfo[] };
}

export interface OllamaModelDetail {
  name: string;
  size: string;
  size_bytes: number;
}

// Modèles catalogue et activés
export interface CatalogModel {
  model_id: string;
  name: string;
  cost: string;
  context_length: number;
  params_info: string;
}

export interface ModelCatalog {
  free: CatalogModel[];
  cheap: CatalogModel[];
}

export interface EnabledModel {
  id: number;
  model_id: string;
  name: string;
  provider: string;
  category: string;
  cost: string;
  context_length: number;
  params_info: string;
  enabled_at: string;
}

export type GamePhase =
  | "config"
  | "running"
  | "clue"
  | "discussion"
  | "vote"
  | "elimination"
  | "ended";

export interface ActivePlayer {
  name: string;
  model_id: string;
  provider: string;
  alive: boolean;
  role?: string; // Visible seulement après élimination ou fin de partie
  word?: string; // Mot secret du joueur (pour l'observateur)
  currentClue?: string;
  lastMessage?: string;
  votedFor?: string;
}
