import { GoogleGenerativeAI } from "@google/generative-ai";
import { NextRequest, NextResponse } from 'next/server';

// Ensure the API key is loaded from environment variables
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

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

    // 4. Return the AI's response
    // Note: We are not yet saving to documents.json in this step
    return NextResponse.json({ response: text }, { status: 200 });

  } catch (error) {
    console.error("Error in chat API route:", error);
    // It's good practice to check the error type, but for simplicity:
    const errorMessage = error instanceof Error ? error.message : "An unknown error occurred";
    return NextResponse.json({ error: "Failed to get response from AI", details: errorMessage }, { status: 500 });
  }
} 