import { createClient } from '@supabase/supabase-js';

// Database types for type safety
export interface KnowledgeVector {
  id: string;
  account_id: string;
  content: string;
  tags: string[];
  added_by: string;
  embedding: number[];
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
        };
        Returns: Array<KnowledgeVector & { similarity: number }>;
      };
    };
  };
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error('Missing Supabase environment variables');
}

// Create and export the typed Supabase client
export const supabase = createClient<Database>(supabaseUrl, supabaseAnonKey);

export default supabase; 