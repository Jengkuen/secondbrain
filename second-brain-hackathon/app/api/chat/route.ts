import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs/promises';
import path from 'path';
import cosineSimilarity from 'cosine-similarity'; // Import cosine similarity

// Ensure API key is loaded correctly. Add specific error handling if needed.
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
// Use gemini-1.5-flash-latest for chat
const chatModel = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest" }); 
// Initialize embedding model
const embeddingModel = genAI.getGenerativeModel({ model: "embedding-001" }); 

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
    console.log("Prompt sent to Gemini:\n", finalPrompt); // Log the full prompt for debugging

    // Call Chat Model
    const result = await chatModel.generateContent(finalPrompt); // Use chatModel
    const response = await result.response;
    const text = response.text();

    // --- Save the new interaction with Embedding ---
    let newDocEmbedding: number[] | null = null;
    try {
        const docContentToEmbed = `User: ${message}\nAI: ${text}`; // Embed the full interaction
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
        content: `User: ${message}\nAI: ${text}`,
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


    return new Response(JSON.stringify({ response: text }), { status: 200 });

  } catch (error) {
    console.error("Error processing chat request:", error);
    return new Response(JSON.stringify({ error: "An internal server error occurred" }), { status: 500 });
  }
} 