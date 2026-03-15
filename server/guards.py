import time
from fastapi import HTTPException, Request

# ---------------------------------------------------
# LIMITS
# ---------------------------------------------------

MAX_MESSAGE_LENGTH = 500

SESSION_LIMIT = 15
SESSION_WINDOW = 600   # 10 minutes

MAX_SESSIONS_PER_IP = 5
MAX_CONNECTIONS_PER_IP = 5

SESSION_COOLDOWN = 1.0  # seconds between requests


# ---------------------------------------------------
# MEMORY STORES
# (in-memory protection structures)
# ---------------------------------------------------

session_requests = {}        # session_id -> {count, start_time}

active_connections = {}      # session_id -> True

session_to_ip = {}           # session_id -> ip
ip_sessions = {}             # ip -> set(session_ids)

ip_connections = {}          # ip -> number of active SSE connections

session_last_request = {}    # session_id -> timestamp


# ---------------------------------------------------
# REAL CLIENT IP
# Works behind proxy / render / nginx
# ---------------------------------------------------

def get_real_ip(request: Request):

    forwarded = request.headers.get("X-Forwarded-For")

    if forwarded:
        return forwarded.split(",")[0].strip()

    return request.client.host


# ---------------------------------------------------
# SESSION ↔ IP PROTECTION
# prevents changing session_id to bypass quota
# ---------------------------------------------------

def protect_session(session_id: str, ip: str):

    if session_id in session_to_ip:

        if session_to_ip[session_id] != ip:

            raise HTTPException(
                status_code=403,
                detail="Session/IP mismatch."
            )

    else:

        sessions = ip_sessions.setdefault(ip, set())

        if len(sessions) >= MAX_SESSIONS_PER_IP:

            raise HTTPException(
                status_code=429,
                detail="Too many sessions from this IP."
            )

        sessions.add(session_id)
        session_to_ip[session_id] = ip


# ---------------------------------------------------
# SESSION QUOTA
# limits requests per session
# ---------------------------------------------------

def check_session_quota(session_id: str):

    now = time.time()

    # cleanup expired sessions
    for sid in list(session_requests.keys()):

        if now - session_requests[sid]["start_time"] > SESSION_WINDOW:
            del session_requests[sid]

    if session_id not in session_requests:

        session_requests[session_id] = {
            "count": 0,
            "start_time": now
        }

    session = session_requests[session_id]

    # reset window
    if now - session["start_time"] > SESSION_WINDOW:

        session["count"] = 0
        session["start_time"] = now

    if session["count"] >= SESSION_LIMIT:

        raise HTTPException(
            status_code=429,
            detail="Session quota exceeded. Please try again later. (15 requests per 10 minutes)"
        )

    session["count"] += 1


# ---------------------------------------------------
# ACTIVE SSE CONNECTION PER SESSION
# prevents double requests
# ---------------------------------------------------

def check_active_connection(session_id: str):

    if session_id in active_connections:

        raise HTTPException(
            status_code=429,
            detail="Another request is already in progress."
        )

    active_connections[session_id] = True


# ---------------------------------------------------
# CONNECTION LIMIT PER IP
# prevents opening many SSE streams
# ---------------------------------------------------

def protect_connections(ip: str):

    count = ip_connections.get(ip, 0)

    if count >= MAX_CONNECTIONS_PER_IP:

        raise HTTPException(
            status_code=429,
            detail="Too many open connections."
        )

    ip_connections[ip] = count + 1


def release_connection(ip: str):

    if ip in ip_connections:

        ip_connections[ip] -= 1

        if ip_connections[ip] <= 0:
            del ip_connections[ip]


# ---------------------------------------------------
# COOLDOWN BETWEEN REQUESTS
# prevents spam
# ---------------------------------------------------

def protect_cooldown(session_id: str):

    now = time.time()

    last = session_last_request.get(session_id)

    if last and (now - last) < SESSION_COOLDOWN:

        raise HTTPException(
            status_code=429,
            detail="Please slow down."
        )

    session_last_request[session_id] = now


# ---------------------------------------------------
# CLEANUP FUNCTION
# called when SSE closes
# ---------------------------------------------------

def cleanup_connection(session_id: str, ip: str):

    active_connections.pop(session_id, None)

    if ip in ip_connections:

        ip_connections[ip] -= 1

        if ip_connections[ip] <= 0:
            del ip_connections[ip]

ALLOWED_ORIGINS = {
    "https://ai-chatbot-client.vercel.app",
    "http://localhost:3000"
}

def protect_origin(request: Request):

    origin = request.headers.get("origin")

    if origin not in ALLOWED_ORIGINS:
        raise HTTPException(
            status_code=403,
            detail="Invalid origin"
        )