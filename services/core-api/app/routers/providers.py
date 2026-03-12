import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.models import Provider
from app.schemas.schemas import ProviderCreate, ProviderOut

router = APIRouter(prefix="/v1/providers", tags=["providers"])


@router.post("", response_model=ProviderOut, status_code=201)
def create_provider(body: ProviderCreate, db: Session = Depends(get_db)):
    provider = Provider(**body.model_dump())
    db.add(provider)
    db.commit()
    db.refresh(provider)
    return provider


@router.get("", response_model=list[ProviderOut])
def list_providers(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return db.query(Provider).offset(skip).limit(limit).all()


@router.get("/{provider_id}", response_model=ProviderOut)
def get_provider(provider_id: uuid.UUID, db: Session = Depends(get_db)):
    provider = db.get(Provider, provider_id)
    if not provider:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider
