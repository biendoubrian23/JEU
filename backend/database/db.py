"""Gestion de la base de données SQLite."""
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
