# Temporal Intelligence System

Memory Merge now features advanced temporal intelligence that makes your AI assistant truly time-aware. This system understands when information was stored, resolves relative time expressions, and provides contextually relevant responses based on temporal relationships.

## 🕒 What is Temporal Intelligence?

Temporal intelligence allows the AI to understand and reason about time in natural language. When you say "remind my wife about the birthday party tomorrow," the system:

1. **Parses** the temporal expression ("tomorrow")
2. **Resolves** it to an actual date (e.g., "January 16, 2024")
3. **Stores** both the original text and resolved date
4. **Tracks** when the information was stored
5. **Provides context** in future queries about temporal relevance

## 🎯 Key Features

### Smart Date Resolution
- **Relative terms**: "tomorrow", "next week", "in 3 days" → actual dates
- **Absolute dates**: "January 15th", "March 5th at 2pm" → standardized format
- **Recurring patterns**: "every Monday", "weekly meetings" → recurring event detection
- **Contextual references**: "after the meeting", "before Christmas" → contextual understanding

### Temporal Context Awareness
- Understands when information becomes outdated
- Distinguishes between current, past, and future events
- Provides temporal context in AI responses
- Suggests current alternatives for expired events

### Intelligent Search & Filtering
- **Future-focused queries**: "What's coming up?" prioritizes upcoming events
- **Historical queries**: "What happened last week?" focuses on past events
- **Current timeframe**: "What's happening today?" shows immediate relevance
- **Temporal relevance scoring**: Weights results based on temporal importance

## 🚀 How It Works

### 1. Content Processing
When you store information, the system:

```typescript
// Input: "Remind my wife about birthday party tomorrow"
// Processing:
{
  originalContent: "Remind my wife about birthday party tomorrow",
  processedContent: "Remind my wife about birthday party tomorrow (Tuesday, January 16, 2024)",
  temporalInfo: [{
    originalText: "tomorrow",
    resolvedDate: "2024-01-16T00:00:00Z",
    temporalType: "relative",
    confidence: 0.9,
    isInPast: false,
    daysSinceStorage: 0
  }],
  temporalRelevanceScore: 0.8,
  containsTemporalRefs: true
}
```

### 2. Enhanced Embeddings
The system creates multi-layered embeddings that include:
- **User context**: "Added by John on 2024-01-15"
- **Temporal context**: "referring to temporal events: 'tomorrow' (January 16, 2024)"
- **Processed content**: Original text with resolved dates

### 3. Intelligent Retrieval
When you query the system:

```typescript
// Query: "When is the birthday party?"
// System reasoning:
// 1. Finds temporal references in stored content
// 2. Checks if dates are still relevant
// 3. Provides temporal context in response
// 4. Suggests alternatives if events are past
```

## 📝 Usage Examples

### Storing Temporal Information
```
✅ "Remind my wife about birthday party tomorrow"
✅ "Doctor appointment next Friday at 2pm"
✅ "Every Monday we have team standup"
✅ "The family reunion is July 9th"
✅ "Car inspection due in 3 months"
```

### Querying with Temporal Awareness
```
🔍 "When is the birthday party?"
🤖 "I found a reference to a birthday party that was scheduled for 'tomorrow' when stored on January 15th (which was January 16th), but that's now in the past. Are you looking for a current/upcoming birthday party?"

🔍 "What do I have coming up this week?"
🤖 "You have a doctor appointment on Friday at 2pm and your weekly team standup every Monday."

🔍 "What happened last month?"
🤖 "Last month you had the family reunion on July 9th and completed your car inspection."
```

### Recurring Events
```
✅ "Every Monday we have team standup at 9am"
🔍 "When is the next standup?"
🤖 "Your team standup happens every Monday at 9am. The next one is January 22nd."
```

## 🛠️ Technical Implementation

### Database Schema
```sql
-- New temporal fields in knowledge_vectors table
ALTER TABLE knowledge_vectors ADD COLUMN temporal_info JSONB;
ALTER TABLE knowledge_vectors ADD COLUMN resolved_dates JSONB;
ALTER TABLE knowledge_vectors ADD COLUMN temporal_relevance_score FLOAT;
ALTER TABLE knowledge_vectors ADD COLUMN contains_temporal_refs BOOLEAN;
ALTER TABLE knowledge_vectors ADD COLUMN processed_content TEXT;
```

### Core Components

#### 1. Temporal Processor (`src/lib/temporal-processor.ts`)
- Parses natural language temporal expressions
- Resolves relative dates to absolute dates
- Detects recurring patterns
- Calculates temporal relevance scores

#### 2. Enhanced Embeddings (`src/lib/embedding.ts`)
- Creates temporally-aware embeddings
- Includes user and temporal context
- Stores both original and processed content

