"use client"; // Required for hooks like useState

import { useState, useRef, useEffect } from 'react';

// Define a type for chat messages for better structure
type Message = {
  sender: 'user' | 'ai';
  text: string;
};

export default function Home() {
  const [userInput, setUserInput] = useState<string>('');
  const [chatHistory, setChatHistory] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const chatContainerRef = useRef<HTMLDivElement>(null); // Ref for the chat container

  // Effect to scroll down when chat history changes
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [chatHistory]);

  const handleSendMessage = async () => {
    if (!userInput.trim() || isLoading) return; // Prevent sending while loading or if input is empty

    const newUserMessage: Message = { sender: 'user', text: userInput };
    // Add user message and clear input immediately
    setChatHistory(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      // Call the backend API route
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ message: newUserMessage.text }), // Send the user message text
      });

      if (!response.ok) {
        // Handle HTTP errors
        const errorData = await response.json();
        throw new Error(errorData.error || `HTTP error! status: ${response.status}`);
      }

      const data = await response.json();

      // Add AI response to chat history
      const aiResponse: Message = { sender: 'ai', text: data.response }; // Assuming API returns { response: "..." }
      setChatHistory(prev => [...prev, aiResponse]);

    } catch (error) {
      console.error("Failed to send message:", error);
      // Display error message in chat (optional)
      const errorMessage: Message = {
        sender: 'ai',
        text: `Error: ${error instanceof Error ? error.message : 'Could not get response.'}`,
      };
      setChatHistory(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false); // Stop loading indicator regardless of success/failure
    }
  };

  // Ensure event type matches the <input> element
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setUserInput(event.target.value);
    // Optional: Auto-resize textarea height (simple example)
    event.target.style.height = 'auto';
    event.target.style.height = `${event.target.scrollHeight}px`;
  };

  // Ensure event type matches the <input> element
  const handleKeyPress = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' && !isLoading) {
      // Prevent default Enter behavior (form submission if applicable)
      // event.preventDefault(); // Usually not needed unless inside a <form>
      handleSendMessage();
    }
  };

  return (
    // Main container: Dark background, full height, flex column layout
    <main className="flex min-h-screen flex-col items-center justify-between p-4 md:p-24 bg-gray-800 text-gray-100">
      {/* Chat container: Takes most space, dark background, rounded */}
      <div className="w-full max-w-2xl flex flex-col h-[80vh] bg-gray-900 shadow-md rounded-lg">
        {/* Chat History - Attach the ref here, dark scrollbar */}
        <div ref={chatContainerRef} className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thumb-gray-600 scrollbar-track-gray-900 scrollbar-thin">
          {chatHistory.map((msg, index) => (
            <div key={index} className={`flex ${msg.sender === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[75%] rounded-lg px-4 py-2 ${
                  msg.sender === 'user' ? 'bg-indigo-600 text-white' : 'bg-gray-700 text-gray-200' // Darker AI bubble
                }`}
              >
                {/* Basic rendering, can be enhanced later */}
                {msg.text.split('\n').map((line, i) => (<p key={i}>{line}</p>))}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
               {/* Darker loading bubble */}
               <div className="max-w-[75%] rounded-lg px-4 py-2 bg-gray-700 text-gray-400 animate-pulse">
                 Thinking...
               </div>
            </div>
           )}
        </div>

        {/* Input Area - Dark background, border */}
        <div className="border-t border-gray-700 p-4 bg-gray-800">
          <div className="flex items-center space-x-2">
            {/* Dark input field */}
            <input
              type="text"
              value={userInput}
              onChange={handleInputChange}
              onKeyPress={handleKeyPress}
              placeholder="Type your message..."
              disabled={isLoading}
              className="flex-1 border border-gray-600 rounded-lg px-4 py-2 bg-gray-700 text-gray-100 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent disabled:bg-gray-600 disabled:opacity-70"
            />
            {/* Dark button */}
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !userInput.trim()}
              className="bg-indigo-600 text-white rounded-lg px-4 py-2 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send
            </button>
          </div>
        </div>
      </div>
    </main>
  );
}
