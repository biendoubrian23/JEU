# 🕵️ Undercover AI Arena

Faites jouer des modèles IA les uns contre les autres au jeu **Undercover** (avec Mr. White) et analysez leurs performances !

## 📋 Prérequis

- **Python 3.10+**
- **Node.js 18+** (npm)
- **Ollama** installé ([ollama.com](https://ollama.com)) — *optionnel si uniquement OpenRouter*
- **Clé API OpenRouter** — *optionnel si uniquement Ollama*

## 🚀 Installation

### 1. Variables d'environnement

Le fichier `.env` à la racine est déjà configuré. Vérifiez votre clé OpenRouter :

```env
OPENROUTER_API_KEY=sk-or-v1-votre-cle-ici
```

### 2. Backend Python

```powershell
cd backend
pip install -r requirements.txt
```

### 3. Frontend Next.js

```powershell
cd frontend
npm install
```

### 4. Modèles Ollama (optionnel)

Téléchargez un ou plusieurs modèles légers :

```powershell
ollama pull llama3.2:3b       # 2 Go - Excellent rapport qualité/taille
ollama pull gemma2:2b          # 1.6 Go - Très léger
ollama pull phi3:mini           # 2.3 Go - Bon pour le raisonnement
ollama pull qwen2.5:3b          # 2 Go - Très bon en français
ollama pull mistral:7b          # 4.1 Go - Plus lourd mais performant
```

> 💡 Commencez avec `llama3.2:3b` et `gemma2:2b` pour tester rapidement.

## ▶️ Lancement

### Terminal 1 — Backend

```powershell
cd backend
python main.py
```

Le serveur démarre sur `http://localhost:8000`.

### Terminal 2 — Frontend

```powershell
cd frontend
npm run dev
```

L'interface est accessible sur `http://localhost:3000`.

### Terminal 3 — Ollama (si utilisé)

Vérifiez qu'Ollama tourne :

```powershell
ollama serve
```

## 🎮 Utilisation

### Configuration rapide

1. Ouvrez `http://localhost:3000`
2. Choisissez le nombre de joueurs (3–12)
3. Assignez un modèle à chaque joueur (Ollama local ou OpenRouter cloud)
4. Sélectionnez le **niveau** (1–5)
5. Définissez le nombre de parties
6. Cliquez **Lancer l'arène**

### Les 5 niveaux

| Niveau | Nom | Description |
|--------|-----|-------------|
| 1 | Indépendant | Chaque partie est isolée, pas de mémoire |
| 2 | Mémoire | Les modèles reçoivent un résumé des parties précédentes |
| 3 | Tendances | Analyse des tendances de chaque modèle entre les parties |
| 4 | Méta-jeu | Stratégies adaptatives basées sur l'historique complet |
| 5 | Tournoi | Rotation complète : chaque modèle joue contre chaque autre |

### Modèles OpenRouter recommandés (gratuits)

- `google/gemma-2-9b-it:free`
- `meta-llama/llama-3.1-8b-instruct:free`
- `mistralai/mistral-7b-instruct:free`
- `qwen/qwen-2.5-7b-instruct:free`

### Modèles OpenRouter pas chers

- `google/gemma-2-9b-it` — ~$0.00003/requête
- `meta-llama/llama-3.1-8b-instruct` — ~$0.00005/requête

> Avec $5 sur OpenRouter et les modèles gratuits, vous pouvez jouer **100+ parties** facilement.

## 📊 Dashboard

L'onglet **Dashboard** affiche :

- **KPIs** : parties jouées, durée moyenne, victoires par camp
- **Classement** des modèles avec taux de victoire par rôle
- **Graphiques** : win rate, performances par rôle, distribution des victoires
- **Historique** complet des parties avec détails

## 🏗️ Architecture

```
Jeu/
├── .env                    # Configuration
├── backend/
│   ├── main.py             # FastAPI + WebSocket + routes
│   ├── config.py           # Settings depuis .env
│   ├── game/
│   │   ├── engine.py       # Moteur de jeu Undercover
│   │   ├── roles.py        # Rôles et distribution
│   │   ├── word_pairs.py   # Paires de mots FR/EN
│   │   └── prompts.py      # Prompts IA (non biaisés)
│   ├── ai/
│   │   ├── base.py         # Interface abstraite
│   │   ├── ollama_provider.py
│   │   └── openrouter_provider.py
│   └── database/
│       ├── models.py       # Modèles SQLAlchemy
│       └── db.py           # Opérations base de données
├── frontend/
│   ├── src/app/
│   │   ├── page.tsx        # Page principale (jeu)
│   │   └── dashboard/
│   │       └── page.tsx    # Page statistiques
│   ├── src/components/
│   │   ├── Sidebar.tsx     # Navigation
│   │   ├── GameConfig.tsx  # Configuration de partie
│   │   ├── GameTable.tsx   # Table de jeu circulaire
│   │   ├── PlayerCard.tsx  # Carte joueur
│   │   ├── ChatRoom.tsx    # Log des événements
│   │   ├── ReasoningPanel.tsx  # Raisonnement IA
│   │   └── StatsCharts.tsx # Graphiques Recharts
│   └── src/lib/
│       ├── types.ts        # Types TypeScript
│       └── api.ts          # Client API
└── README.md
```

## 🔧 API Endpoints

| Méthode | Route | Description |
|---------|-------|-------------|
| POST | `/api/game/start` | Lancer une session de jeu |
| GET | `/api/stats` | Statistiques des modèles |
| GET | `/api/stats/rankings` | Classement |
| GET | `/api/games` | Liste des parties |
| GET | `/api/game/{id}` | Détails d'une partie |
| GET | `/api/models/ollama` | Modèles Ollama disponibles |
| GET | `/api/models/openrouter` | Modèles OpenRouter dispo |
| WS | `/ws` | WebSocket temps réel |

## 📝 Notes

- Les réponses IA sont limitées à **2-3 phrases** pour un jeu naturel
- Les prompts sont **strictement non biaisés** — pas d'injection de personnalité
- Tout est stocké **localement** dans SQLite (`undercover_arena.db`)
- Le WebSocket diffuse les événements en temps réel pour une visualisation live
