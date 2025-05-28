import OpenAI from 'openai';
import type { KnowledgeEntry } from './constants';

// Create OpenAI client - this should only be used server-side
function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Export interfaces from constants
export type { KnowledgeEntry } from './constants';

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

// System prompt for categorizing and processing knowledge entries
const CATEGORIZATION_PROMPT = `You are an AI assistant that helps couples organize and categorize their shared household information. 

Analyze the user's input and determine:
1. Intent: Is this storing new information ('store') or retrieving existing information ('retrieve')?
2. Category: What category does this belong to? Choose from:
   - Home Maintenance (repairs, warranties, service contacts)
   - Documents (important papers, IDs, insurance)
   - Schedules (appointments, events, deadlines)
   - Shopping (lists, preferences, stores)
   - Travel (reservations, itineraries, preferences)
   - Personal (gift ideas, preferences, special dates)
   - Household (locations of items, organization)
   - Finance (accounts, passwords, important numbers)
   - Health (doctors, medications, insurance)
   - Other

3. For storage: Extract the key information to store
4. For retrieval: Generate search terms that would help find relevant information

Respond in JSON format only:
{
  "intent": "store" | "retrieve" | "unclear",
  "category": "category name",
  "content": "processed content for storage OR original query for retrieval",
  "searchTerms": ["term1", "term2", "term3"],
  "confidence": 0.0-1.0
}`;

// System prompt for generating responses to queries
const RESPONSE_PROMPT = `You are a helpful AI assistant for couples managing their shared household knowledge. 

Given a user's query and relevant knowledge entries, provide a helpful, conversational response. 

Guidelines:
- Be warm and conversational, like talking to a friend
- If information is found, present it clearly and offer to help with related tasks
- If no exact match, suggest related information or ask clarifying questions
- Always maintain a helpful, supportive tone
- Keep responses concise but complete

Format your response as JSON:
{
  "answer": "your conversational response",
  "confidence": 0.0-1.0,
  "suggestions": ["suggestion1", "suggestion2", "suggestion3"]
}`;

export async function processUserInput(input: string): Promise<ProcessedQuery> {
  try {
    const openai = createOpenAIClient();
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: CATEGORIZATION_PROMPT },
        { role: "user", content: input }
      ],
      temperature: 0.3,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(response) as ProcessedQuery;
    return parsed;
  } catch (error) {
    console.error('Error processing user input:', error);
    // Fallback response
    return {
      intent: 'unclear',
      category: 'Other',
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
      temperature: 0.7,
      max_tokens: 500,
    });

    const response = completion.choices[0]?.message?.content;
    if (!response) {
      throw new Error('No response from OpenAI');
    }

    const parsed = JSON.parse(response);
    
    return {
      answer: parsed.answer,
      confidence: parsed.confidence,
      sources: relevantEntries,
      suggestions: parsed.suggestions || []
    };
  } catch (error) {
    console.error('Error generating response:', error);
    
    // Fallback response
    if (relevantEntries.length > 0) {
      return {
        answer: `I found ${relevantEntries.length} related items: ${relevantEntries.map(e => e.content).join(', ')}`,
        confidence: 0.5,
        sources: relevantEntries,
        suggestions: []
      };
    } else {
      return {
        answer: "I couldn't find any specific information about that. Could you provide more details or try rephrasing your question?",
        confidence: 0.1,
        sources: [],
        suggestions: ["Try being more specific", "Check if the information was added recently", "Try different keywords"]
      };
    }
  }
}

// Import categories from constants
export { KNOWLEDGE_CATEGORIES, type KnowledgeCategory } from './constants'; 