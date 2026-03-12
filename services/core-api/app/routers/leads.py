import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import IdempotencyRecord, Lead
from app.schemas.schemas import LeadCreate, LeadOut
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
def list_leads(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Lead).offset(skip).limit(limit).all()


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
    for field, value in updates.items():
        setattr(lead, field, value)
    log_activity(db, entity_type="lead", entity_id=lead.id, action="UPDATE",
                 request_id=req_id, payload=updates)
    db.commit()
    db.refresh(lead)
    return lead
