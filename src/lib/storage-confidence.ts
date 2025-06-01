import type { ProcessedQuery } from './openai';

// Confidence thresholds per intent type
const CONFIDENCE_THRESHOLDS = {
  store: 0.7,      // High confidence needed for new information
  update: 0.8,     // Very high confidence for changes/updates
  purchase: 0.6,   // Shopping actions are usually clear
  clear_list: 0.6, // List operations are usually clear
  retrieve: 0.4,   // Searches can be fuzzy
  unclear: 0.0     // Always allow unclear intent (fallback)
} as const;

export interface ConfidenceCheckResult {
  shouldProceed: boolean;
  reason?: string;
  clarificationPrompt?: string;
  suggestions?: string[];
}

/**
 * Check if the processed query meets confidence thresholds for storage
 */
export function checkStorageConfidence(processedQuery: ProcessedQuery): ConfidenceCheckResult {
  const threshold = CONFIDENCE_THRESHOLDS[processedQuery.intent];
  
  // Always proceed if confidence meets threshold
  if (processedQuery.confidence >= threshold) {
    return { shouldProceed: true };
  }

  // Generate specific clarification based on intent and confidence level
  return generateClarificationResponse(processedQuery, threshold);
}

/**
 * Generate helpful clarification prompts for low-confidence queries
 */
function generateClarificationResponse(
  processedQuery: ProcessedQuery, 
  requiredThreshold: number
): ConfidenceCheckResult {
  const { intent, confidence } = processedQuery;
  
  // Very low confidence - generic help
  if (confidence < 0.3) {
    return {
      shouldProceed: false,
      reason: `Very low confidence (${Math.round(confidence * 100)}%)`,
      clarificationPrompt: "I'm not sure what you'd like me to do with that. Could you be more specific about whether you want to store new information, update something existing, or search for something?",
      suggestions: [
        "Try: 'Remember that...' to store information",
        "Try: 'What do I know about...' to search",
        "Try: 'Update my...' to change existing info"
      ]
    };
  }

  // Intent-specific clarifications
  switch (intent) {
    case 'store':
      return {
        shouldProceed: false,
        reason: `Storage confidence too low (${Math.round(confidence * 100)}% < ${Math.round(requiredThreshold * 100)}%)`,
        clarificationPrompt: "I think you want me to store some information, but I'm not entirely sure what the key details are. Could you rephrase what you'd like me to remember?",
        suggestions: [
          "Try being more specific about what to store",
          "Include the main topic or category",
          "Add more context or details"
        ]
      };

    case 'update':
      return {
        shouldProceed: false,
        reason: `Update confidence too low (${Math.round(confidence * 100)}% < ${Math.round(requiredThreshold * 100)}%)`,
        clarificationPrompt: "I think you want to update some existing information, but I'm not sure exactly what you're changing. Could you be more specific about what you're updating and what the new information should be?",
        suggestions: [
          "Try: 'Update my [topic] to [new info]'",
          "Be specific about what's changing",
          "Include both old and new information"
        ]
      };

    case 'purchase':
      return {
        shouldProceed: false,
        reason: `Purchase confidence too low (${Math.round(confidence * 100)}% < ${Math.round(requiredThreshold * 100)}%)`,
        clarificationPrompt: "I think you bought something, but I'm not sure exactly which items. Could you tell me specifically what you purchased?",
        suggestions: [
          "Try: 'I bought [specific items]'",
          "List the exact items you purchased",
          "Be specific about what you got"
        ]
      };

    case 'clear_list':
      return {
        shouldProceed: false,
        reason: `Clear list confidence too low (${Math.round(confidence * 100)}% < ${Math.round(requiredThreshold * 100)}%)`,
        clarificationPrompt: "I think you want to clear a list, but I'm not sure which one. Could you specify which list you want to clear?",
        suggestions: [
          "Try: 'Clear my shopping list'",
          "Try: 'Clear my grocery list'",
          "Be specific about which list to clear"
        ]
      };

    case 'retrieve':
      // Retrieve has very low threshold, so if we're here, confidence is extremely low
      return {
        shouldProceed: false,
        reason: `Search confidence too low (${Math.round(confidence * 100)}% < ${Math.round(requiredThreshold * 100)}%)`,
        clarificationPrompt: "I'm not sure what you're looking for. Could you be more specific about what information you need?",
        suggestions: [
          "Try asking 'What do I know about...'",
          "Be more specific about the topic",
          "Include key details you remember"
        ]
      };

    default:
      return {
        shouldProceed: false,
        reason: `Unclear intent with low confidence (${Math.round(confidence * 100)}%)`,
        clarificationPrompt: "I'm not sure how to help with that. Could you rephrase what you're trying to do?",
        suggestions: [
          "Try being more direct about your request",
          "Let me know if you want to store, search, or update info",
          "Add more context to your message"
        ]
      };
  }
}

/**
 * Get the confidence threshold for a specific intent
 */
export function getConfidenceThreshold(intent: ProcessedQuery['intent']): number {
  return CONFIDENCE_THRESHOLDS[intent];
}

/**
 * Check if an intent is storage-related (needs confidence check)
 */
export function isStorageIntent(intent: ProcessedQuery['intent']): boolean {
  return ['store', 'update', 'purchase', 'clear_list'].includes(intent);
} 