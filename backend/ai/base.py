"""Interface commune pour les providers AI."""
from abc import ABC, abstractmethod


class AIProvider(ABC):
    """Interface abstraite pour un provider AI."""

    @abstractmethod
    async def chat(self, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 150) -> str:
        """Envoie un message et retourne la réponse."""
        ...

    @abstractmethod
    async def list_models(self) -> list[str]:
        """Liste les modèles disponibles."""
        ...

    @abstractmethod
    async def is_available(self) -> bool:
        """Vérifie si le provider est accessible."""
        ...