#### 3. Temporal Search (`src/lib/temporal-search.ts`)
- Performs temporally-aware vector searches
- Filters results based on temporal relevance
- Provides temporal context for AI responses

#### 4. AI Enhancement (`src/lib/openai.ts`)
- Enhanced prompts with temporal intelligence
- Temporal context in AI responses
- Smart suggestions based on temporal state

## 🔧 Configuration & Setup

### 1. Database Migration
Run the temporal intelligence migration:

```bash
# Apply database schema changes
npm run migrate:temporal
```

### 2. Environment Variables
Ensure you have the required environment variables:

```env
OPENAI_API_KEY=your_openai_api_key
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### 3. Existing Data Migration
The migration script will:
- Process all existing entries for temporal expressions
- Generate new temporally-aware embeddings
- Update database with temporal metadata
- Preserve all existing functionality

## 🎛️ Advanced Features

### Temporal Search Options
```typescript
interface TemporalSearchOptions {
  timeFrame?: 'future' | 'past' | 'current' | 'all';
  temporalRelevanceWeight?: number; // 0-1, how much to weight temporal vs semantic
  includeExpiredEvents?: boolean;
  includeRecurringEvents?: boolean;
  temporalRelevanceThreshold?: number;
}
```

### Temporal Query Processing
```typescript
// Automatic temporal intent detection
const query = "What's happening tomorrow?";
const temporalQuery = await processTemporalQuery(query);
// Result: { temporalIntent: 'future', timeFrame: 'current' }
```

### Background Processing
```typescript
// Update temporal relevance scores as time passes
await updateTemporalRelevanceScores(accountId);
```

## 🔍 Debugging & Monitoring

### Console Logging
The system provides detailed logging:
```
🕒 Processing temporal content: "birthday party tomorrow"
📝 Creating temporally-aware embedding for: John
🧠 Enhanced content: Added by John on 2024-01-15: birthday party tomorrow (Tuesday, January 16, 2024)...
✅ Stored temporally-aware embedding for: John
🕒 Temporal refs: 1, relevance: 0.82
```

### Temporal Context in Responses
AI responses include temporal context:
```
🏷️ [birthday, party] by John: Birthday party tomorrow
Temporal context: "tomorrow" was stored 3 days ago and resolved to 1/16/2024 (2 days ago)
```

## 🚀 Benefits

### For Users
- **Natural language**: Use everyday temporal expressions
- **Smart reminders**: System understands when events are relevant
- **Context awareness**: AI knows when information is outdated
- **Proactive suggestions**: Get reminded about upcoming events

### For Developers
- **Extensible**: Easy to add new temporal patterns
- **Performant**: Efficient database queries with temporal indexes
- **Scalable**: Background processing for temporal updates
- **Maintainable**: Clean separation of temporal logic

## 🔮 Future Enhancements

### Planned Features
- **Time zone awareness**: Handle multiple time zones
- **Natural language scheduling**: "Schedule for next available Tuesday"
- **Smart notifications**: Proactive reminders based on temporal relevance
- **Calendar integration**: Sync with external calendar systems
- **Temporal analytics**: Insights about temporal patterns in your data

### Extensibility
The system is designed to be easily extended:
- Add new temporal patterns in `temporal-processor.ts`
- Customize temporal relevance scoring
- Integrate with external time services
- Add domain-specific temporal logic

## 📚 API Reference

### Core Functions

#### `processTemporalContent(content, referenceDate?, storageDate?)`
Processes content for temporal expressions and returns temporal metadata.

#### `searchWithTemporalAwareness(query, accountId, embedding, options?)`
Performs temporally-aware vector search with intelligent filtering.

#### `createTemporalContext(temporalInfo, storageDate)`
Creates human-readable temporal context for AI responses.

#### `isTemporallyRelevant(temporalInfo, options?)`
Determines if temporal information is still relevant.

### Types

#### `TemporalInfo`
```typescript
interface TemporalInfo {
  originalText: string;
  resolvedDate?: Date;
  temporalType: 'absolute' | 'relative' | 'recurring' | 'none';
  confidence: number;
  isInPast: boolean;
  daysSinceStorage: number;
  recurringPattern?: RecurringPattern;
}
```

#### `ProcessedTemporalContent`
```typescript
interface ProcessedTemporalContent {
  originalContent: string;
  processedContent: string;
  temporalInfo: TemporalInfo[];
  temporalRelevanceScore: number;
  containsTemporalRefs: boolean;
  resolvedDates: Date[];
}
```

---

The temporal intelligence system transforms Memory Merge from a simple knowledge store into a truly intelligent, time-aware assistant that understands the temporal context of your information and provides relevant, timely responses. 