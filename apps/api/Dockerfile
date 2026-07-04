FROM python:3.12-slim

# uv binary
COPY --from=ghcr.io/astral-sh/uv:latest /uv /uvx /bin/

ENV PYTHONUNBUFFERED=1
WORKDIR /app

# Copy metadata + source, then install (no dev deps in the image)
COPY pyproject.toml ./
COPY src ./src
RUN uv sync --no-dev

EXPOSE 8000
CMD ["uv", "run", "uvicorn", "astroscout_api.main:app", "--host", "0.0.0.0", "--port", "8000"]
