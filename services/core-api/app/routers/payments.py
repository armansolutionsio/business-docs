import uuid
from typing import Optional

from fastapi import APIRouter, Depends, Header, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import IdempotencyRecord, Payment
from app.schemas.schemas import PaymentCreate, PaymentOut

router = APIRouter(prefix="/v1/payments", tags=["payments"])


@router.post("", response_model=PaymentOut, status_code=201)
def create_payment(
    body: PaymentCreate,
    db: Session = Depends(get_db),
    idempotency_key: Optional[str] = Header(None, alias="Idempotency-Key"),
):
    if idempotency_key:
        rec = db.get(IdempotencyRecord, idempotency_key)
        if rec and rec.resource_type == "payment":
            payment = db.get(Payment, rec.resource_id)
            if payment:
                return payment

    payment = Payment(**body.model_dump())
    db.add(payment)
    db.commit()
    db.refresh(payment)

    if idempotency_key:
        db.merge(IdempotencyRecord(
            key=idempotency_key,
            resource_type="payment",
            resource_id=payment.id,
            response_status=201,
        ))
        db.commit()

    return payment


@router.get("", response_model=list[PaymentOut])
def list_payments(sale_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    q = db.query(Payment)
    if sale_id:
        q = q.filter(Payment.sale_id == sale_id)
    return q.all()


@router.get("/{payment_id}", response_model=PaymentOut)
def get_payment(payment_id: uuid.UUID, db: Session = Depends(get_db)):
    payment = db.get(Payment, payment_id)
    if not payment:
        raise HTTPException(status_code=404, detail="Payment not found")
    return payment
