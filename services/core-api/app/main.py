import logging
import logging.config

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.middleware.request_id import RequestIdMiddleware
from app.routers import (
    activity_logs,
    conversations,
    costs,
    document_refs,
    health,
    leads,
    parties,
    payments,
    providers,
    sale_items,
    sales,
)

# ── Structured logging ────────────────────────────────────────────────────────
LOGGING_CONFIG = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "json": {
            "()": "logging.Formatter",
            "fmt": '{"time":"%(asctime)s","level":"%(levelname)s","service":"core-api","logger":"%(name)s","msg":%(message)s}',
            "datefmt": "%Y-%m-%dT%H:%M:%S",
        },
        "plain": {
            "format": "%(asctime)s [%(levelname)s] %(name)s — %(message)s",
            "datefmt": "%H:%M:%S",
        },
    },
    "handlers": {
        "console": {
            "class": "logging.StreamHandler",
            "formatter": "plain",   # switch to "json" for production
            "stream": "ext://sys.stdout",
        },
    },
    "root": {"handlers": ["console"], "level": "INFO"},
    "loggers": {
        "uvicorn.access": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "sqlalchemy.engine": {"handlers": ["console"], "level": "WARNING", "propagate": False},
        "core_api": {"handlers": ["console"], "level": "INFO", "propagate": False},
        "core_api.activity": {"handlers": ["console"], "level": "INFO", "propagate": False},
    },
}

logging.config.dictConfig(LOGGING_CONFIG)

# ── App ───────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="Arman Core API",
    version="1.0.0",
    description="SoR para ventas, costos y trazabilidad operativa.",
    docs_url="/docs",
    openapi_url="/openapi.json",
)

app.add_middleware(RequestIdMiddleware)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],          # tighten in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Core-Doc-Ref-Id", "X-Core-Party-Id",
                    "X-Core-Sale-Id", "X-Core-Lead-Id"],
)

app.include_router(health.router)
app.include_router(parties.router)
app.include_router(leads.router)
app.include_router(sales.router)
app.include_router(sale_items.router)
app.include_router(providers.router)
app.include_router(costs.router)
app.include_router(payments.router)
app.include_router(document_refs.router)
app.include_router(conversations.router)
app.include_router(activity_logs.router)
