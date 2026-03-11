"""Routes API pour le jeu."""
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

router = APIRouter(prefix="/api/game", tags=["game"])


class GameConfigRequest(BaseModel):
    """Configuration d'une partie."""
    players: list[dict]  # [{"name": "GPT-1", "model_id": "...", "provider": "ollama|openrouter"}]
    level: int = 1
    num_games: int = 1  # Nombre de parties à jouer d'affilée
    session_name: str = "Partie rapide"


class BatchGameRequest(BaseModel):
    """Lancer un batch de parties."""
    players: list[dict]
    level: int = 1
    num_games: int = 10
    session_name: str = "Session batch"
