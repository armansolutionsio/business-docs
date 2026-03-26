import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException, Request
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import IdempotencyRecord, Party
from app.schemas.schemas import PartyCreate, PartyOut
from app.services.activity import log_activity
from app.services.doc_validator import normalize_doc

router = APIRouter(prefix="/v1/parties", tags=["parties"])


def _find_by_idempotency(key: str, resource_type: str, model_class, db: Session):
    rec = db.get(IdempotencyRecord, key)
    if rec and rec.resource_type == resource_type:
        obj = db.get(model_class, rec.resource_id)
        if obj:
            return obj
    return None


def _save_idempotency(key: str, resource_type: str, resource_id: uuid.UUID, status: int, db: Session):
    rec = IdempotencyRecord(key=key, resource_type=resource_type, resource_id=resource_id, response_status=status)
    db.merge(rec)
    db.commit()


@router.post("", response_model=PartyOut, status_code=201)
def create_party(
    body: PartyCreate,
    request: Request,
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    req_id = getattr(request.state, "request_id", None)

    if idempotency_key:
        cached = _find_by_idempotency(idempotency_key, "party", Party, db)
        if cached:
            return cached

    try:
        normalized = normalize_doc(body.doc_type, body.doc_number)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    party = (
        db.query(Party)
        .filter(
            Party.doc_type == body.doc_type,
            Party.doc_number_normalized == normalized,
            Party.country == body.country,
        )
        .first()
    )

    if party:
        changed = False
        if body.full_name and not party.full_name:
            party.full_name = body.full_name
            changed = True
        if body.email and not party.email:
            party.email = body.email
            changed = True
        if body.phone and not party.phone:
            party.phone = body.phone
            changed = True
        if changed:
            log_activity(db, entity_type="party", entity_id=party.id, action="UPDATE",
                         request_id=req_id, payload={"reason": "enrich_fields"})
            db.commit()
            db.refresh(party)
    else:
        party = Party(
            doc_type=body.doc_type,
            doc_number_normalized=normalized,
            country=body.country,
            full_name=body.full_name,
            email=body.email,
            phone=body.phone,
        )
        db.add(party)
        try:
            db.flush()
            log_activity(db, entity_type="party", entity_id=party.id, action="CREATE",
                         request_id=req_id,
                         payload={"doc_type": body.doc_type, "country": body.country,
                                  "full_name": body.full_name, "email": body.email})
            db.commit()
            db.refresh(party)
        except IntegrityError:
            db.rollback()
            party = (
                db.query(Party)
                .filter(
                    Party.doc_type == body.doc_type,
                    Party.doc_number_normalized == normalized,
                    Party.country == body.country,
                )
                .first()
            )

    if idempotency_key:
        _save_idempotency(idempotency_key, "party", party.id, 201, db)

    return party


@router.get("", response_model=list[PartyOut])
def list_parties(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Party).offset(skip).limit(limit).all()


@router.get("/{party_id}", response_model=PartyOut)
def get_party(party_id: uuid.UUID, db: Session = Depends(get_db)):
    party = db.get(Party, party_id)
    if not party:
        raise HTTPException(status_code=404, detail="Party not found")
    return party
