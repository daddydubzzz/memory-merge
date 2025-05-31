  -- FINAL FIX: Create new function with CORRECT data types to match actual table schema
  -- Based on error showing: id is uuid (not text), updated_at is timestamp with time zone

  -- Drop any existing versions of the function
  DROP FUNCTION IF EXISTS match_knowledge_vectors(vector, text, double precision, integer);
  DROP FUNCTION IF EXISTS match_knowledge_vectors(vector, text, double precision, integer, boolean, double precision);
  DROP FUNCTION IF EXISTS match_knowledge_vectors(vector(1536), text, float, int, boolean, float);
  DROP FUNCTION IF EXISTS search_knowledge_vectors_v2(vector(1536), text, float, int, boolean, float);

  -- Create a new function with CORRECT data types matching the actual table
  CREATE OR REPLACE FUNCTION search_knowledge_vectors_v2(
    query_embedding vector(1536),
    account_id text,
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10,
    include_temporal_filter boolean DEFAULT false,
    temporal_relevance_threshold float DEFAULT 0.3
  )
  RETURNS TABLE (
    id uuid,
    firebase_doc_id text,
    embedding vector(1536),
    enhanced_content text,
    temporal_info jsonb,
    resolved_dates jsonb,
    temporal_relevance_score double precision,
    contains_temporal_refs boolean,
    created_at timestamp without time zone,
    updated_at timestamp with time zone,
    similarity double precision
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
      ((kv.embedding <#> query_embedding) * -1)::double precision as similarity
    FROM knowledge_vectors kv
    WHERE 
      kv.account_id = search_knowledge_vectors_v2.account_id
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

  -- Now create the proper match_knowledge_vectors function with correct types
  CREATE OR REPLACE FUNCTION match_knowledge_vectors(
    query_embedding vector(1536),
    account_id text,
    match_threshold float DEFAULT 0.5,
    match_count int DEFAULT 10,
    include_temporal_filter boolean DEFAULT false,
    temporal_relevance_threshold float DEFAULT 0.3
  )
  RETURNS TABLE (
    id uuid,
    firebase_doc_id text,
    embedding vector(1536),
    enhanced_content text,
    temporal_info jsonb,
    resolved_dates jsonb,
    temporal_relevance_score double precision,
    contains_temporal_refs boolean,
    created_at timestamp without time zone,
    updated_at timestamp with time zone,
    similarity double precision
  )
  LANGUAGE plpgsql
  AS $$
  BEGIN
    RETURN QUERY
    SELECT * FROM search_knowledge_vectors_v2(
      query_embedding,
      account_id,
      match_threshold,
      match_count,
      include_temporal_filter,
      temporal_relevance_threshold
    );
  END;
  $$;

  -- Grant necessary permissions
  GRANT EXECUTE ON FUNCTION search_knowledge_vectors_v2 TO anon, authenticated;
  GRANT EXECUTE ON FUNCTION match_knowledge_vectors TO anon, authenticated;

  -- Test the new function works
  SELECT 'Testing new function with correct data types...' as status;

  -- Test search_knowledge_vectors_v2 with simple query
  SELECT id, firebase_doc_id, similarity 
  FROM search_knowledge_vectors_v2(
    ARRAY(SELECT 0.1 FROM generate_series(1, 1536))::vector(1536),
    'iVjLBoNSrfYcHSsAEFEx',
    0.0,
    1
  ) LIMIT 1;

  -- Show current table schema for reference
  SELECT column_name, data_type 
  FROM information_schema.columns 
  WHERE table_name = 'knowledge_vectors' 
  ORDER BY column_name; 