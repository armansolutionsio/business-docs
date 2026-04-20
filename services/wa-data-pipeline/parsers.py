"""
Parsers para datos de WhatsApp Business API webhooks.

El Google Sheet guarda en la columna "Telefono" el payload COMPLETO del webhook.
Cada fila es un mensaje con toda la metadata de la WA Business API.

Ejemplos reales del campo:
  {"from":"549342547435","id":"wamid.HBg...","timestamp":"2026-03-19T13:09:36.000Z","text":{"body":"Perfecto"},"type":"text"}
  {"from":"549375660181","id":"wamid...","type":"audio","audio":{"mime_type":"audio/ogg; codecs=opus","sha256":"cWgacf..."}}
  {"from":"549134115485","id":"wamid...","type":"document","document":{"filename":"PROPUESTA DE VIAJE ARMAN TRAVEL SEPT 2025 doc","mime_type":"application/pdf"}}
  {"referral":{"source_url":"https://instagram.com/p/...","source_id":"12024...","source_type":"ad","body":"Jamaica en Mayo"},"from":"549113...","id":"wamid..."}
  {"context":{"forwarded":true},"from":"549134115485","id":"wamid..."}
  {"from":"549117020977","id":"wamid...","errors":[{"code":131051,"title":"Message type unknown"}]}
"""
import json
import re
from datetime import datetime


