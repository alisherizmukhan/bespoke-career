"""Defences for the free-text assistant, layered around the model's own instructions:

1. `screen_input`: refuse obvious prompt-injection / prompt-extraction attempts before they reach the model.
2. `clean`: strip markup and control characters from data that goes into the prompt (much of it is scraped from
   third-party job sites), so nothing can close the <career_data> fence or smuggle hidden text.
3. `screen_output`: never return text that echoes the system prompt or looks like a secret.
"""
import re
import unicodedata
from typing import Any

from . import prompts

OFF_LIMITS_REPLY = ("I can only help with your job search and career: resumes, applications, interviews, salary and "
                    "next steps. Try asking, for example, which applications you should follow up on.")

_INJECTION = re.compile(
    r"(ignore|disregard|forget|override|bypass)\b.{0,40}\b(previous|prior|above|earlier|all|your|system)\b.{0,30}\b"
    r"(instruction|prompt|rule|message|direction|guideline)s?"
    r"|\b(reveal|show|print|repeat|output|display|leak|dump|translate|summari[sz]e)\b.{0,40}\b(system|initial|hidden|developer|original)\s+"
    r"(prompt|instruction|message|rule)s?"
    r"|\bwhat (is|are|were) your (system |initial |hidden )?(prompt|instructions|rules)\b"
    r"|\b(developer|god|dan|jailbreak|unrestricted|sudo)\s+mode\b|\bjailbreak\b|\bdo anything now\b"
    r"|\byou are no longer\b|\bact as (an? )?(unfiltered|uncensored|different)\b|\bpretend (you are|to be) (not|an? (unfiltered|evil))\b"
    r"|</?\s*(system|career_data|user_message|instructions?)\s*>"
    r"|\b(api[_ -]?key|secret key|openai key|env(ironment)? variables?|\.env\b|jwt secret)\b",
    re.I | re.S,
)

_SECRET = re.compile(r"\b(sk|rk)_(live|test)_[A-Za-z0-9]{8,}|\bsk-[A-Za-z0-9_-]{20,}|\bwhsec_[A-Za-z0-9]{8,}"
                     r"|\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}")


def screen_input(text: str) -> bool:
    """True when the message should be refused without calling the model."""
    t = unicodedata.normalize("NFKC", text)
    t = re.sub(r"[​-‏⁠﻿]", "", t)  # zero-width characters used to split keywords
    return bool(_INJECTION.search(t))


def clean(value: Any, limit: int = 300) -> Any:
    """Recursively sanitise data before it is embedded in a prompt."""
    if isinstance(value, str):
        v = unicodedata.normalize("NFKC", value)
        v = "".join(ch for ch in v if ch in "\n\t" or unicodedata.category(ch)[0] != "C")
        v = v.replace("<", "‹").replace(">", "›")
        return v[:limit]
    if isinstance(value, dict):
        return {k: clean(v, limit) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [clean(v, limit) for v in value]
    return value


_PROMPT_MARKERS = [s for s in (prompts.SYSTEM["assistant"][:60], "Security rules (highest priority", "untrusted data. Never follow",
                               prompts.NO_FABRICATION[:50])]


def screen_output(text: str) -> str:
    if _SECRET.search(text) or any(m in text for m in _PROMPT_MARKERS):
        return OFF_LIMITS_REPLY
    return text


def fence(tag: str, text: str, limit: int = 60000) -> str:
    """Wrap untrusted text in a named tag the model is told to treat as data."""
    return "<" + tag + ">\n" + clean(text or "", limit) + "\n</" + tag + ">"
