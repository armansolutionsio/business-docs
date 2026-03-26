import uuid

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.models import ConversationMessage, ConversationThread
from app.schemas.schemas import (
    ConversationMessageCreate,
    ConversationMessageOut,
    ConversationThreadCreate,
    ConversationThreadOut,
)

router = APIRouter(prefix="/v1/conversations", tags=["conversations"])


@router.post("", response_model=ConversationThreadOut, status_code=201)
def create_thread(body: ConversationThreadCreate, db: Session = Depends(get_db)):
    thread = ConversationThread(**body.model_dump())
    db.add(thread)
    db.commit()
    db.refresh(thread)
    return thread


@router.get("", response_model=list[ConversationThreadOut])
def list_threads(skip: int = 0, limit: int = 100, db: Session = Depends(get_db)):
    return (
        db.query(ConversationThread)
        .options(joinedload(ConversationThread.messages))
        .offset(skip)
        .limit(limit)
        .all()
    )


@router.get("/{thread_id}", response_model=ConversationThreadOut)
def get_thread(thread_id: uuid.UUID, db: Session = Depends(get_db)):
    thread = (
        db.query(ConversationThread)
        .options(joinedload(ConversationThread.messages))
        .filter(ConversationThread.id == thread_id)
        .first()
    )
    if not thread:
        raise HTTPException(status_code=404, detail="ConversationThread not found")
    return thread


@router.post("/{thread_id}/messages", response_model=ConversationMessageOut, status_code=201)
def add_message(
    thread_id: uuid.UUID,
    body: ConversationMessageCreate,
    db: Session = Depends(get_db),
):
    thread = db.get(ConversationThread, thread_id)
    if not thread:
        raise HTTPException(status_code=404, detail="ConversationThread not found")

    msg = ConversationMessage(thread_id=thread_id, **body.model_dump())
    db.add(msg)
    db.commit()
    db.refresh(msg)
    return msg
