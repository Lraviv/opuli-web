"""ידע קודם לקורסי האו"פ, כפי שמופיע בדף הקורס (www.openu.ac.il/courses/<מספר>.htm).

מספר קורס -> (ידע קודם דרוש, ידע קודם מומלץ). קורס שהדף שלו לא נקרא לא מופיע כאן.
"""

PREREQUISITES: dict[str, tuple[tuple[str, ...], tuple[str, ...]]] = {}
