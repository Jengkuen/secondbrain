import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs/promises';
import path from 'path';
import cosineSimilarity from 'cosine-similarity'; // Import cosine similarity

// --- Helper Functions ---
function sanitizeFilename(name: string): string {
  if (!name) return '_'; // Handle empty or null names
  return name
    .toLowerCase()
    .replace(/\s+/g, '_') // Replace spaces with underscores
    .replace(/[^a-z0-9_.-]/g, '') // Remove disallowed characters
    .substring(0, 100); // Limit length
}

async function createOrUpdateObsidianNote(
  message: string,
  aiResponse: string,
  genAIInstance: GoogleGenerativeAI
) {
  const userDataDir = path.join(process.cwd(), 'userData');
  const noteGenModelName = "gemini-2.5-flash-preview-04-17";
  const noteGenModel = genAIInstance.getGenerativeModel({ model: noteGenModelName });
  console.log(`Using Gemini note generation model: ${noteGenModelName}`); // Log the note generation model

  try {
    // 1. Ensure userData directory exists
    await fs.mkdir(userDataDir, { recursive: true });

    // 2. Prompt for Information Extraction
    const extractionPrompt = `Given the following user query and AI response:
User Query: "${message}"
AI Response: "${aiResponse}"

1. Identify the primary specific topic being discussed (e.g., "React State Management Hooks", "Python List Comprehensions"). Keep it concise.
2. Summarize the key information or insights from the AI response regarding this topic in 2-4 concise sentences.
3. Identify 1-3 broader parent concepts or closely related topics (e.g., for "React State Management Hooks", related concepts might be "React", "State Management", "Frontend Development"). List only the concept names.

Return the result **only** as a valid JSON object with the keys "primaryTopic" (string), "summary" (string), and "relatedConcepts" (array of strings). Ensure the JSON is well-formed.
Example:
{
  "primaryTopic": "React State Management Hooks",
  "summary": "useState and useReducer are key React hooks for managing component state. useState is simpler for basic state, while useReducer is better for complex logic.",
  "relatedConcepts": ["React", "State Management", "JavaScript Frameworks"]
}`; 

    console.log("Sending extraction prompt to Gemini...");
    const extractionResult = await noteGenModel.generateContent(extractionPrompt);
    const extractionResponse = await extractionResult.response;
    const rawJsonText = extractionResponse.text().trim();

    // 3. Parse LLM Response
    let noteData: { primaryTopic: string; summary: string; relatedConcepts: string[] };
    try {
        // Attempt to handle potential markdown code blocks
        const cleanedJsonText = rawJsonText.replace(/^```json\n?/, '').replace(/\n?```$/, '');
        noteData = JSON.parse(cleanedJsonText);
        console.log("Extracted Note Data:", noteData);
        if (!noteData.primaryTopic || !noteData.summary || !Array.isArray(noteData.relatedConcepts)) {
            throw new Error("Invalid structure in JSON response from LLM");
        }
    } catch (parseError: any) {
        console.error("Failed to parse JSON from note extraction LLM:", parseError);
        console.error("Raw response was:", rawJsonText);
        return; // Stop processing if parsing fails
    }

    // 4. Check for existing semantically similar notes before deciding filename
    let targetFilename = '';
    let existingFiles: string[] = [];
    try {
        existingFiles = (await fs.readdir(userDataDir))
                            .filter(file => file.endsWith('.md'))
                            .map(file => file.replace(/\.md$/, '')); // Get basenames
    } catch (readdirError: any) {
        if (readdirError.code !== 'ENOENT') {
            console.error("Error reading userData directory:", readdirError);
            // Decide how to proceed - maybe attempt to create anyway?
            // For now, let's try to proceed assuming no existing files check is possible.
        }
        // If ENOENT, existingFiles remains empty, which is fine.
    }

    if (existingFiles.length > 0) {
        const similarityCheckPrompt = `Given the new topic "${noteData.primaryTopic}" and the list of existing note titles (filenames): ${JSON.stringify(existingFiles)}.

Which existing title is the most semantically similar to the new topic? 
Focus on the core meaning, ignoring minor differences in wording or capitalization.

If you find a title that is a very strong semantic match (meaning it covers the same core concept), return **only** that exact existing title string from the list.
If no existing title is a strong semantic match, return the string "None".`;

        console.log("Checking for semantically similar existing notes...");
        try {
            const similarityResult = await noteGenModel.generateContent(similarityCheckPrompt);
            const similarityResponse = await similarityResult.response;
            const similarFilename = similarityResponse.text().trim();

            if (existingFiles.includes(similarFilename)) {
                targetFilename = similarFilename; // Use the existing filename
                console.log(`Found semantically similar existing note: "${targetFilename}.md". Will merge into this file.`);
            } else {
                 console.log("No strongly similar existing note found by LLM.");
                 // Fall through to sanitize and use the new topic
            }
        } catch (similarityError) {
            console.error("Error during semantic similarity check with LLM:", similarityError);
            // Fallback: proceed as if no similar file was found
        }
    }

    // If no similar file was found or check failed/skipped, use the new topic
    if (!targetFilename) {
        const sanitizedPrimaryTopic = sanitizeFilename(noteData.primaryTopic);
        if (!sanitizedPrimaryTopic || sanitizedPrimaryTopic === '_') {
            console.error("Primary topic sanitized to an invalid filename, aborting note creation.");
            return;
        }
        targetFilename = sanitizedPrimaryTopic;
        console.log(`No similar existing note found or check skipped. Using filename: "${targetFilename}.md"`);
    }

    // 5. Sanitize related concepts (needed regardless of filename choice)
    const sanitizedRelatedConcepts = noteData.relatedConcepts.map(sanitizeFilename).filter(name => name && name !== '_');

    // 6. Generate Markdown Content block for the NEW interaction (summary, related, original timestamp)
    const generationTimestamp = new Date().toISOString(); // Keep track of original generation
    const newSummaryBlock = `${noteData.summary}\\n`;
    let newInfoBlock = newSummaryBlock;
    if (sanitizedRelatedConcepts.length > 0) {
        newInfoBlock += `\\nRelated: ${sanitizedRelatedConcepts.map(rc => `[[${rc}]]`).join(' ')}\\n`;
    }
    newInfoBlock += `\\n*Generated from chat on ${generationTimestamp}*\\n`; // Include original timestamp for context in merge prompt

    // 7. File System Operations using the determined target filename
    const primaryFilePath = path.join(userDataDir, `${targetFilename}.md`);
    const updateTimestamp = new Date().toISOString(); // Timestamp for the "Last updated" metadata

    try {
        let existingContent = '';
        let isNewFile = false;
        try {
            existingContent = await fs.readFile(primaryFilePath, 'utf-8');
        } catch (readError: any) {
            if (readError.code === 'ENOENT') {
                // File doesn't exist, start with just the title
                // Use the *original* primary topic for the title, not necessarily the targetFilename if it came from an existing file
                existingContent = `# ${noteData.primaryTopic}\\n\\n`;
                isNewFile = true; // Flag that this is effectively the first version
            } else {
                throw readError; // Re-throw unexpected read errors
            }
        }

        // 8. Prepare Merge Prompt for LLM
        // If it's a new file, the existingContent only has the title.
        // The prompt asks the LLM to synthesize the summary and combine related links.
        const mergePrompt = `Given the existing Markdown note content and new information derived from a recent conversation, please merge them intelligently into a single, updated note.

**Existing Note Content:**
\`\`\`markdown
${existingContent}
\`\`\`

**New Information (Summary & Related Concepts from recent conversation):**
\`\`\`markdown
${newInfoBlock}
\`\`\`

**Instructions:**
1.  Keep the main title (the first line starting with '#'). If the existing content is just the title, use the summary from the "New Information" as the initial summary.
2.  If there's existing summary content, review it along with the summary from the "New Information". Synthesize these into a single, comprehensive, and up-to-date summary paragraph reflecting the current understanding of the topic. Place this synthesized summary directly after the title. Avoid simple appending of summaries.
3.  Review any existing "Related: [[link1]] [[link2]]..." lines and the new related concepts from the "New Information". Combine these into a single "Related:" line below the summary, ensuring no duplicate links (e.g., "Related: [[link1]] [[link2]] [[new_link]]"). If no related links exist in either source, omit this line.
4.  Add a final line indicating the update time: \`*Last updated on: ${updateTimestamp}*\`. Do not include the original "Generated from chat on..." timestamps or '---' separators from the input content.
5.  Ensure the output is valid Markdown and contains only the merged note content as described.

**Output the merged Markdown content ONLY.**`;

        console.log(`Sending merge prompt to Gemini for note: ${targetFilename}.md`);
        // Use the same noteGenModel for merging
        const mergeResult = await noteGenModel.generateContent(mergePrompt);
        const mergeResponse = await mergeResult.response;
        const mergedContent = mergeResponse.text().trim();

        if (!mergedContent) {
            console.error(`LLM merge returned empty content for ${primaryFilePath}. Skipping update.`);
            // Optionally: Fallback to appending if merge fails? For now, we skip.
        } else {
            // 9. Write Merged Content
            await fs.writeFile(primaryFilePath, mergedContent);
            console.log(`Successfully ${isNewFile ? 'created' : 'updated'} note with merged content: ${primaryFilePath}`);
        }

        // Ensure related concept files exist (Logic remains the same, ensure linking uses the *final* target filename)
        for (const relatedConcept of noteData.relatedConcepts) {
            const sanitizedRC = sanitizeFilename(relatedConcept);
            if (!sanitizedRC || sanitizedRC === '_') continue;

            const relatedFilePath = path.join(userDataDir, `${sanitizedRC}.md`);
            try {
                await fs.access(relatedFilePath);
            } catch (accessError: any) {
                if (accessError.code === 'ENOENT') {
                    // File doesn't exist, create placeholder linking to the *target* file
                    const placeholderContent = `# ${relatedConcept}\\n\\nThis topic was automatically created as a link from [[${targetFilename}]] on ${generationTimestamp}.\\n`;
                    await fs.writeFile(relatedFilePath, placeholderContent);
                    console.log(`Created placeholder note: ${relatedFilePath}`);
                } else {
                    throw accessError; // Re-throw other access errors
                }
            }
        }

    } catch (fileOpError) {
        console.error(`Error performing file operations for note '${targetFilename}':`, fileOpError);
    }

  } catch (error) {
    console.error("Error in createOrUpdateObsidianNote:", error);
  }
}
// --- End Helper Functions ---

