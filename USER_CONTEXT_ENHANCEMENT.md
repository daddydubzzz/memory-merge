# User Context Enhancement for Memory Merge

## Overview

This enhancement introduces intelligent user context awareness to the Memory Merge knowledge management system. The AI can now make connections and provide more relevant responses based on **who** added information, enabling scenarios like:

- "What did Walter say about testicles?" 
- "Did John mention anything about the wifi password?"
- Making intelligent connections when exact matches aren't found but related information exists from specific users

## Key Features

### 🧠 Enhanced Vector Embeddings
- **User Context in Embeddings**: Content is now embedded as `"Added by [UserName]: [content]"` instead of just `[content]`
- **Improved Search Relevance**: The AI can find connections based on user relationships and contributions
- **Cached User Names**: Display names are cached in the vector database for performance

### 🤖 Intelligent AI Responses
- **User-Aware Connections**: When exact matches aren't found, the AI suggests related content from specific users
- **Contextual Suggestions**: "I didn't find that specific information, but Walter mentioned something about testicles that might be related..."
- **Attribution in Responses**: All responses show who contributed what information

### 🔍 Enhanced Search Experience
- **User-Based Queries**: Search for "walter's notes" or "what did john say"
- **Smart Fallbacks**: When direct matches fail, the system looks for topically related content from mentioned users
- **Visual User Attribution**: Knowledge cards show who added each piece of information

## Technical Implementation

### Database Schema Changes

**New Supabase Fields:**
```sql
-- Enhanced content with user context used for embedding
enhanced_content text

-- Cached display name for quick access  
added_by_name text
```

**Updated Vector Search Function:**
```sql
CREATE OR REPLACE FUNCTION match_knowledge_vectors(
  query_embedding vector(1536),
  account_id text,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10
)
RETURNS TABLE (
  id text,
  account_id text,
  content text,
  enhanced_content text,    -- NEW
  tags text[],
  added_by text,
  added_by_name text,       -- NEW
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
```

### Code Changes

#### 1. Enhanced Embedding Storage (`src/lib/embedding.ts`)
```typescript
// Before: generateEmbedding(entry.content)
// After:
const userName = await getUserDisplayName(entry.addedBy);
const enhancedContent = `Added by ${userName}: ${entry.content}`;
const embedding = await generateEmbedding(enhancedContent);

// Store both original and enhanced content
await supabase.from('knowledge_vectors').insert({
  content: entry.content,           // For display
  enhanced_content: enhancedContent, // For search
  added_by_name: userName,          // Cached name
  embedding: embedding
});
```

#### 2. User-Aware AI Responses (`src/lib/openai.ts`)
```typescript
// Enhanced system prompt with user context intelligence
const RESPONSE_PROMPT = `
**USER CONTEXT INTELLIGENCE**:
- Each entry shows who added it (look for "Added by [Name]:" in enhanced content)
- When users ask about specific people, prioritize entries from that person
- Make intelligent connections: "Walter mentioned something about testicles..."
- Use user context for personalized responses
`;

// Enhanced context generation
const context = relevantEntries.map(entry => {
  const enhancedContent = entry.enhanced_content || entry.content;
  const userMatch = enhancedContent.match(/^Added by ([^:]+):/);
  const userName = userMatch ? userMatch[1] : 'Someone';
  
  return `🏷️ [${entry.tags.join(', ')}] by ${userName}: ${entry.content}`;
}).join('\n');
```

#### 3. Updated TypeScript Types
```typescript
export interface KnowledgeEntry {
  // ... existing fields
  enhanced_content?: string;  // Enhanced content with user context
  addedByName?: string;       // Cached display name
}

export interface VectorSearchResult {
  // ... existing fields  
  enhanced_content?: string;
  addedByName?: string;
}
```

### Migration Strategy

A migration script (`scripts/migrate-user-context.ts`) handles existing data:

