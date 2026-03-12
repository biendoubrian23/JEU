// Client API pour communiquer avec le backend FastAPI

const API_BASE = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const WS_BASE = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000";

// ============================================================
// Jeu
// ============================================================

export async function startGame(config: {
  players: Array<{ name: string; model_id: string; provider: string }>;
  level: number;
  num_games: number;
  session_name: string;
}) {
  const res = await fetch(`${API_BASE}/api/game/start`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(config),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getGame(gameId: string) {
  const res = await fetch(`${API_BASE}/api/game/${gameId}`);
  if (!res.ok) throw new Error("Partie non trouvée");
  return res.json();
}

export async function getGameReasoning(gameId: string) {
  const res = await fetch(`${API_BASE}/api/game/${gameId}/reasoning`);
  if (!res.ok) throw new Error("Partie non trouvée");
  return res.json();
}

export async function stopGame(gameId: string) {
  const res = await fetch(`${API_BASE}/api/game/stop/${gameId}`, {
    method: "POST",
  });
  return res.json();
}

// ============================================================
// Statistiques
// ============================================================

export async function getStats(level: number = 0) {
  const res = await fetch(`${API_BASE}/api/stats?level=${level}`);
  return res.json();
}

export async function getRankings() {
  const res = await fetch(`${API_BASE}/api/stats/rankings`);
  return res.json();
}

export async function getGames(limit: number = 50, sessionId?: number) {
  let url = `${API_BASE}/api/games?limit=${limit}`;
  if (sessionId) url += `&session_id=${sessionId}`;
  const res = await fetch(url);
  return res.json();
}

export async function getSessions() {
  const res = await fetch(`${API_BASE}/api/sessions`);
  return res.json();
}

export async function deleteGame(gameId: string) {
  const res = await fetch(`${API_BASE}/api/games/${gameId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Erreur suppression partie");
  return res.json();
}

export async function deleteSession(sessionId: number) {
  const res = await fetch(`${API_BASE}/api/sessions/${sessionId}`, {
    method: "DELETE",
  });
  if (!res.ok) throw new Error("Erreur suppression session");
  return res.json();
}

export async function getAnalytics(sessionId?: number) {
  let url = `${API_BASE}/api/analytics`;
  if (sessionId) url += `?session_id=${sessionId}`;
  const res = await fetch(url);
  return res.json();
}

// ============================================================
// Configuration
// ============================================================

export async function getOllamaModels() {
  const res = await fetch(`${API_BASE}/api/models/ollama`);
  return res.json();
}

export async function getOpenRouterModels() {
  const res = await fetch(`${API_BASE}/api/models/openrouter`);
  return res.json();
}

export async function getRecommendedModels() {
  const res = await fetch(`${API_BASE}/api/models/recommended`);
  return res.json();
}

// ============================================================
// Gestion des modèles (catalogue + activés)
// ============================================================

export async function getModelCatalog() {
  const res = await fetch(`${API_BASE}/api/models/catalog`);
  return res.json();
}

export async function pingAllModels() {
  const res = await fetch(`${API_BASE}/api/models/ping`, { method: "POST" });
  return res.json();
}

export async function pingOneModel(modelId: string) {
  const res = await fetch(`${API_BASE}/api/models/ping/${encodeURIComponent(modelId)}`, { method: "POST" });
  return res.json();
}

export async function getPingResults() {
  const res = await fetch(`${API_BASE}/api/models/ping`);
  return res.json();
}

export async function getEnabledModels() {
  const res = await fetch(`${API_BASE}/api/models/enabled`);
  return res.json();
}

export async function addEnabledModel(model: {
  model_id: string;
  name: string;
  provider?: string;
  category?: string;
  cost?: string;
  context_length?: number;
  params_info?: string;
}) {
  const res = await fetch(`${API_BASE}/api/models/enabled`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(model),
  });
  return res.json();
}

export async function removeEnabledModel(modelId: string) {
  const res = await fetch(
    `${API_BASE}/api/models/enabled/${encodeURIComponent(modelId)}`,
    { method: "DELETE" }
  );
  return res.json();
}

export async function bulkEnableModels(modelIds: string[]) {
  const res = await fetch(`${API_BASE}/api/models/enabled/bulk`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model_ids: modelIds }),
  });
  return res.json();
}

export async function getWordPairs() {
  const res = await fetch(`${API_BASE}/api/word-pairs`);
  return res.json();
}

export async function getRoleDistribution(numPlayers: number) {
  const res = await fetch(`${API_BASE}/api/role-distribution/${numPlayers}`);
  return res.json();
}

export async function healthCheck() {
  const res = await fetch(`${API_BASE}/api/health`);
  return res.json();
}

// ============================================================
// Contrôles de partie (Pause / Stop)
// ============================================================

export async function pauseGame(gameId: string) {
  const res = await fetch(`${API_BASE}/api/game/pause/${gameId}`, {
    method: "POST",
  });
  return res.json();
}

export async function stopAllGames() {
  const res = await fetch(`${API_BASE}/api/game/stop-all`, {
    method: "POST",
  });
  return res.json();
}

// ============================================================
// WebSocket
// ============================================================

export function createWebSocket(onMessage: (data: any) => void): WebSocket {
  const ws = new WebSocket(`${WS_BASE}/ws`);

  ws.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onMessage(data);
    } catch (e) {
      console.error("WebSocket parse error:", e);
    }
  };

  ws.onerror = () => {
    // Silencieux — la reconnexion est gérée par onclose dans page.tsx
  };

  return ws;
}
