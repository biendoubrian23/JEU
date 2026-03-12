"""Backend principal - Undercover AI Arena.

FastAPI + WebSocket pour orchestrer les parties d'Undercover entre IA.
"""
import asyncio
import json
import sys
import os
import time
from pathlib import Path
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

# Ajouter le dossier backend au path
sys.path.insert(0, str(Path(__file__).parent))

from config import settings
from game.engine import UndercoverEngine, GameState, Player
from game.word_pairs import get_all_pairs, get_random_pair
from game.roles import get_role_distribution
from game.prompts import level2_memory_prompt, level3_tendencies_prompt, level4_meta_prompt
from ai.ollama_provider import OllamaProvider
from ai.openrouter_provider import OpenRouterProvider
from database.db import Database

# ============================================================
# Initialisation
# ============================================================

db = Database(settings.DATABASE_PATH)
ollama = OllamaProvider(settings.OLLAMA_BASE_URL)
openrouter = OpenRouterProvider(settings.OPENROUTER_API_KEY)

# Stocker les WebSocket actives et les parties en cours
active_connections: list[WebSocket] = []
running_games: dict[str, GameState] = {}
game_stop_flags: dict[str, bool] = {}
game_pause_flags: dict[str, bool] = {}
batch_stop_flag: bool = False

# Cache des résultats de ping des modèles
# {"model_id": {"ok": bool, "latency_ms": int, "error": str, "timestamp": float}}
model_ping_cache: dict[str, dict] = {}


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle de l'application."""
    # Créer le dossier data
    Path(settings.DATABASE_PATH).parent.mkdir(parents=True, exist_ok=True)
    yield
    await ollama.close()
    await openrouter.close()


