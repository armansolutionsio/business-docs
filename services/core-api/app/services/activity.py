"""
Activity logging utility.

Every significant business action (create/update/delete on core entities)
is recorded in the `activity_log` table.

Usage:
    log_activity(db, entity_type="party", entity_id=party.id,
                 action="CREATE", request_id=request_id, payload={...})
"""
import uuid
from typing import Any

from sqlalchemy.orm import Session

from app.models.models import ActivityLog


def log_activity(
    db: Session,
    *,
    entity_type: str,
    entity_id: uuid.UUID,
    action: str,                    # CREATE | UPDATE | DELETE | GENERATE
    request_id: str | None = None,
    actor_id: str | None = None,    # future: auth user id
    payload: dict[str, Any] | None = None,
) -> None:
    """Write one record to activity_log. Fire-and-forget — errors are swallowed."""
    try:
        entry = ActivityLog(
            entity_type=entity_type,
            entity_id=entity_id,
            action=action,
            actor_id=actor_id,
            request_id=request_id,
            payload=payload,
        )
        db.add(entry)
        db.flush()   # flush inside the caller's transaction — committed with the entity
    except Exception as exc:  # noqa: BLE001
        import logging
        logging.getLogger("core_api.activity").warning("activity_log write failed: %s", exc)
