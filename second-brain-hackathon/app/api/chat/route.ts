import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';
import fs from 'fs/promises';
import path from 'path';

// Ensure the API key is loaded from environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// Define Document interface
interface Document {
  id: string;
  topic: string;
  content: string;
  timestamp: string;
}

// Define file path relative to project root
const filePath = path.join(process.cwd(), 'documents.json');

export async function POST(request: NextRequest) {
  try {
    // 1. Get the user's message from the request body
    const { message } = await request.json();

    if (!message) {
      return NextResponse.json({ error: 'Message is required' }, { status: 400 });
    }

    // 2. Initialize the Gemini model
    // Use a current, recommended model like gemini-1.5-flash-latest
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash-latest"});

    // 3. Call the Gemini API
    const result = await model.generateContent(message);
    const response = await result.response;
    const text = response.text();

    // --- START: Document Saving Logic ---
    // 4. Generate document data
    const newDoc: Document = {
      id: crypto.randomUUID(), // Using web standard crypto
      topic: message, // Simple: use user prompt as topic
      content: `User: ${message}\\nAI: ${text}`, // Store conversation turn
      timestamp: new Date().toISOString()
    };

    // 5. Read existing data
    let documents: Document[] = [];
    try {
      const fileContent = await fs.readFile(filePath, 'utf-8');
      // Ensure file has content before parsing
      if (fileContent.trim()) {
        documents = JSON.parse(fileContent);
        // Ensure it's an array
        if (!Array.isArray(documents)) {
            console.warn("documents.json content was not an array. Resetting.");
            documents = [];
        }
      }
    } catch (error: any) {
        // If the file doesn't exist (ENOENT), it's okay, start fresh.
        if (error.code === 'ENOENT') {
          console.log("documents.json not found, starting fresh.");
        } else {
          // Log other read errors but continue with an empty array
          console.warn("Error reading documents.json:", error);
          // Decide if throwing an error is better:
          // return NextResponse.json({ error: "Failed to read existing documents" }, { status: 500 });
        }
        documents = []; // Initialize as empty array in case of error or empty file
    }

    // 6. Append new document
    documents.push(newDoc);

    // 7. Write back to file
    try {
        await fs.writeFile(filePath, JSON.stringify(documents, null, 2)); // Pretty print JSON
    } catch (writeError) {
        console.error("Error writing to documents.json:", writeError);
        // Return an error response if saving fails
        return NextResponse.json({ error: "Failed to save document" }, { status: 500 });
    }
    // --- END: Document Saving Logic ---

    // 8. Return the AI's response
    return NextResponse.json({ response: text }, { status: 200 });

  } catch (error) {
    console.error("Error in chat API route:", error);
    // It's good practice to check the error type, but for simplicity:
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: "Failed to get response from AI", details: errorMessage }, { status: 500 });
  }
} 