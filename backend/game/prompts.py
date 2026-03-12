"""Prompts système pour les IA - strictement non biaisés.

Les prompts ne donnent aucune stratégie, personnalité ou indication.
Ils exposent uniquement les règles du jeu et ce que l'IA doit faire.
"""


def system_prompt_rules() -> str:
    """Règles du jeu Undercover, communes à tous les joueurs."""
    return """Tu participes à une partie du jeu "Undercover" avec Mr. White.

RÈGLES DU JEU :
- Chaque joueur reçoit secrètement un rôle : Civil, Undercover ou Mr. White.
- Les Civils reçoivent tous le même mot secret.
- L'Undercover reçoit un mot différent mais proche du mot des Civils.
- Mr. White ne reçoit aucun mot.
- À chaque tour, chaque joueur doit donner UN SEUL MOT (un indice) lié à son mot secret.
- Mr. White doit bluffer en donnant un mot crédible sans connaître le vrai mot.
- Après les indices, les joueurs discutent brièvement pour identifier qui est suspect.
- Puis chaque joueur vote pour éliminer un joueur.
- Le joueur avec le plus de votes est éliminé. Son rôle est révélé.
- Si Mr. White est éliminé, il a UNE chance de deviner le mot des Civils pour gagner seul.

CONDITIONS DE VICTOIRE :
- Les Civils gagnent en éliminant tous les Undercover et Mr. White.
- L'Undercover gagne en étant parmi les 2 derniers survivants.
- Mr. White gagne en devinant le mot des Civils lorsqu'il est éliminé.

CONTRAINTES DE COMMUNICATION :
- Tes réponses doivent être COURTES : 1 à 3 phrases maximum.
- Ne révèle JAMAIS ton mot secret directement.
- Ne révèle JAMAIS ton rôle sauf si c'est stratégique.
- Parle naturellement, comme dans une conversation entre amis."""


def role_prompt(role: str, word: str | None, player_name: str) -> str:
    """Prompt spécifique au rôle du joueur."""
    if role == "civil":
        return f"""Tu es {player_name}.
Ton rôle secret : CIVIL.
Ton mot secret : "{word}".
Donne des indices liés à ton mot sans le révéler directement. Essaie d'identifier qui n'a pas le même mot que toi."""

    elif role == "undercover":
        return f"""Tu es {player_name}.
Ton rôle secret : UNDERCOVER.
Ton mot secret : "{word}".
Ton mot est DIFFÉRENT de celui des Civils mais proche. Donne des indices assez vagues pour te fondre dans le groupe sans te faire repérer."""

    elif role == "mr_white":
        return f"""Tu es {player_name}.
Ton rôle secret : MR. WHITE.
Tu n'as AUCUN mot. Tu dois bluffer en écoutant les indices des autres et en donnant des mots crédibles.
Si tu es éliminé, tu auras une chance de deviner le mot des Civils pour gagner."""

    return ""


def clue_prompt(round_num: int, previous_clues: list[dict]) -> str:
    """Prompt pour demander un indice."""
    context = ""
    if previous_clues:
        context = "\nIndices donnés précédemment :\n"
        for clue in previous_clues:
            context += f"- {clue['player']}: \"{clue['word']}\"\n"

    return f"""Tour {round_num} - Phase d'indices.
{context}
C'est ton tour. Donne UN SEUL MOT comme indice lié à ton mot secret.
IMPORTANT : Tu ne dois PAS répéter un mot déjà donné par toi ou par un autre joueur. Chaque indice doit être un mot DIFFÉRENT de tous les indices précédents.
Réponds UNIQUEMENT en JSON : {{"clue": "ton_mot", "reasoning": "explication courte de ton choix (privé, les autres ne verront pas)"}}"""


def discussion_prompt(
    round_num: int,
    clues_this_round: list[dict],
    previous_eliminations: list[dict],
    all_clues_history: list[dict] | None = None,
) -> str:
    """Prompt pour la phase de discussion."""
    clues_text = "\n".join([f"- {c['player']}: \"{c['word']}\"" for c in clues_this_round])

    # Historique complet des indices des tours précédents
    history_text = ""
    if all_clues_history:
        history_text = "\nHistorique des indices (tours précédents) :\n"
        for c in all_clues_history:
            history_text += f"- Tour {c.get('round', '?')} · {c['player']}: \"{c['word']}\"\n"

    elim_text = ""
    if previous_eliminations:
        elim_text = "\nJoueurs éliminés précédemment :\n"
        for e in previous_eliminations:
            elim_text += f"- {e['player']} était {e['role']}\n"

    return f"""Tour {round_num} - Phase de discussion.
{history_text}
Indices de ce tour :
{clues_text}
{elim_text}
Donne ton avis en 1-3 phrases. Qui te semble suspect et pourquoi ?
Réponds en JSON : {{"message": "ton message court", "reasoning": "ta réflexion privée"}}"""


