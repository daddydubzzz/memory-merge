'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Send, MessageCircle, Sparkles } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { KnowledgeService } from '@/lib/knowledge';
import { checkStorageConfidence, isStorageIntent } from '@/lib/storage-confidence';
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
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const knowledgeService = new KnowledgeService(accountId);
  
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
      
      // Check confidence thresholds before proceeding with storage
      if (isStorageIntent(processedQuery.intent)) {
        const confidenceCheck = checkStorageConfidence(processedQuery);
        
        if (!confidenceCheck.shouldProceed) {
          // Handle low confidence with clarification request
          console.log('🚫 Confidence too low:', confidenceCheck.reason);
          
          const clarificationMessage: Message = {
            id: (Date.now() + 1).toString(),
            content: confidenceCheck.clarificationPrompt || "I need more clarification to help you properly.",
            isUser: false,
            timestamp: new Date(),
            suggestions: confidenceCheck.suggestions || [
              "Try being more specific",
              "Add more details",
              "Rephrase your request"
            ]
          };
          
          setMessages(prev => [...prev, clarificationMessage]);
          setIsLoading(false);
          return; // Exit early, don't proceed with storage
        }
        
        console.log('✅ Confidence check passed:', {
          intent: processedQuery.intent,
          confidence: Math.round(processedQuery.confidence * 100) + '%'
        });
      }
      
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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-100 relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-gradient-to-r from-blue-200/20 to-purple-200/20 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-gradient-to-r from-pink-200/15 to-orange-200/15 rounded-full blur-3xl animate-pulse delay-1000"></div>
      </div>

      <div className="relative flex flex-col h-full">
        {/* Header */}
        <div className="bg-white/80 backdrop-blur-xl border-b border-gray-200/50 p-6 shadow-sm">
          <div className="max-w-4xl mx-auto flex items-center">
            <div className="w-12 h-12 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25 mr-4">
              <MessageCircle className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-3xl font-bold bg-gradient-to-r from-gray-900 via-purple-900 to-pink-900 bg-clip-text text-transparent">
                Chat Assistant
              </h1>
              <p className="text-gray-600/80 text-lg">
                Ask questions or store new memories
              </p>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto">
          <div className="max-w-4xl mx-auto p-6 space-y-6">
            {messages.length === 0 && (
              <div className="text-center py-16">
                <div className="w-16 h-16 bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl flex items-center justify-center shadow-lg shadow-purple-500/25 mx-auto mb-6">
                  <Sparkles className="w-8 h-8 text-white" />
                </div>
                <h3 className="text-2xl font-bold text-gray-800 mb-3">Welcome to Memory Merge!</h3>
                <p className="text-gray-600 mb-6 max-w-md mx-auto">
                  I&apos;m your AI assistant. Ask me questions about your stored memories or share new information to remember.
                </p>
              </div>
            )}

            {messages.map((message) => (
              <div key={message.id} className={`flex ${message.isUser ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-xs lg:max-w-2xl ${
                  message.isUser 
                    ? 'bg-gradient-to-r from-blue-600 to-purple-600 text-white shadow-lg shadow-blue-500/25' 
                    : 'bg-white/80 backdrop-blur-xl text-gray-900 border border-white/20 shadow-lg shadow-gray-500/5'
                } px-6 py-4 rounded-2xl transition-all duration-200 hover:shadow-xl`}>
                  <p className="text-base leading-relaxed">{message.content}</p>
                  
                  {/* Enhanced sources display */}
                  {message.sources && message.sources.length > 0 && (
                    <div className="mt-4 pt-4 border-t border-gray-200/50">
                      <p className="text-sm font-semibold text-gray-700 mb-3 flex items-center">
                        <span className="w-2 h-2 bg-blue-500 rounded-full mr-2"></span>
                        Found in your knowledge:
                      </p>
                      <div className="space-y-2">
                        {message.sources.map((source, index) => (
                          <div key={source.id || index} className="bg-gray-50/80 backdrop-blur-sm rounded-xl p-3 border border-gray-200/50">
                            <div className="flex flex-wrap gap-1 mb-2">
                              {source.tags.map((tag: string, tagIndex) => (
                                <span key={tag} className={`inline-flex items-center px-2 py-1 rounded-lg text-xs font-medium ${
                                  tagIndex % 3 === 0 
                                    ? 'bg-blue-100 text-blue-700' 
                                    : tagIndex % 3 === 1
                                    ? 'bg-green-100 text-green-700'
                                    : 'bg-purple-100 text-purple-700'
                                }`}>
                                  {tag}
                                </span>
                              ))}
                            </div>
                            <span className="text-sm text-gray-700">{source.content.substring(0, 120)}...</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  
                  <p className={`text-xs mt-3 ${message.isUser ? 'text-white/70' : 'text-gray-500'}`}>
                    {message.timestamp.toLocaleTimeString()}
                  </p>
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-white/80 backdrop-blur-xl border border-white/20 text-gray-900 px-6 py-4 rounded-2xl flex items-center space-x-3 shadow-lg">
                  <div className="flex space-x-1">
                    <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-bounce"></div>
                    <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.1s' }}></div>
                    <div className="w-3 h-3 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }}></div>
                  </div>
                  <span className="text-base font-medium">AI is thinking...</span>
                </div>
              </div>
            )}
            
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Enhanced Input area - Mobile Optimized */}
        <div className="bg-white/90 backdrop-blur-xl border-t border-gray-200/50 shadow-lg">
          {/* Mobile-first responsive padding */}
          <div className="p-4 sm:p-6">
            <div className="max-w-4xl mx-auto">
              <div className="flex flex-col sm:flex-row space-y-3 sm:space-y-0 sm:space-x-3">
                {/* Enhanced input area */}
                <div className="flex-1 relative group">
                  <textarea
                    value={inputValue}
                    onChange={(e) => setInputValue(e.target.value)}
                    onKeyPress={(e) => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault();
                        handleSendMessage(inputValue);
                      }
                    }}
                    placeholder="Ask a question or share information..."
                    rows={3}
                    className="w-full px-5 py-4 bg-gray-50/50 border border-gray-200/50 rounded-2xl focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500/50 focus:bg-white/90 transition-all duration-200 text-gray-900 placeholder-gray-400 text-base leading-6 resize-none group-focus-within:shadow-lg min-h-[3.5rem] sm:min-h-[2.75rem]"
                    disabled={isLoading}
                    style={{ maxHeight: '8rem' }}
                  />
                  
                  {/* Character count for long messages */}
                  {inputValue.length > 100 && (
                    <div className="absolute right-3 bottom-3 text-xs text-gray-400 bg-white/90 px-2 py-1 rounded-lg shadow-sm">
                      {inputValue.length}
                    </div>
                  )}
                  
                  {/* Mobile helper text */}
                  <div className="mt-2 text-xs text-gray-500 text-center sm:text-left">
                    Press Enter to send • Shift+Enter for new line
                  </div>
                </div>
                
                {/* Send button - Mobile optimized */}
                <div className="flex justify-end">
                  <button
                    onClick={() => handleSendMessage(inputValue)}
                    disabled={!inputValue.trim() || isLoading}
                    className="px-6 py-4 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white rounded-2xl font-semibold disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-200 shadow-lg shadow-blue-500/25 hover:shadow-xl active:scale-95 min-h-[3.5rem] sm:min-h-[2.75rem] flex items-center justify-center touch-manipulation select-none"
                    title="Send message"
                    style={{ 
                      WebkitTapHighlightColor: 'transparent',
                      touchAction: 'manipulation'
                    }}
                  >
                    <Send className="w-5 h-5" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
} 