def parse_telefono_field(raw: str) -> dict:
    """
    Parsea el campo 'Telefono' del Sheet — es el payload completo del webhook WA Business API.

    Retorna un dict con TODOS los campos extraidos:
      - telefono: numero limpio
      - wa_message_id: wamid del mensaje
      - timestamp: fecha/hora del mensaje (del payload, mas precisa que la columna Fecha)
      - tipo_mensaje: text, audio, document, image, video, sticker, location, contacts, error
      - contenido: texto del mensaje (si es texto)
      - archivo_nombre: nombre del archivo (si es document)
      - archivo_mime_type: mime type del archivo
      - archivo_sha256: hash del archivo
      - es_error: si el mensaje es un error/tipo no soportado
      - error_detalle: detalle del error
      - referral_source_url: URL del anuncio
      - referral_source_id: ID del anuncio en Meta
      - referral_source_type: tipo (ad, organic)
      - referral_body: texto del anuncio
      - campana_tipo: instagram_ad, facebook_ad, forwarded, direct, etc.
      - forwarded: si es reenviado
    """
    result = {
        "telefono": "",
        "wa_message_id": None,
        "timestamp": None,
        "tipo_mensaje": "unknown",
        "contenido": "",
        "archivo_nombre": None,
        "archivo_mime_type": None,
        "archivo_sha256": None,
        "es_error": False,
        "error_detalle": None,
        "referral_source_url": None,
        "referral_source_id": None,
        "referral_source_type": None,
        "referral_body": None,
        "campana_tipo": "direct",
        "forwarded": False,
    }

    if not raw or not raw.strip():
        return result

    raw = raw.strip()

    # ── Caso 1: JSON (payload del webhook) ────────────────────────────────
    if raw.startswith("{") or raw.startswith("("):
        data = _safe_parse_json(raw)
        if not data:
            # Fallback: extraer telefono con regex
            phone_match = re.search(r'"from"\s*:\s*"(\d+)"', raw)
            if phone_match:
                result["telefono"] = normalize_phone(phone_match.group(1))
            return result

        # ── Telefono ──
        if "from" in data:
            result["telefono"] = normalize_phone(str(data["from"]))

        # ── Message ID ──
        if "id" in data:
            result["wa_message_id"] = str(data["id"])

        # ── Timestamp ──
        if "timestamp" in data:
            try:
                result["timestamp"] = data["timestamp"]
            except Exception:
                pass

        # ── Tipo de mensaje y contenido ──
        msg_type = data.get("type", "")
        result["tipo_mensaje"] = msg_type or "unknown"

        if msg_type == "text" and isinstance(data.get("text"), dict):
            result["contenido"] = data["text"].get("body", "")

        elif msg_type == "audio" and isinstance(data.get("audio"), dict):
            audio = data["audio"]
            result["archivo_mime_type"] = audio.get("mime_type", "audio/ogg")
            result["archivo_sha256"] = audio.get("sha256")
            result["archivo_nombre"] = "audio_whatsapp"
            result["contenido"] = "[Audio de voz]"

        elif msg_type == "document" and isinstance(data.get("document"), dict):
            doc = data["document"]
            result["archivo_nombre"] = doc.get("filename", "documento")
            result["archivo_mime_type"] = doc.get("mime_type", "application/octet-stream")
            result["archivo_sha256"] = doc.get("sha256")
            result["contenido"] = f"[Documento: {result['archivo_nombre']}]"

        elif msg_type == "image" and isinstance(data.get("image"), dict):
            img = data["image"]
            result["archivo_mime_type"] = img.get("mime_type", "image/jpeg")
            result["archivo_sha256"] = img.get("sha256")
            result["archivo_nombre"] = "imagen_whatsapp"
            caption = img.get("caption", "")
            result["contenido"] = f"[Imagen]{': ' + caption if caption else ''}"

        elif msg_type == "video" and isinstance(data.get("video"), dict):
            vid = data["video"]
            result["archivo_mime_type"] = vid.get("mime_type", "video/mp4")
            result["archivo_sha256"] = vid.get("sha256")
            result["archivo_nombre"] = "video_whatsapp"
            caption = vid.get("caption", "")
            result["contenido"] = f"[Video]{': ' + caption if caption else ''}"

        elif msg_type == "sticker":
            result["contenido"] = "[Sticker]"
            result["archivo_nombre"] = "sticker"
            if isinstance(data.get("sticker"), dict):
                result["archivo_mime_type"] = data["sticker"].get("mime_type", "image/webp")

        elif msg_type == "location" and isinstance(data.get("location"), dict):
            loc = data["location"]
            lat = loc.get("latitude", "")
            lon = loc.get("longitude", "")
            name = loc.get("name", "")
            result["contenido"] = f"[Ubicacion: {name} ({lat}, {lon})]" if name else f"[Ubicacion: {lat}, {lon}]"

        elif msg_type == "contacts":
            result["contenido"] = "[Contacto compartido]"

        # ── Errores (mensaje no soportado) ──
        if "errors" in data and isinstance(data["errors"], list):
            result["es_error"] = True
            errors = data["errors"]
            if errors:
                err = errors[0]
                title = err.get("title", "Error")
                details = ""
                if isinstance(err.get("error_data"), dict):
                    details = err["error_data"].get("details", "")
                result["error_detalle"] = f"{title}: {details}" if details else title
                if not result["contenido"]:
                    result["contenido"] = f"[Error: {result['error_detalle']}]"
                result["tipo_mensaje"] = "error"

        # ── Referral (campana publicitaria) ──
        if "referral" in data and isinstance(data["referral"], dict):
            ref = data["referral"]
            result["referral_source_url"] = ref.get("source_url")
            result["referral_source_id"] = ref.get("source_id")
            result["referral_source_type"] = ref.get("source_type")
            result["referral_body"] = ref.get("body")

            source_url = ref.get("source_url", "") or ""
            source_type = ref.get("source_type", "") or ""

            if "instagram.com" in source_url:
                result["campana_tipo"] = "instagram_ad" if source_type == "ad" else "instagram_organic"
            elif "facebook.com" in source_url or "fb.me" in source_url:
                result["campana_tipo"] = "facebook_ad" if source_type == "ad" else "facebook_organic"
            elif source_type == "ad":
                result["campana_tipo"] = "meta_ad"
            elif source_url:
                result["campana_tipo"] = "referral_link"

        # ── Context (forwarded, quoted) ──
        if "context" in data and isinstance(data["context"], dict):
            ctx = data["context"]
            if ctx.get("forwarded"):
                result["forwarded"] = True
                if result["campana_tipo"] == "direct":
                    result["campana_tipo"] = "forwarded"

    # ── Caso 2: Numero de telefono simple ─────────────────────────────────
    else:
        result["telefono"] = extract_phone_from_string(raw)

    return result


