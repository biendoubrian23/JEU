"""Moteur de jeu Undercover - orchestre une partie complète."""
import asyncio
import json
import random
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Callable, Coroutine

from game.roles import Role, get_role_distribution
from game.word_pairs import get_random_pair
from game.prompts import (
    system_prompt_rules,
    role_prompt,
    clue_prompt,
    discussion_prompt,
    vote_prompt,
    mr_white_guess_prompt,
    level2_memory_prompt,
    level3_tendencies_prompt,
    level4_meta_prompt,
)


@dataclass
class Player:
    name: str
    model_id: str           # ex: "ollama/mistral:7b" ou "openrouter/gpt-4o-mini"
    provider: str            # "ollama" ou "openrouter"
    role: Role | None = None
    word: str | None = None
    alive: bool = True
    clues_given: list[str] = field(default_factory=list)
    messages: list[dict] = field(default_factory=list)
    reasoning_log: list[dict] = field(default_factory=list)
    votes_cast: list[str] = field(default_factory=list)
    votes_received: int = 0


@dataclass
class GameEvent:
    timestamp: float
    event_type: str  # "clue", "discussion", "vote", "elimination", "mr_white_guess", "game_end", "system"
    round_num: int
    player: str | None
    data: dict


@dataclass
class GameState:
    game_id: str
    players: list[Player]
    civil_word: str
    undercover_word: str
    current_round: int = 0
    phase: str = "setup"  # setup, clue, discussion, vote, elimination, mr_white_guess, ended
    events: list[GameEvent] = field(default_factory=list)
    eliminated: list[dict] = field(default_factory=list)
    winner: str | None = None  # "civil", "undercover", "mr_white"
    started_at: float = 0.0
    ended_at: float = 0.0
    level: int = 1
    level_context: str = ""


# Type pour le callback d'envoi d'événements (WebSocket)
EventCallback = Callable[[dict], Coroutine[Any, Any, None]]


class GameStoppedError(Exception):
    """Levée quand une partie est stoppée manuellement."""
    pass


