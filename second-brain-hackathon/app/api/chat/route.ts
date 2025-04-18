import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from 'fs/promises';
import path from 'path';

// Ensure API key is loaded correctly. Add specific error handling if needed.
if (!process.env.GEMINI_API_KEY) {
  throw new Error("GEMINI_API_KEY environment variable not set");
}
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash-preview-04-17" });

// Define the path relative to the project root (where package.json is)
const filePath = path.join(process.cwd(), 'documents.json');

interface Document {
  id: string;
  topic: string; // User's initial prompt or a summary
  content: string; // Combined User + AI conversation snippet
  timestamp: string;
}

export async function POST(request: Request) {
  try {
    const { message } = await request.json();

    if (!message || typeof message !== 'string') {
      return new Response(JSON.stringify({ error: "Invalid message format" }), { status: 400 });
    }

    // --- RAG: Retrieve relevant context ---
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
        // Decide if we should proceed without context or return an error
        // For hackathon, proceed without context is likely acceptable
      }
    }

    // Perform RAG search only if documents were loaded successfully
    if (documents.length > 0) {
        const userKeywords = message.toLowerCase().split(/\s+/).filter(k => k.length > 2); // Basic split, ignore short words
        // Simple search: find the first document where any keyword appears in the content
        // Consider refining search later (e.g., TF-IDF, embeddings) if needed
        const relevantDoc = documents.find(doc =>
          userKeywords.some(keyword => doc.content.toLowerCase().includes(keyword))
        );

        if (relevantDoc) {
          // Limit context length if necessary
          const maxContextLength = 1000; // Example limit
          const limitedContent = relevantDoc.content.length > maxContextLength ? relevantDoc.content.substring(0, maxContextLength) + '...' : relevantDoc.content;
          contextString = `Context from previous discussion (Topic: ${relevantDoc.topic}):\n${limitedContent}\n\n---\n\n`;
          console.log(`Found relevant context for prompt (Doc ID: ${relevantDoc.id}).`); // Add log for debugging
        } else {
            console.log("No relevant context found for the keywords."); // Add log for debugging
        }
    }
    // --- End RAG ---

    // Construct the prompt for Gemini, including context if found
    const userQuery = "User query: " + message;
    const systemPrompt = "You are the user's Second Brain. The following context represents the history of your conversation with the user. Use *only* this provided context and your general knowledge to answer the user's query. Do not refer to external browser history. Synthesize the context with your knowledge to provide a helpful and personalized answer.\\n\\n---\\n\\n";

    const finalPrompt = systemPrompt + contextString + userQuery;
    // console.log("Sending prompt to Gemini (length: " + finalPrompt.length + ")"); // Log prompt length if needed
    console.log("Prompt sent to Gemini:", finalPrompt); // Log the full prompt

    // Call Gemini
    const result = await model.generateContent(finalPrompt);
    const response = await result.response;
    const text = response.text();

    // --- Save the new interaction ---
     // Generate document data for the *current* interaction
    const newDoc: Document = {
        id: crypto.randomUUID(),
        topic: message.substring(0, 50) + (message.length > 50 ? '...' : ''), // Use first 50 chars of prompt as topic
        content: `User: ${message}\nAI: ${text}`,
        timestamp: new Date().toISOString()
    };

    // Append new document to the *in-memory* list
    documents.push(newDoc);

    // Write the updated list back to the file
    try {
        await fs.writeFile(filePath, JSON.stringify(documents, null, 2)); // Use null, 2 for pretty printing
        console.log(`Successfully saved interaction to documents.json (Total docs: ${documents.length})`); // Add log for debugging
    } catch (writeError) {
        console.error("Error writing documents.json:", writeError);
        // Return an error to the client as saving failed
        return new Response(JSON.stringify({ error: "Failed to save interaction history" }), { status: 500 });
    }
    // --- End Saving ---


    return new Response(JSON.stringify({ response: text }), { status: 200 });

  } catch (error) {
    console.error("Error processing chat request:", error);
    // Provide a more generic error message to the client
    return new Response(JSON.stringify({ error: "An internal server error occurred" }), { status: 500 });
  }
} 