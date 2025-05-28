'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff, Loader2 } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { KnowledgeService } from '@/lib/knowledge';
import type { KnowledgeEntry } from '@/lib/constants';

interface Message {
  id: string;
  content: string;
  isUser: boolean;
  timestamp: Date;
  sources?: KnowledgeEntry[];
  suggestions?: string[];
}

interface ChatInterfaceProps {
  accountId: string;
}

export default function ChatInterface({ accountId }: ChatInterfaceProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      content: "Hi! I'm here to help you organize and find your household information. You can ask me questions like 'Where did we put the Christmas decorations?' or tell me something new like 'We just bought a new dishwasher warranty that expires in 2027'.",
      isUser: false,
      timestamp: new Date(),
      suggestions: [
        "Tell me about home warranties",
        "What restaurants do I like?",
        "Where are important documents?"
      ]
    }
  ]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const knowledgeService = new KnowledgeService(accountId);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const recognition = new (window as any).webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: any) => {
        const transcript = event.results[0][0].transcript;
        setInputValue(transcript);
        setIsListening(false);
      };

      recognition.onerror = () => {
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      setRecognition(recognition);
    }
  }, []);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const handleSendMessage = async (content: string) => {
    if (!content.trim() || !user) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      content: content.trim(),
      isUser: true,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInputValue('');
    setIsLoading(true);

    try {
      // Process user input with OpenAI via API
      const processResponse = await fetch('/api/ai/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'process', input: content }),
      });
      
      if (!processResponse.ok) {
        throw new Error('Failed to process input');
      }
      
      const processedQuery = await processResponse.json();
      
      if (processedQuery.intent === 'store') {
        // Store new information
        await knowledgeService.addKnowledge({
          content: processedQuery.content,
          tags: processedQuery.tags,
          addedBy: user.uid,
        });

        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: `Perfect! I've saved "${processedQuery.content}" with tags: ${processedQuery.tags.map((tag: string) => `#${tag}`).join(', ')}. You'll be able to find it easily whenever you need it.`,
          isUser: false,
          timestamp: new Date(),
          suggestions: [
            "What else can I help you store?",
            "Show me recent entries",
            "Tell me about my stored information"
          ]
        };

        setMessages(prev => [...prev, botMessage]);
      } else {
        // Search for existing information using tags if available
        const searchResults = await knowledgeService.searchKnowledge(
          processedQuery.searchTerms,
          processedQuery.tags.length > 0 ? processedQuery.tags : undefined
        );

        // Generate response using OpenAI via API
        const generateResponse = await fetch('/api/ai/process', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ 
            action: 'generate', 
            input: content, 
            searchResults: searchResults 
          }),
        });
        
        if (!generateResponse.ok) {
          throw new Error('Failed to generate response');
        }
        
        const response = await generateResponse.json();

        const botMessage: Message = {
          id: (Date.now() + 1).toString(),
          content: response.answer,
          isUser: false,
          timestamp: new Date(),
          sources: response.sources,
          suggestions: response.suggestions,
        };

        setMessages(prev => [...prev, botMessage]);
      }
    } catch (error) {
      console.error('Error processing message:', error);
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        content: "Sorry, I had trouble processing that. Could you try rephrasing your question?",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, errorMessage]);
    }

    setIsLoading(false);
  };

  const startListening = () => {
    if (recognition && !isListening) {
      setIsListening(true);
      recognition.start();
    }
  };

  const stopListening = () => {
    if (recognition && isListening) {
      recognition.stop();
      setIsListening(false);
    }
  };

  const handleSuggestionClick = (suggestion: string) => {
    handleSendMessage(suggestion);
  };

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-2 rounded-lg ${
              message.isUser 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-100 text-gray-900'
            }`}>
              <p className="text-sm">{message.content}</p>
              
              {/* Show sources if available */}
              {message.sources && message.sources.length > 0 && (
                <div className="mt-2 pt-2 border-t border-gray-300">
                  <p className="text-xs font-medium">Sources:</p>
                  {message.sources.map((source, index) => (
                    <div key={source.id || index} className="text-xs mt-1 opacity-75">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {source.tags.map((tag: string) => (
                          <span key={tag} className="text-blue-600 font-medium">#{tag}</span>
                        ))}
                      </div>
                      <span>{source.content.substring(0, 100)}...</span>
                    </div>
                  ))}
                </div>
              )}
              
              {/* Show suggestions */}
              {message.suggestions && message.suggestions.length > 0 && (
                <div className="mt-2 space-y-1">
                  {message.suggestions.map((suggestion, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestionClick(suggestion)}
                      className="block w-full text-left text-xs px-2 py-1 bg-white bg-opacity-20 rounded text-gray-700 hover:bg-opacity-30 transition-colors"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
              )}
              
              <p className="text-xs opacity-75 mt-1">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-100 text-gray-900 px-4 py-2 rounded-lg flex items-center space-x-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-sm">Thinking...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input area */}
      <div className="border-t bg-white p-4">
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
              placeholder="Ask a question or share information..."
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              disabled={isLoading}
            />
          </div>
          
          {/* Voice input button */}
          {recognition && (
            <button
              onClick={isListening ? stopListening : startListening}
              className={`px-3 py-2 rounded-lg transition-colors ${
                isListening 
                  ? 'bg-red-500 text-white' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              disabled={isLoading}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
          
          {/* Send button */}
          <button
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        {isListening && (
          <p className="text-sm text-gray-500 mt-2 text-center">
            Listening... Speak now
          </p>
        )}
      </div>
    </div>
  );
} 