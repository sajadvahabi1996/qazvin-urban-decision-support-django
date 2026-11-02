"""Create a safe local .env file for development without overwriting user settings."""
from __future__ import annotations

import secrets
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ENV_FILE = ROOT / ".env"
EXAMPLE_FILE = ROOT / ".env.example"
PLACEHOLDER_VALUES = {
    "",
    "replace-this-with-a-generated-secret-key",
    "replace-this-with-a-long-random-secret",
    "change-me",
}


def read_env_key(text: str, key: str) -> str | None:
    prefix = f"{key}="
    for line in text.splitlines():
        stripped = line.strip()
        if stripped.startswith(prefix):
            return stripped[len(prefix) :].strip().strip('"\'')
    return None


def main() -> None:
    if not ENV_FILE.exists():
        if EXAMPLE_FILE.exists():
            content = EXAMPLE_FILE.read_text(encoding="utf-8")
        else:
            content = "DJANGO_DEBUG=1\nDJANGO_ALLOWED_HOSTS=127.0.0.1,localhost\n"
    else:
        content = ENV_FILE.read_text(encoding="utf-8")

    current_key = read_env_key(content, "DJANGO_SECRET_KEY")
    if current_key is None or current_key.lower() in PLACEHOLDER_VALUES:
        secret = secrets.token_urlsafe(48)
        lines = content.splitlines()
        replaced = False
        for index, line in enumerate(lines):
            if line.strip().startswith("DJANGO_SECRET_KEY="):
                lines[index] = f"DJANGO_SECRET_KEY={secret}"
                replaced = True
                break
        if not replaced:
            lines.insert(0, f"DJANGO_SECRET_KEY={secret}")
        content = "\n".join(lines).rstrip() + "\n"

    # Ensure local development settings are present when the example is incomplete.
    if read_env_key(content, "DJANGO_DEBUG") is None:
        content += "DJANGO_DEBUG=1\n"
    if read_env_key(content, "DJANGO_ALLOWED_HOSTS") is None:
        content += "DJANGO_ALLOWED_HOSTS=127.0.0.1,localhost\n"

    ENV_FILE.write_text(content, encoding="utf-8")
    print(f"Local environment file is ready: {ENV_FILE.name}")


if __name__ == "__main__":
    main()
