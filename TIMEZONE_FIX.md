# Timezone Fix: Production Date Issue Resolution

## Problem

In production, the Memory Merge application was storing incorrect dates for knowledge entries. Users would add content in their local timezone (e.g., EST 9:24 PM on May 30th) but the database would show it was added on a different date (e.g., May 31st).

### Root Cause

The issue occurred because:

1. **Development Environment**: Local development server runs in the user's timezone (EST)
2. **Production Environment**: Production server runs in UTC timezone
3. **Date Creation**: Server was creating `new Date()` using server timezone
4. **Date Formatting**: Using `toLocaleDateString('en-CA')` on server gave different results in different environments

### Example Scenario

- User adds content at 9:24 PM EST on May 30th
- Production server time: 1:24 AM UTC on May 31st
- Old code: `new Date().toLocaleDateString('en-CA')` → `"2025-05-31"` ❌
- Expected: `"2025-05-30"` ✅

## Solution

### Client-Side Changes

**File: `src/components/ChatInterface.tsx`**
```typescript
await knowledgeService.addKnowledge({
  content: processedQuery.content,
  // ... other fields ...
  // NEW: Pass client timezone information
  clientStorageDate: new Date().toISOString(), // Current time in user's timezone
  userTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone
});
```

### Server-Side Changes

**File: `src/lib/embedding.ts`**
```typescript
export async function storeWithEmbedding(
  accountId: string,
  entry: Omit<KnowledgeEntry, 'id' | 'createdAt' | 'updatedAt' | 'accountId'> & { 
    userTimezone?: string;
    clientStorageDate?: string; // ISO string from client in user's timezone
  }
): Promise<string> {
  // Use client-provided storage date if available
  const storageDate = entry.clientStorageDate 
    ? new Date(entry.clientStorageDate)
    : new Date();

  // Format date correctly using client timezone info
  let storageDateFormatted: string;
  if (entry.clientStorageDate) {
    const clientDate = new Date(entry.clientStorageDate);
    storageDateFormatted = clientDate.toISOString().split('T')[0]; // YYYY-MM-DD
  } else {
    storageDateFormatted = storageDate.toLocaleDateString('en-CA');
  }
}
```

### Service Layer Changes

Updated function signatures in:
- `src/lib/knowledge/services/knowledge-crud-service.ts`
- `src/lib/knowledge/services/unified-knowledge-service.ts`

## Technical Details

### Before Fix
```typescript
// Server creates date in its timezone
const storageDate = new Date(); // UTC in production
const formatted = storageDate.toLocaleDateString('en-CA'); // "2025-05-31"
const enhancedContent = `Added by ${userName} on ${formatted}: ${content}`;
```

### After Fix
```typescript
// Client sends date in user's timezone
const storageDate = entry.clientStorageDate 
  ? new Date(entry.clientStorageDate) // User's timezone
  : new Date(); // Fallback to server time

// Use client date for formatting
const formatted = storageDate.toISOString().split('T')[0]; // "2025-05-30"
const enhancedContent = `Added by ${userName} on ${formatted}: ${content}`;
```

## Benefits

1. **Consistent Dates**: Users see correct storage dates regardless of server timezone
2. **Timezone Awareness**: System now properly handles user timezone information
3. **Production Parity**: Development and production environments behave identically
4. **Backward Compatibility**: Fallback to server date if client info unavailable
5. **Enhanced Context**: AI embeddings contain accurate temporal context

## Testing

Run the test script to see the fix in action:
```bash
npx tsx scripts/test-timezone-fix.ts
```

## Future Considerations

1. **Update Function**: The `updateWithEmbedding` function could benefit from similar timezone handling
2. **Temporal Processor**: May need timezone awareness for more accurate temporal resolution
3. **User Preferences**: Could store user's preferred timezone in their profile

## Files Modified

- `src/components/ChatInterface.tsx` - Added client timezone data
- `src/lib/embedding.ts` - Updated server-side date handling
- `src/lib/knowledge/services/knowledge-crud-service.ts` - Updated function signature
- `src/lib/knowledge/services/unified-knowledge-service.ts` - Updated function signature
- `scripts/test-timezone-fix.ts` - Test demonstration script
- `TIMEZONE_FIX.md` - This documentation 