"""שרת MCP: מאפשר לסטודנטיות לעבוד עם OpuLi מתוך Claude, ChatGPT ושאר
אפליקציות AI. מורכב על /mcp באותו שרת API (ראו main.py), כבוי כל עוד
MCP_ENABLED לא דולק."""

from .server import build_mcp_app

__all__ = ["build_mcp_app"]
