import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Cost
from app.schemas.schemas import CostCreate, CostOut

router = APIRouter(prefix="/v1/costs", tags=["costs"])


@router.post("", response_model=CostOut, status_code=201)
def create_cost(body: CostCreate, db: Session = Depends(get_db)):
    cost = Cost(**body.model_dump())
    db.add(cost)
    db.commit()
    db.refresh(cost)
    return cost


@router.get("", response_model=list[CostOut])
def list_costs(sale_id: uuid.UUID | None = None, db: Session = Depends(get_db)):
    q = db.query(Cost)
    if sale_id:
        q = q.filter(Cost.sale_id == sale_id)
    return q.all()


@router.get("/{cost_id}", response_model=CostOut)
def get_cost(cost_id: uuid.UUID, db: Session = Depends(get_db)):
    cost = db.get(Cost, cost_id)
    if not cost:
        raise HTTPException(status_code=404, detail="Cost not found")
    return cost
