import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import DocumentRef, IdempotencyRecord
from app.schemas.schemas import DocumentRefCreate, DocumentRefOut

router = APIRouter(prefix="/v1/documents/refs", tags=["document-refs"])


@router.post("", response_model=DocumentRefOut, status_code=201)
def create_document_ref(
    body: DocumentRefCreate,
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    if idempotency_key:
        rec = db.get(IdempotencyRecord, idempotency_key)
        if rec and rec.resource_type == "document_ref":
            doc = db.get(DocumentRef, rec.resource_id)
            if doc:
                return doc

    # Compute correlative doc_number per (party, doc_type) — thread-safe via DB lock
    doc_number = None
    if body.party_id:
        # Lock the party row to prevent race conditions on concurrent requests
        db.execute(
            __import__("sqlalchemy").text("SELECT id FROM party WHERE id = :pid FOR UPDATE"),
            {"pid": str(body.party_id)},
        )
        count = (
            db.query(DocumentRef)
            .filter(
                DocumentRef.party_id == body.party_id,
                DocumentRef.doc_type == body.doc_type,
            )
            .count()
        )
        doc_number = count + 1

    data = body.model_dump()
    data["doc_number"] = doc_number
    doc = DocumentRef(**data)
    db.add(doc)
    db.commit()
    db.refresh(doc)

    if idempotency_key:
        db.merge(IdempotencyRecord(
            key=idempotency_key,
            resource_type="document_ref",
            resource_id=doc.id,
            response_status=201,
        ))
        db.commit()

    return doc


@router.get("", response_model=list[DocumentRefOut])
def list_document_refs(sale_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    q = db.query(DocumentRef)
    if sale_id:
        q = q.filter(DocumentRef.sale_id == sale_id)
    return q.all()


@router.get("/{doc_id}", response_model=DocumentRefOut)
def get_document_ref(doc_id: uuid.UUID, db: Session = Depends(get_db)):
    doc = db.get(DocumentRef, doc_id)
    if not doc:
        raise HTTPException(status_code=404, detail="DocumentRef not found")
    return doc
