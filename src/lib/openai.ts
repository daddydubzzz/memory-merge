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

// Zod schemas for validation
const ProcessedQuerySchema = z.object({
  intent: z.enum(['store', 'retrieve', 'unclear']),
  category: z.string(),
  content: z.string(),
  searchTerms: z.array(z.string()),
  confidence: z.number().min(0).max(1)
});

const QueryResponseSchema = z.object({
  answer: z.string(),
  confidence: z.number().min(0).max(1),
  suggestions: z.array(z.string())
});

export interface ProcessedQuery {
  intent: 'store' | 'retrieve' | 'unclear';
  category: string;
  content: string;
  searchTerms: string[];
  confidence: number;
}

export interface QueryResponse {
  answer: string;
  confidence: number;
  sources: KnowledgeEntry[];
  suggestions: string[];
}

// Function definition for categorization
const categorizationFunction = {
  name: "process_user_input",
  description: "Analyze user input to determine intent and categorize information for a household knowledge management system",
  parameters: {
    type: "object",
    properties: {
      intent: {
        type: "string",
        enum: ["store", "retrieve", "unclear"],
        description: "Whether the user wants to store new information, retrieve existing information, or intent is unclear"
      },
      category: {
        type: "string",
        description: "The category that best fits this information",
        enum: [
          "Tasks & Reminders",
          "Home Maintenance", 
          "Documents",
          "Schedules & Events",
          "Shopping",
          "Travel",
          "Personal Notes",
          "Household Items",
          "Finance",
          "Health & Medical",
          "Contacts",
          "Passwords & Accounts",
          "Other"
        ]
      },
      content: {
        type: "string",
        description: "For storage: clean, processed content to store. For retrieval: the original query"
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
        description: "Confidence level in the categorization"
      }
    },
    required: ["intent", "category", "content", "searchTerms", "confidence"]
  }
};

// Function definition for response generation
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

// System prompt for categorizing and processing knowledge entries
const CATEGORIZATION_PROMPT = `You are an AI assistant that helps people organize and categorize their shared household and personal information. 

Analyze the user's input and determine:
1. Intent: Is this storing new information ('store') or retrieving existing information ('retrieve')?
2. Category: What category does this belong to? Choose the most appropriate one.
3. For storage: Extract the key information to store cleanly
4. For retrieval: Use the original query as content and generate search terms

Examples:
- "Remind me to get golf balls tomorrow" → store, Tasks & Reminders
- "I need to send back Stitch Fix items" → store, Tasks & Reminders  
- "Where did we put the Christmas decorations?" → retrieve, Household Items
- "What's our WiFi password?" → retrieve, Passwords & Accounts

Be precise with categorization and generate meaningful search terms.`;

// System prompt for generating responses to queries
const RESPONSE_PROMPT = `You are a helpful AI assistant for managing shared household and personal knowledge. 

Given a user's query and relevant knowledge entries, provide a helpful, conversational response. 

Guidelines:
- Be warm and conversational, like talking to a helpful friend
- If information is found, present it clearly and offer to help with related tasks
- If no exact match, suggest related information or ask clarifying questions
- Always maintain a helpful, supportive tone
- Keep responses concise but complete
- Don't assume specific relationships (could be family, roommates, partners, etc.)
- Make the experience personal to the current user

Provide 2-3 helpful follow-up suggestions that make sense in context.`;

export async function processUserInput(input: string): Promise<ProcessedQuery> {
  try {
    const openai = createOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CATEGORIZATION_PROMPT },
        { role: "user", content: input }
      ],
      tools: [{ type: "function", function: categorizationFunction }],
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
    
    return validatedResult;
  } catch (error) {
    console.error('Error processing user input:', error);
    
    // Enhanced fallback with better categorization
    const lowerInput = input.toLowerCase();
    let category = 'Other';
    
    // Simple keyword-based fallback categorization
    if (lowerInput.includes('remind') || lowerInput.includes('remember') || lowerInput.includes('need to') || lowerInput.includes('return')) {
      category = 'Tasks & Reminders';
    } else if (lowerInput.includes('where') || lowerInput.includes('put') || lowerInput.includes('stored')) {
      category = 'Household Items';
    } else if (lowerInput.includes('password') || lowerInput.includes('wifi') || lowerInput.includes('account')) {
      category = 'Passwords & Accounts';
    } else if (lowerInput.includes('appointment') || lowerInput.includes('meeting') || lowerInput.includes('schedule')) {
      category = 'Schedules & Events';
    }
    
    return {
      intent: 'unclear',
      category,
      content: input,
      searchTerms: input.split(' ').filter(word => word.length > 2),
      confidence: 0.1
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
          `- ${entry.category}: ${entry.content}`
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

// Import categories from constants
export { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from './constants'; 