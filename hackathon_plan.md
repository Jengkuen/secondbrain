# Simplified 3-Hour Hackathon Plan: Chat-First Second Brain MVP

This plan focuses on building the MVP defined in `hackathon_prd.md` with maximum speed and minimal dependencies, suitable for a 3-hour hackathon demonstrated locally.

**Goal:** Build the Chat-First Second Brain MVP locally in 3 hours.

**Core Tech Choices (Simplicity Focus):**

1.  **Frontend:** **Next.js (React)** - Widely used, quick start (`create-next-app`), integrates UI and basic backend.
2.  **Backend:** **Next.js API Routes** - Included with Next.js, simple server-side logic within the same project.
3.  **Data Storage:** **Local Filesystem (Node.js `fs` module)** - Absolute minimum dependency using built-in Node.js module. **CRITICAL CAVEAT:** Works for local demo (`next dev`), but **will not work** on standard serverless deployments (Vercel, etc.). This limitation must be stated during the demo.
4.  **LLM API:** **Google Gemini API** (`@google/generative-ai` library) - Core requirement. USE gemini-1.5-flash-latest FOR THE MODEL.

**Minimal Dependencies:**

*   `next`, `react`, `react-dom` (from `create-next-app`)
*   `@google/generative-ai`
*   (Optional devDependencies: `typescript`, `@types/node`, `tailwindcss`)

---

## Concrete 3-Hour Plan

**Pre-Hackathon Prep (~10-15 mins):**

*   Ensure Node.js (LTS version recommended) and npm/yarn are installed.
*   Obtain your Google Gemini API key.
*   Create a main project folder.

**Hour 1: Setup & Basic Chat (0:00-1:00)**

*   **(0:00-0:15) Project Setup:**
    *   ✅ Open terminal in your project folder.
    *   ✅ Run `npx create-next-app@latest second-brain-hackathon` (use defaults, select TypeScript, optionally Tailwind).
    *   ✅ `cd second-brain-hackathon`
    *   ✅ Install Gemini SDK: `npm install @google/generative-ai`
    *   ✅ Create `.env.local` file in the project root. Add `GEMINI_API_KEY=YOUR_API_KEY_HERE` to it.
    *   ✅ Add `.env.local` to your `.gitignore` file.
    *   ✅ Create an empty file: `touch documents.json` in the project root (or a `./data` folder). Add `documents.json` to `.gitignore`.
    *   ✅ Initialize Git: `git init && git add . && git commit -m "Initial project setup"`
*   **(0:15-0:40) Simple Chat UI (React Component):**
    *   ✅ Edit `app/page.tsx`.
    *   ✅ Use `useState` hook for chat history array and current input string.
    *   ✅ Add basic HTML elements: `<input>` field bound to input state, `<button>` for sending, and a `<div>` to map over and display chat history.
    *   ✅ Apply minimal styling (e.g., basic Tailwind classes like `p-2`, `border`, `mb-2`).
*   **(0:40-1:00) Basic API Route & Gemini Connection:**
    *   ✅ Create the API route file: `app/api/chat/route.ts`.
    *   ✅ Implement a `POST` request handler function (`export async function POST(request: Request) { ... }`).
    *   ✅ Frontend (`app/page.tsx`): Implement the `onClick` handler for the send button to:
        *   ✅ Make a `fetch` call to `/api/chat` with `method: 'POST'`, `headers: {'Content-Type': 'application/json'}`, and `body: JSON.stringify({ message: userInput })`.
        *   ✅ Update chat history state with the user's message immediately (optimistic update).
    *   ✅ Backend (`app/api/chat/route.ts`):
        *   ✅ Read the incoming message: `const { message } = await request.json();`
        *   ✅ Import and initialize Gemini client: `import { GoogleGenerativeAI } from "@google/generative-ai"; const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!); const model = genAI.getGenerativeModel("gemini-pro");`
        *   ✅ Call Gemini: `const result = await model.generateContent(message); const response = await result.response; const text = response.text();`
        *   ✅ Return the response: `return new Response(JSON.stringify({ response: text }), { status: 200 });`
    *   ✅ Frontend (`app/page.tsx`): In the `.then()` of the fetch call, parse the JSON response and update the chat history state with the AI's message. Clear the input field.
    *   ✅ *Test:* Verify basic chat interaction works. Check browser console and terminal for errors.

