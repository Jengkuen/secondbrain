# Product Requirements Document (PRD) - 3-Hour Hackathon Prototype
## Chat-First Second Brain MVP

**Version:** 1.0
**Date:** [Date of Hackathon]

---

### 1. Executive Summary

This document outlines the requirements for a 3-hour hackathon prototype of a "Chat-First Second Brain". The goal is to build a minimal viable product (MVP) demonstrating the core concept: capturing knowledge through natural chat interactions with an LLM and using that captured knowledge to provide contextually relevant responses. The prototype will feature a basic chat interface, a simple JSON file acting as a document store, and a rudimentary Retrieval-Augmented Generation (RAG) mechanism.

---

### 2. Goals & Objectives

*   **Demonstrate Core Concept:** Build a functional prototype proving the feasibility of conversational knowledge capture and retrieval.
*   **Minimal Chat Interaction:** Implement a basic chat UI allowing users to send prompts to an LLM and receive responses.
*   **Basic Document Storage:** Create a system to store conversation-derived information (topics, content) in a local JSON file.
*   **Rudimentary RAG:** Implement a simple mechanism to retrieve relevant snippets from the JSON store and add them as context to LLM prompts.
*   **End-to-End Flow:** Achieve a working connection between the chat UI, document storage, RAG, and LLM.

---

### 3. Target Users & Use Cases (Hackathon Demo Focus)

*   **Target:** Hackathon judges/participants.
*   **Use Case:** Demonstrate how a user interaction (chatting) can lead to automatic knowledge capture (JSON entry creation/update) and how subsequent interactions can leverage that knowledge (RAG-enhanced response).

---

### 4. Core Features (Hackathon Scope)

| Feature                     | Description (Hackathon Implementation)                                                                                                                               |
| :-------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Simple Chat Interface**   | Minimal web UI with message input, send button, and chat history display.                                                                                            |
| **Basic Gemini API Connection** | Connects the UI to the Gemini API to send prompts and display responses.                                                                                           |
| **JSON Document Storage**   | Uses a local JSON file as the document database. Implements functions to add/update simple entries (ID, Title/Topic, Content, Timestamp) based on chat content.      |
| **Minimal RAG Engine**      | Implements basic keyword matching to find relevant entries in the JSON file based on user prompts. Appends relevant content snippets to the Gemini API prompt as context. |
| **Document Viewer (Basic)** | (Optional Stretch Goal) A simple button or display area to show the current contents of the JSON document store for demo purposes.                                  |

---

### 5. Functional Requirements (Hackathon MVP)

*   **FR1:** User can type a message in the chat input and click "Send".
*   **FR2:** The user's message is sent to the configured Gemini API.
*   **FR3:** The Gemini API's response is displayed in the chat history.
*   **FR4:** After a conversation turn (or triggered manually for simplicity), the system attempts to extract a basic topic/content snippet.
*   **FR5:** The extracted information is saved as an entry (or updates an existing one) in the `documents.json` file.
*   **FR6:** Before sending a new user prompt to the Gemini API, the system performs a keyword search in `documents.json` based on the prompt.
*   **FR7:** If relevant entries are found, their content is prepended/appended to the user prompt as context before sending to the Gemini API.
*   **FR8:** (Optional Stretch Goal) User can click a button to view the raw content of the `documents.json` file.

---

### 6. Non-Functional Requirements (Hackathon Focus)

*   **NFR1:** The prototype must be functional and demonstrate the end-to-end flow within the 3-hour timeframe.
*   **NFR2:** Focus on core logic over robust error handling, scalability, or UI polish.
*   **NFR3:** Code should be runnable locally with minimal setup (e.g., installing dependencies, setting an API key).

---

### 7. Simplified Technical Architecture (Hackathon)

```
[Browser]
   ↓ ↑
[Web Server (Flask/Express)]
   ↓ ↑
[Chat Controller]
   ↓ ↑
┌────────┬───────────────┬────────────────┐
│Gemini API │Document       │Minimal RAG     │
│Client  │Manager (JSON) │(Keyword Match) │
└────────┴───────────────┴────────────────┘
   ↓ ↑
[documents.json]
```

---

### 8. Data Model (JSON Store)

*   A single JSON file (e.g., `documents.json`) containing a list of document objects.
*   **Document Object Structure:**
    ```json
    {
      "id": "unique_identifier",
      "topic": "Inferred topic/title",
      "content": "Relevant text snippet from conversation",
      "timestamp": "ISO 8601 timestamp"
    }
    ```

---

### 9. Success Metric (Hackathon)

*   **Primary Metric:** A working demo showcasing a user chat, subsequent JSON document creation/update, and a follow-up chat where the LLM response demonstrably uses context retrieved from the JSON store.

---

### 10. Hackathon Shortcuts & Simplifications

*   **Document Storage:** Local JSON file, not a database.
*   **Document Analysis:** Basic keyword extraction or using predefined triggers, not complex NLP.
*   **RAG Implementation:** Simple keyword matching, not vector embeddings or semantic search.
*   **UI:** Minimalistic, functionality over aesthetics.
*   **Error Handling:** Minimal, focus on the "happy path".

---

### 11. Demo-Ready Elements

*   **Sample Documents:** Pre-populate `documents.json` with 1-2 entries to ensure retrieval can be demoed immediately.
*   **Demo Script:** Prepare 2-3 specific conversation examples highlighting:
    1.  Initial chat -> Document creation.
    2.  Follow-up chat -> Context retrieval and use.
*   **Visualization:** If implemented, the basic document viewer.

---

### 12. Risks & Mitigations (Hackathon Context)

*   **Risk:** Running out of time.
    *   **Mitigation:** Strictly follow the hour-by-hour plan. Prioritize core features over stretch goals. Use pre-built library components where possible.
*   **Risk:** Integration issues between components.
    *   **Mitigation:** Test connections between components early (e.g., basic UI-LLM connection first). Keep interfaces simple.
*   **Risk:** RAG implementation is too basic to show value.
    *   **Mitigation:** Pre-populate JSON with clear examples. Craft demo script carefully to trigger obvious keyword matches.
*   **Risk:** External API issues (LLM downtime/rate limits).
    *   **Mitigation:** Have API keys ready. Test connection early. Consider having a mocked response function as a backup. 