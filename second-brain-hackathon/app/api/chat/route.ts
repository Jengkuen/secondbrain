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
  genAIInstance: GoogleGenerativeAI
) {
  const userDataDir = path.join(process.cwd(), 'userData');
  // Use a model suitable for complex instruction following / structured output
  const noteGenModelName = "gemini-2.5-flash-preview-04-17"; // Reverted back from 1.5-pro as it caused 404
  const noteGenModel = genAIInstance.getGenerativeModel({ model: noteGenModelName });
  console.log(`Using Gemini note generation model: ${noteGenModelName}`);

  try {
    // 1. Ensure userData directory exists
    await fs.mkdir(userDataDir, { recursive: true });

    // 2. Prompt for Entity Extraction and File Structure Suggestion
    //    Input: User's raw message.
    //    Output: Structured list of actions (CREATE_PERSON, CREATE_EVENT, CREATE_JOURNAL).
    const extractionPrompt = `Analyze the following user message and identify key entities like people, events, places, and specific dates. Based on these entities, suggest a structured way to store this information as separate Markdown files.

User Message: "${message}"

Instructions:
1.  Identify Persons: List any names mentioned.
2.  Identify Events: List any specific events, meetings, or occasions mentioned.
3.  Identify Dates: Extract any specific dates (try to format as YYYY-MM-DD).
4.  Identify the Core Subject/Action: Briefly describe what the message is about (e.g., "Meeting friend", "Learned concept", "Attended event").
5.  Suggest File Actions: Based on the identified entities, generate a list of actions to create corresponding Markdown files. Use the following formats ONLY:
    *   For a person: \`CREATE_PERSON: [Person's Name]\`
    *   For an event: \`CREATE_EVENT: [Event Name]\`
    *   For a dated journal entry: \`CREATE_JOURNAL: [YYYY-MM-DD]\` (Use the core subject as context for the journal).

Return the result ONLY as a single, strictly valid JSON object. Do NOT include any text, explanations, or markdown formatting (like \`\`\`json) before or after the JSON object itself. The entire response must be ONLY the JSON object.

Example User Message: "John doe is my friend, he's a cool guy i met on 18 April 2025 at the Signal fire hackathon!"
Example JSON Output:
{
  "persons": ["John Doe"],
  "events": ["Signal fire hackathon"],
  "dates": ["2025-04-18"],
  "coreSubject": "Meeting friend John Doe at Signal fire hackathon",
  "fileActions": [
    "CREATE_PERSON: John Doe",
    "CREATE_EVENT: Signal fire hackathon",
    "CREATE_JOURNAL: 2025-04-18"
  ]
}`;

    console.log("Sending entity extraction prompt to Gemini...");
    const extractionResult = await noteGenModel.generateContent(extractionPrompt);
    const extractionResponse = await extractionResult.response;
    const rawJsonText = extractionResponse.text().trim();

    // 3. Parse LLM Response for File Actions
    let extractionData: {
        persons: string[];
        events: string[];
        dates: string[];
        coreSubject: string;
        fileActions: string[];
    };
    try {
        // More robust JSON extraction: find the first { and last }
        const jsonMatch = rawJsonText.match(/\{[\s\S]*\}/);
        if (!jsonMatch || !jsonMatch[0]) {
             throw new Error("Could not find JSON object boundaries ({...}) in the LLM response.");
        }
        const extractedJson = jsonMatch[0];
        extractionData = JSON.parse(extractedJson);
        console.log("Extracted File Actions Data:", extractionData);
        // Basic validation after successful parse
        if (!Array.isArray(extractionData.fileActions)) {
            throw new Error("Parsed JSON is missing 'fileActions' array.");
        }
    } catch (parseError: any) {
        console.error("Failed to parse JSON from entity extraction LLM:", parseError);
        console.error("Original Raw response was:", rawJsonText); // Log the original raw text
        return; // Stop processing if parsing fails
    }

    // 4. Process File Actions - Create Markdown files
    const generationTimestamp = new Date().toISOString();

    for (const action of extractionData.fileActions) {
        const parts = action.split(': ');
        if (parts.length < 2) continue; // Skip malformed actions

        const actionType = parts[0];
        const entityName = parts.slice(1).join(': '); // Re-join in case name had colons
        const sanitizedFilename = sanitizeFilename(entityName);

        if (!sanitizedFilename || sanitizedFilename === '_') {
             console.warn(`Skipping action due to invalid sanitized filename for entity: ${entityName}`);
             continue;
        }

        const filePath = path.join(userDataDir, `${sanitizedFilename}.md`);
        let fileExists = false;
        let existingContent = '';

        // Check if file exists and read content if it does
        try {
            existingContent = await fs.readFile(filePath, 'utf-8');
            fileExists = true;
        } catch (readError: any) {
            if (readError.code !== 'ENOENT') {
                console.error(`Error reading file ${filePath} before potential update:`, readError);
                continue; // Skip this action on unexpected read error
            }
            // ENOENT means file doesn't exist, fileExists remains false
        }

        // Prepare the block of new information (for create or update)
        const updateTimestamp = new Date().toISOString();
        const relatedLinks = extractionData.fileActions
            .map(a => {
                const actionParts = a.split(': ');
                if (actionParts.length < 2) return null;
                const otherEntity = actionParts.slice(1).join(': ');
                const otherFilename = sanitizeFilename(otherEntity);
                // Don't link to self
                return (otherFilename && otherFilename !== '_' && otherFilename !== sanitizedFilename) ? `[[${otherFilename}]]` : null;
            })
            .filter(link => link !== null)
            .join(' ');

        // Use a clear separator and context for the new info
        let newInfoBlock = `\n\n---\n\n**Context from ${updateTimestamp}:**\nOriginally mentioned in relation to: "${extractionData.coreSubject}"\n\nUser Input:\n\`\`\`\n${message}\n\`\`\`\n`;
        if (relatedLinks) {
            newInfoBlock += `\nRelated: ${relatedLinks}\n`;
        }

        try {
            if (fileExists) {
                // --- Update existing file --- //
                console.log(`Note for "${entityName}" (${filePath}) already exists. Attempting merge.`);

                // Prepare Merge Prompt for LLM
                const mergePrompt = `Given the existing Markdown note content and new information derived from a recent conversation, please merge them intelligently into a single, updated note.

**Existing Note Content:**
\`\`\`markdown
${existingContent}
\`\`\`

**New Information Block (Context from recent interaction):**
\`\`\`markdown
${newInfoBlock}  // This block contains the latest user input, context, and related links from the *new* interaction.
\`\`\`

**Instructions:**
1.  Keep the main title (the first line starting with '#').
2.  Analyze the existing summary/content under the title and the information in the "New Information Block".
3.  Synthesize these into a single, comprehensive, and updated summary paragraph reflecting the *current, combined understanding* of the topic. Place this synthesized summary directly after the title (potentially under a "## Summary" heading if appropriate).
4.  Identify any existing "Related: [[link1]] [[link2]]..." lines and the new related concepts from the "New Information Block". Combine these into a single "Related:" line below the summary, ensuring no duplicate links. If no related links exist in either source, omit this line.
5.  Ensure the correct tag (e.g., #person, #event, #journal - likely already present in existing content, but verify) is present near the bottom.
6.  Add a final line indicating the update time: \`*Last updated on: ${updateTimestamp}*\`. Remove any previous "Created on" or "Last updated on" lines.
7.  Ensure the output is valid Markdown and contains ONLY the merged and updated note content as described.

**Output the updated Markdown content ONLY.**`;

                console.log(`Sending merge prompt to Gemini for note: ${sanitizedFilename}.md`);
                const mergeResult = await noteGenModel.generateContent(mergePrompt);
                const mergeResponse = await mergeResult.response;
                const mergedContent = mergeResponse.text().trim();

                if (!mergedContent) {
                    console.error(`LLM merge returned empty content for ${filePath}. Skipping update.`);
                    // Fallback? Append newInfoBlock as before?
                    // const fallbackContent = existingContent + "\n\n---\n\n## Update Failed - Appending Raw Context\n" + newInfoBlock;
                    // await fs.writeFile(filePath, fallbackContent);
                } else {
                    // Write the merged content from the LLM
                    await fs.writeFile(filePath, mergedContent);
                    console.log(`Successfully updated note with merged content: ${filePath}`);
                }

            } else {
                // --- Create new file --- //
                let tag = '';
                let title = '';
                let initialSummary = extractionData.coreSubject || "Initial context."; // Use coreSubject as initial summary

                switch (actionType) {
                    case 'CREATE_PERSON':
                        title = `# ${entityName}`;
                        tag = '#person';
                        break;
                    case 'CREATE_EVENT':
                        title = `# ${entityName}`;
                        tag = '#event';
                        break;
                    case 'CREATE_JOURNAL':
                        const titleDate = entityName.match(/^\\d{4}-\\d{2}-\\d{2}$/) ? entityName : sanitizedFilename;
                        title = `# Journal Entry: ${titleDate}`;
                        tag = '#journal';
                        break;
                    default:
                        console.warn(`Unknown action type: ${actionType}`);
                        continue; // Skip unknown actions
                }

                // Construct the initial content with structure
                const initialContent = `${title}

## Summary
${initialSummary}

## Context
${newInfoBlock.replace('**Context from', 'Initial context from').replace(/^\n\n---\n\n/, '')} 

${tag}

*Created on: ${updateTimestamp}*`;

                await fs.writeFile(filePath, initialContent);
                console.log(`Successfully created note: ${filePath} with tag ${tag}`);
            }
        } catch (fileOpError) {
            console.error(`Error writing file during ${fileExists ? 'update' : 'creation'} for action "${action}" on file ${filePath}:`, fileOpError);
            // Continue with the next action even if one fails
        }
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

    // --- RAG: Retrieve relevant context using Embeddings --- //
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
            contextString = ""; // Ensure context is empty on error
        }
    }
    // --- End RAG ---

    // Construct the prompt for Gemini, including context if found
    const userQuery = "User query: " + message;
    const systemPrompt = `You are the user's Second Brain assistant.
Use the provided CONTEXT (if any) from previous conversations and your general knowledge to answer the USER QUERY.
Prioritize information from the CONTEXT when relevant. Be concise and helpful.

--- START CONTEXT ---
${contextString || "No relevant context found."}
--- END CONTEXT ---

`;

    const finalPrompt = systemPrompt + userQuery;
    console.log("Prompt sent to Gemini (Chat):\n", finalPrompt);

    // Call Chat Model
    const chatResult = await chatModel.generateContent(finalPrompt);
    const chatResponse = await chatResult.response;
    const aiChatResponseText = chatResponse.text();

    // --- Save the new interaction with Embedding --- //
    let newDocEmbedding: number[] | null = null;
    try {
        const docContentToEmbed = `User: ${message}\nAI: ${aiChatResponseText}`; // Embed the full interaction
        const embeddingResult = await embeddingModel.embedContent(docContentToEmbed);
        newDocEmbedding = embeddingResult.embedding.values;
    } catch (embeddingError) {
        console.error("Failed to generate embedding for new document:", embeddingError);
        // Continue saving without embedding if generation fails
    }

    const newDoc: Document = {
        id: crypto.randomUUID(),
        topic: message.substring(0, 50) + (message.length > 50 ? '...' : ''), // Use first 50 chars of prompt as topic
        content: `User: ${message}\nAI: ${aiChatResponseText}`,
        timestamp: new Date().toISOString(),
        embedding: newDocEmbedding, // Add the generated embedding (or null if failed)
    };

    // Read documents again before pushing to avoid potential race conditions if multiple requests happen
    // Although for this app, it might be unlikely. A more robust solution might use a DB.
    let currentDocuments: Document[] = [];
    try {
      const currentFileContent = await fs.readFile(filePath, 'utf-8');
      if (currentFileContent.trim()) {
          currentDocuments = JSON.parse(currentFileContent);
      }
    } catch (readError: any) {
       if (readError.code !== 'ENOENT') {
         console.error("Error reading documents.json before final save:", readError);
         // Decide if we should proceed with potentially outdated documents array or error out
       }
       // If ENOENT or error, currentDocuments remains empty or potentially outdated from above
       // For simplicity here, we'll use the potentially outdated `documents` array read earlier.
       currentDocuments = documents; // Fallback to the array read at the start of POST
    }

    currentDocuments.push(newDoc);

    // Write the updated list back to the file
    try {
        await fs.writeFile(filePath, JSON.stringify(currentDocuments, null, 2));
        console.log(`Successfully saved interaction to documents.json (Total docs: ${currentDocuments.length})`);
    } catch (writeError) {
        console.error("Error writing documents.json:", writeError);
        // Don't necessarily stop the whole process, maybe just log it?
        // For now, return error to indicate save failure
        return new Response(JSON.stringify({ error: "Failed to save interaction history" }), { status: 500 });
    }
    // --- End Saving ---

    // --- Start Obsidian Note Creation (Non-blocking) --- //
    // Call the updated function which handles create/update
    createOrUpdateObsidianNote(message, genAI)
      .catch(err => {
          console.error("Background Obsidian note creation/update failed:", err);
      });
    // --- End Obsidian Note Creation ---

    // Return the chat response to the user
    return new Response(JSON.stringify({ response: aiChatResponseText }), { status: 200 });

  } catch (error) {
    console.error("Error processing chat request in POST:", error);
    return new Response(JSON.stringify({ error: "An internal server error occurred" }), { status: 500 });
  }
}