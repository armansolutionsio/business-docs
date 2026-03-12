import logging
import uuid

from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request

logger = logging.getLogger("core_api")


class RequestIdMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next):
        request_id = request.headers.get("X-Request-Id", str(uuid.uuid4()))
        request.state.request_id = request_id

        response = await call_next(request)
        response.headers["X-Request-Id"] = request_id

        logger.info(
            '{"method":"%s","path":"%s","status":%d,"req_id":"%s"}',
            request.method,
            request.url.path,
            response.status_code,
            request_id,
        )
        return response