**Hour 2: Document Storage (Local File) (1:00-2:00)**

*   ✅ **(1:00-1:40) Document Saving Logic (API Route):**
    *   Modify `app/api/chat/route.ts`.
    *   Import `fs/promises`: `import fs from 'fs/promises';`
    *   Import `path`: `import path from 'path';`
    *   Define file path consistently: `const filePath = path.join(process.cwd(), 'documents.json');` (ensures correct path resolution).
    *   Define `Document` type/interface: `interface Document { id: string; topic: string; content: string; timestamp: string; }`
    *   **After** getting the Gemini response (`text`):
        *   Generate document data:
            *   `const newDoc: Document = { id: crypto.randomUUID(), topic: message, // Simple: use user prompt as topic content: `User: ${message}\\nAI: ${text}`, timestamp: new Date().toISOString() };`
        *   **Read existing data:**
            ```typescript
            let documents: Document[] = [];
            try {
              const fileContent = await fs.readFile(filePath, 'utf-8');
              documents = JSON.parse(fileContent);
            } catch (error) {
              // File might not exist yet, ignore error or log if needed
              console.log("documents.json not found or empty, starting fresh.");
            }
            ```
        *   **Append new document:** `documents.push(newDoc);`
        *   **Write back to file:** `await fs.writeFile(filePath, JSON.stringify(documents, null, 2)); // Use null, 2 for pretty printing`
*   ✅ **(1:40-2:00) Testing Document Creation:**
    *   Run a few chat interactions.
    *   Open `documents.json` in your editor (Cursor) and verify entries are being added with the correct structure (id, topic, content, timestamp).
    *   (Optional Stretch Goal): Create `app/api/documents/route.ts` with a `GET` handler using `fs.readFile(filePath, 'utf-8')` to return the file content. Add a button to the frontend to fetch from `/api/documents` and display the raw JSON.

**Hour 3: RAG Implementation & Integration (2:00-3:00)**

*   **(2:00-2:40) RAG Logic (API Route):**
    *   Modify `app/api/chat/route.ts`.
    *   **Before** calling the Gemini API (`model.generateContent(...)`):
        *   Read documents from `documents.json` using `fs.readFile` (same try/catch logic as above).
        *   **Simple Keyword Matching:**
            ```typescript
            let contextString = "";
            const userKeywords = message.toLowerCase().split(/\s+/); // Basic split
            const relevantDoc = documents.find(doc =>
              userKeywords.some(keyword => doc.content.toLowerCase().includes(keyword))
            ); // Find first doc where any keyword matches content

            if (relevantDoc) {
              contextString = `Context from previous discussion: ${relevantDoc.content}\n\n---\n\n`;
            }
            ```
        *   Construct the prompt for Gemini: `const enhancedPrompt = contextString + "User query: " + message;`
        *   Call Gemini with the enhanced prompt: `const result = await model.generateContent(enhancedPrompt);`
*   **(2:40-3:00) End-to-End Testing & Refinement:**
    *   Follow the demo script from `hackathon_prd.md`.
        1.  Chat to create a document about "React state management".
        2.  Verify `documents.json` contains this entry.
        3.  Start a new chat asking "Tell me more about state management".
        4.  Observe if the AI response references or seems aware of the previous context. (Add `console.log(enhancedPrompt)` in the API route to verify context is being added).
    *   Fix any obvious bugs encountered.
    *   Prepare to demo *locally*. **Crucially, remember to explain the local filesystem limitation during the demo.**

---
This plan prioritizes a functional local demo within the tight time constraint. 

---

## Refinement: Improving RAG with Embeddings (Post-Hackathon or Time Permitting)

This section outlines how to replace the basic keyword RAG with a more robust semantic search using embeddings. This improves relevance significantly but adds complexity.

**Key Idea:** Store an embedding (a vector representation of meaning) for each document. When a new query comes in, generate its embedding and find the document(s) with the most similar embeddings (using cosine similarity).

**Steps:**

