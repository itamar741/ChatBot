from typing import TypedDict, Annotated, Optional
from langgraph.graph import add_messages, StateGraph, END
from langchain_openai import ChatOpenAI
from langchain_core.messages import HumanMessage, AIMessageChunk, ToolMessage
from dotenv import load_dotenv
from langchain_community.tools.tavily_search import TavilySearchResults
from fastapi import FastAPI, Query
from fastapi.responses import StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import json
from uuid import uuid4
from langgraph.checkpoint.memory import MemorySaver

from uuid import uuid4
import json

load_dotenv()

class ChatState(TypedDict):
    messages: Annotated[list, add_messages]

model = ChatOpenAI(model="gpt-4o-mini", temperature=0)
search_tool = TavilySearchResults(max_results=4)
memory = MemorySaver()
tools = [search_tool]
llm_with_tools = model.bind_tools(tools)

async def model(state: ChatState) -> ChatState:
    result = await llm_with_tools.ainvoke(state["messages"])
    return {
    "messages": [result], 
}

async def tools_router(state: ChatState) -> ChatState:
    last_message = state["messages"][-1]
    if hasattr(last_message, "tool_calls") and len(last_message.tool_calls) > 0:
        return "tools_node"
    else: return END

async def tools_node(state: ChatState) -> ChatState:
    last_message = state["messages"][-1]
    tool_calls = last_message.tool_calls
    tool_messages = []
    for tool_call in tool_calls:
        tool_name = tool_call["name"   ]
        tool_args = tool_call["args"]
        tool_id = tool_call["id"]
        
        if tool_name == "tavily_search_results_json":
            search_results = await search_tool.ainvoke(tool_args)

            tool_message =ToolMessage(
                content=str(search_results),
                tool_call_id=tool_id,
                name=tool_name,
                )
            tool_messages.append(tool_message)
    return {"messages": tool_messages}

graph_builder = StateGraph(ChatState)
graph_builder.add_node("model", model)
graph_builder.add_node("tools_node", tools_node)
graph_builder.set_entry_point("model")

graph_builder.add_conditional_edges("model", tools_router)
graph_builder.add_edge("tools_node", "model")

graph = graph_builder.compile(checkpointer=memory)

app = FastAPI()

# Add CORS middleware with settings that match frontend requirements
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  
    allow_credentials=True,
    allow_methods=["*"],  
    allow_headers=["*"], 
    expose_headers=["Content-Type"], 
)

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

async def generate_chat_response(message: str, checkpoint_id: Optional[str] = None):
    is_new_conversation = checkpoint_id is None

    if is_new_conversation:
        new_checkpoint_id = str(uuid4())
        config = {
            "configurable" :{
                "thread_id": new_checkpoint_id
            }
        }

        events = graph.astream_events(
            {"messages": [HumanMessage(content=message)]},
            config=config,
            version="v2"
        )

        yield f"data:{{\"type\":\"checkpoint\",\"checkpoint_id\":\"{new_checkpoint_id}\"}}\n\n"

    else:
        config = {
            "configurable" :{
                "thread_id": checkpoint_id
            }
        }
        events = graph.astream_events(
            {"messages": [HumanMessage(content=message)]},
            config=config,
            version="v2"
        )

    async for event in events:
        print(event["event"])
        event_type = event["event"]
        if event_type == "on_chat_model_stream":
            chunk_content = serialise_ai_message_chunk(event["data"]["chunk"])
            # Build the data object and serialize it once to avoid double-encoding
            content = chunk_content if isinstance(chunk_content, str) else ""
            data_obj = {
                "type": "content",
                "content": content
            }
            yield f"data:{json.dumps(data_obj)}\n\n"
        elif event_type == "on_chat_model_end":
            tool_calls = event["data"]["output"].tool_calls if hasattr(event["data"]["output"], "tool_calls") else []
            if tool_calls:
                search_query = tool_calls[0]["args"].get("query", "")
                # Build the data object and serialize it once to avoid double-encoding
                data_obj = {"type": "search_start", "query": search_query}
                yield f"data:{json.dumps(data_obj)}\n\n"

        elif event_type == "on_tool_end" and event["name"] == "tavily_search_results_json":
            output = event["data"]["output"]

            if isinstance(output, list):
                urls = []
                for item in output:
                    if isinstance(item, dict) and "url" in item:
                        urls.append(item["url"])
                
                # Build the data object and serialize it once to avoid double-encoding
                data_obj = {"type": "search_results", "urls": urls}
                yield f"data:{json.dumps(data_obj)}\n\n"
    
    data_obj = {"type": "end"}
    yield f"data:{json.dumps(data_obj)}\n\n"

@app.get("/chat_stream/{message}")
async def chat_stream(
    message: str,
    checkpoint_id: Optional[str] = Query(None)
):
    return StreamingResponse(
        generate_chat_response(message, checkpoint_id),
        media_type="text/event-stream"
    )