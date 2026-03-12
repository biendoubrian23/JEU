"""Provider Ollama pour les modèles locaux."""
import httpx
from ai.base import AIProvider


class OllamaProvider(AIProvider):
    """Intégration avec Ollama (modèles locaux)."""

    def __init__(self, base_url: str = "http://localhost:11434"):
        self.base_url = base_url.rstrip("/")
        self.client = httpx.AsyncClient(timeout=120.0)

    async def chat(self, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 150) -> str:
        """Envoie un message au modèle Ollama."""
        url = f"{self.base_url}/api/chat"
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "stream": False,
            "options": {
                "num_predict": max_tokens,
                "temperature": 0.7,
            },
        }

        try:
            response = await self.client.post(url, json=payload)
            response.raise_for_status()
            data = response.json()
            return data.get("message", {}).get("content", "")
        except httpx.HTTPStatusError as e:
            return f'{{"error": "Ollama HTTP error: {e.response.status_code}"}}'
        except httpx.ConnectError:
            return '{"error": "Ollama non accessible. Lancez: ollama serve"}'
        except Exception as e:
            return f'{{"error": "Ollama error: {str(e)}"}}'

    async def list_models(self) -> list[str]:
        """Liste les modèles installés dans Ollama."""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            data = response.json()
            return [m["name"] for m in data.get("models", [])]
        except Exception:
            return []

    async def list_models_with_details(self) -> list[dict]:
        """Liste les modèles installés avec taille et détails."""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            response.raise_for_status()
            data = response.json()
            result = []
            for m in data.get("models", []):
                size_bytes = m.get("size", 0)
                size_gb = size_bytes / (1024 ** 3)
                if size_gb >= 1:
                    size_str = f"{size_gb:.1f} GB"
                else:
                    size_str = f"{size_bytes / (1024 ** 2):.0f} MB"
                result.append({
                    "name": m["name"],
                    "size": size_str,
                    "size_bytes": size_bytes,
                })
            return result
        except Exception:
            return []

    async def is_available(self) -> bool:
        """Vérifie si Ollama est en cours d'exécution."""
        try:
            response = await self.client.get(f"{self.base_url}/api/tags")
            return response.status_code == 200
        except Exception:
            return False

    async def pull_model(self, model_name: str) -> bool:
        """Télécharge un modèle Ollama."""
        try:
            response = await self.client.post(
                f"{self.base_url}/api/pull",
                json={"name": model_name},
                timeout=600.0,
            )
            return response.status_code == 200
        except Exception:
            return False

    async def close(self):
        await self.client.aclose()
