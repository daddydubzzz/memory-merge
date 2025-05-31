  -- FINAL FIX: Supabase function signature to match actual table schema
  -- Based on test results showing table has: firebase_doc_id, enhanced_content (not content, tags, etc.)

  -- Drop any existing versions of the function
  DROP FUNCTION IF EXISTS match_knowledge_vectors(vector, text, double precision, integer);
  DROP FUNCTION IF EXISTS match_knowledge_vectors(vector, text, double precision, integer, boolean, double precision);

  -- Create the function that matches the ACTUAL table schema from test results
  -- Returns: Omit<KnowledgeVector, 'account_id'> & { similarity: number }
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
    embedding vector(1536),
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
      kv.embedding,
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
      (kv.embedding <#> query_embedding) * -1 DESC
    LIMIT match_count;
  END;
  $$;

  -- Grant necessary permissions
  GRANT EXECUTE ON FUNCTION match_knowledge_vectors TO anon, authenticated;

  -- Test the function works with the current schema
  SELECT 'Testing function with current schema...' as status;

  -- Show current table schema for reference
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'knowledge_vectors' 
  ORDER BY column_name; 