def rebuttal_prompt(
    round_num: int,
    first_round_messages: list[dict],
) -> str:
    """Prompt pour le 2e tour de discussion (réplique / défense)."""
    msgs_text = "\n".join([f"- {m['player']}: {m['message']}" for m in first_round_messages])

    return f"""Tour {round_num} - Phase de réplique.
Voici ce que les joueurs ont dit au premier tour de discussion :
{msgs_text}

C'est ton tour de répondre. Tu peux te défendre si tu as été accusé, contre-attaquer, soutenir une accusation, ou changer d'avis.
Réponds en 1-3 phrases.
Réponds en JSON : {{"message": "ta réplique", "reasoning": "ta réflexion privée"}}"""


def vote_prompt(
    round_num: int,
    alive_players: list[str],
    player_name: str,
    discussion_messages: list[dict],
    round_clues: list[dict] | None = None,
    all_clues_history: list[dict] | None = None,
) -> str:
    """Prompt pour voter."""
    players_list = ", ".join([p for p in alive_players if p != player_name])

    # Historique complet des indices
    history_text = ""
    if all_clues_history:
        history_text = "\nHistorique des indices (tours précédents) :\n"
        for c in all_clues_history:
            history_text += f"- Tour {c.get('round', '?')} · {c['player']}: \"{c['word']}\"\n"

    # Indices du tour en cours
    clues_text = ""
    if round_clues:
        clues_text = "\nIndices de ce tour :\n"
        for c in round_clues:
            clues_text += f"- {c['player']}: \"{c['word']}\"\n"

    discussion_text = ""
    if discussion_messages:
        discussion_text = "\nDiscussion :\n"
        for msg in discussion_messages:
            discussion_text += f"- {msg['player']}: {msg['message']}\n"

    return f"""Tour {round_num} - Phase de vote.
{history_text}{clues_text}{discussion_text}
Joueurs en vie (sauf toi) : {players_list}
En te basant sur les indices ET la discussion, vote pour éliminer UN joueur. Tu ne peux PAS voter pour toi-même.
Réponds en JSON : {{"vote": "nom_du_joueur", "reasoning": "pourquoi tu votes pour cette personne (privé)"}}"""


def mr_white_guess_prompt(clues_history: list[dict]) -> str:
    """Prompt pour Mr. White quand il est éliminé - il tente de deviner."""
    clues_text = "\n".join([f"- {c['player']}: \"{c['word']}\"" for c in clues_history])

    return f"""Tu as été éliminé ! En tant que Mr. White, tu as UNE chance de deviner le mot des Civils.
Voici tous les indices qui ont été donnés :
{clues_text}

Quel est selon toi le mot secret des Civils ?
Réponds en JSON : {{"guess": "le_mot", "reasoning": "ton raisonnement"}}"""


def level2_memory_prompt(previous_games: list[dict]) -> str:
    """Prompt additionnel pour le Level 2 - mémoire des parties passées."""
    if not previous_games:
        return ""

    text = "\n--- MÉMOIRE DES PARTIES PRÉCÉDENTES ---\n"
    for i, game in enumerate(previous_games[-5:], 1):  # Max 5 dernières parties
        text += f"Partie {i}: Gagnant={game.get('winner_role', '?')}, "
        text += f"Éliminés={', '.join(game.get('eliminated', []))}\n"

    return text


def level3_tendencies_prompt(player_tendencies: dict) -> str:
    """Prompt additionnel pour le Level 3 - tendances des adversaires."""
    if not player_tendencies:
        return ""

    text = "\n--- TENDANCES OBSERVÉES ---\n"
    for player, stats in player_tendencies.items():
        text += f"{player}: victoires={stats.get('wins', 0)}, "
        text += f"détections correctes={stats.get('correct_votes', 0)}%, "
        text += f"survie moyenne={stats.get('avg_survival', 0)} tours\n"

    return text


def level4_meta_prompt(global_rankings: list[dict]) -> str:
    """Prompt additionnel pour le Level 4 - méta-stratégie."""
    if not global_rankings:
        return ""

    text = "\n--- CLASSEMENT GLOBAL ---\n"
    for i, entry in enumerate(global_rankings, 1):
        text += f"#{i} {entry['model']}: {entry['win_rate']}% victoires\n"

    return text