1.  **Modify Document Structure:**
    *   Update the `Document` interface in `app/api/chat/route.ts` to include an embedding field:
        ```typescript
        interface Document { 
          id: string; 
          topic: string; 
          content: string; 
          timestamp: string;
          embedding: number[]; // Add this line
        }
        ```
    *   **Note:** Storing embeddings directly in JSON is inefficient for large datasets but acceptable for this scope. Real applications would use a vector database.

2.  **Generate Embeddings on Save:**
    *   In `app/api/chat/route.ts`, *before* saving the `newDoc`:
    *   Initialize the embedding model (needs to be done once, ideally outside the request handler or cached):
        ```typescript
        // Add near other imports/constants
        const { GoogleGenerativeAI } = require("@google/generative-ai"); 
        // ... existing genAI setup for chat model ...
        const embeddingModel = genAI.getGenerativeModel("embedding-001"); 
        ```
    *   Generate the embedding for the document content:
        ```typescript
        // Inside the POST handler, before saving newDoc
        const docContentToEmbed = newDoc.content; // Or potentially just the AI response, or a summary
        const embeddingResult = await embeddingModel.embedContent(docContentToEmbed);
        const documentEmbedding = embeddingResult.embedding.values; 
        
        // Add embedding to the document object
        newDoc.embedding = documentEmbedding; 
        ```
    *   Save the `newDoc` (which now includes the `embedding` array) to `documents.json`.
    *   **Important:** Existing documents in `documents.json` will lack embeddings. You'll need to either manually clear the file or write a script to backfill embeddings for old documents if you want them included in semantic search.

3.  **Implement Semantic Search Logic:**
    *   In `app/api/chat/route.ts`, replace the **Simple Keyword Matching** block with the following:
    *   **Get Query Embedding:**
        ```typescript
        // Before calling the chat model, after reading documents
        const queryEmbeddingResult = await embeddingModel.embedContent(message);
        const queryEmbedding = queryEmbeddingResult.embedding.values;
        ```
    *   **Calculate Similarities:**
        *   Install a helper library for vector math (cosine similarity): `npm install cosine-similarity`
        *   Import it: `import cosineSimilarity from 'cosine-similarity';`
        *   Find the most relevant document:
        ```typescript
        let contextString = "";
        let mostSimilarDoc: Document | null = null;
        let highestSimilarity = -1; // Cosine similarity ranges from -1 to 1

        // Ensure documents have embeddings before comparing
        const docsWithEmbeddings = documents.filter(doc => doc.embedding && Array.isArray(doc.embedding));

        for (const doc of docsWithEmbeddings) {
          const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
          if (similarity > highestSimilarity) {
            highestSimilarity = similarity;
            mostSimilarDoc = doc;
          }
        }

        // Define a relevance threshold (e.g., 0.7) - adjust as needed
        const SIMILARITY_THRESHOLD = 0.7; 
        if (mostSimilarDoc && highestSimilarity > SIMILARITY_THRESHOLD) {
          contextString = `Context from previous discussion (topic: ${mostSimilarDoc.topic}):
${mostSimilarDoc.content}

---

`;
          console.log(`Found relevant document with similarity: ${highestSimilarity}`);
        } else {
          console.log(`No sufficiently relevant document found (highest similarity: ${highestSimilarity})`);
        }
        ```
    *   **Use Context:** Construct `enhancedPrompt` using `contextString` as before:
        `const enhancedPrompt = contextString + "User query: " + message;`
    *   Call the chat model (`gemini-pro`) with `enhancedPrompt`.

4.  **Testing:**
    *   Clear `documents.json` or ensure existing entries have embeddings.
    *   Create a few distinct documents via chat.
    *   Ask follow-up questions that are semantically related but may not share exact keywords.
    *   Check the console logs in the API route to see if context is being correctly identified and added based on similarity scores. Adjust the `SIMILARITY_THRESHOLD` if needed. 

---

## Refinement: Automatic Obsidian-Style Note Creation (Post-Hackathon)

This section describes adding functionality to automatically create interlinked Markdown notes in a `userData` directory, inspired by Obsidian's knowledge management approach. This would coexist with the raw chat log storage in `documents.json`.

**Goal:** Extract key information and relationships from chat interactions and structure them as linked `.md` files for use in Obsidian or similar Markdown editors.

**Steps:**

