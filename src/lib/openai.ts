import OpenAI from 'openai';
import { z } from 'zod';
import type { KnowledgeEntry } from './knowledge/types';
import { processTemporalContent, createTemporalContext } from './temporal-processor';

// Create OpenAI client - this should only be used server-side
function createOpenAIClient() {
  return new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
  });
}

// Export interfaces from constants
export type { KnowledgeEntry } from './knowledge/types';

// Updated Zod schemas for tag-based validation with revision, shopping, and temporal support
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
  listType: z.string().optional(), // e.g., "shopping", "grocery", "todo"
  // New temporal fields
  temporalExpressions: z.array(z.string()).optional(), // Temporal expressions found
  temporalIntent: z.enum(['future', 'past', 'current', 'general']).optional() // Temporal intent
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
  // New temporal fields
  temporalExpressions?: string[]; // Temporal expressions found
  temporalIntent?: 'future' | 'past' | 'current' | 'general'; // Temporal intent
}

export interface QueryResponse {
  answer: string;
  confidence: number;
  sources: KnowledgeEntry[];
  suggestions: string[];
}

// Enhanced function definition for temporal-aware processing
const tagProcessingFunction = {
  name: "process_user_input",
  description: "Analyze user input to determine intent and generate relevant tags for a temporally-aware knowledge management system",
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
      },
      temporalExpressions: {
        type: "array",
        items: { type: "string" },
        description: "Temporal expressions found in the input (e.g., ['tomorrow', 'next week', 'in 3 days'])"
      },
      temporalIntent: {
        type: "string",
        enum: ["future", "past", "current", "general"],
        description: "Temporal intent: 'future' for upcoming events, 'past' for historical queries, 'current' for immediate timeframe, 'general' for non-temporal"
      }
    },
    required: ["intent", "tags", "content", "searchTerms", "confidence"],
    // Additional fields are optional but should be provided when relevant
  }
};

