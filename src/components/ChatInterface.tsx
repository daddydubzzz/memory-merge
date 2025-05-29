'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, MicOff } from 'lucide-react';
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
  
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [recognition, setRecognition] = useState<SpeechRecognition | null>(null);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const knowledgeService = new KnowledgeService(accountId);

  // Initialize speech recognition
  useEffect(() => {
    if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
      const recognition = new (window as unknown as { webkitSpeechRecognition: new () => SpeechRecognition }).webkitSpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event: SpeechRecognitionEvent) => {
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
      
      if (processedQuery.intent === 'store' || processedQuery.intent === 'update' || processedQuery.intent === 'purchase' || processedQuery.intent === 'clear_list') {
        // Handle shopping list operations
        if (processedQuery.intent === 'purchase') {
          // Mark items as purchased (remove from shopping list)
          await knowledgeService.handleItemPurchase(processedQuery.items || [], processedQuery.tags);
          
          const items = processedQuery.items || [];
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: `Perfect! I've marked ${items.join(', ')} as purchased and removed them from your shopping list. You'll be able to find this purchase record easily whenever you need it.`,
            isUser: false,
            timestamp: new Date(),
            suggestions: [
              "What else do I need from the store?",
              "Show me my shopping list",
              "Add more items to my list"
            ]
          };
          setMessages(prev => [...prev, botMessage]);
          
        } else if (processedQuery.intent === 'clear_list') {
          // Clear entire list
          await knowledgeService.clearShoppingList(processedQuery.listType || 'shopping');
          
          const listType = processedQuery.listType || 'shopping';
          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: `Perfect! I've cleared your ${listType} list. All items have been marked as inactive. You can start fresh with new items anytime!`,
            isUser: false,
            timestamp: new Date(),
            suggestions: [
              "Add new items to my list",
              "Show me what I purchased recently",
              "Help me plan my next shopping trip"
            ]
          };
          setMessages(prev => [...prev, botMessage]);
          
        } else {
          // Store new information or update existing information (original logic)
          await knowledgeService.addKnowledge({
            content: processedQuery.content,
            tags: processedQuery.tags,
            addedBy: user.uid,
            // Pass revision fields for updates
            intent: processedQuery.intent,
            replaces: processedQuery.replaces,
            timestamp: processedQuery.timestamp || new Date().toISOString(),
            // Pass shopping fields if present
            items: processedQuery.items,
            listType: processedQuery.listType
          });

          const isUpdate = processedQuery.intent === 'update';
          const actionWord = isUpdate ? 'updated' : 'saved';
          const updateNote = isUpdate && processedQuery.replaces 
            ? ` (replacing previous ${processedQuery.replaces} information)` 
            : '';

          const botMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: `Perfect! I've ${actionWord} "${processedQuery.content}" with tags: ${processedQuery.tags.map((tag: string) => `#${tag}`).join(', ')}${updateNote}. You'll be able to find it easily whenever you need it.`,
            isUser: false,
            timestamp: new Date(),
            suggestions: [
              "What else can I help you store?",
              "Show me recent entries",
              "Tell me about my stored information"
            ]
          };

          setMessages(prev => [...prev, botMessage]);
        }
      } else {
        // Search for existing information using tags if available
        let searchResults: KnowledgeEntry[] = [];
        
        // Special handling for shopping list queries
        const isShoppingQuery = processedQuery.tags.some((tag: string) => ['shopping', 'groceries'].includes(tag)) && 
                               processedQuery.intent === 'retrieve';
        
        if (isShoppingQuery) {
          // Use specialized shopping list method for accurate results
          console.log('🛍️ Detected shopping list query, using getActiveShoppingList');
          searchResults = await knowledgeService.getActiveShoppingList();
        } else {
          // Use general search for other queries
          searchResults = await knowledgeService.searchKnowledge(
            processedQuery.searchTerms,
            processedQuery.tags.length > 0 ? processedQuery.tags : undefined
          );
        }

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

  return (
    <div className="flex flex-col h-full bg-white">
      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((message) => (
          <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs lg:max-w-md px-4 py-3 rounded-lg ${
              message.isUser 
                ? 'bg-blue-500 text-white' 
                : 'bg-gray-50 text-gray-900 border border-gray-200'
            }`}>
              <p className="text-sm leading-relaxed">{message.content}</p>
              
              {/* Enhanced sources display */}
              {message.sources && message.sources.length > 0 && (
                <div className="mt-3 pt-3 border-t border-gray-300">
                  <p className="text-xs font-medium text-gray-600 mb-2">Found in your knowledge:</p>
                  {message.sources.map((source, index) => (
                    <div key={source.id || index} className="bg-white rounded p-2 mb-2 last:mb-0">
                      <div className="flex flex-wrap gap-1 mb-1">
                        {source.tags.map((tag: string) => (
                          <span key={tag} className="inline-flex items-center px-1.5 py-0.5 rounded text-xs bg-blue-100 text-blue-700">
                            {tag}
                          </span>
                        ))}
                      </div>
                      <span className="text-xs text-gray-600">{source.content.substring(0, 100)}...</span>
                    </div>
                  ))}
                </div>
              )}
              
              <p className="text-xs opacity-60 mt-2">
                {message.timestamp.toLocaleTimeString()}
              </p>
            </div>
          </div>
        ))}
        
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-gray-50 border border-gray-200 text-gray-900 px-4 py-3 rounded-lg flex items-center space-x-3">
              <div className="flex space-x-1">
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce"></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                <div className="w-2 h-2 bg-blue-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
              </div>
              <span className="text-sm">AI is thinking...</span>
            </div>
          </div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Enhanced Input area */}
      <div className="border-t bg-white p-4">
        <div className="flex space-x-2">
          <div className="flex-1 relative">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSendMessage(inputValue)}
              placeholder="Ask a question or share information..."
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm text-gray-900 placeholder-gray-500 bg-white"
              disabled={isLoading}
            />
            {/* Character count for long messages */}
            {inputValue.length > 100 && (
              <div className="absolute right-3 top-1/2 transform -translate-y-1/2 text-xs text-gray-400">
                {inputValue.length}
              </div>
            )}
          </div>
          
          {/* Enhanced voice button */}
          {recognition && (
            <button
              onClick={isListening ? stopListening : startListening}
              className={`px-3 py-3 rounded-lg transition-all ${
                isListening 
                  ? 'bg-red-500 text-white shadow-lg' 
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              disabled={isLoading}
              title={isListening ? 'Stop listening' : 'Start voice input'}
            >
              {isListening ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
            </button>
          )}
          
          {/* Enhanced send button */}
          <button
            onClick={() => handleSendMessage(inputValue)}
            disabled={!inputValue.trim() || isLoading}
            className="px-4 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
        
        {/* Enhanced listening indicator */}
        {isListening && (
          <div className="mt-2 text-center">
            <div className="inline-flex items-center text-sm text-red-600">
              <div className="w-2 h-2 bg-red-500 rounded-full mr-2 animate-pulse"></div>
              Listening... Speak now
            </div>
          </div>
        )}
      </div>
    </div>
  );
} 