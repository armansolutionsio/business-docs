"""
GET /v1/activity-logs — query the audit trail.

Filters:
  ?entity_type=party            filter by entity type
  ?entity_id=<uuid>             filter by specific entity
  ?action=CREATE                filter by action
  ?req_id=<str>                 filter by request_id
  ?limit=50&offset=0            pagination (default limit=50, max=200)
"""
import uuid
from typing import Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import ActivityLog

router = APIRouter(prefix="/v1/activity-logs", tags=["activity-logs"])


class ActivityLogOut(BaseModel):
    id: uuid.UUID
    entity_type: str
    entity_id: uuid.UUID
    action: str
    actor_id: Optional[str]
    request_id: Optional[str]
    payload: Optional[dict]
    created_at: str

    model_config = {"from_attributes": True}

    def model_post_init(self, __context):
        # Normalize created_at to ISO string for JSON output
        if hasattr(self, "created_at") and not isinstance(self.created_at, str):
            object.__setattr__(self, "created_at", self.created_at.isoformat())


@router.get("", response_model=list[dict])
def list_activity_logs(
    entity_type: Optional[str] = None,
    entity_id: Optional[uuid.UUID] = None,
    action: Optional[str] = None,
    req_id: Optional[str] = None,
    limit: int = 50,
    offset: int = 0,
    db: Session = Depends(get_db),
):
    limit = min(limit, 200)
    q = db.query(ActivityLog).order_by(ActivityLog.created_at.desc())

    if entity_type:
        q = q.filter(ActivityLog.entity_type == entity_type)
    if entity_id:
        q = q.filter(ActivityLog.entity_id == entity_id)
    if action:
        q = q.filter(ActivityLog.action == action)
    if req_id:
        q = q.filter(ActivityLog.request_id == req_id)

    rows = q.offset(offset).limit(limit).all()

    return [
        {
            "id": str(row.id),
            "entity_type": row.entity_type,
            "entity_id": str(row.entity_id),
            "action": row.action,
            "actor_id": row.actor_id,
            "request_id": row.request_id,
            "payload": row.payload,
            "created_at": row.created_at.isoformat(),
        }
        for row in rows
    ]
