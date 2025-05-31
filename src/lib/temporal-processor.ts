// Custom temporal processing without external dependencies for better Next.js compatibility

export interface TemporalInfo {
  originalText: string;           // "tomorrow", "next week", "in 3 days"
  resolvedDate?: Date;           // Actual date calculated at storage time
  temporalType: 'absolute' | 'relative' | 'recurring' | 'none';
  confidence: number;            // 0-1 confidence in the parsing
  isInPast: boolean;            // Is this date now in the past?
  daysSinceStorage: number;     // How many days ago was this stored?
  recurringPattern?: {
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
    dayOfWeek?: number;         // 0-6 for Sunday-Saturday
    dayOfMonth?: number;        // 1-31
    month?: number;             // 1-12
  };
}

export interface ProcessedTemporalContent {
  originalContent: string;              // Original user input
  processedContent: string;             // Content with resolved dates
  temporalInfo: TemporalInfo[];         // All temporal references found
  temporalRelevanceScore: number;       // 0-1 score for temporal relevance
  containsTemporalRefs: boolean;        // Quick boolean check
  resolvedDates: Date[];                // Array of all resolved dates
}

// Pattern definition interface
interface TemporalPattern {
  pattern: RegExp;
  type: 'relative' | 'recurring';
  days?: number;
  months?: number;
  extract?: 'days' | 'weeks' | 'months';
  negative?: boolean;
  weekday?: boolean;
  direction?: number;
  frequency?: 'daily' | 'weekly' | 'monthly' | 'yearly';
}