// Ensure API key is loaded correctly. Add specific error handling if needed.
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Use gemini-2.5-flash-preview-04-17 for chat
const chatModelName = "gemini-2.5-flash-preview-04-17";
const chatModel = genAI.getGenerativeModel({ model: chatModelName });
console.log(`Using Gemini chat model: ${chatModelName}`); // Log the chat model
// Initialize embedding model
const embeddingModelName = "embedding-001";
const embeddingModel = genAI.getGenerativeModel({ model: embeddingModelName });

// Define the path relative to the project root (where package.json is)
const filePath = path.join(process.cwd(), 'documents.json');

interface Document {
  id: string;
  topic: string; // User's initial prompt or a summary
  content: string; // Combined User + AI conversation snippet
  timestamp: string;
  embedding: number[] | null; // Add embedding field, nullable for backward compatibility
}

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: "Invalid message format" }), { status: 400 });
    }

    // --- RAG: Retrieve relevant context using Embeddings ---
    let documents: Document[] = [];
    let contextString = "";
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      if (fileContent.trim()) { // Check if file is not empty
          documents = JSON.parse(fileContent);
      }
    } catch (error: any) {
      if (error.code === 'ENOENT') { // File doesn't exist yet
        console.log("documents.json not found, will create it.");
      } else { // Other read error
        console.error("Error reading documents.json:", error);
      }
    }

    // Perform RAG search only if documents were loaded successfully
    if (documents.length > 0) {
        try {
            // 1. Get Query Embedding
            const queryEmbeddingResult = await embeddingModel.embedContent(message);
            const queryEmbedding = queryEmbeddingResult.embedding.values;

            // 2. Calculate Similarities
            let mostSimilarDoc: Document | null = null;
            let highestSimilarity = -1; // Cosine similarity ranges from -1 to 1

            // Ensure documents have embeddings before comparing
            const docsWithEmbeddings = documents.filter(doc => doc.embedding && Array.isArray(doc.embedding) && doc.embedding.length > 0);

            if (docsWithEmbeddings.length > 0 && queryEmbedding && queryEmbedding.length > 0) {
                for (const doc of docsWithEmbeddings) {
                    // Ensure doc.embedding is valid before calculating similarity
                    if (doc.embedding && doc.embedding.length > 0) {
                        const similarity = cosineSimilarity(queryEmbedding, doc.embedding);
                        if (similarity > highestSimilarity) {
                            highestSimilarity = similarity;
                            mostSimilarDoc = doc;
                        }
                    }
                }
            } else {
                console.log("No documents with embeddings found or query embedding failed.");
            }


            // 3. Use Context based on threshold
            const SIMILARITY_THRESHOLD = 0.7; // Adjust as needed
            if (mostSimilarDoc && highestSimilarity > SIMILARITY_THRESHOLD) {
              // Limit context length if necessary
              const maxContextLength = 1500; // Slightly increased limit
              const limitedContent = mostSimilarDoc.content.length > maxContextLength ? mostSimilarDoc.content.substring(0, maxContextLength) + '...' : mostSimilarDoc.content;
              contextString = `Context from previous discussion (Topic: ${mostSimilarDoc.topic}, Similarity: ${highestSimilarity.toFixed(4)}):\n${limitedContent}\n\n---\n\n`;
              console.log(`Found relevant context (Doc ID: ${mostSimilarDoc.id}, Similarity: ${highestSimilarity.toFixed(4)}).`);
            } else {
              console.log(`No sufficiently relevant document found (Highest similarity: ${highestSimilarity > -1 ? highestSimilarity.toFixed(4) : 'N/A'}).`);
            }
        } catch (embeddingError) {
            console.error("Error during embedding generation or similarity calculation:", embeddingError);
            // Decide how to handle: proceed without context, or return error?
            // For hackathon, proceeding without context might be okay.
            contextString = ""; // Ensure context is empty on error
        }
    }
    // --- End RAG ---

    // Construct the prompt for Gemini, including context if found
    const userQuery = "User query: " + message;
    // Refined System Prompt (example)
    const systemPrompt = `You are the user's Second Brain assistant.
Use the provided CONTEXT (if any) from previous conversations and your general knowledge to answer the USER QUERY.
Prioritize information from the CONTEXT when relevant. Be concise and helpful.

--- START CONTEXT ---
${contextString || "No relevant context found."}
--- END CONTEXT ---

`;

    const finalPrompt = systemPrompt + userQuery;
    console.log("Prompt sent to Gemini (Chat):\n", finalPrompt); // Log the full prompt for debugging

    // Call Chat Model
    const chatResult = await chatModel.generateContent(finalPrompt);
    const chatResponse = await chatResult.response;
    const aiChatResponseText = chatResponse.text();

    // --- Save the new interaction with Embedding ---
    let newDocEmbedding: number[] | null = null;
    try {
        const docContentToEmbed = `User: ${message}\nAI: ${aiChatResponseText}`; // Embed the full interaction
        const embeddingResult = await embeddingModel.embedContent(docContentToEmbed);
        newDocEmbedding = embeddingResult.embedding.values;
    } catch (embeddingError) {
        console.error("Failed to generate embedding for new document:", embeddingError);
        // Continue saving without embedding if generation fails
    }

     // Generate document data for the *current* interaction
    const newDoc: Document = {
        id: crypto.randomUUID(),
        topic: message.substring(0, 50) + (message.length > 50 ? '...' : ''), // Use first 50 chars of prompt as topic
        content: `User: ${message}\nAI: ${aiChatResponseText}`,
        timestamp: new Date().toISOString(),
        embedding: newDocEmbedding, // Add the generated embedding (or null if failed)
    };

    // Append new document to the *in-memory* list
    // Make sure documents array includes the latest state before appending
    // (Reading again might be safer in concurrent scenarios, but less efficient here)
    documents.push(newDoc);


    // Write the updated list back to the file
    try {
        await fs.writeFile(filePath, JSON.stringify(documents, null, 2)); // Use null, 2 for pretty printing
        console.log(`Successfully saved interaction to documents.json (Total docs: ${documents.length})`);
    } catch (writeError) {
        console.error("Error writing documents.json:", writeError);
        return new Response(JSON.stringify({ error: "Failed to save interaction history" }), { status: 500 });
    }
    // --- End Saving ---

    // --- Start Obsidian Note Creation (Non-blocking) ---
    // We don't await this, so the main response isn't delayed
    createOrUpdateObsidianNote(message, aiChatResponseText, genAI)
      .catch(err => {
          console.error("Background Obsidian note creation failed:", err);
      });
    // --- End Obsidian Note Creation ---

    // Return the chat response to the user
    return new Response(JSON.stringify({ response: aiChatResponseText }), { status: 200 });

  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(JSON.stringify({ error: "An internal server error occurred" }), { status: 500 });
  }
} 