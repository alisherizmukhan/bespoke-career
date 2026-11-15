"""LLM provider abstraction (OpenAI by default, Anthropic optional).

Callers ask for a task + schema; this module picks the provider/model, records usage metadata
(never prompt or output content) and returns None when AI is unavailable, refused or failing,
so callers fall back to deterministic logic."""
import logging
import threading
import re
import time
from typing import TypeVar

from pydantic import BaseModel

from ..config import get_settings
from ..db import SessionLocal
from ..models import AICall
from . import prompts

log = logging.getLogger("bespoke.ai")
settings = get_settings()
T = TypeVar("T", bound=BaseModel)
_clients: dict = {}


def available() -> bool:
    return settings.ai_enabled


# Model routing: cheap fast model for everyday work, the smart model only where quality matters most.
TASK_TIER = {
    "resume_parse": "fast", "salary_explain": "fast", "assistant": "auto",
    "ats_analyze": "smart", "resume_generate": "smart", "cover_letter": "smart", "negotiate": "smart",
}
_COMPLEX = re.compile(r"prepare|interview|strateg|plan|roadmap|rewrite|improve|negotiat|cover letter|compare|analy|"
                      r"career change|switch career|step by step|mock|practice|feedback on|review my", re.I)


def model_for(task: str, text: str = "") -> str:
    if settings.ai_provider != "openai":
        return settings.anthropic_model
    tier = TASK_TIER.get(task, "fast")
    if tier == "auto":
        tier = "smart" if (len(text) > 400 or _COMPLEX.search(text or "")) else "fast"
    return settings.openai_model if tier == "smart" else settings.openai_model_fast


def _openai():
    if "openai" not in _clients:
        from openai import OpenAI

        _clients["openai"] = OpenAI(api_key=settings.openai_api_key, max_retries=2, timeout=120)
    return _clients["openai"]


def _anthropic():
    if "anthropic" not in _clients:
        import anthropic

        _clients["anthropic"] = anthropic.Anthropic(api_key=settings.anthropic_api_key, max_retries=2, timeout=120)
    return _clients["anthropic"]


def _record(user_id, task: str, status: str, in_tok: int = 0, out_tok: int = 0, started: float | None = None,
            model: str | None = None) -> None:
    """Write usage metadata off the request path so it never delays a reply."""
    latency = int((time.time() - (started or time.time())) * 1000)
    threading.Thread(target=_write, args=(user_id, task, status, in_tok, out_tok, latency, model), daemon=True).start()


def _write(user_id, task, status, in_tok, out_tok, latency, model) -> None:
    db = SessionLocal()
    try:
        db.add(AICall(user_id=user_id, task=task, prompt_version=prompts.VERSIONS.get(task, "v1"),
                      model=f"{settings.ai_provider}:{model or settings.ai_model}", status=status, input_tokens=in_tok or 0,
                      output_tokens=out_tok or 0, latency_ms=latency))
        db.commit()
    except Exception:  # noqa: BLE001
        log.exception("failed to record AI call")
    finally:
        db.close()


def structured(task: str, user_content: str, schema: type[T], user_id=None, effort: str = "medium") -> T | None:
    """JSON output validated against `schema`. Returns None if AI is off, refused, or fails."""
    if not available():
        return None
    started = time.time()
    model = model_for(task, user_content)
    if settings.ai_provider == "openai":
        import openai

        try:
            r = _openai().chat.completions.parse(
                model=model,
                messages=[{"role": "system", "content": prompts.SYSTEM[task]}, {"role": "user", "content": user_content}],
                response_format=schema,
            )
        except (openai.APIError, openai.APIConnectionError) as e:
            log.warning("AI %s failed: %s", task, e)
            _record(user_id, task, "error", started=started, model=model)
            return None
        except Exception as e:  # noqa: BLE001 — e.g. output that fails schema validation
            log.warning("AI %s parse failed: %s", task, e)
            _record(user_id, task, "error", started=started, model=model)
            return None
        msg = r.choices[0].message
        u = r.usage
        if msg.refusal or msg.parsed is None:
            _record(user_id, task, "refused", u.prompt_tokens if u else 0, u.completion_tokens if u else 0, started, model)
            return None
        _record(user_id, task, "ok", u.prompt_tokens if u else 0, u.completion_tokens if u else 0, started, model)
        return msg.parsed

    import anthropic

    try:
        resp = _anthropic().messages.parse(model=settings.ai_model, max_tokens=16000, system=prompts.SYSTEM[task],
                                           output_config={"effort": effort},
                                           messages=[{"role": "user", "content": user_content}], output_format=schema)
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        log.warning("AI %s failed: %s", task, e)
        _record(user_id, task, "error", started=started, model=model)
        return None
    if resp.stop_reason == "refusal":
        _record(user_id, task, "refused", resp.usage.input_tokens, resp.usage.output_tokens, started)
        return None
    _record(user_id, task, "ok", resp.usage.input_tokens, resp.usage.output_tokens, started)
    return resp.parsed_output


REFUSAL_TEXT = "I can't help with that request. Try asking about your resume, applications, salary or next career steps."


def chat(task: str, system_context: str, messages: list[dict], user_id=None, effort: str = "medium") -> str | None:
    """Free-text assistant reply grounded in `system_context`."""
    if not available():
        return None
    started = time.time()
    last_user = next((m["content"] for m in reversed(messages) if m["role"] == "user"), "")
    model = model_for(task, last_user if isinstance(last_user, str) else "")
    # The data block goes into the user turn, fenced in tags, never into the system role: it contains user- and
    # third-party-written text that must not carry instruction authority.
    if messages and messages[-1]["role"] == "user":
        fenced = "<career_data>\n" + system_context + "\n</career_data>\n\n<user_message>\n" + str(messages[-1]["content"]) + "\n</user_message>"
        messages = [*messages[:-1], {"role": "user", "content": fenced}]
    if settings.ai_provider == "openai":
        import openai

        try:
            r = _openai().chat.completions.create(
                model=model,
                messages=[{"role": "system", "content": prompts.SYSTEM[task]}, *messages],
                max_completion_tokens=2000,
            )
        except (openai.APIError, openai.APIConnectionError) as e:
            log.warning("AI chat failed: %s", e)
            _record(user_id, task, "error", started=started, model=model)
            return None
        msg = r.choices[0].message
        u = r.usage
        if msg.refusal:
            _record(user_id, task, "refused", u.prompt_tokens if u else 0, u.completion_tokens if u else 0, started, model)
            return REFUSAL_TEXT
        _record(user_id, task, "ok", u.prompt_tokens if u else 0, u.completion_tokens if u else 0, started, model)
        return (msg.content or "").strip() or None

    import anthropic

    try:
        resp = _anthropic().beta.messages.create(
            model=settings.ai_model, max_tokens=16000, betas=["server-side-fallback-2026-07-01"], fallbacks="default",
            system=[{"type": "text", "text": prompts.SYSTEM[task], "cache_control": {"type": "ephemeral"}}],
            output_config={"effort": effort}, messages=messages)
    except (anthropic.APIStatusError, anthropic.APIConnectionError) as e:
        log.warning("AI chat failed: %s", e)
        _record(user_id, task, "error", started=started, model=model)
        return None
    if resp.stop_reason == "refusal":
        _record(user_id, task, "refused", resp.usage.input_tokens, resp.usage.output_tokens, started)
        return REFUSAL_TEXT
    _record(user_id, task, "ok", resp.usage.input_tokens, resp.usage.output_tokens, started)
    return "".join(b.text for b in resp.content if b.type == "text").strip() or None