def _safe_parse_json(raw: str) -> dict | None:
    """Intenta parsear JSON limpiando caracteres problematicos."""
    # Limpiar parentesis si los usa en vez de llaves
    cleaned = raw
    if cleaned.startswith("("):
        cleaned = "{" + cleaned[1:]
    if cleaned.endswith(")"):
        cleaned = cleaned[:-1] + "}"

    # Intentar parseo directo
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Limpiar comillas tipograficas
    cleaned = (
        cleaned.replace("\u201c", '"')
        .replace("\u201d", '"')
        .replace("\u2018", "'")
        .replace("\u2019", "'")
    )
    try:
        return json.loads(cleaned)
    except json.JSONDecodeError:
        pass

    # Intentar extraer el primer JSON valido con regex
    try:
        # Buscar balance de llaves
        depth = 0
        start = None
        for i, ch in enumerate(raw):
            if ch == "{":
                if depth == 0:
                    start = i
                depth += 1
            elif ch == "}":
                depth -= 1
                if depth == 0 and start is not None:
                    try:
                        return json.loads(raw[start : i + 1])
                    except json.JSONDecodeError:
                        pass
    except Exception:
        pass

    return None


def normalize_phone(phone: str) -> str:
    """Normaliza un numero de telefono."""
    if not phone:
        return ""
    cleaned = re.sub(r"[^\d+]", "", phone)
    if not cleaned.startswith("+"):
        if cleaned.startswith("549") or cleaned.startswith("54"):
            cleaned = "+" + cleaned
        elif len(cleaned) >= 10:
            cleaned = "+54" + cleaned
    return cleaned


def extract_phone_from_string(s: str) -> str:
    """Extrae un numero de telefono de un string arbitrario."""
    matches = re.findall(r"\+?\d[\d\s\-]{8,}", s)
    if matches:
        return normalize_phone(matches[0])
    return s.strip()


def parse_whatsapp_export_txt(content: str) -> list[dict]:
    """
    Parsea un archivo .txt de exportacion manual de WhatsApp.
    Formato: DD/MM/YYYY, HH:MM - Nombre: Mensaje
    """
    messages = []
    pattern = re.compile(
        r"(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2})\s*-\s*(.+?):\s*(.*)"
    )
    current_msg = None

    for line in content.split("\n"):
        line = line.strip()
        if not line:
            continue
        match = pattern.match(line)
        if match:
            if current_msg:
                messages.append(current_msg)
            date_str, time_str, name, text = match.groups()
            try:
                fecha = datetime.strptime(f"{date_str} {time_str}", "%d/%m/%Y %H:%M")
            except ValueError:
                try:
                    fecha = datetime.strptime(f"{date_str} {time_str}", "%d/%m/%y %H:%M")
                except ValueError:
                    fecha = datetime.now()
            current_msg = {
                "fecha": fecha.isoformat(),
                "nombre": name.strip(),
                "mensaje": text.strip(),
                "tipo": "entrante",
                "is_media": "<Multimedia" in text or "<Media" in text,
            }
        elif current_msg:
            current_msg["mensaje"] += "\n" + line

    if current_msg:
        messages.append(current_msg)
    return messages


def detect_campaign_label(parsed: dict) -> str:
    """Genera un label legible para la campana publicitaria."""
    tipo = parsed.get("campana_tipo", "direct")
    body = parsed.get("referral_body", "")

    labels = {
        "instagram_ad": "Instagram Ad",
        "instagram_organic": "Instagram Organico",
        "facebook_ad": "Facebook Ad",
        "facebook_organic": "Facebook Organico",
        "meta_ad": "Meta Ad",
        "referral_link": "Link Referral",
        "forwarded": "Reenviado",
        "direct": "Mensaje directo",
    }
    label = labels.get(tipo, tipo)
    if body:
        label += f" - {body}"
    return label


def classify_archivo_tipo(mime_type: str, tipo_mensaje: str) -> str:
    """Clasifica el tipo de archivo para la tabla conversacion_archivos."""
    if not mime_type and not tipo_mensaje:
        return "otro"
    mime = (mime_type or "").lower()
    if "image" in mime or tipo_mensaje == "image":
        return "imagen"
    if "audio" in mime or tipo_mensaje == "audio":
        return "audio"
    if "video" in mime or tipo_mensaje == "video":
        return "video"
    if "pdf" in mime or "document" in mime or tipo_mensaje == "document":
        return "pdf"
    return "otro"
