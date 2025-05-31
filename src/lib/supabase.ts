import { createClient } from '@supabase/supabase-js';

// Optimized database types - only vector and AI-specific data (no Firebase duplication)
export interface KnowledgeVector {
  id: string;
  firebase_doc_id: string; // Reference to Firebase document
  account_id: string;
  
  // Vector and AI-specific fields only
  embedding: number[];
  enhanced_content: string; // Enhanced content used for embedding
  
  // Temporal intelligence fields
  temporal_info?: unknown; // JSONB temporal data
  resolved_dates?: unknown; // JSONB resolved dates array
  temporal_relevance_score: number;
  contains_temporal_refs: boolean;
  
  // Metadata
  created_at: string;
  updated_at: string;
}

export interface Database {
  public: {
    Tables: {
      knowledge_vectors: {
        Row: KnowledgeVector;
        Insert: Omit<KnowledgeVector, 'id' | 'created_at' | 'updated_at'>;
        Update: Partial<Omit<KnowledgeVector, 'id' | 'created_at'>>;
      };
    };
    Functions: {
      match_knowledge_vectors: {
        Args: {
          query_embedding: number[];
          account_id: string;
          match_threshold: number;
          match_count: number;
          include_temporal_filter?: boolean;
          temporal_relevance_threshold?: number;
        };
        Returns: Array<Omit<KnowledgeVector, 'account_id'> & { similarity: number }>;
      };
      get_temporally_relevant_knowledge: {
        Args: {
          account_id: string;
          time_frame?: 'future' | 'past' | 'current' | 'all';
          limit_count?: number;
        };
        Returns: Array<Pick<KnowledgeVector, 'id' | 'firebase_doc_id' | 'enhanced_content' | 'temporal_info' | 'resolved_dates' | 'temporal_relevance_score' | 'created_at'>>;
      };
    };
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create and export the typed Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseKey);

export default supabase; 