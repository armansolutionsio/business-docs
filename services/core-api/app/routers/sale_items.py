import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import SaleItem
from app.schemas.schemas import SaleItemCreate, SaleItemOut

router = APIRouter(prefix="/v1/sale-items", tags=["sale-items"])


@router.post("", response_model=SaleItemOut, status_code=201)
def create_sale_item(body: SaleItemCreate, db: Session = Depends(get_db)):
    item = SaleItem(**body.model_dump())
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("", response_model=list[SaleItemOut])
def list_sale_items(sale_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    q = db.query(SaleItem)
    if sale_id:
        q = q.filter(SaleItem.sale_id == sale_id)
    return q.all()


@router.get("/{item_id}", response_model=SaleItemOut)
def get_sale_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    item = db.get(SaleItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="SaleItem not found")
    return item


@router.delete("/{item_id}", status_code=204)
def delete_sale_item(item_id: uuid.UUID, db: Session = Depends(get_db)):
    item = db.get(SaleItem, item_id)
    if not item:
        raise HTTPException(status_code=404, detail="SaleItem not found")
    db.delete(item)
    db.commit()