// Custom temporal parsing patterns
const TEMPORAL_PATTERNS: TemporalPattern[] = [
  // Relative time patterns
  { pattern: /\btomorrow\b/i, type: 'relative', days: 1 },
  { pattern: /\byesterday\b/i, type: 'relative', days: -1 },
  { pattern: /\btoday\b/i, type: 'relative', days: 0 },
  { pattern: /\bnext week\b/i, type: 'relative', days: 7 },
  { pattern: /\blast week\b/i, type: 'relative', days: -7 },
  { pattern: /\bnext month\b/i, type: 'relative', months: 1 },
  { pattern: /\blast month\b/i, type: 'relative', months: -1 },
  { pattern: /\bin (\d+) days?\b/i, type: 'relative', extract: 'days' },
  { pattern: /\bin (\d+) weeks?\b/i, type: 'relative', extract: 'weeks' },
  { pattern: /\bin (\d+) months?\b/i, type: 'relative', extract: 'months' },
  { pattern: /\b(\d+) days? ago\b/i, type: 'relative', extract: 'days', negative: true },
  { pattern: /\b(\d+) weeks? ago\b/i, type: 'relative', extract: 'weeks', negative: true },
  { pattern: /\b(\d+) months? ago\b/i, type: 'relative', extract: 'months', negative: true },
  
  // Weekday patterns
  { pattern: /\bnext (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: 'relative', weekday: true, direction: 1 },
  { pattern: /\blast (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: 'relative', weekday: true, direction: -1 },
  { pattern: /\bthis (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: 'relative', weekday: true, direction: 0 },
  
  // Recurring patterns
  { pattern: /\bevery day\b/i, type: 'recurring', frequency: 'daily' },
  { pattern: /\bdaily\b/i, type: 'recurring', frequency: 'daily' },
  { pattern: /\bevery week\b/i, type: 'recurring', frequency: 'weekly' },
  { pattern: /\bweekly\b/i, type: 'recurring', frequency: 'weekly' },
  { pattern: /\bevery month\b/i, type: 'recurring', frequency: 'monthly' },
  { pattern: /\bmonthly\b/i, type: 'recurring', frequency: 'monthly' },
  { pattern: /\bevery year\b/i, type: 'recurring', frequency: 'yearly' },
  { pattern: /\byearly\b/i, type: 'recurring', frequency: 'yearly' },
  { pattern: /\bannually\b/i, type: 'recurring', frequency: 'yearly' },
  { pattern: /\bevery (monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i, type: 'recurring', frequency: 'weekly', weekday: true },
];

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];

/**
 * Process content for temporal expressions and resolve them to actual dates
 */
export async function processTemporalContent(
  content: string, 
  referenceDate: Date = new Date(),
  storageDate?: Date
): Promise<ProcessedTemporalContent> {
  const actualStorageDate = storageDate || referenceDate;
  
  try {
    const temporalInfo: TemporalInfo[] = [];
    let processedContent = content;
    const resolvedDates: Date[] = [];
    
    // Check for absolute dates first (using built-in Date parsing)
    const absoluteDateMatches = findAbsoluteDates(content, referenceDate);
    temporalInfo.push(...absoluteDateMatches.map(match => createTemporalInfo(match, actualStorageDate)));
    
    // Check for relative/recurring patterns
    for (const patternDef of TEMPORAL_PATTERNS) {
      const matches = [...content.matchAll(new RegExp(patternDef.pattern.source, 'gi'))];
      
      for (const match of matches) {
        const temporalMatch = parseTemporalMatch(match, patternDef, referenceDate);
        if (temporalMatch) {
          const temporal = createTemporalInfo(temporalMatch, actualStorageDate);
          temporalInfo.push(temporal);
          
          if (temporal.resolvedDate) {
            resolvedDates.push(temporal.resolvedDate);
            
            // Enhance processed content with resolved date
            const dateStr = temporal.resolvedDate.toLocaleDateString('en-US', { 
              weekday: 'long', 
              year: 'numeric', 
              month: 'long', 
              day: 'numeric' 
            });
            
            processedContent = processedContent.replace(
              match[0], 
              `${match[0]} (${dateStr})`
            );
          }
        }
      }
    }
    
    // Remove duplicates based on original text
    const uniqueTemporalInfo = temporalInfo.filter((temporal, index, arr) => 
      arr.findIndex(t => t.originalText.toLowerCase() === temporal.originalText.toLowerCase()) === index
    );
    
    // Calculate overall temporal relevance score
    const temporalRelevanceScore = calculateTemporalRelevanceScore(uniqueTemporalInfo, actualStorageDate);
    
    return {
      originalContent: content,
      processedContent,
      temporalInfo: uniqueTemporalInfo,
      temporalRelevanceScore,
      containsTemporalRefs: uniqueTemporalInfo.length > 0,
      resolvedDates
    };
    
  } catch (error) {
    console.error('Error processing temporal content:', error);
    
    // Return safe fallback
    return {
      originalContent: content,
      processedContent: content,
      temporalInfo: [],
      temporalRelevanceScore: 0.5, // Neutral score when we can't parse
      containsTemporalRefs: false,
      resolvedDates: []
    };
  }
}

/**
 * Find absolute dates in content using various patterns
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function findAbsoluteDates(content: string, _referenceDate: Date): Array<{originalText: string, resolvedDate: Date, confidence: number, temporalType: 'absolute'}> {
  const results: Array<{originalText: string, resolvedDate: Date, confidence: number, temporalType: 'absolute'}> = [];
  
  // Common date patterns
  const datePatterns = [
    /\b(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})\b/g, // MM/DD/YYYY or MM-DD-YYYY
    /\b(\d{4})[\/\-](\d{1,2})[\/\-](\d{1,2})\b/g,   // YYYY-MM-DD
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2}),?\s*(\d{4})?\b/gi, // Month DD, YYYY
    /\b(\d{1,2})\s+(january|february|march|april|may|june|july|august|september|october|november|december)\s*(\d{4})?\b/gi, // DD Month YYYY
  ];
  
  for (const pattern of datePatterns) {
    const matches = [...content.matchAll(pattern)];
    for (const match of matches) {
      try {
        const dateStr = match[0];
        const parsedDate = new Date(dateStr);
        
        if (!isNaN(parsedDate.getTime()) && parsedDate.getFullYear() > 1900) {
          results.push({
            originalText: dateStr,
            resolvedDate: parsedDate,
            confidence: 0.9,
            temporalType: 'absolute'
          });
        }
      } catch {
        // Skip invalid dates
      }
    }
  }
  
  return results;
}

/**
 * Parse a temporal match from pattern matching
 */
function parseTemporalMatch(
  match: RegExpMatchArray, 
  patternDef: TemporalPattern, 
  referenceDate: Date
): {originalText: string, resolvedDate?: Date, confidence: number, temporalType: 'relative' | 'recurring', recurringPattern?: TemporalInfo['recurringPattern']} | null {
  const originalText = match[0];
  let resolvedDate: Date | undefined;
  let recurringPattern: TemporalInfo['recurringPattern'];
  
  if (patternDef.type === 'recurring') {
    recurringPattern = {
      frequency: patternDef.frequency!
    };
    
    if (patternDef.weekday && match[1]) {
      const weekdayIndex = WEEKDAYS.indexOf(match[1].toLowerCase());
      if (weekdayIndex !== -1) {
        recurringPattern.dayOfWeek = weekdayIndex;
      }
    }
    
    // For recurring patterns, set a representative date
    resolvedDate = new Date(referenceDate);
  } else if (patternDef.type === 'relative') {
    resolvedDate = new Date(referenceDate);
    
    if (patternDef.days !== undefined) {
      resolvedDate.setDate(resolvedDate.getDate() + patternDef.days);
    } else if (patternDef.months !== undefined) {
      resolvedDate.setMonth(resolvedDate.getMonth() + patternDef.months);
    } else if (patternDef.extract) {
      const num = parseInt(match[1] || '1', 10);
      const multiplier = patternDef.negative ? -1 : 1;
      
      if (patternDef.extract === 'days') {
        resolvedDate.setDate(resolvedDate.getDate() + (num * multiplier));
      } else if (patternDef.extract === 'weeks') {
        resolvedDate.setDate(resolvedDate.getDate() + (num * 7 * multiplier));
      } else if (patternDef.extract === 'months') {
        resolvedDate.setMonth(resolvedDate.getMonth() + (num * multiplier));
      }
    } else if (patternDef.weekday && match[1]) {
      const targetWeekday = WEEKDAYS.indexOf(match[1].toLowerCase());
      if (targetWeekday !== -1) {
        const currentWeekday = resolvedDate.getDay();
        let daysToAdd = (targetWeekday - currentWeekday);
        
        if (patternDef.direction === 1) { // next
          if (daysToAdd <= 0) daysToAdd += 7;
        } else if (patternDef.direction === -1) { // last
          if (daysToAdd >= 0) daysToAdd -= 7;
        } else { // this week
          if (daysToAdd < 0) daysToAdd += 7;
        }
        
        resolvedDate.setDate(resolvedDate.getDate() + daysToAdd);
      }
    }
  }
  
  return {
    originalText,
    resolvedDate,
    confidence: 0.8,
    temporalType: patternDef.type,
    recurringPattern
  };
}

/**
 * Create a TemporalInfo object from parsed temporal data
 */
function createTemporalInfo(
  match: {originalText: string, resolvedDate?: Date, confidence: number, temporalType: 'absolute' | 'relative' | 'recurring', recurringPattern?: TemporalInfo['recurringPattern']}, 
  storageDate: Date
): TemporalInfo {
  const currentDate = new Date();
  const daysSinceStorage = Math.floor((currentDate.getTime() - storageDate.getTime()) / (1000 * 60 * 60 * 24));
  
  return {
    originalText: match.originalText,
    resolvedDate: match.resolvedDate,
    temporalType: match.temporalType,
    confidence: match.confidence,
    isInPast: match.resolvedDate ? match.resolvedDate < currentDate : false,
    daysSinceStorage,
    recurringPattern: match.recurringPattern
  };
}

/**
 * Calculate overall temporal relevance score for content
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function calculateTemporalRelevanceScore(temporalInfo: TemporalInfo[], _storageDate: Date): number {
  if (temporalInfo.length === 0) {
    return 0; // No temporal content
  }
  
  let totalScore = 0;
  const currentDate = new Date();
  
  for (const temporal of temporalInfo) {
    let score = temporal.confidence;
    
    // Boost score for future events (more relevant)
    if (temporal.resolvedDate && temporal.resolvedDate > currentDate) {
      score += 0.3;
    }
    
    // Slight boost for recurring events (ongoing relevance)
    if (temporal.recurringPattern) {
      score += 0.2;
    }
    
    // Reduce score for very old events (unless they're recurring)
    if (temporal.isInPast && !temporal.recurringPattern) {
      const daysOld = temporal.daysSinceStorage;
      if (daysOld > 30) {
        score -= 0.2;
      } else if (daysOld > 7) {
        score -= 0.1;
      }
    }
    
    totalScore += score;
  }
  
  // Average the scores and normalize
  const avgScore = totalScore / temporalInfo.length;
  return Math.max(0, Math.min(1, avgScore));
}

/**
 * Check if temporal information is still relevant
 */
export function isTemporallyRelevant(
  temporalInfo: TemporalInfo[], 
  options: { includeExpiredEvents?: boolean; timeFrame?: 'future' | 'past' | 'current' | 'all' } = {}
): boolean {
  if (temporalInfo.length === 0) {
    return true; // Non-temporal content is always relevant
  }
  
  const { includeExpiredEvents = false, timeFrame = 'all' } = options;
  const currentDate = new Date();
  
  for (const temporal of temporalInfo) {
    // Recurring events are always relevant
    if (temporal.recurringPattern) {
      return true;
    }
    
    // Check time frame preferences
    if (timeFrame === 'future' && temporal.resolvedDate && temporal.resolvedDate > currentDate) {
      return true;
    }
    
    if (timeFrame === 'past' && temporal.isInPast) {
      return true;
    }
    
    if (timeFrame === 'current') {
      // Current means within the next week or last week
      if (temporal.resolvedDate) {
        const diffDays = Math.abs((temporal.resolvedDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays <= 7) {
          return true;
        }
      }
    }
    
    if (timeFrame === 'all') {
      // Include if not expired, or if we include expired events
      if (!temporal.isInPast || includeExpiredEvents) {
        return true;
      }
    }
  }
  
  return false;
}

/**
 * Create temporal context for AI responses
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function createTemporalContext(temporalInfo: TemporalInfo[], storageDate: Date): string {
  if (temporalInfo.length === 0) {
    return '';
  }
  
  const contexts: string[] = [];
  const currentDate = new Date();
  
  for (const temporal of temporalInfo) {
    if (temporal.resolvedDate) {
      const resolvedDateStr = temporal.resolvedDate.toLocaleDateString('en-US', { 
        weekday: 'long', 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      });
      
      // Calculate how many days from NOW to the resolved date
      const daysFromNow = Math.ceil((temporal.resolvedDate.getTime() - currentDate.getTime()) / (1000 * 60 * 60 * 24));
      
      let contextStr: string;
      
      if (temporal.isInPast) {
        const daysAgo = Math.abs(daysFromNow);
        if (temporal.recurringPattern) {
          contextStr = `"${temporal.originalText}" refers to ${resolvedDateStr} [recurring ${temporal.recurringPattern.frequency}]`;
        } else {
          contextStr = `"${temporal.originalText}" referred to ${resolvedDateStr} (${daysAgo} days ago)`;
        }
      } else {
        // Future event
        if (daysFromNow === 0) {
          contextStr = `"${temporal.originalText}" refers to today (${resolvedDateStr})`;
        } else if (daysFromNow === 1) {
          contextStr = `"${temporal.originalText}" refers to tomorrow (${resolvedDateStr})`;
        } else {
          contextStr = `"${temporal.originalText}" refers to ${resolvedDateStr} (in ${daysFromNow} days)`;
        }
        
        if (temporal.recurringPattern) {
          contextStr += ` [recurring ${temporal.recurringPattern.frequency}]`;
        }
      }
      
      contexts.push(contextStr);
    }
  }
  
  return contexts.length > 0 ? `Temporal context: ${contexts.join('; ')}` : '';
}

/**
 * Get next occurrence of a recurring event
 */
export function getNextOccurrence(temporal: TemporalInfo, fromDate: Date = new Date()): Date | null {
  if (!temporal.recurringPattern || !temporal.resolvedDate) {
    return null;
  }
  
  const pattern = temporal.recurringPattern;
  const nextDate = new Date(fromDate);
  
  switch (pattern.frequency) {
    case 'daily':
      nextDate.setDate(nextDate.getDate() + 1);
      break;
      
    case 'weekly':
      const currentDay = nextDate.getDay();
      const targetDay = pattern.dayOfWeek ?? currentDay;
      const daysUntilNext = (targetDay - currentDay + 7) % 7;
      nextDate.setDate(nextDate.getDate() + (daysUntilNext === 0 ? 7 : daysUntilNext));
      break;
      
    case 'monthly':
      const targetDayOfMonth = pattern.dayOfMonth ?? nextDate.getDate();
      nextDate.setMonth(nextDate.getMonth() + 1);
      nextDate.setDate(targetDayOfMonth);
      break;
      
    case 'yearly':
      nextDate.setFullYear(nextDate.getFullYear() + 1);
      break;
  }
  
  return nextDate;
} 