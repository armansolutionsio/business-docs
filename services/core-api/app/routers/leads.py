import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import IdempotencyRecord, Lead, LeadTask
from app.schemas.schemas import LeadCreate, LeadOut, LeadTaskCreate, LeadTaskOut
from app.services.activity import log_activity

router = APIRouter(prefix="/v1/leads", tags=["leads"])


@router.post("", response_model=LeadOut, status_code=201)
def create_lead(
    body: LeadCreate,
    request: Request,
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    req_id = getattr(request.state, "request_id", None)

    if idempotency_key:
        rec = db.get(IdempotencyRecord, idempotency_key)
        if rec and rec.resource_type == "lead":
            lead = db.get(Lead, rec.resource_id)
            if lead:
                return lead

    lead = Lead(
        party_id=body.party_id,
        source=body.source,
        status=body.status,
        notes=body.notes,
        assigned_to=body.assigned_to,
        destination=body.destination,
    )
    db.add(lead)
    db.flush()

    log_activity(db, entity_type="lead", entity_id=lead.id, action="CREATE",
                 request_id=req_id,
                 payload={"party_id": str(body.party_id) if body.party_id else None,
                          "source": body.source, "status": body.status})
    db.commit()
    db.refresh(lead)

    if idempotency_key:
        db.merge(IdempotencyRecord(
            key=idempotency_key,
            resource_type="lead",
            resource_id=lead.id,
            response_status=201,
        ))
        db.commit()

    return lead


@router.get("", response_model=list[LeadOut])
def list_leads(
    status: Optional[str] = None,
    source: Optional[str] = None,
    assigned_to: Optional[str] = None,
    destination: Optional[str] = None,
    skip: int = 0,
    limit: int = 100,
    db: Session = Depends(get_db),
):
    q = db.query(Lead).order_by(Lead.updated_at.desc())
    if status:
        q = q.filter(Lead.status == status)
    if source:
        q = q.filter(Lead.source == source)
    if assigned_to:
        q = q.filter(Lead.assigned_to == assigned_to)
    if destination:
        q = q.filter(Lead.destination.ilike(f"%{destination}%"))
    return q.offset(skip).limit(limit).all()


@router.get("/{lead_id}", response_model=LeadOut)
def get_lead(lead_id: uuid.UUID, db: Session = Depends(get_db)):
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    return lead


@router.patch("/{lead_id}", response_model=LeadOut)
def update_lead(lead_id: uuid.UUID, body: LeadCreate, request: Request,
                db: Session = Depends(get_db)):
    req_id = getattr(request.state, "request_id", None)
    lead = db.get(Lead, lead_id)
    if not lead:
        raise HTTPException(status_code=404, detail="Lead not found")
    updates = body.model_dump(exclude_unset=True)
    old_status = lead.status
    for field, value in updates.items():
        setattr(lead, field, value)
    payload = {**updates}
    if "status" in updates:
        payload["previous_status"] = old_status
    log_activity(db, entity_type="lead", entity_id=lead.id, action="UPDATE",
                 request_id=req_id, payload=payload)
    db.commit()
    db.refresh(lead)
    return lead


# ── Tasks sub-resource ────────────────────────────────────────────────────────

@router.get("/{lead_id}/tasks", response_model=list[LeadTaskOut])
def list_tasks(lead_id: uuid.UUID, db: Session = Depends(get_db)):
    if not db.get(Lead, lead_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    return (db.query(LeadTask)
            .filter(LeadTask.lead_id == lead_id)
            .order_by(LeadTask.created_at)
            .all())


@router.post("/{lead_id}/tasks", response_model=LeadTaskOut, status_code=201)
def create_task(lead_id: uuid.UUID, body: LeadTaskCreate,
                request: Request, db: Session = Depends(get_db)):
    if not db.get(Lead, lead_id):
        raise HTTPException(status_code=404, detail="Lead not found")
    task = LeadTask(lead_id=lead_id, **body.model_dump())
    db.add(task)
    db.flush()
    log_activity(db, entity_type="lead", entity_id=lead_id, action="TASK_CREATED",
                 request_id=getattr(request.state, "request_id", None),
                 payload={"title": body.title})
    db.commit()
    db.refresh(task)
    return task


@router.patch("/{lead_id}/tasks/{task_id}", response_model=LeadTaskOut)
def update_task(lead_id: uuid.UUID, task_id: uuid.UUID, body: LeadTaskCreate,
                request: Request, db: Session = Depends(get_db)):
    task = (db.query(LeadTask)
            .filter(LeadTask.id == task_id, LeadTask.lead_id == lead_id)
            .first())
    if not task:
        raise HTTPException(status_code=404, detail="Task not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(task, field, value)
    if body.status == "DONE":
        log_activity(db, entity_type="lead", entity_id=lead_id, action="TASK_DONE",
                     request_id=getattr(request.state, "request_id", None),
                     payload={"title": task.title})
    db.commit()
    db.refresh(task)
    return task
