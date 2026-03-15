from typing import TypedDict, Annotated, Optional
from langgraph.graph import add_messages, StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessageChunk, ToolMessage
from dotenv import load_dotenv
from langchain_community.tools.tavily_search import TavilySearchResults
from fastapi import FastAPI, Query, Request, HTTPException
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from slowapi import Limiter
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware
from langgraph.checkpoint.memory import MemorySaver

from guards import (
    get_real_ip,
    protect_session,
    check_session_quota,
    check_active_connection,
    protect_connections,
    protect_cooldown,
    cleanup_connection,
    MAX_MESSAGE_LENGTH,
    protect_origin
)

import json
from uuid import uuid4

load_dotenv()

# -------------------------------
# SSE HEADERS
# Prevent proxy buffering for SSE
# -------------------------------

SSE_HEADERS = {
    "Cache-Control": "no-cache",
    "Connection": "keep-alive",
    "X-Accel-Buffering": "no"
}

# -------------------------------
# Rate limiter (IP level)
# -------------------------------

limiter = Limiter(key_func=get_real_ip)

# -------------------------------
# LangGraph state
# -------------------------------

class ChatState(TypedDict):
    messages: Annotated[list, add_messages]

llm = ChatOpenAI(model="gpt-4o-mini", temperature=0)

search_tool = TavilySearchResults(max_results=4)

memory = MemorySaver()

tools = [search_tool]
llm_with_tools = llm.bind_tools(tools)

# -------------------------------
# LangGraph nodes
# -------------------------------

async def model_node(state: ChatState) -> ChatState:

    result = await llm_with_tools.ainvoke(state["messages"])

    return {"messages": [result]}


async def tools_router(state: ChatState):

    last = state["messages"][-1]

    if hasattr(last, "tool_calls") and len(last.tool_calls) > 0:
        return "tools_node"

    return END


async def tools_node(state: ChatState):

    last = state["messages"][-1]

    tool_messages = []

    for tool_call in last.tool_calls:

        tool_name = tool_call["name"]
        tool_args = tool_call["args"]
        tool_id = tool_call["id"]

        if tool_name == "tavily_search_results_json":

            results = await search_tool.ainvoke(tool_args)

            tool_messages.append(
                ToolMessage(
                    content=str(results),
                    tool_call_id=tool_id,
                    name=tool_name
                )
            )

    return {"messages": tool_messages}

# -------------------------------
# Build LangGraph
# -------------------------------

graph_builder = StateGraph(ChatState)

graph_builder.add_node("model", model_node)
graph_builder.add_node("tools_node", tools_node)

graph_builder.set_entry_point("model")

graph_builder.add_conditional_edges("model", tools_router)
graph_builder.add_edge("tools_node", "model")

graph = graph_builder.compile(checkpointer=memory)

# -------------------------------
# FastAPI app
# -------------------------------

app = FastAPI()

app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

# -------------------------------
# CORS
# -------------------------------

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------------------------------------------------
# System message helper
# Sends errors as chat messages
# ---------------------------------------------------

async def system_message_stream(message: str):

    yield f"data:{json.dumps({'type':'content','content':message})}\n\n"

    yield f"data:{json.dumps({'type':'end'})}\n\n"

# ---------------------------------------------------
# HTTPException handler
# Converts all errors into SSE messages
# ---------------------------------------------------

@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):

    if request.url.path.startswith("/chat_stream"):

        return StreamingResponse(
            system_message_stream(str(exc.detail)),
            media_type="text/event-stream",
            headers=SSE_HEADERS
        )

    raise exc

# ---------------------------------------------------
# Rate limit handler
# ---------------------------------------------------

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):

    return StreamingResponse(
        system_message_stream(
            "Too many requests. Please slow down. (IP limit)"
        ),
        media_type="text/event-stream",
        headers=SSE_HEADERS
    )

# ---------------------------------------------------
# Helpers
# ---------------------------------------------------

def serialise_ai_message_chunk(chunk):

    if not isinstance(chunk, AIMessageChunk):
        return ""

    content = chunk.content

    if isinstance(content, str):
        return content

    if isinstance(content, list):

        text = ""

        for block in content:

            if isinstance(block, dict) and "text" in block:
                text += block["text"]

        return text

    return ""

# ---------------------------------------------------
# Streaming response from LangGraph
# ---------------------------------------------------

async def generate_chat_response(message: str, checkpoint_id: Optional[str]):

    try:

        if checkpoint_id is None:

            checkpoint_id = str(uuid4())

            yield f"data:{json.dumps({'type':'checkpoint','checkpoint_id':checkpoint_id})}\n\n"

        config = {
            "configurable": {
                "thread_id": checkpoint_id
            }
        }

        events = graph.astream_events(
            {"messages": [HumanMessage(content=message)]},
            config=config,
            version="v2"
        )

        async for event in events:

            if event["event"] == "on_chat_model_stream":

                chunk = serialise_ai_message_chunk(
                    event["data"]["chunk"]
                )

                yield f"data:{json.dumps({'type':'content','content':chunk})}\n\n"

        yield f"data:{json.dumps({'type':'end'})}\n\n"

    except Exception as e:

        async for chunk in system_message_stream(str(e)):
            yield chunk

# ---------------------------------------------------
# Main SSE endpoint
# ---------------------------------------------------

@app.get("/chat_stream/{message}")
@limiter.limit("5/minute")
async def chat_stream(
    request: Request,
    message: str,
    session_id: str = Query(...),
    checkpoint_id: Optional[str] = Query(None)
):

    protect_origin(request)
    ip = get_real_ip(request)

    # -------------------------
    # Basic validation
    # -------------------------

    if len(session_id) > 100:
        raise HTTPException(400, "Invalid session ID")

    if len(message) > MAX_MESSAGE_LENGTH:
        raise HTTPException(400, "Message too long (max 500 characters)")

    # -------------------------
    # Security guards
    # -------------------------

    protect_session(session_id, ip)
    protect_connections(ip)
    protect_cooldown(session_id)

    check_session_quota(session_id)
    check_active_connection(session_id)

    # -------------------------
    # Streaming
    # -------------------------

    async def stream():

        try:

            async for chunk in generate_chat_response(message, checkpoint_id):
                yield chunk

        finally:

            cleanup_connection(session_id, ip)

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers=SSE_HEADERS
    )