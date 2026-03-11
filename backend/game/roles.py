"""Définition des rôles du jeu Undercover."""
from enum import Enum


class Role(str, Enum):
    CIVIL = "civil"
    UNDERCOVER = "undercover"
    MR_WHITE = "mr_white"


# Distribution des rôles selon le nombre de joueurs
# Format: {nb_joueurs: (nb_civils, nb_undercover, nb_mr_white)}
ROLE_DISTRIBUTION = {
    3: (2, 1, 0),
    4: (3, 1, 0),
    5: (3, 1, 1),
    6: (4, 1, 1),
    7: (4, 2, 1),
    8: (5, 2, 1),
    9: (6, 2, 1),
    10: (6, 3, 1),
    11: (7, 3, 1),
    12: (8, 3, 1),
}


def get_role_distribution(nb_players: int) -> tuple[int, int, int]:
    """Retourne la distribution (civils, undercover, mr_white) pour un nombre de joueurs."""
    if nb_players in ROLE_DISTRIBUTION:
        return ROLE_DISTRIBUTION[nb_players]
    # Pour > 12 joueurs, formule générale
    nb_mr_white = 1
    nb_undercover = max(1, nb_players // 4)
    nb_civils = nb_players - nb_undercover - nb_mr_white
    return (nb_civils, nb_undercover, nb_mr_white)
