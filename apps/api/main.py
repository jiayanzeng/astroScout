"""Vercel FastAPI entrypoint.

The deploy wrapper keeps the runtime application in the installed
``astroscout_api`` package while exposing the conventional ``main:app`` seam
expected by Vercel's Python runtime.
"""

from astroscout_api.main import app

__all__ = ["app"]