app = FastAPI(
    title="Undercover AI Arena",
    description="Faites jouer des IA au jeu Undercover !",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ============================================================
# WebSocket Manager
# ============================================================

async def broadcast(data: dict):
    """Envoie un événement à tous les clients WebSocket connectés."""
    message = json.dumps(data, ensure_ascii=False)
    disconnected = []
    for ws in active_connections:
        try:
            await ws.send_text(message)
        except Exception:
            disconnected.append(ws)
    for ws in disconnected:
        if ws in active_connections:
            active_connections.remove(ws)


@app.websocket("/ws")
async def websocket_endpoint(ws: WebSocket):
    await ws.accept()
    active_connections.append(ws)
    try:
        while True:
            data = await ws.receive_text()
            # Le client peut envoyer des commandes (ex: stop)
            try:
                msg = json.loads(data)
                if msg.get("action") == "stop" and msg.get("game_id"):
                    game_stop_flags[msg["game_id"]] = True
            except json.JSONDecodeError:
                pass
    except WebSocketDisconnect:
        if ws in active_connections:
            active_connections.remove(ws)


# ============================================================
# AI Call Dispatcher
# ============================================================

async def ai_call(model_id: str, provider: str, system_prompt: str, user_prompt: str) -> str:
    """Dispatche un appel vers le bon provider AI."""
    if provider == "ollama":
        return await ollama.chat(model_id, system_prompt, user_prompt, max_tokens=settings.MAX_TOKENS)
    elif provider == "openrouter":
        return await openrouter.chat(model_id, system_prompt, user_prompt, max_tokens=settings.MAX_TOKENS)
    else:
        return '{"error": "Provider inconnu"}'


# ============================================================
# Pydantic Models
# ============================================================

class PlayerConfig(BaseModel):
    name: str
    model_id: str
    provider: str  # "ollama" ou "openrouter"


class GameConfig(BaseModel):
    players: list[PlayerConfig]
    level: int = 1
    num_games: int = 1
    session_name: str = "Partie rapide"


class BatchConfig(BaseModel):
    players: list[PlayerConfig]
    level: int = 1
    num_games: int = 10
    session_name: str = "Session batch"


# ============================================================
# Routes API - Jeu
# ============================================================

@app.post("/api/game/start")
async def start_game(config: GameConfig):
    """Lance une ou plusieurs parties."""
    if len(config.players) < 3:
        raise HTTPException(status_code=400, detail="Minimum 3 joueurs requis")
    if len(config.players) > 20:
        raise HTTPException(status_code=400, detail="Maximum 20 joueurs")

    # Créer une session si plusieurs parties
    session_id = None
    if config.num_games > 1:
        session_id = db.create_session(config.session_name, config.level, config.num_games)

    # Lancer les parties en arrière-plan
    global batch_stop_flag
    batch_stop_flag = False
    asyncio.create_task(
        _run_games(config, session_id)
    )

    return {
        "status": "started",
        "num_games": config.num_games,
        "players": len(config.players),
        "level": config.level,
        "session_id": session_id,
    }


async def _run_games(config: GameConfig, session_id: int | None):
    """Exécute les parties séquentiellement."""
    print(f"\n{'='*60}")
    print(f"🎮 Lancement de {config.num_games} partie(s) — {len(config.players)} joueurs — Niveau {config.level}")
    print(f"{'='*60}")
    previous_games = []

    for game_num in range(config.num_games):
        # Construire le contexte de niveau
        level_context = ""
        if config.level >= 2 and previous_games:
            level_context += level2_memory_prompt(previous_games)
        if config.level >= 3 and previous_games:
            # Calculer les tendances
            tendencies = _compute_tendencies(previous_games)
            level_context += level3_tendencies_prompt(tendencies)
        if config.level >= 4:
            rankings = db.get_all_stats(level=0)
            level_context += level4_meta_prompt(rankings)

        # Créer le moteur de jeu (flags stop/pause ajoutés après setup)
        engine = UndercoverEngine(
            ai_call=ai_call,
            event_callback=broadcast,
        )

        # Préparer les joueurs
        player_configs = [p.model_dump() for p in config.players]

        # Setup de la partie
        state = engine.setup_game(
            player_configs=player_configs,
            level=config.level,
            level_context=level_context,
        )

        running_games[state.game_id] = state
        game_stop_flags[state.game_id] = False
        game_pause_flags[state.game_id] = False

        # Maintenant que state existe, brancher les flags stop/pause
        gid = state.game_id
        engine._should_stop = lambda gid=gid: game_stop_flags.get(gid, False) or batch_stop_flag
        engine._is_paused = lambda gid=gid: game_pause_flags.get(gid, False)

        # Notifier le début
        print(f"\n▶ Partie {game_num + 1}/{config.num_games} — ID {state.game_id}")
        await broadcast({
            "event_type": "batch_progress",
            "data": {
                "current_game": game_num + 1,
                "total_games": config.num_games,
                "game_id": state.game_id,
            },
        })

        # Jouer la partie
        try:
            state = await engine.run_game(state)
            print(f"  ✅ Partie terminée — Gagnant: {state.winner or '?'}")
        except Exception as e:
            print(f"  ❌ Erreur partie {game_num + 1}: {e}")
            await broadcast({
                "event_type": "error",
                "data": {"message": f"Erreur partie {game_num + 1}: {str(e)}"},
            })
            continue

        # Calculer les métriques
        metrics = engine.compute_metrics(state)
        # Ajouter le provider aux métriques
        for p in state.players:
            if p.name in metrics["players"]:
                metrics["players"][p.name]["provider"] = p.provider

        # Sauvegarder en base
        try:
            game_db_id = db.save_game(metrics, session_id)
            # Sauvegarder les événements
            events_data = [
                {
                    "timestamp": e.timestamp,
                    "event_type": e.event_type,
                    "round": e.round_num,
                    "player": e.player,
                    "data": e.data,
                }
                for e in state.events
            ]
            db.save_game_events(state.game_id, events_data)
        except Exception as e:
            print(f"Erreur sauvegarde: {e}")

        # Stocker pour le contexte des prochaines parties
        previous_games.append({
            "winner_role": state.winner,
            "eliminated": [e["player"] for e in state.eliminated],
            "rounds": state.current_round,
        })

        # Nettoyage
        if state.game_id in running_games:
            del running_games[state.game_id]
        if state.game_id in game_stop_flags:
            del game_stop_flags[state.game_id]
        if state.game_id in game_pause_flags:
            del game_pause_flags[state.game_id]

        # Vérifier si le batch est stoppé
        if batch_stop_flag:
            break

        # Petit délai entre les parties
        if game_num < config.num_games - 1:
            await asyncio.sleep(1)

    # Notifier la fin du batch
    await broadcast({
        "event_type": "batch_complete",
        "data": {
            "total_games": config.num_games,
            "session_id": session_id,
        },
    })


def _compute_tendencies(previous_games: list[dict]) -> dict:
    """Calcule les tendances des joueurs à partir des parties précédentes."""
    tendencies = {}
    # Utiliser les stats globales de la DB
    stats = db.get_all_stats(level=0)
    for s in stats:
        tendencies[s["model_id"]] = {
            "wins": s["wins"],
            "correct_votes": s["vote_accuracy"],
            "avg_survival": s["avg_rounds_survived"],
        }
    return tendencies


@app.post("/api/game/stop/{game_id}")
async def stop_game(game_id: str):
    """Arrête une partie en cours."""
    game_stop_flags[game_id] = True
    return {"status": "stopping", "game_id": game_id}


@app.post("/api/game/pause/{game_id}")
async def pause_game(game_id: str):
    """Met en pause / reprend une partie."""
    current = game_pause_flags.get(game_id, False)
    game_pause_flags[game_id] = not current
    status = "paused" if not current else "resumed"
    await broadcast({"event_type": "system", "round": 0, "player": None,
                     "data": {"message": f"Partie {status}"}})
    return {"status": status, "game_id": game_id}


@app.post("/api/game/stop-all")
async def stop_all_games():
    """Arrête toutes les parties et le batch en cours."""
    global batch_stop_flag
    batch_stop_flag = True
    for gid in list(game_stop_flags.keys()):
        game_stop_flags[gid] = True
    await broadcast({"event_type": "batch_complete",
                     "data": {"total_games": 0, "session_id": None, "stopped": True}})
    return {"status": "all_stopped"}


@app.get("/api/game/{game_id}")
async def get_game(game_id: str):
    """Récupère le détail d'une partie."""
    detail = db.get_game_detail(game_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Partie non trouvée")
    return detail


@app.get("/api/game/{game_id}/reasoning")
async def get_game_reasoning(game_id: str):
    """Récupère le raisonnement privé de tous les joueurs d'une partie."""
    detail = db.get_game_detail(game_id)
    if not detail:
        raise HTTPException(status_code=404, detail="Partie non trouvée")

    reasoning = {}
    for player in detail.get("players", []):
        reasoning[player["name"]] = {
            "model": player["model_id"],
            "role": player["role"],
            "log": player.get("reasoning_log", []),
        }
    return reasoning


# ============================================================
# Routes API - Analytics
# ============================================================

@app.get("/api/analytics")
async def get_analytics(session_id: int | None = None):
    """Données complètes pour la page Analytics."""
    return db.get_rich_analytics(session_id=session_id)


# ============================================================
# Routes API - Statistiques
# ============================================================

@app.get("/api/stats")
async def get_stats(level: int = 0):
    """Retourne les statistiques globales ou par niveau."""
    return db.get_all_stats(level=level)


@app.get("/api/stats/rankings")
async def get_rankings():
    """Retourne le classement des modèles."""
    stats = db.get_all_stats(level=0)
    # Trier par taux de victoire
    stats.sort(key=lambda x: x["win_rate"], reverse=True)
    return stats


@app.get("/api/stats/by-level/{level}")
async def get_stats_by_level(level: int):
    """Statistiques pour un niveau spécifique."""
    return db.get_all_stats(level=level)


@app.get("/api/games")
async def list_games(limit: int = 50, session_id: int | None = None):
    """Liste les parties jouées."""
    return db.get_games_list(limit=limit, session_id=session_id)


@app.get("/api/sessions")
async def list_sessions():
    """Liste les sessions de jeu."""
    return db.get_sessions()


@app.delete("/api/games/{game_id}")
async def delete_game(game_id: str):
    """Supprime une partie et ses données."""
    success = db.delete_game(game_id)
    if not success:
        raise HTTPException(status_code=404, detail="Partie non trouvée")
    return {"status": "deleted", "game_id": game_id}


@app.delete("/api/sessions/{session_id}")
async def delete_session(session_id: int):
    """Supprime une session et toutes ses parties."""
    success = db.delete_session(session_id)
    if not success:
        raise HTTPException(status_code=404, detail="Session non trouvée")
    return {"status": "deleted", "session_id": session_id}


# ============================================================
# Routes API - Configuration
# ============================================================

@app.get("/api/models/ollama")
async def list_ollama_models():
    """Liste les modèles Ollama installés."""
    available = await ollama.is_available()
    if not available:
        return {"available": False, "models": [], "message": "Ollama n'est pas en cours d'exécution"}
    models = await ollama.list_models()
    return {"available": True, "models": models}


@app.get("/api/models/openrouter")
async def list_openrouter_models():
    """Liste les modèles OpenRouter disponibles."""
    available = await openrouter.is_available()
    models = await openrouter.list_models()
    credits = await openrouter.get_credits() if available else None
    return {
        "available": available,
        "models": models,
        "credits_remaining": credits,
    }


# ============================================================
# Routes API - Gestion des modèles activés
# ============================================================

OPENROUTER_CATALOG = {
    "free": [
        {"model_id": "openai/gpt-oss-120b:free", "name": "OpenAI gpt-oss 120B", "cost": "Gratuit", "context_length": 131072, "params_info": "117B MoE (5.1B actifs)"},
        {"model_id": "openai/gpt-oss-20b:free", "name": "OpenAI gpt-oss 20B", "cost": "Gratuit", "context_length": 131072, "params_info": "21B MoE (3.6B actifs)"},
        {"model_id": "google/gemma-3-27b-it:free", "name": "Google Gemma 3 27B", "cost": "Gratuit", "context_length": 131072, "params_info": "27B"},
        {"model_id": "google/gemma-3-4b-it:free", "name": "Google Gemma 3 4B", "cost": "Gratuit", "context_length": 32768, "params_info": "4B"},
        {"model_id": "google/gemma-3n-e2b-it:free", "name": "Google Gemma 3n 2B", "cost": "Gratuit", "context_length": 32768, "params_info": "2B (6B arch)"},
        {"model_id": "mistralai/mistral-small-3.1-24b-instruct:free", "name": "Mistral Small 3.1 24B", "cost": "Gratuit", "context_length": 128000, "params_info": "24B"},
        {"model_id": "nvidia/nemotron-3-nano-30b-a3b:free", "name": "NVIDIA Nemotron 3 Nano 30B", "cost": "Gratuit", "context_length": 256000, "params_info": "30B MoE"},
        {"model_id": "nvidia/nemotron-nano-9b-v2:free", "name": "NVIDIA Nemotron Nano 9B V2", "cost": "Gratuit", "context_length": 128000, "params_info": "9B"},
        {"model_id": "qwen/qwen3-coder:free", "name": "Qwen3 Coder 480B", "cost": "Gratuit", "context_length": 262144, "params_info": "480B MoE (35B actifs)"},
        {"model_id": "qwen/qwen3-next-80b-a3b-instruct:free", "name": "Qwen3 Next 80B A3B", "cost": "Gratuit", "context_length": 131072, "params_info": "80B MoE (3B actifs)"},
        {"model_id": "qwen/qwen3-4b:free", "name": "Qwen3 4B", "cost": "Gratuit", "context_length": 40960, "params_info": "4B"},
        {"model_id": "stepfun/step-3.5-flash:free", "name": "StepFun Step 3.5 Flash", "cost": "Gratuit", "context_length": 256000, "params_info": "196B MoE (11B actifs)"},
        {"model_id": "arcee-ai/trinity-large-preview:free", "name": "Arcee Trinity Large", "cost": "Gratuit", "context_length": 262144, "params_info": "400B MoE (13B actifs)"},
        {"model_id": "arcee-ai/trinity-mini:free", "name": "Arcee Trinity Mini", "cost": "Gratuit", "context_length": 131072, "params_info": "26B MoE (3B actifs)"},
        {"model_id": "z-ai/glm-4.5-air:free", "name": "Z.ai GLM 4.5 Air", "cost": "Gratuit", "context_length": 131072, "params_info": "MoE"},
        {"model_id": "liquid/lfm-2.5-1.2b-thinking:free", "name": "LiquidAI LFM 1.2B Thinking", "cost": "Gratuit", "context_length": 32768, "params_info": "1.2B"},
        {"model_id": "liquid/lfm-2.5-1.2b-instruct:free", "name": "LiquidAI LFM 1.2B Instruct", "cost": "Gratuit", "context_length": 32768, "params_info": "1.2B"},
        {"model_id": "cognitivecomputations/dolphin-mistral-24b-venice-edition:free", "name": "Venice Uncensored 24B", "cost": "Gratuit", "context_length": 32768, "params_info": "24B"},
        {"model_id": "nousresearch/hermes-3-llama-3.1-405b:free", "name": "Nous Hermes 3 405B", "cost": "Gratuit", "context_length": 131072, "params_info": "405B"},
        {"model_id": "deepseek/deepseek-chat-v3-0324:free", "name": "DeepSeek V3", "cost": "Gratuit", "context_length": 163840, "params_info": "685B MoE"},
    ],
    "cheap": [
        {"model_id": "openai/gpt-4o-mini", "name": "GPT-4o Mini (OpenAI)", "cost": "$0.60/M", "context_length": 128000, "params_info": ""},
        {"model_id": "openai/gpt-5-nano", "name": "GPT-5 Nano (OpenAI)", "cost": "$0.45/M", "context_length": 400000, "params_info": ""},
        {"model_id": "openai/gpt-5-mini", "name": "GPT-5 Mini (OpenAI)", "cost": "$2.25/M", "context_length": 400000, "params_info": ""},
        {"model_id": "anthropic/claude-3-haiku", "name": "Claude 3 Haiku (Anthropic)", "cost": "$0.80/M", "context_length": 200000, "params_info": ""},
        {"model_id": "anthropic/claude-haiku-4.5", "name": "Claude 4.5 Haiku (Anthropic)", "cost": "$1.00/M", "context_length": 200000, "params_info": ""},
        {"model_id": "google/gemini-2.0-flash-lite-001", "name": "Gemini 2.0 Flash Lite (Google)", "cost": "$0.08/M", "context_length": 1048576, "params_info": ""},
        {"model_id": "x-ai/grok-3-mini-beta", "name": "Grok 3 Mini (xAI)", "cost": "$0.30/M", "context_length": 131072, "params_info": ""},
        {"model_id": "x-ai/grok-4-fast", "name": "Grok 4 Fast (xAI)", "cost": "$0.20/M", "context_length": 2000000, "params_info": ""},
        {"model_id": "mistralai/ministral-3b-2512", "name": "Ministral 3B (Mistral)", "cost": "$0.02/M", "context_length": 131072, "params_info": "3B"},
        {"model_id": "deepseek/deepseek-chat", "name": "DeepSeek V3.1 (DeepSeek)", "cost": "$0.30/M", "context_length": 163840, "params_info": "685B MoE"},
        {"model_id": "qwen/qwen-2.5-72b-instruct", "name": "Qwen 2.5 72B (Alibaba)", "cost": "$0.35/M", "context_length": 32768, "params_info": "72B"},
        {"model_id": "amazon/nova-micro-v1", "name": "Nova Micro (Amazon)", "cost": "$0.04/M", "context_length": 128000, "params_info": ""},
        {"model_id": "amazon/nova-lite-v1", "name": "Nova Lite (Amazon)", "cost": "$0.06/M", "context_length": 300000, "params_info": ""},
        {"model_id": "meta-llama/llama-3.1-8b-instruct", "name": "Llama 3.1 8B (Meta)", "cost": "$0.02/M", "context_length": 16384, "params_info": "8B"},
    ],
}


class EnableModelRequest(BaseModel):
    model_id: str
    name: str
    provider: str = "openrouter"
    category: str = "free"
    cost: str = "Gratuit"
    context_length: int = 0
    params_info: str = ""


class BulkEnableRequest(BaseModel):
    model_ids: list[str]


@app.get("/api/models/catalog")
async def get_model_catalog():
    """Retourne le catalogue complet des modèles OpenRouter disponibles."""
    return OPENROUTER_CATALOG


@app.get("/api/models/enabled")
async def get_enabled_models():
    """Retourne les modèles actuellement activés par l'utilisateur."""
    return db.get_enabled_models()


@app.post("/api/models/enabled")
async def add_enabled_model(req: EnableModelRequest):
    """Ajoute un modèle à la liste des modèles activés."""
    result = db.add_enabled_model(req.model_dump())
    return result


@app.delete("/api/models/enabled/{model_id:path}")
async def remove_enabled_model(model_id: str):
    """Retire un modèle de la liste des modèles activés."""
    success = db.remove_enabled_model(model_id)
    if not success:
        raise HTTPException(status_code=404, detail="Modèle non trouvé")
    return {"status": "removed", "model_id": model_id}


@app.post("/api/models/enabled/bulk")
async def bulk_enable_models(req: BulkEnableRequest):
    """Remplace toute la liste des modèles activés."""
    all_models = []
    for cat_key, cat_models in OPENROUTER_CATALOG.items():
        for m in cat_models:
            all_models.append({**m, "category": cat_key, "provider": "openrouter"})
    count = db.bulk_set_enabled_models(req.model_ids, all_models)
    return {"status": "ok", "count": count}


@app.get("/api/models/recommended")
async def get_recommended_models():
    """Retourne les modèles recommandés par catégorie (basé sur les modèles activés)."""
    enabled = db.get_enabled_models()

    free_models = [m for m in enabled if m["category"] == "free"]
    cheap_models = [m for m in enabled if m["category"] == "cheap"]

    # Filtrer par les résultats du ping si disponibles
    def _is_alive(model_id: str) -> bool:
        if not model_ping_cache:
            return True  # Pas de ping lancé → tout afficher
        info = model_ping_cache.get(model_id)
        return info["ok"] if info else True  # Non testé → afficher

    # Modèles Ollama : seulement ceux installés + alive
    ollama_installed = await ollama.list_models()
    ollama_models = [
        {"id": m, "name": m.split(":")[0].title() + " " + m.split(":")[-1] if ":" in m else m, "size": "", "quality": ""}
        for m in ollama_installed
        if _is_alive(m)
    ]

    return {
        "ollama": {
            "description": "Modèles locaux (gratuit, nécessite Ollama)",
            "models": ollama_models,
        },
        "openrouter_free": {
            "description": "Modèles gratuits via OpenRouter",
            "models": [
                {"id": m["model_id"], "name": m["name"], "cost": "Gratuit"}
                for m in free_models if _is_alive(m["model_id"])
            ],
        },
        "openrouter_cheap": {
            "description": "Modèles payants grand public (économiques)",
            "models": [
                {"id": m["model_id"], "name": m["name"], "cost": m["cost"]}
                for m in cheap_models if _is_alive(m["model_id"])
            ],
        },
    }


@app.get("/api/word-pairs")
async def get_word_pairs():
    """Retourne toutes les paires de mots disponibles."""
    pairs = get_all_pairs("fr")
    return [{"civil": p[0], "undercover": p[1]} for p in pairs]


@app.get("/api/role-distribution/{num_players}")
async def get_role_dist(num_players: int):
    """Retourne la distribution des rôles pour un nombre de joueurs."""
    if num_players < 3 or num_players > 20:
        raise HTTPException(status_code=400, detail="Entre 3 et 20 joueurs")
    civils, undercover, mr_white = get_role_distribution(num_players)
    return {
        "total": num_players,
        "civils": civils,
        "undercover": undercover,
        "mr_white": mr_white,
    }


@app.get("/api/health")
async def health_check():
    """Vérifie l'état du backend."""
    ollama_ok = await ollama.is_available()
    openrouter_ok = await openrouter.is_available()
    return {
        "status": "ok",
        "ollama": ollama_ok,
        "openrouter": openrouter_ok,
    }


# ============================================================
# Ping des modèles
# ============================================================

async def _ping_one_model(model_id: str, provider: str) -> dict:
    """Ping un seul modèle avec un prompt minimal."""
    t0 = time.time()
    try:
        if provider == "ollama":
            resp = await ollama.chat(model_id, "Reply OK.", "Hi", max_tokens=50)
        else:
            resp = await openrouter.chat(model_id, "Reply OK.", "Hi", max_tokens=50)
        latency = int((time.time() - t0) * 1000)
        if not resp or (isinstance(resp, str) and "error" in resp.lower() and resp.strip().startswith("{")):
            return {"ok": False, "latency_ms": latency, "error": resp or "empty", "timestamp": time.time()}
        return {"ok": True, "latency_ms": latency, "error": "", "timestamp": time.time()}
    except Exception as e:
        return {"ok": False, "latency_ms": int((time.time() - t0) * 1000), "error": str(e), "timestamp": time.time()}


@app.post("/api/models/ping")
async def ping_all_models():
    """Ping tous les modèles (Ollama + OpenRouter) et cache les résultats.
    Seuls les modèles qui répondent seront affichés dans le frontend."""
    global model_ping_cache
    results = {}

    # 1) Modèles Ollama
    ollama_models = await ollama.list_models()
    ollama_tasks = {m: _ping_one_model(m, "ollama") for m in ollama_models}

    # 2) Modèles OpenRouter (catalogue complet)
    or_models = []
    for cat_models in OPENROUTER_CATALOG.values():
        for m in cat_models:
            or_models.append(m["model_id"])
    or_tasks = {m: _ping_one_model(m, "openrouter") for m in or_models}

    # Exécuter tous les pings en parallèle
    all_ids = list(ollama_tasks.keys()) + list(or_tasks.keys())
    all_coros = list(ollama_tasks.values()) + list(or_tasks.values())

    print(f"\n🏓 Ping de {len(all_ids)} modèles en cours...")
    ping_results = await asyncio.gather(*all_coros)

    alive = 0
    dead = 0
    for model_id, result in zip(all_ids, ping_results):
        results[model_id] = result
        if result["ok"]:
            alive += 1
            print(f"  ✅ {model_id} — {result['latency_ms']}ms")
        else:
            dead += 1
            err_short = result["error"][:60] if result["error"] else "?"
            print(f"  ❌ {model_id} — {err_short}")

    model_ping_cache = results
    print(f"🏓 Résultat: {alive} OK, {dead} KO\n")

    return {
        "total": len(results),
        "alive": alive,
        "dead": dead,
        "models": results,
    }


@app.get("/api/models/ping")
async def get_ping_results():
    """Retourne les résultats du dernier ping (cache)."""
    return {
        "total": len(model_ping_cache),
        "alive": sum(1 for v in model_ping_cache.values() if v["ok"]),
        "dead": sum(1 for v in model_ping_cache.values() if not v["ok"]),
        "models": model_ping_cache,
    }


@app.post("/api/models/ping/{model_id:path}")
async def ping_single_model(model_id: str):
    """Ping un seul modèle et met à jour le cache."""
    global model_ping_cache
    # Déterminer le provider
    ollama_models = await ollama.list_models()
    provider = "ollama" if model_id in ollama_models else "openrouter"
    result = await _ping_one_model(model_id, provider)
    model_ping_cache[model_id] = result
    status = "✅" if result["ok"] else "❌"
    print(f"🏓 Ping {model_id} → {status} ({result['latency_ms']}ms)")
    return {"model_id": model_id, **result}


# ============================================================
# Entry Point
# ============================================================

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(
        "main:app",
        host=settings.BACKEND_HOST,
        port=settings.BACKEND_PORT,
        reload=True,
    )
