-- Fix Supabase function signature mismatch - FINAL VERSION
-- This script updates the match_knowledge_vectors function to match the current codebase exactly

-- Drop any existing versions of the function
DROP FUNCTION IF EXISTS match_knowledge_vectors(vector, text, double precision, integer);
DROP FUNCTION IF EXISTS match_knowledge_vectors(vector, text, double precision, integer, boolean, double precision);

-- Create the correct function that matches our TypeScript interface exactly
CREATE OR REPLACE FUNCTION match_knowledge_vectors(
  query_embedding vector(1536),
  account_id text,
  match_threshold float DEFAULT 0.5,
  match_count int DEFAULT 10,
  include_temporal_filter boolean DEFAULT false,
  temporal_relevance_threshold float DEFAULT 0.3
)
RETURNS TABLE (
  id text,
  firebase_doc_id text,
  enhanced_content text,
  temporal_info jsonb,
  resolved_dates jsonb,
  temporal_relevance_score float,
  contains_temporal_refs boolean,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kv.id,
    kv.firebase_doc_id,
    kv.enhanced_content,
    kv.temporal_info,
    kv.resolved_dates,
    kv.temporal_relevance_score,
    kv.contains_temporal_refs,
    kv.created_at,
    kv.updated_at,
    (kv.embedding <#> query_embedding) * -1 as similarity
  FROM knowledge_vectors kv
  WHERE 
    kv.account_id = match_knowledge_vectors.account_id
    AND (kv.embedding <#> query_embedding) * -1 > match_threshold
    AND (
      include_temporal_filter = false 
      OR kv.temporal_relevance_score >= temporal_relevance_threshold 
      OR kv.contains_temporal_refs = false
    )
  ORDER BY 
    -- Simple similarity ordering
    (kv.embedding <#> query_embedding) * -1 DESC
  LIMIT match_count;
END;
$$;

-- Grant necessary permissions
GRANT EXECUTE ON FUNCTION match_knowledge_vectors TO anon, authenticated;

-- Test the function to make sure it works
SELECT match_knowledge_vectors(
  ARRAY[0.1, 0.2, 0.3]::vector(3)::vector(1536), -- Dummy embedding
  'test-account',
  0.0,
  1
); 