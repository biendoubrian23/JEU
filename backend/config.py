"""Configuration centralisée de l'application."""
import os
from pathlib import Path
from dotenv import load_dotenv

# Charger .env depuis la racine du projet
ROOT_DIR = Path(__file__).parent.parent
load_dotenv(ROOT_DIR / ".env")


class Settings:
    # API Keys
    OPENROUTER_API_KEY: str = os.getenv("OPENROUTER_API_KEY", "")
    OLLAMA_BASE_URL: str = os.getenv("OLLAMA_BASE_URL", "http://localhost:11434")

    # Server
    BACKEND_HOST: str = os.getenv("BACKEND_HOST", "0.0.0.0")
    BACKEND_PORT: int = int(os.getenv("BACKEND_PORT", "8000"))

    # Database
    DATABASE_PATH: str = os.getenv("DATABASE_PATH", str(ROOT_DIR / "data" / "undercover.db"))

    # Game
    DEFAULT_PLAYER_COUNT: int = int(os.getenv("DEFAULT_PLAYER_COUNT", "6"))
    MAX_TOKENS: int = int(os.getenv("MAX_TOKENS_PER_RESPONSE", "300"))
    GAME_LANGUAGE: str = os.getenv("GAME_LANGUAGE", "fr")

    # Modèles Ollama recommandés (< 7 GB)
    OLLAMA_MODELS = [
        "llama3.2:3b",
        "mistral:7b",
        "gemma2:2b",
        "phi3:mini",
        "qwen2.5:3b",
    ]

    # Modèles OpenRouter grand public
    OPENROUTER_MODELS = [
        "deepseek/deepseek-chat-v3-0324:free",
        "qwen/qwen-2.5-72b-instruct:free",
        "mistralai/mistral-small-3.1-24b-instruct:free",
        "openai/gpt-4o-mini",
        "anthropic/claude-3-haiku",
        "google/gemini-2.0-flash-lite-001",
        "x-ai/grok-3-mini-beta",
        "mistralai/mistral-small-latest",
        "deepseek/deepseek-chat",
        "qwen/qwen-2.5-72b-instruct",
        "moonshotai/kimi-k1.5-32k",
    ]


settings = Settings()
