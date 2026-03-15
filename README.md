# ChatBot - AI-Powered Chat Application with Web Search

A modern full-stack AI chat application with real-time streaming responses and integrated web search.

## 🚀 Live Demo

Try the application live at: **[chat-bot-nu-rose.vercel.app](https://chat-bot-nu-rose.vercel.app)**

## Features

- 🤖 **AI-Powered Conversations**: Powered by OpenAI's GPT-4o-mini model
- 🔍 **Web Search Integration**: Automatic web search using Tavily Search API for up-to-date information
- 📡 **Real-Time Streaming**: Server-Sent Events (SSE) for real-time response streaming
- 💾 **Conversation Memory**: Persistent conversation state using LangGraph checkpoints
- 🎨 **Modern UI**: Clean, responsive interface built with React, Next.js, and Tailwind CSS
- 🔄 **State Management**: Robust state management with conversation threading
- 🔒 **Advanced Security**: Multi-layer protection with rate limiting, session management, and connection limits

### 🛡 Usage Limits

The API includes rate limiting, session quotas, and connection guards to prevent abuse and ensure fair usage.

## Tech Stack

### Backend
- **Python 3.12+**
- **FastAPI**: Modern, fast web framework for building APIs
- **LangChain**: Framework for developing applications powered by language models
- **LangGraph**: Build stateful, multi-actor applications with LLMs
- **OpenAI**: GPT-4o-mini model for chat completions
- **Tavily Search**: Real-time web search API
- **Uvicorn**: ASGI server for FastAPI
- **SlowAPI**: Rate limiting middleware for FastAPI

### Frontend
- **Next.js 15**: React framework with App Router
- **React 19**: UI library
- **TypeScript**: Type-safe JavaScript
- **Tailwind CSS 4**: Utility-first CSS framework

## Project Structure

```
ChatBot/
├── server/                 # Backend FastAPI application
│   ├── app.py             # Main application file
│   ├── guards.py          # Rate limiting and abuse protection    
│   ├── requirements.txt   # Python dependencies
│   └── Dockerfile         # Docker configuration
├── client/                # Frontend Next.js application
│   ├── src/
│   │   ├── app/          # Next.js app directory
│   │   │   ├── page.tsx  # Main chat page
│   │   │   └── layout.tsx
│   │   └── components/    # React components
│   │       ├── Header.tsx
│   │       ├── InputBar.tsx
│   │       └── MessageArea.tsx
│   ├── package.json      # Node.js dependencies
│   └── tsconfig.json
└── README.md
```

## Prerequisites

- **Python 3.12+** (for backend)
- **Node.js 20+** and **npm** (for frontend)
- **OpenAI API Key**: Get one from [OpenAI Platform](https://platform.openai.com/)
- **Tavily API Key**: Get one from [Tavily](https://tavily.com/)

## Installation

### Backend Setup

1. Navigate to the server directory:
```bash
cd server
```

2. Create a virtual environment:
```bash
python -m venv venv
```

3. Activate the virtual environment:
   - **Windows**: `venv\Scripts\activate`
   - **macOS/Linux**: `source venv/bin/activate`

4. Install dependencies:
```bash
pip install -r requirements.txt
```

5. Create a `.env` file in the `server` directory:
```env
OPENAI_API_KEY=your_openai_api_key_here
TAVILY_API_KEY=your_tavily_api_key_here
```

### Frontend Setup

1. Navigate to the client directory:
```bash
cd client
```

2. Install dependencies:
```bash
npm install
```

## Running the Application

### Start the Backend Server

From the `server` directory:

```bash
uvicorn app:app --reload --port 8000
```

The server will start on `http://localhost:8000`

### Start the Frontend Development Server

From the `client` directory:

```bash
npm run dev
```

The frontend will start on `http://localhost:3000`

### Using Docker (Backend)

Build and run the Docker container:

```bash
cd server
docker build -t chatbot-server .
docker run -p 8000:8000 --env-file .env chatbot-server
```

## API Endpoints

### `GET /chat_stream/{message}`

Stream chat responses using Server-Sent Events (SSE).

**Parameters:**
- `message` (path): The user's message (max 500 characters)
- `session_id` (query, required): Unique session identifier for rate limiting and security
- `checkpoint_id` (query, optional): Conversation checkpoint ID for continuing a conversation

**Rate Limits:**
- 5 requests per minute per IP address
- 15 requests per 10 minutes per session
- Maximum 5 concurrent connections per IP
- 1 second cooldown between requests per session

**Response:**
SSE stream with the following event types:

- `checkpoint`: New conversation checkpoint ID
  ```json
  {"type":"checkpoint","checkpoint_id":"uuid"}
  ```

- `content`: Streaming content chunks
  ```json
  {"type":"content","content":"text chunk"}
  ```

- `search_start`: Web search initiated
  ```json
  {"type":"search_start","query":"search query"}
  ```

- `search_results`: Web search results
  ```json
  {"type":"search_results","urls":["url1","url2"]}
  ```

- `end`: Stream completed
  ```json
  {"type":"end"}
  ```

**Example:**
```bash
curl -N "http://localhost:8000/chat_stream/hello?session_id=test123&checkpoint_id=abc123"
```

## How It Works

1. **User sends a message** through the frontend
2. **Frontend creates an EventSource** connection to the backend SSE endpoint
3. **Backend processes the message** using LangGraph:
   - Sends message to OpenAI GPT-4o-mini
   - If tool calls are needed (e.g., web search), executes them
   - Streams responses back via SSE
4. **Frontend receives and displays** streaming chunks in real-time
5. **Conversation state** is maintained using LangGraph checkpoints

## Security Features

The application includes comprehensive security measures implemented in `server/guards.py`:

### Rate Limiting
- **IP-level rate limiting**: 5 requests per minute per IP address (using SlowAPI)
- **Session-level quota**: 15 requests per 10-minute window per session
- **Connection limits**: Maximum 5 concurrent SSE connections per IP address
- **Cooldown protection**: 1 second minimum between requests per session

### Session Management
- **Session-IP binding**: Sessions are bound to IP addresses to prevent session hijacking
- **Session quota tracking**: Automatic cleanup of expired session data
- **Active connection tracking**: Prevents duplicate concurrent requests from the same session

### Origin Protection
- **CORS configuration**: Restricted to allowed origins only
- **Origin validation**: Server-side validation of request origins

### Input Validation
- **Message length limits**: Maximum 500 characters per message
- **Session ID validation**: Maximum 100 characters, validated format

## Configuration

### Environment Variables

**Backend** (`.env` in `server/` directory):
- `OPENAI_API_KEY`: Your OpenAI API key
- `TAVILY_API_KEY`: Your Tavily Search API key

**Frontend** (optional):
- `NEXT_PUBLIC_SERVER_URL`: Custom server URL (defaults to `http://localhost:8000`)

### Server Configuration

The server can be configured in `app.py`:
- **Model**: Change `model="gpt-4o-mini"` to use a different OpenAI model
- **Search Results**: Adjust `max_results=4` in `TavilySearchResults` to change the number of search results
- **Port**: Modify the port in the uvicorn command or Dockerfile

## Troubleshooting

### Common Issues

1. **CORS Errors**
   - Ensure the backend CORS middleware is configured correctly
   - Check that the frontend is connecting to the correct server URL

2. **API Key Errors**
   - Verify your `.env` file exists and contains valid API keys
   - Ensure environment variables are loaded correctly

3. **Connection Issues**
   - Check that both servers are running
   - Verify the server URL in the frontend matches the backend port

4. **JSON Parsing Errors**
   - The server now handles JSON encoding correctly
   - If you encounter issues, check the server logs

## Development

### Backend Development

The backend uses FastAPI with automatic reloading. Changes to `app.py` will automatically reload the server.

### Frontend Development

The frontend uses Next.js with hot module replacement. Changes to React components will update automatically in the browser.

### Code Quality

- **Python**: Follow PEP 8 style guidelines
- **TypeScript**: Use strict type checking
- **React**: Follow React best practices and hooks patterns

## Technical Notes

### JSON Encoding Fix

The application includes a robust solution for handling double-encoded JSON from LangGraph events. The `clean_json_string()` function in `server/app.py` automatically detects and fixes JSON-encoded strings before serialization, ensuring clean JSON output.

See `FIX_SUMMARY.md` for more details on the implementation.

## License

This project is open source and available under the MIT License.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## Acknowledgments

- [LangChain](https://www.langchain.com/) for the LLM framework
- [LangGraph](https://langchain-ai.github.io/langgraph/) for stateful LLM applications
- [OpenAI](https://openai.com/) for the GPT models
- [Tavily](https://tavily.com/) for web search capabilities
- [FastAPI](https://fastapi.tiangolo.com/) for the web framework
- [Next.js](https://nextjs.org/) for the React framework

## Support

For issues and questions, please open an issue on the GitHub repository.
