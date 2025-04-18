"use client"; // Required for hooks like useState

import { useState } from 'react';

// Define a type for chat messages for better structure
type Message = {
  sender: 'user' | 'ai';
  text: string;
};

export default function Home() {
  const [userInput, setUserInput] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);

  const handleSendMessage = async () => {
    if (!userInput.trim()) return;

    const newUserMessage: Message = { sender: 'user', text: userInput };
    // Prepend new messages to the start of the array for typical chat flow
    setChatHistory(prev => [newUserMessage, ...prev]);
    setUserInput('');
    setIsLoading(true);

    // --- API Call placeholder ---
    // Simulating AI response for development
    // This part will be replaced with the actual fetch call later
    try {
       // Simulate network delay
       await new Promise(resolve => setTimeout(resolve, 1500));
       // Simulate receiving an AI response
       const aiResponse: Message = { sender: 'ai', text: `Simulated response based on: "${newUserMessage.text}"` };
       // Prepend AI response WITHOUT removing the user message
       setChatHistory(prev => [aiResponse, ...prev]);

       // A slightly better way to handle optimistic + final state:
       // setChatHistory(prev => [newUserMessage, ...prev]); // Optimistic User
       // // ... fetch logic ...
       // .then(response => {
       //   const aiMessage = { sender: 'ai', text: response.data };
       //   setChatHistory(prev => [aiMessage, ...prev]); // Add AI message
       // })

    } catch (error) {
      console.error("Error sending message:", error);
      const errorResponse: Message = { sender: 'ai', text: 'Sorry, something went wrong.' };
      // Replace user message with error message in case of failure
      setChatHistory(prev => [errorResponse, ...prev.slice(1)]);
    } finally {
        setIsLoading(false);
    }
    // --- End of API Call placeholder ---

  };

  // Adjusted for Textarea
  const handleInputChange = (event: React.ChangeEvent<HTMLTextAreaElement>) => {
    setUserInput(event.target.value);
    // Optional: Auto-resize textarea height (simple example)
    event.target.style.height = 'auto';
    event.target.style.height = `${event.target.scrollHeight}px`;
  };

  // Adjusted for Textarea (Shift+Enter for newline, Enter to send)
  const handleKeyPress = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !isLoading) {
      event.preventDefault(); // Prevent newline on Enter
      handleSendMessage();
    }
  };

  return (
    // Main container: Dark background, full height, flex column layout
    <main className="flex h-screen flex-col items-center bg-gray-800 text-gray-100">
      {/* Chat container: Takes most space, centers content, adds padding */}
      <div className="flex-1 w-full max-w-3xl flex flex-col p-4">
        {/* Chat History: Reverse flex order, scrollable, spacing */}
        <div className="flex-1 flex flex-col-reverse overflow-y-auto mb-4 space-y-4 space-y-reverse scrollbar-thumb-gray-600 scrollbar-track-gray-800 scrollbar-thin">
          {isLoading && (
            // Loading indicator bubble
            <div className="flex justify-start">
               <div className="max-w-[75%] rounded-lg px-4 py-3 bg-gray-700 animate-pulse">
                 <span className="inline-block w-3 h-3 bg-gray-400 rounded-full mr-1 animate-bounce"></span>
                 <span className="inline-block w-3 h-3 bg-gray-400 rounded-full mr-1 animate-bounce delay-75"></span>
                 <span className="inline-block w-3 h-3 bg-gray-400 rounded-full animate-bounce delay-150"></span>
               </div>
            </div>
           )}
          {chatHistory.map((msg, index) => (
            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                // Chat bubble styling: Different backgrounds for user/AI, padding, rounded corners
                className={`max-w-[80%] rounded-xl px-4 py-3 shadow-md whitespace-pre-wrap ${ // whitespace-pre-wrap preserves newlines
                  msg.sender === 'user' ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'
                }`}
              >
                {msg.text}
              </div>
            </div>
          ))}
        </div>

        {/* Input Area: Stick to bottom, dark background, padding */}
        <div className="mt-auto p-4 bg-gray-800 sticky bottom-0 w-full max-w-3xl mx-auto">
          <div className="flex items-start bg-gray-700 rounded-lg shadow-inner p-2"> {/* Use items-start for textarea alignment */}
            {/* Textarea for input: Dark background, light text, auto-resizing */}
            <textarea
              value={userInput}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Send a message (Shift+Enter for newline)..."
              disabled={isLoading}
              className="flex-1 bg-transparent border-none text-gray-100 placeholder-gray-400 px-4 py-2 focus:outline-none focus:ring-0 resize-none disabled:opacity-50 overflow-y-auto max-h-40" // Added max-h-40
              rows={1} // Start with one row
            />
            {/* Send button: Aligned with textarea top */}
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !userInput.trim()}
              className="bg-blue-600 text-white rounded-md p-2 ml-2 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {/* Simple Send Icon (Heroicons Outline ArrowUp) */}
              <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor" className="w-5 h-5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5 12 3m0 0 7.5 7.5M12 3v18" />
              </svg>
            </button>
          </div>
           {/* Small note about context limitation */}
           <p className="text-xs text-gray-400 text-center pt-2">Context is not persistent between page loads in this demo.</p>
        </div>
      </div>
    </main>
  );
}
