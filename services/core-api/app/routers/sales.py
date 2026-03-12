import uuid
from decimal import Decimal

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.models import Sale
from app.schemas.schemas import CostOut, SaleCreate, SaleDetail, SaleItemOut, SaleOut
from app.services.activity import log_activity

router = APIRouter(prefix="/v1/sales", tags=["sales"])


@router.post("", response_model=SaleOut, status_code=201)
def create_sale(body: SaleCreate, request: Request, db: Session = Depends(get_db)):
    req_id = getattr(request.state, "request_id", None)
    sale = Sale(
        buyer_party_id=body.buyer_party_id,
        status=body.status,
        currency=body.currency,
        notes=body.notes,
    )
    db.add(sale)
    db.flush()
    log_activity(db, entity_type="sale", entity_id=sale.id, action="CREATE",
                 request_id=req_id,
                 payload={"buyer_party_id": str(body.buyer_party_id),
                          "currency": body.currency, "status": body.status})
    db.commit()
    db.refresh(sale)
    return sale


@router.get("", response_model=list[SaleOut])
def list_sales(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Sale).offset(skip).limit(limit).all()


@router.get("/{sale_id}", response_model=SaleDetail)
def get_sale(sale_id: uuid.UUID, db: Session = Depends(get_db)):
    sale = (
        db.query(Sale)
        .options(
            joinedload(Sale.items),
            joinedload(Sale.costs),
            joinedload(Sale.payments),
        )
        .filter(Sale.id == sale_id)
        .first()
    )
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")

    subtotal: Decimal = sum((item.total_price for item in sale.items), Decimal("0"))
    total_costs: Decimal = sum((cost.amount for cost in sale.costs), Decimal("0"))
    payments_total: Decimal = sum(
        (p.amount for p in sale.payments if p.status == "COMPLETED"), Decimal("0")
    )

    return SaleDetail(
        id=sale.id,
        buyer_party_id=sale.buyer_party_id,
        status=sale.status,
        currency=sale.currency,
        notes=sale.notes,
        items=[SaleItemOut.model_validate(i) for i in sale.items],
        costs=[CostOut.model_validate(c) for c in sale.costs],
        subtotal=subtotal,
        total_costs=total_costs,
        payments_total=payments_total,
        created_at=sale.created_at,
    )


@router.patch("/{sale_id}", response_model=SaleOut)
def update_sale(sale_id: uuid.UUID, body: SaleCreate, request: Request,
                db: Session = Depends(get_db)):
    req_id = getattr(request.state, "request_id", None)
    sale = db.get(Sale, sale_id)
    if not sale:
        raise HTTPException(status_code=404, detail="Sale not found")
    updates = body.model_dump(exclude_unset=True)
    for field, value in updates.items():
        setattr(sale, field, value)
    log_activity(db, entity_type="sale", entity_id=sale.id, action="UPDATE",
                 request_id=req_id, payload=updates)
    db.commit()
    db.refresh(sale)
    return sale
