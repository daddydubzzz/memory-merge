-- Temporal Intelligence Migration for Memory Merge
-- This migration adds temporal awareness capabilities to the knowledge management system

-- Add temporal awareness fields to knowledge_vectors table
ALTER TABLE knowledge_vectors ADD COLUMN IF NOT EXISTS temporal_info JSONB;
ALTER TABLE knowledge_vectors ADD COLUMN IF NOT EXISTS resolved_dates JSONB;
ALTER TABLE knowledge_vectors ADD COLUMN IF NOT EXISTS temporal_relevance_score FLOAT DEFAULT 0;
ALTER TABLE knowledge_vectors ADD COLUMN IF NOT EXISTS contains_temporal_refs BOOLEAN DEFAULT FALSE;
ALTER TABLE knowledge_vectors ADD COLUMN IF NOT EXISTS processed_content TEXT;

-- Create indexes for efficient temporal queries
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_temporal 
ON knowledge_vectors(contains_temporal_refs, temporal_relevance_score);

CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_resolved_dates 
ON knowledge_vectors USING GIN(resolved_dates);

CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_temporal_info 
ON knowledge_vectors USING GIN(temporal_info);

-- Add temporal fields to the match_knowledge_vectors function
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
  account_id text,
  content text,
  enhanced_content text,
  processed_content text,
  tags text[],
  added_by text,
  added_by_name text,
  created_at timestamptz,
  updated_at timestamptz,
  temporal_info jsonb,
  resolved_dates jsonb,
  temporal_relevance_score float,
  contains_temporal_refs boolean,
  similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kv.id,
    kv.account_id,
    kv.content,
    kv.enhanced_content,
    kv.processed_content,
    kv.tags,
    kv.added_by,
    kv.added_by_name,
    kv.created_at,
    kv.updated_at,
    kv.temporal_info,
    kv.resolved_dates,
    kv.temporal_relevance_score,
    kv.contains_temporal_refs,
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
    -- Boost temporal relevance in sorting
    (
      (kv.embedding <#> query_embedding) * -1 * 0.7 + 
      COALESCE(kv.temporal_relevance_score, 0) * 0.3
    ) DESC
  LIMIT match_count;
END;
$$;

-- Create a function to get temporally relevant knowledge
CREATE OR REPLACE FUNCTION get_temporally_relevant_knowledge(
  account_id text,
  time_frame text DEFAULT 'all', -- 'future', 'past', 'current', 'all'
  limit_count int DEFAULT 20
)
RETURNS TABLE (
  id text,
  content text,
  temporal_info jsonb,
  resolved_dates jsonb,
  temporal_relevance_score float,
  created_at timestamptz
)
LANGUAGE plpgsql
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    kv.id,
    kv.content,
    kv.temporal_info,
    kv.resolved_dates,
    kv.temporal_relevance_score,
    kv.created_at
  FROM knowledge_vectors kv
  WHERE 
    kv.account_id = get_temporally_relevant_knowledge.account_id
    AND kv.contains_temporal_refs = true
    AND (
      time_frame = 'all'
      OR (time_frame = 'future' AND kv.temporal_relevance_score > 0.6)
      OR (time_frame = 'past' AND kv.temporal_relevance_score BETWEEN 0.2 AND 0.6)
      OR (time_frame = 'current' AND kv.temporal_relevance_score > 0.5)
    )
  ORDER BY 
    kv.temporal_relevance_score DESC,
    kv.created_at DESC
  LIMIT limit_count;
END;
$$;

-- Create a function to update temporal relevance scores (for background processing)
CREATE OR REPLACE FUNCTION update_temporal_relevance_scores(account_id text)
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
  -- This function can be called periodically to update temporal relevance scores
  -- as time passes and events become past/current/future
  UPDATE knowledge_vectors 
  SET temporal_relevance_score = CASE
    WHEN contains_temporal_refs = false THEN 0
    WHEN temporal_info IS NULL THEN 0
    ELSE GREATEST(0, LEAST(1, 
      -- Basic score calculation (can be enhanced with more sophisticated logic)
      CASE 
        WHEN extract(epoch from (now() - created_at)) / 86400 > 30 THEN 0.3
        WHEN extract(epoch from (now() - created_at)) / 86400 > 7 THEN 0.5
        ELSE 0.8
      END
    ))
  END
  WHERE account_id = update_temporal_relevance_scores.account_id;
END;
$$;

-- Add helpful comments
COMMENT ON COLUMN knowledge_vectors.temporal_info IS 'JSON containing parsed temporal information including original text, resolved dates, and confidence scores';
COMMENT ON COLUMN knowledge_vectors.resolved_dates IS 'Array of resolved absolute dates from temporal expressions';
COMMENT ON COLUMN knowledge_vectors.temporal_relevance_score IS 'Score from 0-1 indicating how temporally relevant this content is currently';
COMMENT ON COLUMN knowledge_vectors.contains_temporal_refs IS 'Quick boolean flag to identify content with temporal references';
COMMENT ON COLUMN knowledge_vectors.processed_content IS 'Content with temporal expressions enhanced with resolved dates for better embedding';

-- Grant necessary permissions (adjust as needed for your setup)
-- GRANT SELECT, INSERT, UPDATE ON knowledge_vectors TO authenticated;
-- GRANT EXECUTE ON FUNCTION match_knowledge_vectors TO authenticated;
-- GRANT EXECUTE ON FUNCTION get_temporally_relevant_knowledge TO authenticated; 