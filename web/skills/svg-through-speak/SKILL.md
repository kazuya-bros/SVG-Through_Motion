---
name: svg-through-speak
description: Speak through the user's SVG-Through character using its local fixed HTTP API. Use when the user asks to speak, read aloud, stop, or interrupt that character, or has authorized ongoing character speech.
---

# SVG-Through character speech

Use the configured character and voice. Default server: `http://127.0.0.1:8765`; honor a user-provided URL. The user selects the character/TTS, enables external speech reception, and opens the character window. Do not change those choices or launch a window merely to make a speech request succeed.

The API is fixed: no session ID is needed. Instructions for HTTP clients are at `<server>/web/runtime-help.html`. The optional helper [scripts/speak.py](scripts/speak.py) uses only Python's standard library.

1. `GET /api/runtime/status`. Check `accepting`, `connected`, `ready`, `state`, and `current.id`. If reception is off or the window is unavailable, report that condition; do not enable it automatically.
2. When idle, `POST /api/runtime/speech` with `{"request_id":"a new UUID","action":"speak","text":"the intended spoken text"}`. Compose a short contextual line if the user asks for a speech demonstration without specifying words. Otherwise preserve their intended content and language.
3. If already speaking, normally let it finish. When the user's request warrants interruption, send `action:"replace"`, the observed `expected_utterance_id:current.id`, and the new text. To stop only, use `action:"stop"` with the observed ID and omit text. A 409 means the state changed or reception is unavailable; inspect the state before deciding again. Do not automatically escalate `speak` to `replace`.
4. A 202 means accepted, not spoken. Check `GET /api/runtime/speech/{request_id}` until `completed`, `failed`, or `interrupted`, with a bounded wait. Describe what the API confirmed; it cannot detect OS mute or prove that the user heard the audio.

Keep the UUID and exact payload for each submission. After an uncertain transport result, query the receipt first, and if retrying while its history is retained, resend the **same UUID and payload**. Reopening a character does not invalidate retained receipts. History is in memory (up to 400 fixed-API requests); a server restart or eviction can remove it. If an uncertain request's receipt is 404, report uncertainty instead of generating a fresh request or blindly replaying it.

Helper examples (paths relative to this skill):

```text
python scripts/speak.py --url http://127.0.0.1:8765 status
python scripts/speak.py --url http://127.0.0.1:8765 speak --text "こんにちは。" --request-id YOUR_UUID
python scripts/speak.py --url http://127.0.0.1:8765 result --request-id YOUR_UUID
python scripts/speak.py --url http://127.0.0.1:8765 replace --expected-utterance-id OBSERVED_ID --text "訂正するわね。" --request-id NEW_UUID
```

No speech is authorized just by discovering or loading this skill. Follow the user's current request or existing explicit authorization for when and what to speak. Never put secrets or unrelated tool outputs into spoken text.
