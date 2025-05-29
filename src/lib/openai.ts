import OpenAI from 'openai';
import { z } from 'zod';
import type { KnowledgeEntry } from './constants';

// Create OpenAI client - this should only be used server-side
function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Export interfaces from constants
export type { KnowledgeEntry } from './constants';

// Updated Zod schemas for tag-based validation with revision and shopping support
const ProcessedQuerySchema = z.object({
  intent: z.enum(['store', 'retrieve', 'update', 'unclear', 'purchase', 'clear_list']),
  tags: z.array(z.string()).min(1).max(4),
  content: z.string(),
  searchTerms: z.array(z.string()),
  confidence: z.number().min(0).max(1),
  // New revision fields
  replaces: z.string().optional(), // Tag or ID being replaced
  timestamp: z.string().optional(), // ISO string timestamp
  // New shopping list fields
  items: z.array(z.string()).optional(), // Individual items for shopping lists
  listType: z.string().optional() // e.g., "shopping", "grocery", "todo"
});

const QueryResponseSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  suggestions: z.array(z.string())
});

export interface ProcessedQuery {
  intent: 'store' | 'retrieve' | 'update' | 'unclear' | 'purchase' | 'clear_list';
  tags: string[];
  content: string;
  searchTerms: string[];
  confidence: number;
  // New revision fields
  replaces?: string; // Tag or ID being replaced
  timestamp?: string; // ISO string timestamp
  // New shopping list fields
  items?: string[]; // Individual items for shopping lists
  listType?: string; // e.g., "shopping", "grocery", "todo"
}

export interface QueryResponse {
  answer: string;
  confidence: number;
  sources: KnowledgeEntry[];
  suggestions: string[];
}

// Updated function definition for tag-based processing with revision and shopping support
const tagProcessingFunction = {
  name: "process_user_input",
  description: "Analyze user input to determine intent and generate relevant tags for a knowledge management system with revision and shopping list support",
  parameters: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["store", "retrieve", "update", "unclear", "purchase", "clear_list"],
        description: "Intent: 'store' for new info, 'retrieve' for search, 'update' when replacing/changing existing info, 'purchase' when marking items as bought, 'clear_list' for bulk operations, 'unclear' if uncertain"
      },
      tags: {
        type: "array",
        items: { type: "string" },
        minItems: 1,
        maxItems: 4,
        description: "2-4 relevant tags that summarize the topic. Use lowercase single-word terms (e.g., 'wifi', 'doctor', 'insurance', 'birthday', 'dishwasher')"
      },
      content: {
        type: "string",
        description: "For storage/update: clean, processed content to store. For retrieval: the original query"
      },
      searchTerms: {
        type: "array",
        items: { type: "string" },
        description: "Key terms that would help search for this information"
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence level in the tagging and processing"
      },
      replaces: {
        type: "string",
        description: "For updates: the main tag or concept being replaced (e.g., 'family-reunion', 'wifi-password', 'doctor')"
      },
      timestamp: {
        type: "string",
        description: "ISO 8601 timestamp string (automatically set if not provided)"
      },
      items: {
        type: "array",
        items: { type: "string" },
        description: "For shopping lists: individual items mentioned (e.g., ['butter', 'milk', 'cheese', 'bread'])"
      },
      listType: {
        type: "string",
        description: "Type of list: 'shopping', 'grocery', 'todo', etc."
      }
    },
    required: ["intent", "tags", "content", "searchTerms", "confidence"],
    // replaces and timestamp are optional but should be provided for updates
    // items and listType should be provided for shopping operations
    conditionallyRequired: {
      update: ["replaces"],
      purchase: ["items"],
      clear_list: ["listType"]
    }
  }
};

// Function definition for response generation (updated for tags)
const responseFunction = {
  name: "generate_response",
  description: "Generate a helpful, conversational response based on user query and available information",
  parameters: {
    type: "object",
    properties: {
      answer: {
        type: "string",
        description: "A helpful, conversational response to the user's query"
      },
      confidence: {
        type: "number",
        minimum: 0,
        maximum: 1,
        description: "Confidence level in the response"
      },
      suggestions: {
        type: "array",
        items: { type: "string" },
        description: "2-3 helpful follow-up suggestions for the user"
      }
    },
    required: ["answer", "confidence", "suggestions"]
  }
};

