
# OpenClaw Interface v2.2

A 3D, interactive, voice-enabled avatar interface designed for Humans and AI Agents. This interface supports connecting to Google Gemini, OpenRouter, and **OpenClaw Agents**.

## 🤖 For AI Agents (Auto-Configuration)

Agents can "configure themselves" by generating a Deep Link to this application. If you are an Agent orchestrating a swarm or simply want to direct a human to a specific interface context, use the following URL parameters.

### URL Parameters

*   `provider`: `gemini` | `openrouter` | `openclaw` (Required for auto-config)
*   `baseUrl`: The full URL endpoint of the Agent (Required for `openclaw`)
*   `agentId`: A specific ID to route the chat to (Optional)
*   `authToken`: Bearer token or API Key for the agent (Optional)
*   `model`: Overrides the model ID (for `gemini` or `openrouter`)

### Examples

**1. Direct Connection to a Local OpenClaw Agent**
```
http://your-interface-url.com/?provider=openclaw&baseUrl=http://localhost:8000/api/chat&agentId=swarm-leader-1
```

**2. Direct Connection to OpenRouter with a specific Model**
```
http://your-interface-url.com/?provider=openrouter&model=anthropic/claude-3-opus
```

---

## 🛠 OpenClaw / Agent Integration

The interface expects the following endpoints from your agent server for full functionality:

### 1. Chat Interaction (`POST /chat`)
**Request:**
```json
{
  "message": "User input text",
  "agentId": "configured-agent-id",
  "sessionId": "random-session-id",
  "history": [ { "role": "user", "content": "..." } ],
  "files": [ { "name": "image.png", "type": "image/png", "data": "base64..." } ]
}
```

**Response:**
Your agent should return a JSON object. The interface looks for content in this order: `response` > `message` > `text` > `output`.

**Chain of Thought / Reasoning:**
To display a "Neural Process" (collapsible thought block), return a `thoughts` array or `steps` array in your JSON response.
```json
{
  "response": "Here is the calculation.",
  "thoughts": [ "Checking database...", "Found 3 records.", "Calculating average..." ]
}
```

### 2. Agent Discovery (`GET /agents`)
Used by the "Discover Agents" button in settings.
**Response:**
```json
{
  "agents": [
    { "id": "agent-1", "name": "Data Analyst", "description": "Analyzing spreadsheets" }
  ]
}
```

### 3. Health Check (`GET /health`)
Used by the connection status indicator. Returns `200 OK`.

---

## 👤 For Humans

### Features
*   **3D Avatar**: Real-time lipsync and expressions.
*   **Multimodal**: Click the paperclip to upload images to Gemini or your Agent.
*   **Voice I/O**: Speak to the agent using the microphone.
*   **Cyberpunk HUD**: Immersive, glassmorphism-based UI.

### Manual Configuration

1.  Click the **Gear Icon** in the top right.
2.  Select **AI Provider** tab.
3.  Choose **OpenClaw** to connect to custom agents.
