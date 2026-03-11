"""Modèles de données SQLAlchemy pour la base SQLite."""
import datetime
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, JSON,
    ForeignKey, create_engine,
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class GameSession(Base):
    """Une session de jeu (groupe de parties à un même niveau)."""
    __tablename__ = "game_sessions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    session_name = Column(String(255), nullable=False)
    level = Column(Integer, default=1)
    total_games = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    games = relationship("Game", back_populates="session", cascade="all, delete-orphan")


class Game(Base):
    """Une partie individuelle d'Undercover."""
    __tablename__ = "games"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(String(20), unique=True, nullable=False)
    session_id = Column(Integer, ForeignKey("game_sessions.id"), nullable=True)
    level = Column(Integer, default=1)
    civil_word = Column(String(100), nullable=False)
    undercover_word = Column(String(100), nullable=False)
    winner = Column(String(20))  # "civil", "undercover", "mr_white"
    rounds_played = Column(Integer, default=0)
    duration_seconds = Column(Float, default=0.0)
    player_count = Column(Integer, default=0)
    created_at = Column(DateTime, default=datetime.datetime.utcnow)

    session = relationship("GameSession", back_populates="games")
    players = relationship("GamePlayer", back_populates="game", cascade="all, delete-orphan")
    events = relationship("GameEvent", back_populates="game", cascade="all, delete-orphan")


class GamePlayer(Base):
    """Un joueur dans une partie."""
    __tablename__ = "game_players"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    player_name = Column(String(100), nullable=False)
    model_id = Column(String(200), nullable=False)
    provider = Column(String(50), nullable=False)
    role = Column(String(20), nullable=False)
    survived = Column(Boolean, default=False)
    won = Column(Boolean, default=False)
    rounds_survived = Column(Integer, default=0)
    clues_given = Column(JSON, default=list)
    votes_cast = Column(JSON, default=list)
    correct_votes = Column(Integer, default=0)
    total_votes = Column(Integer, default=0)
    reasoning_log = Column(JSON, default=list)

    game = relationship("Game", back_populates="players")


class GameEvent(Base):
    """Un événement dans une partie (indice, discussion, vote, etc.)."""
    __tablename__ = "game_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    game_id = Column(Integer, ForeignKey("games.id"), nullable=False)
    timestamp = Column(Float, nullable=False)
    event_type = Column(String(30), nullable=False)
    round_num = Column(Integer, default=0)
    player_name = Column(String(100))
    data = Column(JSON, default=dict)

    game = relationship("Game", back_populates="events")


class ModelStats(Base):
    """Statistiques agrégées par modèle (mise à jour après chaque partie)."""
    __tablename__ = "model_stats"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_id = Column(String(200), nullable=False)
    total_games = Column(Integer, default=0)
    wins = Column(Integer, default=0)
    losses = Column(Integer, default=0)
    win_rate = Column(Float, default=0.0)

    # Par rôle
    games_as_civil = Column(Integer, default=0)
    wins_as_civil = Column(Integer, default=0)
    games_as_undercover = Column(Integer, default=0)
    wins_as_undercover = Column(Integer, default=0)
    games_as_mr_white = Column(Integer, default=0)
    wins_as_mr_white = Column(Integer, default=0)
    mr_white_correct_guesses = Column(Integer, default=0)

    # Métriques avancées
    avg_rounds_survived = Column(Float, default=0.0)
    total_correct_votes = Column(Integer, default=0)
    total_votes = Column(Integer, default=0)
    vote_accuracy = Column(Float, default=0.0)
    avg_suspicion_received = Column(Float, default=0.0)  # votes reçus moyen quand éliminé
    deception_rate = Column(Float, default=0.0)  # survie en tant qu'undercover jour 1

    # Par niveau
    level = Column(Integer, default=0)  # 0 = global

    updated_at = Column(DateTime, default=datetime.datetime.utcnow, onupdate=datetime.datetime.utcnow)


class EnabledModel(Base):
    """Modèle activé par l'utilisateur pour la sélection de joueurs."""
    __tablename__ = "enabled_models"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_id = Column(String(200), unique=True, nullable=False)
    name = Column(String(200), nullable=False)
    provider = Column(String(50), nullable=False)  # "openrouter"
    category = Column(String(50), nullable=False)  # "free" ou "cheap"
    cost = Column(String(100), default="Gratuit")
    context_length = Column(Integer, default=0)
    params_info = Column(String(200), default="")
    enabled_at = Column(DateTime, default=datetime.datetime.utcnow)