// Enhanced system prompt for tag-based processing with revision and shopping list support
const TAGGING_PROMPT = `You are an AI assistant that helps organize and tag shared knowledge with intelligent revision tracking and shopping list management.

Your job is to:
1. Determine the user's **intent**:
   - "store": Adding completely new information
   - "retrieve": Looking for existing information  
   - "update": Changing, correcting, or replacing existing information
   - "purchase": Marking items as bought/completed (removes from need list)
   - "clear_list": Bulk operations to clear/reset lists
   - "unclear": Cannot determine intent

2. **SHOPPING LIST SEMANTICS**:
   - "Add X to shopping list" → store, items: ["X"], listType: "shopping"
   - "I bought/purchased X" → purchase, items: ["X"], replaces: "shopping"
   - "Clear my grocery list" → clear_list, listType: "grocery"
   - Smart matching: "bought cheese" should match "sliced cheese" from list

3. **CRITICAL for updates**: Detect update language like:
   - "We moved/changed/updated the [thing] to [new value]"
   - "The [thing] is now [new value]" 
   - "Actually, the [thing] is [new value]"
   - "Correction: [thing] is [new value]"

4. **CRITICAL for purchases**: Detect purchase language like:
   - "I bought/purchased [items]"
   - "We got [items] from the store"
   - "[Person] picked up [items]"
   - "Got [items] today"

5. For **shopping operations**, set:
   - intent: "purchase" or "clear_list" 
   - items: Extract individual items as array
   - listType: "shopping", "grocery", "todo", etc.
   - replaces: The list type being affected

6. Return relevant **tags** (2–4 max) using lowercase terms.
7. Extract useful **search terms**.
8. Provide **confidence** score (0.0-1.0).

**Examples:**
- "Add butter, milk, sliced cheese, and bread to my shopping list" → store, content: "Need butter, milk, sliced cheese, and bread", tags: ["shopping", "groceries"], items: ["butter", "milk", "sliced cheese", "bread"], listType: "shopping"

- "My wife purchased cheese and milk" → purchase, content: "Purchased cheese and milk", tags: ["shopping", "groceries"], items: ["cheese", "milk"], replaces: "shopping"

- "Clear my grocery list" → clear_list, content: "Clear grocery list", tags: ["shopping", "groceries"], listType: "grocery"

- "What do I need from the store?" → retrieve, content: "What do I need from the store?", tags: ["shopping", "groceries"]

- "We moved the family reunion to July 9" → update, content: "The family reunion is scheduled for July 9", tags: ["family", "reunion", "event"], replaces: "family-reunion"

- "Our doctor is Dr. Ramirez at Westside Pediatrics" → store, content: "Our doctor is Dr. Ramirez at Westside Pediatrics", tags: ["doctor", "health", "pediatrics"]

**Key Rules**: 
- For shopping: Extract individual items and understand list operations!
- For purchases: Mark items as bought to remove from active shopping list!
- For updates: Store COMPLETE information, not just the change!
- Always provide full, readable content that stands alone!
- Smart matching: "cheese" matches "sliced cheese", "milk" matches "whole milk"!`;

// Enhanced system prompt for generating responses with shopping list awareness
const RESPONSE_PROMPT = `You are a helpful AI assistant for managing shared household and personal knowledge with smart shopping list capabilities.

Given a user's query and relevant knowledge entries, provide a helpful, conversational response. 

**SHOPPING LIST INTELLIGENCE**:
- For "What do I need?" queries: Show only ACTIVE shopping list items (no "purchased" or "cleared" tags)
- For "What did I buy?" queries: Show only purchase records ("purchased" tag)
- Smart filtering: Ignore superseded entries (replaced_by field set)
- If no active items: "Your shopping list is empty" or "You don't have any items on your shopping list right now"
- If shopping list was recently cleared: Acknowledge it and suggest adding new items

Guidelines:
- Be warm and conversational, like talking to a helpful friend
- If information is found, present it clearly and offer to help with related tasks
- If no exact match, suggest related information or ask clarifying questions
- Always maintain a helpful, supportive tone
- Keep responses concise but complete
- Don't assume specific relationships (could be family, roommates, partners, etc.)
- Make the experience personal to the current user
- When referencing entries, show their tags like: 🏷️ [wifi, password]: "The WiFi password is..."
- For shopping lists, present items clearly: "You need: butter, milk, cheese, bread"
- For empty shopping lists, be encouraging: "Your shopping list is empty! Ready to add some items?"

Provide 2-3 helpful follow-up suggestions that make sense in context.`;

