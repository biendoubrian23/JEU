"""Provider OpenRouter pour les modèles cloud."""
import asyncio
import httpx
from ai.base import AIProvider


class OpenRouterProvider(AIProvider):
    """Intégration avec OpenRouter API."""

    BASE_URL = "https://openrouter.ai/api/v1"
    MAX_RETRIES = 3
    RETRY_DELAYS = [2, 5, 10]  # secondes

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.client = httpx.AsyncClient(timeout=60.0)

    async def chat(self, model: str, system_prompt: str, user_prompt: str, max_tokens: int = 150) -> str:
        """Envoie un message via OpenRouter avec retry automatique."""
        url = f"{self.BASE_URL}/chat/completions"
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "HTTP-Referer": "http://localhost:3000",
            "X-Title": "Undercover AI Arena",
        }
        payload = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": 0.7,
        }
        # Les modèles OpenAI récents (GPT-4.1+, GPT-5.x, o-series) rejettent max_tokens
        # et exigent max_completion_tokens avec un minimum de 16
        if model.startswith("openai/") and not model.startswith("openai/gpt-4o"):
            payload["max_completion_tokens"] = max(max_tokens, 16)
        else:
            payload["max_tokens"] = max_tokens

        last_error = ""
        for attempt in range(self.MAX_RETRIES):
            try:
                response = await self.client.post(url, json=payload, headers=headers)
                response.raise_for_status()
                data = response.json()
                choices = data.get("choices", [])
                if choices:
                    content = choices[0].get("message", {}).get("content", "")
                    return content or ""
                return ""
            except httpx.HTTPStatusError as e:
                status = e.response.status_code
                error_body = e.response.text if e.response else ""
                last_error = f"OpenRouter HTTP {status}: {error_body[:200]}"

                # 429 = rate limit → retry avec backoff
                if status == 429 and attempt < self.MAX_RETRIES - 1:
                    delay = self.RETRY_DELAYS[attempt]
                    print(f"[OpenRouter] Rate limit sur {model}, retry dans {delay}s (tentative {attempt + 1})")
                    await asyncio.sleep(delay)
                    continue

                # 404 = modèle non trouvé → pas de retry
                if status == 404:
                    return f'{{"error": "Modèle {model} indisponible (404)"}}'

                # Autres erreurs → retry
                if attempt < self.MAX_RETRIES - 1:
                    await asyncio.sleep(self.RETRY_DELAYS[attempt])
                    continue

                return f'{{"error": "{last_error}"}}'
            except Exception as e:
                last_error = str(e)
                if attempt < self.MAX_RETRIES - 1:
                    await asyncio.sleep(self.RETRY_DELAYS[attempt])
                    continue
                return f'{{"error": "OpenRouter error: {last_error}"}}'

        return f'{{"error": "{last_error}"}}'

    async def list_models(self) -> list[str]:
        """Liste les modèles disponibles sur OpenRouter."""
        return [
            # Gratuits
            "deepseek/deepseek-chat-v3-0324:free",
            "qwen/qwen-2.5-72b-instruct:free",
            "mistralai/mistral-small-3.1-24b-instruct:free",
            # Payants grand public
            "openai/gpt-4o-mini",
            "anthropic/claude-3-haiku",
            "google/gemini-2.0-flash-lite-001",
            "x-ai/grok-3-mini-beta",
            "mistralai/mistral-small-latest",
            "deepseek/deepseek-chat",
            "qwen/qwen-2.5-72b-instruct",
            "moonshotai/kimi-k1.5-32k",
        ]

    async def is_available(self) -> bool:
        """Vérifie si la clé API est valide."""
        if not self.api_key:
            return False
        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            response = await self.client.get(f"{self.BASE_URL}/models", headers=headers)
            return response.status_code == 200
        except Exception:
            return False

    async def get_credits(self) -> float | None:
        """Retourne le solde de crédits restants."""
        try:
            headers = {"Authorization": f"Bearer {self.api_key}"}
            response = await self.client.get(
                "https://openrouter.ai/api/v1/auth/key",
                headers=headers,
            )
            if response.status_code == 200:
                data = response.json()
                return data.get("data", {}).get("limit_remaining")
        except Exception:
            pass
        return None

    async def close(self):
        await self.client.aclose()
