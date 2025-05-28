-- Supabase Vector Search Setup for Memory Merge
-- Run these commands in your Supabase SQL Editor

-- 1. Enable the vector extension (if not already enabled)
create extension if not exists vector;

-- 2. Create the knowledge_vectors table (if not already created)
create table if not exists knowledge_vectors (
  id text primary key,
  account_id text not null,
  content text not null,
  embedding vector(1536) not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- 3. Add missing columns if they don't exist (for existing tables)
-- Add category column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'knowledge_vectors' AND column_name = 'category') THEN
        ALTER TABLE knowledge_vectors ADD COLUMN category text not null default 'Other';
    END IF;
END $$;

-- Add tags column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'knowledge_vectors' AND column_name = 'tags') THEN
        ALTER TABLE knowledge_vectors ADD COLUMN tags text[] default '{}';
    END IF;
END $$;

-- Add added_by column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'knowledge_vectors' AND column_name = 'added_by') THEN
        ALTER TABLE knowledge_vectors ADD COLUMN added_by text not null default '';
    END IF;
END $$;

-- Add updated_at column if it doesn't exist
DO $$ 
BEGIN 
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'knowledge_vectors' AND column_name = 'updated_at') THEN
        ALTER TABLE knowledge_vectors ADD COLUMN updated_at timestamptz default now();
    END IF;
END $$;

-- 4. Create indexes for better performance
create index if not exists knowledge_vectors_account_id_idx on knowledge_vectors (account_id);
create index if not exists knowledge_vectors_category_idx on knowledge_vectors (category);
create index if not exists knowledge_vectors_created_at_idx on knowledge_vectors (created_at desc);

-- 5. Create vector similarity index for fast searching
create index if not exists knowledge_vectors_embedding_idx on knowledge_vectors 
using hnsw (embedding vector_cosine_ops);

-- 6. Create the vector similarity search function
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
  category text,
  tags text[],
  added_by text,
  created_at timestamptz,
  updated_at timestamptz,
  similarity float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    knowledge_vectors.id,
    knowledge_vectors.account_id,
    knowledge_vectors.content,
    knowledge_vectors.category,
    knowledge_vectors.tags,
    knowledge_vectors.added_by,
    knowledge_vectors.created_at,
    knowledge_vectors.updated_at,
    (knowledge_vectors.embedding <#> query_embedding) * -1 AS similarity
  FROM knowledge_vectors
  WHERE knowledge_vectors.account_id = match_knowledge_vectors.account_id
    AND (knowledge_vectors.embedding <#> query_embedding) * -1 > match_threshold
  ORDER BY knowledge_vectors.embedding <#> query_embedding
  LIMIT match_count;
$$;

-- 7. Enable Row Level Security (RLS) for data protection
alter table knowledge_vectors enable row level security;

-- 8. Create RLS policies (adjust based on your auth setup)
-- Note: You'll need to adjust these policies based on how you handle authentication
-- For now, this allows all authenticated users to access data for their account

-- Policy for SELECT operations
create policy "Users can view knowledge for their account" on knowledge_vectors
  for select using (true); -- Adjust this based on your auth implementation

-- Policy for INSERT operations  
create policy "Users can insert knowledge for their account" on knowledge_vectors
  for insert with check (true); -- Adjust this based on your auth implementation

-- Policy for UPDATE operations
create policy "Users can update knowledge for their account" on knowledge_vectors
  for update using (true); -- Adjust this based on your auth implementation

-- Policy for DELETE operations
create policy "Users can delete knowledge for their account" on knowledge_vectors
  for delete using (true); -- Adjust this based on your auth implementation

-- 9. Grant necessary permissions
grant usage on schema public to anon, authenticated;
grant all on knowledge_vectors to anon, authenticated;
grant execute on function match_knowledge_vectors to anon, authenticated;

-- 10. Create helpful utility functions

-- Function to get category statistics
CREATE OR REPLACE FUNCTION get_category_stats(account_id_param text)
RETURNS TABLE (
  category text,
  count bigint
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    category,
    COUNT(*) as count
  FROM knowledge_vectors 
  WHERE account_id = account_id_param
  GROUP BY category
  ORDER BY count DESC;
$$;

-- Function to get recent entries
CREATE OR REPLACE FUNCTION get_recent_knowledge(
  account_id_param text,
  limit_count int DEFAULT 20
)
RETURNS TABLE (
  id text,
  content text,
  category text,
  tags text[],
  added_by text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE sql STABLE
AS $$
  SELECT 
    id,
    content,
    category,
    tags,
    added_by,
    created_at,
    updated_at
  FROM knowledge_vectors 
  WHERE account_id = account_id_param
  ORDER BY created_at DESC
  LIMIT limit_count;
$$;

-- Grant execute permissions on utility functions
grant execute on function get_category_stats to anon, authenticated;
grant execute on function get_recent_knowledge to anon, authenticated;

-- Setup complete! You can now use the vector search functionality. 