export async function processUserInput(input: string): Promise<ProcessedQuery> {
  try {
    const openai = createOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: TAGGING_PROMPT },
        { role: "user", content: input }
      ],
      tools: [{ type: "function", function: tagProcessingFunction }],
      tool_choice: { type: "function", function: { name: "process_user_input" } },
      temperature: 0.3,
      max_tokens: 500,
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "process_user_input") {
      throw new Error('No valid function call returned');
    }

    const rawResult = JSON.parse(toolCall.function.arguments);
    const validatedResult = ProcessedQuerySchema.parse(rawResult);
    
    // Debug logging for development
    console.log('🏷️ AI Tagging Results:', {
      input,
      tags: validatedResult.tags,
      intent: validatedResult.intent,
      confidence: validatedResult.confidence
    });
    
    return validatedResult;
  } catch (error) {
    console.error('Error processing user input:', error);
    
    // Enhanced fallback with tag-based categorization
    const lowerInput = input.toLowerCase();
    let fallbackTags = ['misc'];
    
    // Simple keyword-based fallback tagging
    if (lowerInput.includes('remind') || lowerInput.includes('remember') || lowerInput.includes('need to')) {
      fallbackTags = ['reminder', 'task'];
    } else if (lowerInput.includes('where') || lowerInput.includes('put') || lowerInput.includes('stored')) {
      fallbackTags = ['storage', 'location'];
    } else if (lowerInput.includes('password') || lowerInput.includes('wifi')) {
      fallbackTags = ['password', 'wifi'];
    } else if (lowerInput.includes('appointment') || lowerInput.includes('meeting')) {
      fallbackTags = ['appointment', 'schedule'];
    } else if (lowerInput.includes('doctor') || lowerInput.includes('health')) {
      fallbackTags = ['health', 'medical'];
    } else if (lowerInput.includes('car') || lowerInput.includes('vehicle')) {
      fallbackTags = ['car', 'vehicle'];
    }
    
    return {
      intent: 'unclear',
      tags: fallbackTags,
      content: input,
      searchTerms: input.split(' ').filter(word => word.length > 3),
      confidence: 0.3
    };
  }
}

export async function generateResponse(
  query: string, 
  relevantEntries: KnowledgeEntry[]
): Promise<QueryResponse> {
  try {
    const openai = createOpenAIClient();
    const context = relevantEntries.length > 0 
      ? `Relevant information found:\n${relevantEntries.map(entry => 
          `🏷️ [${entry.tags.join(', ')}]: ${entry.content}`
        ).join('\n')}`
      : 'No specific information found in the knowledge base.';

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: RESPONSE_PROMPT },
        { role: "user", content: `Query: ${query}\n\n${context}` }
      ],
      tools: [{ type: "function", function: responseFunction }],
      tool_choice: { type: "function", function: { name: "generate_response" } },
      temperature: 0.5, // Reduced from 0.7 for more consistency
      max_tokens: 500,
    });

    const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== "generate_response") {
      throw new Error('No valid function call returned');
    }

    const rawResult = JSON.parse(toolCall.function.arguments);
    const validatedResult = QueryResponseSchema.parse(rawResult);
    
    // Debug logging for development
    console.log('🤖 AI Response Generated:', {
      query,
      confidence: validatedResult.confidence,
      sources: relevantEntries.length,
      tags: relevantEntries.map(e => e.tags).flat()
    });
    
    return {
      answer: validatedResult.answer,
      confidence: validatedResult.confidence,
      sources: relevantEntries,
      suggestions: validatedResult.suggestions
    };
  } catch (error) {
    console.error('Error generating response:', error);
    
    // Enhanced fallback response
    if (relevantEntries.length > 0) {
      return {
        answer: `I found ${relevantEntries.length} related item${relevantEntries.length > 1 ? 's' : ''}: ${relevantEntries.map(e => e.content).slice(0, 2).join(', ')}${relevantEntries.length > 2 ? '...' : ''}`,
        confidence: 0.5,
        sources: relevantEntries,
        suggestions: ["Tell me more about this", "Show me all related items", "Help me organize this better"]
      };
    } else {
      // Try to provide helpful suggestions based on the query
      const suggestions = [];
      const lowerQuery = query.toLowerCase();
      
      if (lowerQuery.includes('where') || lowerQuery.includes('find')) {
        suggestions.push("Try describing what you're looking for differently");
        suggestions.push("Tell me more details about the item");
      } else {
        suggestions.push("Try being more specific");
        suggestions.push("Add some context or details");
      }
      suggestions.push("Browse your stored information");
      
      return {
        answer: "I couldn't find any specific information about that. Could you provide more details or try rephrasing your question?",
        confidence: 0.1,
        sources: [],
        suggestions: suggestions.slice(0, 3)
      };
    }
  }
} 