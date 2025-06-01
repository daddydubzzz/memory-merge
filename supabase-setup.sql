-- Supabase Database Setup Script for Memory Merge Application
-- This script sets up the vector database schema for storing knowledge entries with embeddings

-- Enable the pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;

-- Create the knowledge_vectors table
CREATE TABLE IF NOT EXISTS public.knowledge_vectors (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    account_id TEXT NOT NULL,
    content TEXT NOT NULL,
    tags TEXT[] DEFAULT '{}',
    added_by TEXT NOT NULL,
    embedding vector(1536), -- OpenAI text-embedding-3-small produces 1536-dimensional vectors
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_account_id ON public.knowledge_vectors(account_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_tags ON public.knowledge_vectors USING GIN(tags);
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_created_at ON public.knowledge_vectors(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_knowledge_vectors_embedding ON public.knowledge_vectors USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- Create a function to automatically update the updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Create trigger to automatically update updated_at when record is modified
DROP TRIGGER IF EXISTS update_knowledge_vectors_updated_at ON public.knowledge_vectors;
CREATE TRIGGER update_knowledge_vectors_updated_at
    BEFORE UPDATE ON public.knowledge_vectors
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Create the vector similarity search function
-- Drop existing function if it exists (handles any signature differences)
DROP FUNCTION IF EXISTS match_knowledge_vectors;

CREATE OR REPLACE FUNCTION match_knowledge_vectors(
    query_embedding vector(1536),
    account_id_param text,
    match_threshold float,
    match_count int
)
RETURNS TABLE (
    id uuid,
    account_id text,
    content text,
    tags text[],
    added_by text,
    embedding vector(1536),
    created_at timestamp with time zone,
    updated_at timestamp with time zone,
    similarity float
)
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN query
    SELECT
        knowledge_vectors.id,
        knowledge_vectors.account_id,
        knowledge_vectors.content,
        knowledge_vectors.tags,
        knowledge_vectors.added_by,
        knowledge_vectors.embedding,
        knowledge_vectors.created_at,
        knowledge_vectors.updated_at,
        1 - (knowledge_vectors.embedding <=> query_embedding) as similarity
    FROM knowledge_vectors
    WHERE knowledge_vectors.account_id = account_id_param
        AND 1 - (knowledge_vectors.embedding <=> query_embedding) > match_threshold
    ORDER BY knowledge_vectors.embedding <=> query_embedding
    LIMIT match_count;
END;
$$;

-- Enable Row Level Security (RLS) for security
ALTER TABLE public.knowledge_vectors ENABLE ROW LEVEL SECURITY;

-- Create RLS policies (adjust these based on your authentication requirements)
-- Note: You'll need to replace these with actual authentication policies based on your auth setup

-- Policy for authenticated users to see their account's data
CREATE POLICY "Users can view their account's knowledge vectors" ON public.knowledge_vectors
    FOR SELECT USING (true); -- Replace with actual auth condition like: auth.uid() = ANY(SELECT member_id FROM accounts WHERE id = account_id)

-- Policy for authenticated users to insert their account's data  
CREATE POLICY "Users can insert knowledge vectors for their account" ON public.knowledge_vectors
    FOR INSERT WITH CHECK (true); -- Replace with actual auth condition

-- Policy for authenticated users to update their account's data
CREATE POLICY "Users can update their account's knowledge vectors" ON public.knowledge_vectors
    FOR UPDATE USING (true); -- Replace with actual auth condition

-- Policy for authenticated users to delete their account's data
CREATE POLICY "Users can delete their account's knowledge vectors" ON public.knowledge_vectors
    FOR DELETE USING (true); -- Replace with actual auth condition

-- Grant necessary permissions to authenticated users
GRANT ALL ON public.knowledge_vectors TO authenticated;
GRANT ALL ON public.knowledge_vectors TO anon;

-- Grant execute permission on the search function
GRANT EXECUTE ON FUNCTION match_knowledge_vectors TO authenticated;
GRANT EXECUTE ON FUNCTION match_knowledge_vectors TO anon;

-- Comments for documentation
COMMENT ON TABLE public.knowledge_vectors IS 'Stores knowledge entries with vector embeddings for semantic search';
COMMENT ON COLUMN public.knowledge_vectors.embedding IS 'Vector embedding generated from content using OpenAI text-embedding-3-small (1536 dimensions)';
COMMENT ON FUNCTION match_knowledge_vectors IS 'Performs vector similarity search on knowledge entries for a specific account'; 