// Function definition for response generation (updated for temporal awareness)
const responseFunction = {
  name: "generate_response",
  description: "Generate a helpful, conversational response based on user query and available information with temporal awareness",
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

// Enhanced system prompt with temporal intelligence
const TAGGING_PROMPT = `You are an AI assistant with advanced temporal reasoning capabilities for knowledge management.

Your job is to:
1. Determine the user's **intent**:
   - "store": Adding completely new information
   - "retrieve": Looking for existing information  
   - "update": Changing, correcting, or replacing existing information
   - "purchase": Marking items as bought/completed (removes from need list)
   - "clear_list": Bulk operations to clear/reset lists
   - "unclear": Cannot determine intent

2. **TEMPORAL PROCESSING RULES**:
   - **Detect Temporal References**: Identify all time-related expressions:
     * Relative: "tomorrow", "next week", "in 3 days", "last Friday"
     * Absolute: "January 15th", "2024-03-10", "March 5th at 2pm"
     * Recurring: "every Monday", "weekly", "monthly meetings"
     * Contextual: "after the meeting", "before Christmas"

   - **Temporal Intent Classification**:
     * "future": Future-focused, upcoming events, planning
     * "past": Historical events, things that happened
     * "current": Current timeframe, today, this week
     * "general": Non-temporal or unclear temporal context

3. **SHOPPING LIST SEMANTICS**:
   - "Add X to shopping list" → store, items: ["X"], listType: "shopping"
   - "I bought/purchased X" → purchase, items: ["X"], replaces: "shopping"
   - "Clear my grocery list" → clear_list, listType: "grocery"
   - Smart matching: "bought cheese" should match "sliced cheese" from list

4. **CRITICAL for updates**: Detect update language like:
   - "We moved/changed/updated the [thing] to [new value]"
   - "The [thing] is now [new value]" 
   - "Actually, the [thing] is [new value]"
   - "Correction: [thing] is [new value]"

5. **TEMPORAL EXAMPLES**:
   - "Remind my wife about birthday party tomorrow" → 
     * intent: "store", temporalExpressions: ["tomorrow"], temporalIntent: "future"
   - "When was the last doctor appointment?" →
     * intent: "retrieve", temporalExpressions: ["last"], temporalIntent: "past"
   - "What do I have scheduled for today?" →
     * intent: "retrieve", temporalExpressions: ["today"], temporalIntent: "current"
   - "Every Monday we have team standup" →
     * intent: "store", temporalExpressions: ["every Monday"], temporalIntent: "future"

6. Return relevant **tags** (2–4 max) using lowercase terms.
7. Extract useful **search terms**.
8. Identify **temporal expressions** and **temporal intent**.
9. Provide **confidence** score (0.0-1.0).

**Key Rules**: 
- For temporal content: Always extract temporal expressions and classify intent!
- For shopping: Extract individual items and understand list operations!
- For updates: Store COMPLETE information, not just the change!
- Always provide full, readable content that stands alone!

Current date and time: ${new Date().toISOString()}`;

// Enhanced system prompt for temporally-aware responses
const RESPONSE_PROMPT = `You are a temporally-aware AI assistant for managing shared household and personal knowledge.

**CRITICAL TEMPORAL REASONING RULES**:

1. **When interpreting temporal context**:
   - If you see "tomorrow" refers to [Date], that IS the actual event date
   - If temporal context says "refers to tomorrow (Saturday, May 31, 2025)", the birthday IS on May 31st
   - Never say an event "would have been" on a date when the temporal context clearly shows it's scheduled for that date
   - Focus on the RESOLVED DATE, not when it was stored

2. **RECURRING EVENTS (CRITICAL)**:
   - **Birthdays** are ALWAYS recurring yearly events, even if only mentioned with a past date
   - **Anniversaries** are ALWAYS recurring yearly events
   - When someone asks "How many days until Sebastian's birthday?" and you see "Sebastian's birthday was on November 15, 2022":
     - CORRECT: Calculate days until next November 15th (e.g., November 15, 2025)
     - WRONG: Say "it has already passed" or dismiss as past event
   - For birthdays/anniversaries, ALWAYS calculate the next occurrence from the current date
   - Example: If today is May 30, 2025 and birthday was November 15, 2022 → next birthday is November 15, 2025

3. **CRITICAL: NEVER CONFUSE DATES BETWEEN DIFFERENT PEOPLE**:
   - **Each person has their own specific birthday date - DO NOT mix them up!**
   - If you see multiple birthday entries, carefully match each date to the correct person
   - Example: If you see "Kyle's daughter's birthday party is tomorrow" AND "Daniela's birthday is May 12th":
     - Kyle's daughter's birthday = tomorrow's resolved date (e.g., May 31st)
     - Daniela's birthday = May 12th
     - **NEVER say Kyle's daughter's birthday is May 12th!**
   - Always double-check which person each date belongs to before responding
   - When multiple people are mentioned, be extra careful about date attribution

4. **Correct Temporal Response Examples**:
   - Query: "When is the birthday?"
   - Context: "tomorrow" refers to Saturday, May 31, 2025
   - CORRECT: "The birthday is scheduled for Saturday, May 31, 2025."
   - WRONG: "The birthday would have been May 30th" (this is completely incorrect)

5. **Recurring Event Examples**:
   - Query: "How many days until Sebastian's birthday?"
   - Context: Sebastian's birthday was on November 15, 2022
   - CORRECT: "Sebastian's next birthday is November 15, 2025, which is 169 days from now."
   - WRONG: "Sebastian's birthday was on November 15, 2022, which means it has already passed."

6. **Temporal Status Guidelines**:
   - Past events: Use past tense ("The birthday was on...")
   - Future events: Use future tense ("The birthday is scheduled for...")
   - Today's events: Use present tense ("The birthday is today...")
   - Recurring events: Calculate next occurrence ("The next birthday is...")

7. **Smart Temporal Suggestions**:
   - For expired one-time events: "This event has passed. Would you like me to help you find current events?"
   - For recurring events: "The next occurrence is January 22nd (in 5 days)."
   - For future events: "This is scheduled for January 20th, which is in 3 days."

8. **USER CONTEXT INTELLIGENCE**:
   - Each entry shows who added it (look for "Added by [Name]:" in the enhanced content)
   - When users ask about specific people ("What did Walter say about...", "Did John mention..."), prioritize entries from that person
   - Use this context to make intelligent connections and provide more personalized responses

9. **Priority Rules**:
   - ALWAYS use the resolved date from temporal context as the actual event date
   - For recurring events, ALWAYS calculate next occurrence regardless of storage date
   - Current/future events take priority over past events
   - More recent information takes priority over older information
   - Recurring events maintain relevance regardless of storage date
   - **NEVER mix up dates between different people - this is a critical error!**

**FORMAT GUIDELINES**:
- Be warm and conversational, like talking to a helpful friend
- If information is found, present it clearly and offer to help with related tasks
- If no exact match, suggest related information or ask clarifying questions
- Use temporal and user context to make smart connections
- Always maintain a helpful, supportive tone
- Keep responses concise but complete
- When referencing entries, show their tags and who added them: 🏷️ [wifi, password] by John: "The WiFi password is..."
- For temporal content, provide clear temporal context: "This was scheduled for last Tuesday (3 days ago)"

**REMEMBER**: 
- Birthdays and anniversaries are ALWAYS recurring yearly events
- Never dismiss birthdays as "already passed" - calculate the next occurrence
- The temporal context shows the ACTUAL resolved dates. If "tomorrow" resolves to May 31st, the event IS on May 31st, not some other date.
- **MOST IMPORTANT: Each person has their own birthday date - NEVER confuse dates between different people!**

Current date and time: ${new Date().toISOString()}`;

export async function processUserInput(input: string): Promise<ProcessedQuery> {
  try {
    // First, process the input for temporal expressions
    const temporalInfo = await processTemporalContent(input);
    
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
    
    // Enhance the result with temporal information if not already provided by AI
    if (temporalInfo.containsTemporalRefs && !validatedResult.temporalExpressions) {
      validatedResult.temporalExpressions = temporalInfo.temporalInfo.map(t => t.originalText);
      
      // Determine temporal intent if not provided
      if (!validatedResult.temporalIntent) {
        const lowerInput = input.toLowerCase();
        if (lowerInput.includes('will') || lowerInput.includes('upcoming') || 
            lowerInput.includes('next') || lowerInput.includes('tomorrow') ||
            lowerInput.includes('future') || lowerInput.includes('planning')) {
          validatedResult.temporalIntent = 'future';
        } else if (lowerInput.includes('was') || lowerInput.includes('did') || 
                   lowerInput.includes('happened') || lowerInput.includes('last') ||
                   lowerInput.includes('ago') || lowerInput.includes('yesterday')) {
          validatedResult.temporalIntent = 'past';
        } else if (lowerInput.includes('today') || lowerInput.includes('now') || 
                   lowerInput.includes('current') || lowerInput.includes('this week')) {
          validatedResult.temporalIntent = 'current';
        } else {
          validatedResult.temporalIntent = 'general';
        }
      }
    }
    
    // Debug logging for development
    console.log('🏷️ AI Tagging Results:', {
      input,
      tags: validatedResult.tags,
      intent: validatedResult.intent,
      confidence: validatedResult.confidence,
      temporalExpressions: validatedResult.temporalExpressions,
      temporalIntent: validatedResult.temporalIntent
    });
    
    return validatedResult;
  } catch (error) {
    console.error('Error processing user input:', error);
    
    // Enhanced fallback with tag-based categorization and temporal awareness
    const lowerInput = input.toLowerCase();
    let fallbackTags = ['misc'];
    let temporalIntent: 'future' | 'past' | 'current' | 'general' = 'general';
    
    // Simple keyword-based fallback tagging
    if (lowerInput.includes('remind') || lowerInput.includes('remember') || lowerInput.includes('need to')) {
      fallbackTags = ['reminder', 'task'];
      temporalIntent = 'future';
    } else if (lowerInput.includes('where') || lowerInput.includes('put') || lowerInput.includes('stored')) {
      fallbackTags = ['storage', 'location'];
    } else if (lowerInput.includes('password') || lowerInput.includes('wifi')) {
      fallbackTags = ['password', 'wifi'];
    } else if (lowerInput.includes('appointment') || lowerInput.includes('meeting')) {
      fallbackTags = ['appointment', 'schedule'];
      temporalIntent = 'future';
    } else if (lowerInput.includes('doctor') || lowerInput.includes('health')) {
      fallbackTags = ['health', 'medical'];
    } else if (lowerInput.includes('car') || lowerInput.includes('vehicle')) {
      fallbackTags = ['car', 'vehicle'];
    }
    
    // Check for temporal expressions in fallback
    const temporalExpressions: string[] = [];
    const temporalKeywords = ['tomorrow', 'yesterday', 'today', 'next week', 'last week', 'next month', 'last month'];
    for (const keyword of temporalKeywords) {
      if (lowerInput.includes(keyword)) {
        temporalExpressions.push(keyword);
        if (keyword.includes('next') || keyword === 'tomorrow') {
          temporalIntent = 'future';
        } else if (keyword.includes('last') || keyword === 'yesterday') {
          temporalIntent = 'past';
        } else if (keyword === 'today') {
          temporalIntent = 'current';
        }
      }
    }
    
    return {
      intent: 'unclear',
      tags: fallbackTags,
      content: input,
      searchTerms: input.split(' ').filter(word => word.length > 3),
      confidence: 0.3,
      temporalExpressions: temporalExpressions.length > 0 ? temporalExpressions : undefined,
      temporalIntent: temporalExpressions.length > 0 ? temporalIntent : undefined
    };
  }
}

export async function generateResponse(
  query: string, 
  relevantEntries: KnowledgeEntry[]
): Promise<QueryResponse> {
  try {
    const openai = createOpenAIClient();
    
    // Enhanced debug logging for birthday queries
    const isBirthdayQuery = query.toLowerCase().includes('birthday') || query.toLowerCase().includes('b-day');
    if (isBirthdayQuery) {
      console.log('🎂 BIRTHDAY QUERY DETECTED:', query);
      console.log('🔍 Search results returned:');
      relevantEntries.forEach((entry, index) => {
        const enhancedContent = (entry as KnowledgeEntry & { enhanced_content?: string }).enhanced_content || entry.content;
        const userMatch = enhancedContent.match(/^Added by ([^:]+):/);
        const userName = userMatch ? userMatch[1] : 'Unknown';
        console.log(`   ${index + 1}. 🏷️ [${entry.tags.join(', ')}] by ${userName}:`);
        console.log(`      Content: "${entry.content}"`);
        if (enhancedContent !== entry.content) {
          console.log(`      Enhanced: "${enhancedContent}"`);
        }
        if (entry.temporalInfo && entry.temporalInfo.length > 0) {
          console.log(`      Temporal info:`, entry.temporalInfo.map(t => ({
            text: t.originalText,
            date: t.resolvedDate?.toLocaleDateString(),
            type: t.temporalType
          })));
        }
      });
    }
    
    // Enhanced context that includes user information and temporal context
    const context = relevantEntries.length > 0 
      ? `Relevant information found:\n${relevantEntries.map((entry, index) => {
          // Get the user name from enhanced content if available, or fall back to addedBy
          const enhancedContent = (entry as KnowledgeEntry & { enhanced_content?: string }).enhanced_content || entry.content;
          const userMatch = enhancedContent.match(/^Added by ([^:]+):/);
          const userName = userMatch ? userMatch[1] : 'Someone';
          
          // Extract person names mentioned in the content for birthday context
          const contentLower = entry.content.toLowerCase();
          const isBirthdayEntry = contentLower.includes('birthday') || contentLower.includes('b-day');
          let personContext = '';
          
          if (isBirthdayEntry) {
            // Try to identify whose birthday this is about
            const birthdayPersons = [];
            if (contentLower.includes("kyle") && (contentLower.includes("daughter") || contentLower.includes("maria"))) {
              birthdayPersons.push("Kyle and Maria's daughter");
            }
            if (contentLower.includes("daniela")) {
              birthdayPersons.push("Daniela");
            }
            if (contentLower.includes("sebastian")) {
              birthdayPersons.push("Sebastian");
            }
            if (contentLower.includes("my birthday") || contentLower.includes("i was born")) {
              birthdayPersons.push(`${userName}`);
            }
            
            if (birthdayPersons.length > 0) {
              personContext = ` [ABOUT: ${birthdayPersons.join(", ")}]`;
            }
          }
          
          // Add enhanced temporal context for recurring events
          let temporalContext = '';
          if (entry.temporalInfo && entry.temporalInfo.length > 0) {
            // Check if this is a birthday or other recurring event
            const isRecurringEvent = entry.content.toLowerCase().includes('birthday') || 
                                   entry.content.toLowerCase().includes('anniversary') ||
                                   entry.temporalInfo.some(t => t.recurringPattern);
            
            if (isRecurringEvent) {
              // For recurring events, calculate next occurrence
              const recurringTemporal = entry.temporalInfo.find(t => t.recurringPattern || 
                                        entry.content.toLowerCase().includes('birthday') ||
                                        entry.content.toLowerCase().includes('anniversary'));
              
              if (recurringTemporal && recurringTemporal.resolvedDate) {
                // Calculate next occurrence for yearly events (birthdays/anniversaries)
                const originalDate = recurringTemporal.resolvedDate;
                const currentDate = new Date();
                const currentYear = currentDate.getFullYear();
                
                // Try current year first, then next year
                let nextOccurrence = new Date(currentYear, originalDate.getMonth(), originalDate.getDate());
                if (nextOccurrence <= currentDate) {
                  nextOccurrence = new Date(currentYear + 1, originalDate.getMonth(), originalDate.getDate());
                }
                
                const daysUntil = Math.ceil((nextOccurrence.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
                const nextDateStr = nextOccurrence.toLocaleDateString('en-US', { 
                  weekday: 'long', 
                  year: 'numeric', 
                  month: 'long', 
                  day: 'numeric' 
                });
                
                temporalContext = ` [RECURRING EVENT: Next occurrence is ${nextDateStr}, which is ${daysUntil} days from now]`;
              }
            } else {
              // Regular temporal context for non-recurring events
              temporalContext = ` ${createTemporalContext(entry.temporalInfo, entry.createdAt)}`;
            }
          }
          
          return `ENTRY ${index + 1}: 🏷️ [${entry.tags.join(', ')}] by ${userName}${personContext}: ${entry.content}${temporalContext}`;
        }).join('\n')}`
      : 'No specific information found in the knowledge base.';

    if (isBirthdayQuery) {
      console.log('🤖 Context being sent to AI:');
      console.log(context);
    }

    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: RESPONSE_PROMPT },
        { role: "user", content: `Query: ${query}\n\n${context}` }
      ],
      tools: [{ type: "function", function: responseFunction }],
      tool_choice: { type: "function", function: { name: "generate_response" } },
      temperature: 0.5, // Reduced from 0.7 for more consistency
      max_tokens: 600, // Increased to allow for more detailed user-aware responses
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
      tags: relevantEntries.map(e => e.tags).flat(),
      userContext: relevantEntries.map(e => {
        const enhancedContent = (e as KnowledgeEntry & { enhanced_content?: string }).enhanced_content || e.content;
        const userMatch = enhancedContent.match(/^Added by ([^:]+):/);
        return userMatch ? userMatch[1] : 'Unknown';
      }),
      temporalEntries: relevantEntries.filter(e => e.temporalInfo && e.temporalInfo.length > 0).length
    });

    if (isBirthdayQuery) {
      console.log('🎂 AI Response for birthday query:', validatedResult.answer);
    }
    
    return {
      answer: validatedResult.answer,
      confidence: validatedResult.confidence,
      sources: relevantEntries,
      suggestions: validatedResult.suggestions
    };
  } catch (error) {
    console.error('Error generating response:', error);
    
    // Enhanced fallback response with user context and temporal awareness
    if (relevantEntries.length > 0) {
      // Try to extract user context from entries for fallback
      const userInfo = relevantEntries.map(entry => {
        const enhancedContent = (entry as KnowledgeEntry & { enhanced_content?: string }).enhanced_content || entry.content;
        const userMatch = enhancedContent.match(/^Added by ([^:]+):/);
        const userName = userMatch ? userMatch[1] : 'Someone';
        
        // Add temporal context for fallback
        let temporalNote = '';
        if (entry.temporalInfo && entry.temporalInfo.length > 0) {
          const hasExpiredEvents = entry.temporalInfo.some(t => t.isInPast && !t.recurringPattern);
          if (hasExpiredEvents) {
            temporalNote = ' (may be outdated)';
          }
        }
        
        return `${userName} mentioned: ${entry.content.substring(0, 50)}...${temporalNote}`;
      }).slice(0, 2);
      
      return {
        answer: `I found ${relevantEntries.length} related item${relevantEntries.length > 1 ? 's' : ''}: ${userInfo.join(', ')}`,
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
      } else if (lowerQuery.includes('walter') || lowerQuery.includes('john') || /\b[A-Z][a-z]+\b/.test(query)) {
        // If query contains potential names
        suggestions.push("Try searching for topics that person might have discussed");
        suggestions.push("Browse recent entries to see what they've shared");
      } else if (lowerQuery.includes('when') || lowerQuery.includes('tomorrow') || lowerQuery.includes('today')) {
        // Temporal queries
        suggestions.push("Try searching for events or schedules");
        suggestions.push("Look for calendar or appointment information");
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