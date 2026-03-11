"""Paires de mots pour le jeu Undercover.

Chaque paire contient deux mots proches mais différents.
Le premier mot est celui des civils, le second celui de l'undercover.
Mr. White ne reçoit aucun mot.
"""
import random

WORD_PAIRS_FR = [
    ("Chat", "Chien"),
    ("Soleil", "Lune"),
    ("Café", "Thé"),
    ("Pizza", "Burger"),
    ("Guitare", "Piano"),
    ("Plage", "Piscine"),
    ("Avion", "Hélicoptère"),
    ("Football", "Rugby"),
    ("Chocolat", "Caramel"),
    ("Montagne", "Colline"),
    ("Cinéma", "Théâtre"),
    ("Vélo", "Trottinette"),
    ("Pluie", "Neige"),
    ("Livre", "Journal"),
    ("Chaussure", "Sandale"),
    ("Pomme", "Poire"),
    ("Train", "Métro"),
    ("Crayon", "Stylo"),
    ("Chapeau", "Casquette"),
    ("Sofa", "Fauteuil"),
    ("Forêt", "Jungle"),
    ("Rivière", "Fleuve"),
    ("Glace", "Sorbet"),
    ("Violon", "Violoncelle"),
    ("Croissant", "Brioche"),
    ("Tigre", "Lion"),
    ("Moto", "Scooter"),
    ("Rose", "Tulipe"),
    ("Lait", "Yaourt"),
    ("Étoile", "Planète"),
    ("Sac", "Valise"),
    ("Fenêtre", "Porte"),
    ("Sel", "Poivre"),
    ("Peinture", "Dessin"),
    ("Bague", "Bracelet"),
    ("Miroir", "Vitre"),
    ("Sardine", "Anchois"),
    ("Volcan", "Geyser"),
    ("Kangourou", "Wallaby"),
    ("Opéra", "Comédie musicale"),
    ("Marathon", "Sprint"),
    ("Papillon", "Libellule"),
    ("Igloo", "Tipi"),
    ("Sushi", "Maki"),
    ("Saxophone", "Clarinette"),
    ("Django", "Flask"),
    ("Python", "Java"),
    ("WiFi", "Bluetooth"),
    ("Instagram", "TikTok"),
    ("Netflix", "YouTube"),
    ("Espresso", "Cappuccino"),
    ("Beurre", "Margarine"),
    ("Tortue", "Escargot"),
    ("Aigle", "Faucon"),
    ("Océan", "Mer"),
    ("Désert", "Savane"),
    ("Château", "Palais"),
    ("Roi", "Empereur"),
    ("Épée", "Sabre"),
    ("Diamant", "Rubis"),
    ("Hiver", "Automne"),
    ("Nuit", "Crépuscule"),
    ("Fromage", "Beurre"),
    ("Carotte", "Navet"),
    ("Requin", "Dauphin"),
    ("Hibou", "Chouette"),
    ("Cerise", "Framboise"),
    ("Cheminée", "Poêle"),
    ("Balcon", "Terrasse"),
    ("Coussin", "Oreiller"),
]

WORD_PAIRS_EN = [
    ("Cat", "Dog"),
    ("Sun", "Moon"),
    ("Coffee", "Tea"),
    ("Pizza", "Burger"),
    ("Guitar", "Piano"),
    ("Beach", "Pool"),
    ("Airplane", "Helicopter"),
    ("Soccer", "Rugby"),
    ("Chocolate", "Caramel"),
    ("Mountain", "Hill"),
    ("Cinema", "Theater"),
    ("Bicycle", "Scooter"),
    ("Rain", "Snow"),
    ("Book", "Newspaper"),
    ("Shoe", "Sandal"),
    ("Apple", "Pear"),
    ("Train", "Subway"),
    ("Pencil", "Pen"),
    ("Hat", "Cap"),
    ("Sofa", "Armchair"),
]


def get_random_pair(language: str = "fr") -> tuple[str, str]:
    """Retourne une paire de mots aléatoire."""
    pairs = WORD_PAIRS_FR if language == "fr" else WORD_PAIRS_EN
    return random.choice(pairs)


def get_all_pairs(language: str = "fr") -> list[tuple[str, str]]:
    """Retourne toutes les paires disponibles."""
    return WORD_PAIRS_FR if language == "fr" else WORD_PAIRS_EN