1.  **Trigger:** This process runs after a successful chat interaction (user query + AI response) and after the interaction is saved to `documents.json`.
2.  **Create `userData` Directory:**
    *   In the `app/api/chat/route.ts` logic, ensure a `userData` directory exists at the project root (`second-brain-hackathon/userData`). Create it if it doesn't using `fs.mkdir(path.join(process.cwd(), 'userData'), { recursive: true });`.
    *   Add `userData/` to the `.gitignore` file in the `second-brain-hackathon` project.
3.  **Information Extraction & Linking (Additional LLM Call):**
    *   After obtaining the AI response (`text`) for the user query (`message`), make a *second* call to the Gemini API (could use `gemini-1.5-flash-latest` for speed/cost).
    *   Construct a prompt for this second call, providing the `message` and `text`. Example prompt structure:
        ```
        Given the following user query and AI response:
        User Query: "{message}"
        AI Response: "{text}"

        1. Identify the primary specific topic being discussed (e.g., "React State Management Hooks", "Python List Comprehensions").
        2. Summarize the key information or insights from the AI response regarding this topic in 2-3 concise sentences.
        3. Identify 1-3 broader parent concepts or closely related topics (e.g., for "React State Management Hooks", related concepts might be "React", "State Management", "Frontend Development"). List only the concept names.

        Return the result as a JSON object with the keys "primaryTopic", "summary", and "relatedConcepts" (which should be an array of strings). Ensure the output is **only** the JSON object.
        Example:
        {
          "primaryTopic": "React State Management Hooks",
          "summary": "useState and useReducer are key React hooks for managing component state. useState is simpler for basic state, while useReducer is better for complex logic.",
          "relatedConcepts": ["React", "State Management", "JavaScript Frameworks"]
        }
        ```
    *   Parse the JSON response from this LLM call. Handle potential errors if the LLM doesn't return valid JSON.
4.  **Filename Sanitization:**
    *   Create a helper function to sanitize the `primaryTopic` and `relatedConcepts` strings into valid filenames. Replace spaces with underscores, remove special characters, convert to lowercase. E.g., "React State Management Hooks" becomes `react_state_management_hooks`.
5.  **Generate Markdown Content:**
    *   Use the `summary` from the LLM response as the base content.
    *   For each `relatedConcept`, generate its sanitized filename (e.g., `react`).
    *   Append Obsidian-style wikilinks to the summary for each related concept: `[[sanitized_related_concept]]`. Example: `Summary text... Related: [[react]] [[state_management]] [[javascript_frameworks]]`.
6.  **File System Operations (`fs/promises` in `app/api/chat/route.ts`):**
    *   Define the path to the primary topic file: `const filePath = path.join(process.cwd(), 'userData', sanitizedPrimaryTopic + '.md');`
    *   **Check if Primary Topic File Exists:** Use `fs.readFile` in a try-catch block or `fs.access`.
        *   **If Yes (Append):** Read the existing content. Append the new summary and links, perhaps separated by `
---
` and a timestamp. Write the combined content back using `fs.writeFile`. (Note: This is a simple append strategy; more advanced merging could be implemented).
        *   **If No (Create):** Write the generated Markdown content (summary + links) to the new file using `fs.writeFile`.
    *   **Ensure Related Concept Files Exist (for Linking):**
        *   For each `relatedConcept`:
            *   Define its path: `const relatedFilePath = path.join(process.cwd(), 'userData', sanitizedRelatedConcept + '.md');`
            *   Check if the file exists (using `fs.access` or a try-catch `fs.readFile`).
            *   **If No:** Create an empty file or a minimal placeholder file (e.g., `fs.writeFile(relatedFilePath, `# ${relatedConcept}\n\nThis topic was linked from [[${sanitizedPrimaryTopic}]]`)`) to ensure the wikilink is functional in Obsidian upon creation.

7.  **Error Handling:** Add robust error handling around the LLM call and file system operations.
8.  **Testing:**
    *   Initiate chats on various topics.
    *   Observe the `userData` folder. Verify `.md` files are created with appropriate names.
    *   Check file content for summaries and wikilinks.
    *   Verify that related concept files are created (even if initially empty/placeholders).
    *   Test appending to existing files.
    *   Open the `userData` folder as an Obsidian vault to check linking. 