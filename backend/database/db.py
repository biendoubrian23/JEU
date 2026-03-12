"""Gestion de la base de données SQLite."""
import math
import os
from pathlib import Path
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, Session
from database.models import Base, GameSession, Game, GamePlayer, GameEvent, ModelStats, EnabledModel


class Database:
    """Gestionnaire de base de données SQLite."""

    def __init__(self, db_path: str):
        # Créer le dossier parent si nécessaire
        Path(db_path).parent.mkdir(parents=True, exist_ok=True)
        self.engine = create_engine(f"sqlite:///{db_path}", echo=False)
        Base.metadata.create_all(self.engine)
        self.SessionLocal = sessionmaker(bind=self.engine)

    def get_session(self) -> Session:
        return self.SessionLocal()

    def save_game(self, metrics: dict, session_id: int | None = None) -> int:
        """Sauvegarde une partie complète et ses métriques."""
        with self.get_session() as db:
            game = Game(
                game_id=metrics["game_id"],
                session_id=session_id,
                level=metrics.get("level", 1),
                civil_word=metrics["civil_word"],
                undercover_word=metrics["undercover_word"],
                winner=metrics["winner"],
                rounds_played=metrics["rounds_played"],
                duration_seconds=metrics["duration_seconds"],
                player_count=len(metrics["players"]),
            )
            db.add(game)
            db.flush()

            for player_name, p_data in metrics["players"].items():
                player = GamePlayer(
                    game_id=game.id,
                    player_name=player_name,
                    model_id=p_data["model_id"],
                    provider=p_data.get("provider", "unknown"),
                    role=p_data["role"],
                    survived=p_data["survived"],
                    won=p_data.get("won", False),
                    rounds_survived=p_data["rounds_survived"],
                    clues_given=p_data["clues_given"],
                    votes_cast=p_data["votes_cast"],
                    correct_votes=p_data["correct_votes"],
                    total_votes=p_data["total_votes"],
                    reasoning_log=p_data.get("reasoning_log", []),
                )
                db.add(player)

            db.commit()

            # Mettre à jour les stats agrégées
            self._update_model_stats(db, metrics)

            return game.id

    def save_game_events(self, game_id_str: str, events: list[dict]):
        """Sauvegarde les événements bruts d'une partie."""
        with self.get_session() as db:
            game = db.query(Game).filter(Game.game_id == game_id_str).first()
            if not game:
                return

            for evt in events:
                event = GameEvent(
                    game_id=game.id,
                    timestamp=evt.get("timestamp", 0),
                    event_type=evt.get("event_type", "unknown"),
                    round_num=evt.get("round", 0),
                    player_name=evt.get("player"),
                    data=evt.get("data", {}),
                )
                db.add(event)
            db.commit()

    def _update_model_stats(self, db: Session, metrics: dict):
        """Met à jour les statistiques agrégées par modèle."""
        level = metrics.get("level", 1)

        for player_name, p_data in metrics["players"].items():
            model_id = p_data["model_id"]

            # Stats globales (level=0) et par niveau
            for stat_level in [0, level]:
                stats = db.query(ModelStats).filter(
                    ModelStats.model_id == model_id,
                    ModelStats.level == stat_level,
                ).first()

                if not stats:
                    stats = ModelStats(model_id=model_id, level=stat_level)
                    db.add(stats)
                    db.flush()  # Applique les defaults (0) avant les +=

                stats.total_games += 1
                won = p_data.get("won", False)
                if won:
                    stats.wins += 1
                else:
                    stats.losses += 1
                stats.win_rate = (stats.wins / stats.total_games * 100) if stats.total_games > 0 else 0

                role = p_data["role"]
                if role == "civil":
                    stats.games_as_civil += 1
                    if won:
                        stats.wins_as_civil += 1
                elif role == "undercover":
                    stats.games_as_undercover += 1
                    if won:
                        stats.wins_as_undercover += 1
                elif role == "mr_white":
                    stats.games_as_mr_white += 1
                    if won:
                        stats.wins_as_mr_white += 1

                stats.total_correct_votes += p_data["correct_votes"]
                stats.total_votes += p_data["total_votes"]
                stats.vote_accuracy = (
                    (stats.total_correct_votes / stats.total_votes * 100)
                    if stats.total_votes > 0 else 0
                )

                # Moyenne de survie
                total_survival = stats.avg_rounds_survived * (stats.total_games - 1) + p_data["rounds_survived"]
                stats.avg_rounds_survived = total_survival / stats.total_games

            db.commit()

    def get_all_stats(self, level: int = 0) -> list[dict]:
        """Retourne les statistiques de tous les modèles."""
        with self.get_session() as db:
            stats = db.query(ModelStats).filter(ModelStats.level == level).all()
            return [
                {
                    "model_id": s.model_id,
                    "total_games": s.total_games,
                    "wins": s.wins,
                    "losses": s.losses,
                    "win_rate": round(s.win_rate, 1),
                    "games_as_civil": s.games_as_civil,
                    "wins_as_civil": s.wins_as_civil,
                    "games_as_undercover": s.games_as_undercover,
                    "wins_as_undercover": s.wins_as_undercover,
                    "games_as_mr_white": s.games_as_mr_white,
                    "wins_as_mr_white": s.wins_as_mr_white,
                    "mr_white_correct_guesses": s.mr_white_correct_guesses,
                    "avg_rounds_survived": round(s.avg_rounds_survived, 1),
                    "vote_accuracy": round(s.vote_accuracy, 1),
                    "deception_rate": round(s.deception_rate, 1),
                }
                for s in stats
            ]

    def get_games_list(self, limit: int = 50, session_id: int | None = None) -> list[dict]:
        """Retourne la liste des parties."""
        with self.get_session() as db:
            query = db.query(Game).order_by(Game.created_at.desc())
            if session_id:
                query = query.filter(Game.session_id == session_id)
            games = query.limit(limit).all()
            return [
                {
                    "id": g.id,
                    "game_id": g.game_id,
                    "level": g.level,
                    "winner": g.winner,
                    "civil_word": g.civil_word,
                    "undercover_word": g.undercover_word,
                    "rounds_played": g.rounds_played,
                    "duration_seconds": round(g.duration_seconds, 1),
                    "player_count": g.player_count,
                    "created_at": g.created_at.isoformat() if g.created_at else None,
                }
                for g in games
            ]

    def get_game_detail(self, game_id_str: str) -> dict | None:
        """Retourne le détail complet d'une partie."""
        with self.get_session() as db:
            game = db.query(Game).filter(Game.game_id == game_id_str).first()
            if not game:
                return None

            players = db.query(GamePlayer).filter(GamePlayer.game_id == game.id).all()
            events = db.query(GameEvent).filter(GameEvent.game_id == game.id).order_by(GameEvent.timestamp).all()

            return {
                "game_id": game.game_id,
                "level": game.level,
                "winner": game.winner,
                "civil_word": game.civil_word,
                "undercover_word": game.undercover_word,
                "rounds_played": game.rounds_played,
                "duration_seconds": round(game.duration_seconds, 1),
                "players": [
                    {
                        "name": p.player_name,
                        "model_id": p.model_id,
                        "role": p.role,
                        "survived": p.survived,
                        "won": p.won,
                        "rounds_survived": p.rounds_survived,
                        "clues_given": p.clues_given,
                        "votes_cast": p.votes_cast,
                        "correct_votes": p.correct_votes,
                        "reasoning_log": p.reasoning_log or [],
                    }
                    for p in players
                ],
                "events": [
                    {
                        "timestamp": e.timestamp,
                        "event_type": e.event_type,
                        "round": e.round_num,
                        "player": e.player_name,
                        "data": e.data,
                    }
                    for e in events
                ],
            }

    def create_session(self, name: str, level: int, total_games: int) -> int:
        """Crée une nouvelle session de jeu."""
        with self.get_session() as db:
            session = GameSession(
                session_name=name,
                level=level,
                total_games=total_games,
            )
            db.add(session)
            db.commit()
            return session.id

    def get_sessions(self) -> list[dict]:
        """Retourne toutes les sessions."""
        with self.get_session() as db:
            sessions = db.query(GameSession).order_by(GameSession.created_at.desc()).all()
            return [
                {
                    "id": s.id,
                    "name": s.session_name,
                    "level": s.level,
                    "total_games": s.total_games,
                    "games_played": len(s.games),
                    "created_at": s.created_at.isoformat() if s.created_at else None,
                }
                for s in sessions
            ]

    # ── Gestion des modèles activés ────────────────────────────────────────

    def get_rich_analytics(self, session_id: int | None = None) -> dict:
        """Calcule des analytics riches directement depuis les données brutes."""
        with self.get_session() as db:
            # Requête de base
            games_q = db.query(Game)
            if session_id:
                games_q = games_q.filter(Game.session_id == session_id)
            games = games_q.order_by(Game.created_at.desc()).all()

            if not games:
                return {"models": [], "games": [], "global": {}}

            game_ids = [g.id for g in games]
            players = db.query(GamePlayer).filter(GamePlayer.game_id.in_(game_ids)).all()

            # ── Agrégation par model_id ──
            model_data: dict[str, dict] = {}
            for p in players:
                mid = p.model_id
                if mid not in model_data:
                    model_data[mid] = {
                        "model_id": mid,
                        "total_instances": 0,  # nombre d'instances (un joueur = une instance)
                        "total_games_unique": set(),  # parties uniques
                        "wins": 0, "losses": 0,
                        "games_as_civil": 0, "wins_as_civil": 0,
                        "games_as_undercover": 0, "wins_as_undercover": 0,
                        "games_as_mr_white": 0, "wins_as_mr_white": 0,
                        "rounds_survived_total": 0,
                        "correct_votes": 0, "total_votes": 0,
                        # Bluff: survie en tant qu'UC/MW
                        "uc_rounds_survived": [], "mw_rounds_survived": [],
                        # Détection: quand l'UC/MW joueur a été éliminé
                        "rounds_as_uc_before_caught": [],
                        "rounds_as_mw_before_caught": [],
                    }
                d = model_data[mid]
                d["total_instances"] += 1
                d["total_games_unique"].add(p.game_id)
                if p.won:
                    d["wins"] += 1
                else:
                    d["losses"] += 1

                role = p.role
                if role == "civil":
                    d["games_as_civil"] += 1
                    if p.won:
                        d["wins_as_civil"] += 1
                elif role == "undercover":
                    d["games_as_undercover"] += 1
                    if p.won:
                        d["wins_as_undercover"] += 1
                    d["uc_rounds_survived"].append(p.rounds_survived)
                    if not p.survived:
                        d["rounds_as_uc_before_caught"].append(p.rounds_survived)
                elif role == "mr_white":
                    d["games_as_mr_white"] += 1
                    if p.won:
                        d["wins_as_mr_white"] += 1
                    d["mw_rounds_survived"].append(p.rounds_survived)
                    if not p.survived:
                        d["rounds_as_mw_before_caught"].append(p.rounds_survived)

                d["rounds_survived_total"] += p.rounds_survived
                d["correct_votes"] += p.correct_votes
                d["total_votes"] += p.total_votes

            # ── Calculs finaux par modèle ──
            model_results = []
            for mid, d in model_data.items():
                total = d["total_instances"]
                unique_games = len(d["total_games_unique"])
                wr = round(d["wins"] / total * 100, 1) if total > 0 else 0
                va = round(d["correct_votes"] / d["total_votes"] * 100, 1) if d["total_votes"] > 0 else 0
                avg_survival = round(d["rounds_survived_total"] / total, 1) if total > 0 else 0

                # Bluff rating: moyenne de survie en tant qu'UC (plus c'est haut, meilleur bluffeur)
                bluff_uc = round(sum(d["uc_rounds_survived"]) / len(d["uc_rounds_survived"]), 1) if d["uc_rounds_survived"] else None
                bluff_mw = round(sum(d["mw_rounds_survived"]) / len(d["mw_rounds_survived"]), 1) if d["mw_rounds_survived"] else None

                # Détection: nb moyen de tours pour attraper l'UC/MW
                detection_uc = round(sum(d["rounds_as_uc_before_caught"]) / len(d["rounds_as_uc_before_caught"]), 1) if d["rounds_as_uc_before_caught"] else None
                detection_mw = round(sum(d["rounds_as_mw_before_caught"]) / len(d["rounds_as_mw_before_caught"]), 1) if d["rounds_as_mw_before_caught"] else None

                # Win rate par rôle
                civil_wr = round(d["wins_as_civil"] / d["games_as_civil"] * 100, 1) if d["games_as_civil"] > 0 else None
                uc_wr = round(d["wins_as_undercover"] / d["games_as_undercover"] * 100, 1) if d["games_as_undercover"] > 0 else None
                mw_wr = round(d["wins_as_mr_white"] / d["games_as_mr_white"] * 100, 1) if d["games_as_mr_white"] > 0 else None

                model_results.append({
                    "model_id": mid,
                    "total_instances": total,
                    "unique_games": unique_games,
                    "wins": d["wins"],
                    "losses": d["losses"],
                    "win_rate": wr,
                    "vote_accuracy": va,
                    "avg_survival": avg_survival,
                    "games_as_civil": d["games_as_civil"],
                    "wins_as_civil": d["wins_as_civil"],
                    "civil_wr": civil_wr,
                    "games_as_undercover": d["games_as_undercover"],
                    "wins_as_undercover": d["wins_as_undercover"],
                    "undercover_wr": uc_wr,
                    "games_as_mr_white": d["games_as_mr_white"],
                    "wins_as_mr_white": d["wins_as_mr_white"],
                    "mr_white_wr": mw_wr,
                    "bluff_score_uc": bluff_uc,
                    "bluff_score_mw": bluff_mw,
                    "caught_at_round_uc": detection_uc,
                    "caught_at_round_mw": detection_mw,
                    # Intervalles de confiance (Wilson score, 95%)
                    "ci_low": self._wilson_ci(d["wins"], total)[1],
                    "ci_high": self._wilson_ci(d["wins"], total)[2],
                    "ci_uc_low": self._wilson_ci(d["wins_as_undercover"], d["games_as_undercover"])[1] if d["games_as_undercover"] > 0 else None,
                    "ci_uc_high": self._wilson_ci(d["wins_as_undercover"], d["games_as_undercover"])[2] if d["games_as_undercover"] > 0 else None,
                    "ci_mw_low": self._wilson_ci(d["wins_as_mr_white"], d["games_as_mr_white"])[1] if d["games_as_mr_white"] > 0 else None,
                    "ci_mw_high": self._wilson_ci(d["wins_as_mr_white"], d["games_as_mr_white"])[2] if d["games_as_mr_white"] > 0 else None,
                })

            model_results.sort(key=lambda x: x["win_rate"], reverse=True)

            # ── Stats globales ──
            total_games = len(games)
            total_duration = sum(g.duration_seconds for g in games)
            total_rounds = sum(g.rounds_played for g in games)
            winners_count = {"civil": 0, "undercover": 0, "mr_white": 0}
            for g in games:
                if g.winner in winners_count:
                    winners_count[g.winner] += 1

            # Détection globale: en moyenne combien de tours pour éliminer l'UC/MW
            all_uc_caught = []
            all_mw_caught = []
            for p in players:
                if p.role == "undercover" and not p.survived:
                    all_uc_caught.append(p.rounds_survived)
                elif p.role == "mr_white" and not p.survived:
                    all_mw_caught.append(p.rounds_survived)

            global_stats = {
                "total_games": total_games,
                "total_models": len(model_data),
                "avg_duration": round(total_duration / total_games, 1) if total_games > 0 else 0,
                "avg_rounds": round(total_rounds / total_games, 1) if total_games > 0 else 0,
                "winners": winners_count,
                "avg_rounds_to_catch_uc": round(sum(all_uc_caught) / len(all_uc_caught), 1) if all_uc_caught else None,
                "avg_rounds_to_catch_mw": round(sum(all_mw_caught) / len(all_mw_caught), 1) if all_mw_caught else None,
            }

            # ── Liste de parties enrichie ──
            games_list = []
            for g in games:
                g_players = [p for p in players if p.game_id == g.id]
                games_list.append({
                    "game_id": g.game_id,
                    "session_id": g.session_id,
                    "winner": g.winner,
                    "civil_word": g.civil_word,
                    "undercover_word": g.undercover_word,
                    "rounds_played": g.rounds_played,
                    "duration_seconds": round(g.duration_seconds, 1),
                    "player_count": g.player_count,
                    "created_at": g.created_at.isoformat() if g.created_at else None,
                    "players": [
                        {
                            "name": p.player_name,
                            "model_id": p.model_id,
                            "role": p.role,
                            "survived": p.survived,
                            "won": p.won,
                            "rounds_survived": p.rounds_survived,
                        }
                        for p in g_players
                    ],
                })

            return {
                "models": model_results,
                "games": games_list,
                "global": global_stats,
            }

    def delete_game(self, game_id_str: str) -> bool:
        """Supprime une partie et toutes ses données associées."""
        with self.get_session() as db:
            game = db.query(Game).filter(Game.game_id == game_id_str).first()
            if not game:
                return False
            # Recompute model stats before deletion
            for player in game.players:
                self._decrement_model_stats(db, player, game.winner)
            db.delete(game)
            db.commit()
            return True

    def delete_session(self, session_id: int) -> bool:
        """Supprime une session et toutes ses parties."""
        with self.get_session() as db:
            session = db.query(GameSession).filter(GameSession.id == session_id).first()
            if not session:
                return False
            # Recompute model stats for all games in the session
            for game in session.games:
                for player in game.players:
                    self._decrement_model_stats(db, player, game.winner)
            db.delete(session)
            db.commit()
            return True

    def _decrement_model_stats(self, db, player, winner: str):
        """Décrémente les stats d'un modèle suite à la suppression d'une partie."""
        stat = db.query(ModelStats).filter(ModelStats.model_id == player.model_id).first()
        if not stat:
            return
        stat.total_games = max(0, stat.total_games - 1)
        won = player.won
        if won:
            stat.wins = max(0, stat.wins - 1)
        else:
            stat.losses = max(0, stat.losses - 1)
        stat.win_rate = round((stat.wins / stat.total_games * 100) if stat.total_games > 0 else 0, 1)
        role = player.role
        if role == "civil":
            stat.games_as_civil = max(0, stat.games_as_civil - 1)
            if won:
                stat.wins_as_civil = max(0, stat.wins_as_civil - 1)
        elif role == "undercover":
            stat.games_as_undercover = max(0, stat.games_as_undercover - 1)
            if won:
                stat.wins_as_undercover = max(0, stat.wins_as_undercover - 1)
        elif role == "mr_white":
            stat.games_as_mr_white = max(0, stat.games_as_mr_white - 1)
            if won:
                stat.wins_as_mr_white = max(0, stat.wins_as_mr_white - 1)
        # Supprimer le stat si plus aucune partie
        if stat.total_games <= 0:
            db.delete(stat)


    def get_enabled_models(self) -> list[dict]:
        """Retourne tous les modèles activés par l'utilisateur."""
        with self.get_session() as db:
            models = db.query(EnabledModel).order_by(EnabledModel.category, EnabledModel.name).all()
            return [
                {
                    "id": m.id,
                    "model_id": m.model_id,
                    "name": m.name,
                    "provider": m.provider,
                    "category": m.category,
                    "cost": m.cost,
                    "context_length": m.context_length,
                    "params_info": m.params_info,
                    "enabled_at": m.enabled_at.isoformat() if m.enabled_at else None,
                }
                for m in models
            ]

    def add_enabled_model(self, model_data: dict) -> dict:
        """Ajoute un modèle à la liste des modèles activés."""
        with self.get_session() as db:
            existing = db.query(EnabledModel).filter(
                EnabledModel.model_id == model_data["model_id"]
            ).first()
            if existing:
                return {
                    "id": existing.id,
                    "model_id": existing.model_id,
                    "already_exists": True,
                }
            model = EnabledModel(
                model_id=model_data["model_id"],
                name=model_data["name"],
                provider=model_data.get("provider", "openrouter"),
                category=model_data.get("category", "free"),
                cost=model_data.get("cost", "Gratuit"),
                context_length=model_data.get("context_length", 0),
                params_info=model_data.get("params_info", ""),
            )
            db.add(model)
            db.commit()
            return {
                "id": model.id,
                "model_id": model.model_id,
                "already_exists": False,
            }

    def remove_enabled_model(self, model_id: str) -> bool:
        """Retire un modèle de la liste des modèles activés."""
        with self.get_session() as db:
            model = db.query(EnabledModel).filter(
                EnabledModel.model_id == model_id
            ).first()
            if not model:
                return False
            db.delete(model)
            db.commit()
            return True

    def bulk_set_enabled_models(self, model_ids: list[str], all_models: list[dict]) -> int:
        """Remplace la liste complète des modèles activés."""
        with self.get_session() as db:
            db.query(EnabledModel).delete()
            count = 0
            models_map = {m["model_id"]: m for m in all_models}
            for mid in model_ids:
                info = models_map.get(mid, {})
                model = EnabledModel(
                    model_id=mid,
                    name=info.get("name", mid),
                    provider=info.get("provider", "openrouter"),
                    category=info.get("category", "free"),
                    cost=info.get("cost", "Gratuit"),
                    context_length=info.get("context_length", 0),
                    params_info=info.get("params_info", ""),
                )
                db.add(model)
                count += 1
            db.commit()
            return count

    # ── Méthodes utilitaires ────────────────────────────────────────

    @staticmethod
    def _wilson_ci(successes: int, total: int, z: float = 1.96) -> tuple[float, float, float]:
        """Intervalle de confiance Wilson score (95%) → (center, low, high) en %."""
        if total == 0:
            return (0.0, 0.0, 0.0)
        p = successes / total
        denom = 1 + z**2 / total
        center = (p + z**2 / (2 * total)) / denom
        margin = z * math.sqrt((p * (1 - p) + z**2 / (4 * total)) / total) / denom
        return (
            round(center * 100, 1),
            round(max(0, (center - margin)) * 100, 1),
            round(min(1, (center + margin)) * 100, 1),
        )

    # ── Analytics étendues ──────────────────────────────────────────

    def get_extended_analytics(self, session_id: int | None = None) -> dict:
        """Analytics lourdes: courbes de survie, stats discours, styles, coûts."""
        with self.get_session() as db:
            games_q = db.query(Game)
            if session_id:
                games_q = games_q.filter(Game.session_id == session_id)
            games = games_q.all()

            if not games:
                return {"survival_curves": {}, "discourse_stats": [], "style_typology": [], "cost_data": []}

            game_ids = [g.id for g in games]
            game_rounds = {g.id: g.rounds_played for g in games}
            players = db.query(GamePlayer).filter(GamePlayer.game_id.in_(game_ids)).all()
            events = db.query(GameEvent).filter(
                GameEvent.game_id.in_(game_ids),
                GameEvent.event_type == "discussion",
            ).all()

            # ── Courbes de survie par modèle ──
            survival_data: dict[str, dict[str, list]] = {}
            for p in players:
                mid = p.model_id
                if mid not in survival_data:
                    survival_data[mid] = {"uc": [], "mw": []}
                total_rounds = game_rounds.get(p.game_id, 0)
                if p.role == "undercover":
                    survival_data[mid]["uc"].append((p.rounds_survived, total_rounds))
                elif p.role == "mr_white":
                    survival_data[mid]["mw"].append((p.rounds_survived, total_rounds))

            survival_curves = {}
            for mid, roles in survival_data.items():
                curves = {}
                for role_key in ("uc", "mw"):
                    entries = roles[role_key]
                    if not entries:
                        continue
                    max_round = max(tr for _, tr in entries) if entries else 0
                    curve = []
                    for r in range(1, max_round + 1):
                        alive = sum(1 for survived, _ in entries if survived >= r)
                        curve.append({"round": r, "pct": round(alive / len(entries) * 100, 1)})
                    curves[role_key] = curve
                if curves:
                    survival_curves[mid] = curves

            # ── Stats discours ──
            disc_by_model: dict[str, list[int]] = {}
            player_model_map = {(p.game_id, p.player_name): p.model_id for p in players}
            for evt in events:
                mid = player_model_map.get((evt.game_id, evt.player_name))
                if not mid:
                    continue
                msg = evt.data.get("message", "") if evt.data else ""
                if isinstance(msg, str) and msg:
                    if mid not in disc_by_model:
                        disc_by_model[mid] = []
                    disc_by_model[mid].append(len(msg))

            discourse_stats = []
            for mid, lengths in disc_by_model.items():
                if lengths:
                    discourse_stats.append({
                        "model_id": mid,
                        "avg_length": round(sum(lengths) / len(lengths), 0),
                        "total_messages": len(lengths),
                        "max_length": max(lengths),
                        "min_length": min(lengths),
                    })
            discourse_stats.sort(key=lambda x: x["avg_length"], reverse=True)

            # ── Typologie des styles ──
            style_keywords = {
                "manipulateur": ["bluff", "convaincre", "retourner", "manipul", "stratégi", "piège", "feinte", "tromper"],
                "prudent": ["attention", "méfian", "prudem", "observer", "attendre", "doute", "incertain", "réfléch"],
                "agressif": ["suspect", "élimin", "accus", "menteur", "coupable", "traître", "imposteur", "danger"],
                "opportuniste": ["alli", "profit", "moment", "voter avec", "suivre", "consensus", "majorité", "accord"],
            }

            style_by_model: dict[str, dict[str, int]] = {}
            for p in players:
                mid = p.model_id
                if mid not in style_by_model:
                    style_by_model[mid] = {s: 0 for s in style_keywords}
                for entry in (p.reasoning_log or []):
                    text = str(entry.get("reasoning", "")).lower()
                    for style, keywords in style_keywords.items():
                        for kw in keywords:
                            if kw in text:
                                style_by_model[mid][style] += 1

            style_typology = []
            for mid, scores in style_by_model.items():
                total_score = sum(scores.values())
                if total_score > 0:
                    dominant = max(scores, key=scores.get)
                    style_typology.append({
                        "model_id": mid,
                        "dominant_style": dominant,
                        "scores": {k: round(v / total_score * 100, 1) for k, v in scores.items()},
                        "raw_counts": scores,
                    })

            # ── Coût estimé par victoire ──
            enabled = db.query(EnabledModel).all()
            cost_map = {}
            for m in enabled:
                parsed = self._parse_cost(m.cost)
                if parsed > 0:
                    cost_map[m.model_id] = parsed

            cost_data = []
            model_wins: dict[str, int] = {}
            model_games_count: dict[str, int] = {}
            model_rounds_total: dict[str, int] = {}
            for p in players:
                mid = p.model_id
                model_games_count[mid] = model_games_count.get(mid, 0) + 1
                model_rounds_total[mid] = model_rounds_total.get(mid, 0) + p.rounds_survived
                if p.won:
                    model_wins[mid] = model_wins.get(mid, 0) + 1

            for mid, cost_per_m in cost_map.items():
                total = model_games_count.get(mid, 0)
                if total == 0:
                    continue
                wins = model_wins.get(mid, 0)
                avg_rounds = model_rounds_total.get(mid, 0) / total
                # Estimation: ~300 tokens output * 3 phases * avg_rounds par partie
                tokens_per_game = 300 * 3 * avg_rounds
                cost_per_game = tokens_per_game / 1_000_000 * cost_per_m
                total_cost = cost_per_game * total
                cost_per_win = total_cost / wins if wins > 0 else None
                cost_data.append({
                    "model_id": mid,
                    "cost_per_m": cost_per_m,
                    "est_cost_per_game": round(cost_per_game, 4),
                    "est_total_cost": round(total_cost, 4),
                    "est_cost_per_win": round(cost_per_win, 4) if cost_per_win else None,
                    "total_games": total,
                    "wins": wins,
                })
            cost_data.sort(key=lambda x: x.get("est_cost_per_win") or 9999)

            return {
                "survival_curves": survival_curves,
                "discourse_stats": discourse_stats,
                "style_typology": style_typology,
                "cost_data": cost_data,
            }

    @staticmethod
    def _parse_cost(cost_str: str) -> float:
        """Parse '$0.15/M' → 0.15. Retourne 0 si gratuit."""
        if not cost_str or "gratuit" in cost_str.lower():
            return 0.0
        import re
        m = re.search(r"\$?([\d.]+)", cost_str)
        return float(m.group(1)) if m else 0.0