1. **Fetch all entries** without enhanced_content
2. **Get user display names** for each entry
3. **Create enhanced content** with user context
4. **Regenerate embeddings** with the enhanced content
5. **Update database** with new fields

```bash
# Run the migration
npm run migrate:user-context
```

## Usage Examples

### User-Specific Queries
```
❓ "What did Walter say about his medical condition?"
🤖 "Walter mentioned he has a consultation scheduled with Dr. Smith next Tuesday for his knee pain."

❓ "Did John share the wifi password?"  
🤖 "Yes! John shared: The WiFi password is 'FamilyTime2024' - he added this yesterday."

❓ "What's the shape of walter's left nut?"
🤖 "I didn't find specific information about that, but Walter did mention something about a medical appointment that might be related. Would you like me to show you what he shared?"
```

### Smart Fallbacks
When exact matches aren't found, the system intelligently suggests related content:

```
❓ "walter testicles"
🤖 "I didn't find specific information about that topic, but Walter did mention scheduling a medical consultation. Here's what he shared: [shows related medical entries from Walter]"
```

### Multi-User Context
```
❓ "Who knows about the car maintenance?"
🤖 "Both John and Sarah have shared car-related information:
- John mentioned: 'Oil change due next month at 45,000 miles'  
- Sarah added: 'Tire pressure should be checked weekly'"
```

## Benefits

### For Users
- **More Relevant Results**: Find information by remembering who shared it
- **Better Context**: Understand the source and perspective of information
- **Intelligent Connections**: Get suggestions even when exact matches don't exist
- **Personal Attribution**: See who contributed what knowledge

### For Shared Spaces
- **Collaborative Intelligence**: The AI understands multiple perspectives on topics
- **Source Tracking**: Important for household decisions and family coordination
- **Relationship Awareness**: Connects information through human relationships

### For AI Accuracy
- **Context-Rich Embeddings**: Vector search considers both content and contributor
- **Improved Relevance**: User context provides additional semantic meaning
- **Smart Fallbacks**: Can make educated suggestions based on user patterns

## Performance Considerations

### Optimizations
- **Cached User Names**: `added_by_name` field avoids repeated Firebase lookups
- **Efficient Embeddings**: Only regenerate when content actually changes
- **Batch Processing**: Migration script processes entries in batches to respect rate limits

### Monitoring
- **Embedding Quality**: Enhanced content improves search relevance
- **Response Times**: Cached names reduce lookup overhead  
- **Storage Impact**: Minimal - enhanced_content adds ~20-30% to content size

## Future Enhancements

### Possible Extensions
1. **User Expertise Tracking**: Learn which users are most knowledgeable about specific topics
2. **Relationship Mapping**: Understand family/household relationships for better context
3. **Temporal User Patterns**: "John usually shares dinner plans on Fridays"
4. **User Preference Learning**: Adapt responses based on who's asking

### Advanced Features
1. **Multi-User Conversations**: Track discussions between multiple contributors
2. **Expertise Scoring**: Weight responses based on user expertise in specific domains
3. **Social Context**: "Ask Sarah about cooking, she knows best"

## Migration Notes

### Database Changes Required
1. Run the SQL schema updates in `supabase-setup.sql`
2. Execute the migration script: `npm run migrate:user-context`
3. Monitor logs for any failed migrations

### Backward Compatibility
- All existing functionality remains unchanged
- New fields are optional - system gracefully handles missing data
- Gradual enhancement as new content is added

### Testing Strategy
1. **Verify Schema**: Ensure new columns exist and are properly indexed
2. **Test Migration**: Run script on development data first
3. **Validate Embeddings**: Confirm enhanced content improves search quality
4. **User Experience**: Test user-specific queries and fallback scenarios

## Conclusion

This enhancement transforms Memory Merge from a simple knowledge storage system into an intelligent, context-aware assistant that understands the human relationships and perspectives behind shared information. Users can now leverage the system's understanding of "who knows what" to find information more naturally and get better, more relevant responses. 