class UndercoverEngine:
    """Moteur de jeu Undercover complet."""

    def __init__(self, ai_call: Callable, event_callback: EventCallback | None = None,
                 stop_flag: Callable[[], bool] | None = None,
                 pause_flag: Callable[[], bool] | None = None):
        """
        ai_call: async function(model_id, provider, system_prompt, user_prompt) -> str
        event_callback: async function(event_dict) -> None (pour WebSocket)
        stop_flag: callable that returns True if game should stop
        pause_flag: callable that returns True if game should pause
        """
        self.ai_call = ai_call
        self.event_callback = event_callback
        self._should_stop = stop_flag or (lambda: False)
        self._is_paused = pause_flag or (lambda: False)

    async def _check_controls(self):
        """Vérifie les flags stop/pause entre chaque phase."""
        # Pause : attendre tant que le flag est actif
        while self._is_paused():
            await asyncio.sleep(0.5)
            if self._should_stop():
                raise GameStoppedError("Partie arrêtée")
        # Stop
        if self._should_stop():
            raise GameStoppedError("Partie arrêtée")

    async def emit(self, event: GameEvent):
        """Émet un événement vers le frontend via WebSocket."""
        event_dict = {
            "timestamp": event.timestamp,
            "event_type": event.event_type,
            "round": event.round_num,
            "player": event.player,
            "data": event.data,
        }
        if self.event_callback:
            await self.event_callback(event_dict)

    def setup_game(
        self,
        player_configs: list[dict],
        level: int = 1,
        level_context: str = "",
        word_pair: tuple[str, str] | None = None,
    ) -> GameState:
        """Initialise une nouvelle partie.

        player_configs: [{"name": "GPT-1", "model_id": "openai/gpt-4o-mini", "provider": "openrouter"}, ...]
        """
        game_id = str(uuid.uuid4())[:8]
        nb_players = len(player_configs)

        # Créer les joueurs
        players = []
        for cfg in player_configs:
            players.append(Player(
                name=cfg["name"],
                model_id=cfg["model_id"],
                provider=cfg["provider"],
            ))

        # Choisir une paire de mots
        if word_pair:
            civil_word, undercover_word = word_pair
        else:
            civil_word, undercover_word = get_random_pair("fr")

        # Distribuer les rôles
        nb_civils, nb_undercover, nb_mr_white = get_role_distribution(nb_players)
        roles = (
            [Role.CIVIL] * nb_civils
            + [Role.UNDERCOVER] * nb_undercover
            + [Role.MR_WHITE] * nb_mr_white
        )
        random.shuffle(roles)

        for player, role in zip(players, roles):
            player.role = role
            if role == Role.CIVIL:
                player.word = civil_word
            elif role == Role.UNDERCOVER:
                player.word = undercover_word
            else:
                player.word = None  # Mr. White

        state = GameState(
            game_id=game_id,
            players=players,
            civil_word=civil_word,
            undercover_word=undercover_word,
            started_at=time.time(),
            level=level,
            level_context=level_context,
        )

        return state

    def _build_system_prompt(self, player: Player, state: GameState) -> str:
        """Construit le prompt système complet pour un joueur."""
        parts = [
            system_prompt_rules(),
            role_prompt(player.role.value, player.word, player.name),
        ]

        # Ajout du contexte de niveau
        if state.level_context:
            parts.append(state.level_context)

        return "\n\n".join(parts)

    def _get_alive_players(self, state: GameState) -> list[Player]:
        """Retourne les joueurs encore en vie."""
        return [p for p in state.players if p.alive]

    def _parse_json_response(self, response: str) -> dict:
        """Parse la réponse JSON d'une IA, avec fallback robuste."""
        response = response.strip()

        # Essayer de trouver du JSON dans la réponse
        try:
            # Chercher un bloc JSON
            start = response.find("{")
            end = response.rfind("}") + 1
            if start != -1 and end > start:
                json_str = response[start:end]
                return json.loads(json_str)
        except json.JSONDecodeError:
            pass

        # Fallback : traiter comme texte brut
        return {"raw": response}

    async def _ai_respond(self, player: Player, state: GameState, user_prompt: str) -> dict:
        """Appelle l'IA pour un joueur et parse la réponse."""
        system = self._build_system_prompt(player, state)

        try:
            raw_response = await self.ai_call(
                model_id=player.model_id,
                provider=player.provider,
                system_prompt=system,
                user_prompt=user_prompt,
            )
            if not raw_response:
                print(f"  [!] {player.name}: réponse vide")
                return {"error": "Réponse vide", "raw": ""}
            parsed = self._parse_json_response(raw_response)
            # Détecter les erreurs retournées par le provider
            if "error" in parsed and "clue" not in parsed and "vote" not in parsed and "message" not in parsed:
                print(f"  [!] {player.name}: erreur provider — {parsed['error'][:80]}")
                return {"error": parsed["error"], "raw": ""}
            return parsed
        except Exception as e:
            print(f"  [!] {player.name}: exception — {e}")
            return {"error": str(e), "raw": ""}

    async def play_clue_phase(self, state: GameState) -> list[dict]:
        """Phase d'indices : chaque joueur donne un mot."""
        state.phase = "clue"
        state.current_round += 1

        alive = self._get_alive_players(state)

        # Collecter les indices précédents de tous les tours
        all_previous_clues = []
        for event in state.events:
            if event.event_type == "clue":
                all_previous_clues.append({
                    "player": event.player,
                    "word": event.data.get("clue", "?"),
                })

        round_clues = []

        # Ordre aléatoire pour ne pas biaiser
        order = list(alive)
        random.shuffle(order)

        for player in order:
            prompt = clue_prompt(state.current_round, all_previous_clues + round_clues)
            response = await self._ai_respond(player, state, prompt)

            # Si erreur provider, utiliser un fallback
            if "error" in response and "clue" not in response:
                clue_word = "[erreur]"
                reasoning = response.get("error", "")
            else:
                clue_word = response.get("clue", response.get("raw", "..."))
                reasoning = response.get("reasoning", "")
                # Nettoyer l'indice (garder juste un mot)
                if isinstance(clue_word, str):
                    clue_word = clue_word.strip().split()[0] if clue_word.strip() else "..."

            player.clues_given.append(clue_word)
            player.reasoning_log.append({
                "round": state.current_round,
                "phase": "clue",
                "reasoning": reasoning,
            })

            clue_data = {"clue": clue_word, "reasoning": reasoning}
            round_clues.append({"player": player.name, "word": clue_word})

            event = GameEvent(
                timestamp=time.time(),
                event_type="clue",
                round_num=state.current_round,
                player=player.name,
                data=clue_data,
            )
            state.events.append(event)
            await self.emit(event)

            # Petit délai pour la visualisation
            await asyncio.sleep(0.3)

        return round_clues

    async def play_discussion_phase(self, state: GameState, round_clues: list[dict]) -> list[dict]:
        """Phase de discussion : les joueurs échangent."""
        state.phase = "discussion"
        alive = self._get_alive_players(state)

        discussion_messages = []

        # Chaque joueur parle une fois (ordre aléatoire)
        order = list(alive)
        random.shuffle(order)

        for player in order:
            prompt = discussion_prompt(
                state.current_round,
                round_clues,
                state.eliminated,
            )

            # Ajouter les messages de discussion déjà émis ce tour
            if discussion_messages:
                prompt += "\n\nMessages précédents dans la discussion :\n"
                for msg in discussion_messages:
                    prompt += f"- {msg['player']}: {msg['message']}\n"

            response = await self._ai_respond(player, state, prompt)

            message = response.get("message", response.get("raw", "Hmm, intéressant..."))
            reasoning = response.get("reasoning", "")

            # Tronquer si trop long
            if isinstance(message, str) and len(message) > 300:
                message = message[:297] + "..."

            player.reasoning_log.append({
                "round": state.current_round,
                "phase": "discussion",
                "reasoning": reasoning,
            })

            msg_data = {"message": message, "reasoning": reasoning}
            discussion_messages.append({"player": player.name, "message": message})

            event = GameEvent(
                timestamp=time.time(),
                event_type="discussion",
                round_num=state.current_round,
                player=player.name,
                data=msg_data,
            )
            state.events.append(event)
            await self.emit(event)

            await asyncio.sleep(0.3)

        return discussion_messages

    async def play_vote_phase(self, state: GameState, discussion_messages: list[dict]) -> dict:
        """Phase de vote : chaque joueur vote pour éliminer quelqu'un."""
        state.phase = "vote"
        alive = self._get_alive_players(state)
        alive_names = [p.name for p in alive]

        votes = {}  # {voter_name: target_name}

        # Ordre aléatoire
        order = list(alive)
        random.shuffle(order)

        for player in order:
            prompt = vote_prompt(
                state.current_round,
                alive_names,
                player.name,
                discussion_messages,
            )
            response = await self._ai_respond(player, state, prompt)

            vote_target = response.get("vote", response.get("raw", ""))
            reasoning = response.get("reasoning", "")

            # Valider le vote
            if isinstance(vote_target, str):
                vote_target = vote_target.strip()
                # Chercher le match le plus proche parmi les joueurs vivants (sauf soi-même)
                valid_targets = [n for n in alive_names if n != player.name]
                if vote_target not in valid_targets:
                    # Fuzzy match
                    for name in valid_targets:
                        if vote_target.lower() in name.lower() or name.lower() in vote_target.lower():
                            vote_target = name
                            break
                    else:
                        # Vote aléatoire en dernier recours
                        vote_target = random.choice(valid_targets) if valid_targets else ""

            votes[player.name] = vote_target
            player.votes_cast.append(vote_target)

            player.reasoning_log.append({
                "round": state.current_round,
                "phase": "vote",
                "target": vote_target,
                "reasoning": reasoning,
            })

            event = GameEvent(
                timestamp=time.time(),
                event_type="vote",
                round_num=state.current_round,
                player=player.name,
                data={"vote": vote_target, "reasoning": reasoning},
            )
            state.events.append(event)
            await self.emit(event)

            await asyncio.sleep(0.2)

        return votes

    async def resolve_elimination(self, state: GameState, votes: dict) -> Player | None:
        """Résout le vote et élimine le joueur le plus voté."""
        state.phase = "elimination"

        # Compter les votes
        vote_counts: dict[str, int] = {}
        for target in votes.values():
            vote_counts[target] = vote_counts.get(target, 0) + 1

        if not vote_counts:
            return None

        # Trouver le joueur le plus voté (en cas d'égalité, random)
        max_votes = max(vote_counts.values())
        most_voted = [name for name, count in vote_counts.items() if count == max_votes]
        eliminated_name = random.choice(most_voted)

        # Trouver le joueur
        eliminated_player = None
        for p in state.players:
            if p.name == eliminated_name and p.alive:
                eliminated_player = p
                break

        if eliminated_player:
            eliminated_player.alive = False
            eliminated_player.votes_received = max_votes

            elim_info = {
                "player": eliminated_player.name,
                "role": eliminated_player.role.value,
                "votes": max_votes,
                "vote_details": votes,
            }
            state.eliminated.append(elim_info)

            event = GameEvent(
                timestamp=time.time(),
                event_type="elimination",
                round_num=state.current_round,
                player=eliminated_player.name,
                data=elim_info,
            )
            state.events.append(event)
            await self.emit(event)

        return eliminated_player

    async def play_mr_white_guess(self, state: GameState, mr_white: Player) -> bool:
        """Mr. White tente de deviner le mot des civils."""
        state.phase = "mr_white_guess"

        # Collecter tous les indices passés
        all_clues = []
        for event in state.events:
            if event.event_type == "clue":
                all_clues.append({
                    "player": event.player,
                    "word": event.data.get("clue", "?"),
                })

        prompt = mr_white_guess_prompt(all_clues)
        response = await self._ai_respond(mr_white, state, prompt)

        guess = response.get("guess", response.get("raw", ""))
        reasoning = response.get("reasoning", "")

        # Vérifier si le guess est correct (tolérant)
        correct = False
        if isinstance(guess, str):
            correct = guess.strip().lower() == state.civil_word.lower()

        event = GameEvent(
            timestamp=time.time(),
            event_type="mr_white_guess",
            round_num=state.current_round,
            player=mr_white.name,
            data={
                "guess": guess,
                "correct": correct,
                "actual_word": state.civil_word,
                "reasoning": reasoning,
            },
        )
        state.events.append(event)
        await self.emit(event)

        return correct

    def check_win_condition(self, state: GameState) -> str | None:
        """Vérifie les conditions de victoire. Retourne le gagnant ou None."""
        alive = self._get_alive_players(state)

        alive_roles = [p.role for p in alive]
        nb_undercover = alive_roles.count(Role.UNDERCOVER)
        nb_mr_white = alive_roles.count(Role.MR_WHITE)
        nb_civil = alive_roles.count(Role.CIVIL)

        # Les civils gagnent si plus aucun undercover ni mr_white
        if nb_undercover == 0 and nb_mr_white == 0:
            return "civil"

        # L'undercover gagne si il reste 2 joueurs et il est l'un d'eux
        if len(alive) <= 2 and nb_undercover > 0:
            return "undercover"

        # Mr. White seul restant (ne devrait pas arriver normalement)
        if len(alive) <= 2 and nb_mr_white > 0 and nb_undercover == 0:
            return "mr_white"

        return None

    async def run_game(self, state: GameState) -> GameState:
        """Exécute une partie complète du début à la fin."""
        state.started_at = time.time()
        max_rounds = len(state.players) + 2  # Sécurité anti-boucle infinie

        # Événement de début
        start_event = GameEvent(
            timestamp=time.time(),
            event_type="system",
            round_num=0,
            player=None,
            data={
                "message": f"Partie {state.game_id} commence ! {len(state.players)} joueurs.",
                "players": [{"name": p.name, "model": p.model_id} for p in state.players],
                "civil_word": "***",  # Masqué pendant la partie
                "undercover_word": "***",
            },
        )
        state.events.append(start_event)
        await self.emit(start_event)

        try:
            while state.current_round < max_rounds:
                await self._check_controls()

                # Phase d'indices
                alive_count = len(self._get_alive_players(state))
                print(f"  📢 Tour {state.current_round + 1} — {alive_count} joueurs en vie")
                round_clues = await self.play_clue_phase(state)
                await self._check_controls()

                # Phase de discussion
                discussion = await self.play_discussion_phase(state, round_clues)
                await self._check_controls()

                # Phase de vote
                votes = await self.play_vote_phase(state, discussion)

                # Résolution de l'élimination
                eliminated = await self.resolve_elimination(state, votes)

                if eliminated:
                    # Si Mr. White est éliminé, il tente de deviner
                    if eliminated.role == Role.MR_WHITE:
                        mr_white_wins = await self.play_mr_white_guess(state, eliminated)
                        if mr_white_wins:
                            state.winner = "mr_white"
                            break

                # Vérifier les conditions de victoire
                winner = self.check_win_condition(state)
                if winner:
                    state.winner = winner
                    break
        except GameStoppedError:
            state.winner = state.winner or "stopped"

        # Si pas de gagnant après max_rounds, les civils gagnent par défaut
        if not state.winner:
            state.winner = "civil"

        state.phase = "ended"
        state.ended_at = time.time()

        # Événement de fin
        end_event = GameEvent(
            timestamp=time.time(),
            event_type="game_end",
            round_num=state.current_round,
            player=None,
            data={
                "winner": state.winner,
                "civil_word": state.civil_word,
                "undercover_word": state.undercover_word,
                "rounds_played": state.current_round,
                "duration": state.ended_at - state.started_at,
                "players": [
                    {
                        "name": p.name,
                        "model": p.model_id,
                        "role": p.role.value,
                        "alive": p.alive,
                        "clues": p.clues_given,
                    }
                    for p in state.players
                ],
            },
        )
        state.events.append(end_event)
        await self.emit(end_event)

        return state

    def compute_metrics(self, state: GameState) -> dict:
        """Calcule les métriques d'une partie terminée."""
        metrics = {
            "game_id": state.game_id,
            "winner": state.winner,
            "rounds_played": state.current_round,
            "duration_seconds": state.ended_at - state.started_at,
            "civil_word": state.civil_word,
            "undercover_word": state.undercover_word,
            "level": state.level,
            "players": {},
        }

        for player in state.players:
            p_metrics = {
                "model_id": player.model_id,
                "role": player.role.value,
                "survived": player.alive,
                "rounds_survived": 0,
                "clues_given": player.clues_given,
                "votes_cast": player.votes_cast,
                "votes_received_on_elimination": player.votes_received,
                "correct_votes": 0,
                "total_votes": len(player.votes_cast),
            }

            # Calculer les tours de survie
            for event in state.events:
                if event.event_type == "elimination" and event.player == player.name:
                    p_metrics["rounds_survived"] = event.round_num
                    break
            else:
                p_metrics["rounds_survived"] = state.current_round

            # Calculer les votes corrects (votes contre undercover/mr_white)
            undercover_names = [p.name for p in state.players if p.role in (Role.UNDERCOVER, Role.MR_WHITE)]
            p_metrics["correct_votes"] = sum(1 for v in player.votes_cast if v in undercover_names)

            # Déterminer si le joueur a gagné
            if state.winner == player.role.value:
                p_metrics["won"] = True
            elif state.winner == "civil" and player.role == Role.CIVIL:
                p_metrics["won"] = True
            else:
                p_metrics["won"] = player.role.value == state.winner

            metrics["players"][player.name] = p_metrics

        return metrics
