// Embedding API Client - SiliconFlow

const SILICONFLOW_API_KEY = 'sk-epghmqrstteavwiemdnryihnsaypdlqygmxqrbyzuspibntl';
const SILICONFLOW_BASE_URL = 'https://api.siliconflow.cn/v1';

export interface EmbeddingOptions {
  model?: string;
}

/**
 * Generate embedding vector using SiliconFlow API
 * @param text Text to embed
 * @param options Embedding options (model selection)
 * @returns Embedding vector as number array
 */
export async function embed(
  text: string,
  options: EmbeddingOptions = {}
): Promise<number[]> {
  const model = options.model || 'BAAI/bge-m3';

  const response = await fetch(`${SILICONFLOW_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: text
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding API failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.data || !data.data[0] || !data.data[0].embedding) {
    throw new Error('Invalid embedding response format');
  }

  return data.data[0].embedding;
}

/**
 * Batch embed multiple texts
 * @param texts Array of texts to embed
 * @param options Embedding options
 * @returns Array of embedding vectors
 */
export async function embedBatch(
  texts: string[],
  options: EmbeddingOptions = {}
): Promise<number[][]> {
  const model = options.model || 'BAAI/bge-m3';

  const response = await fetch(`${SILICONFLOW_BASE_URL}/embeddings`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${SILICONFLOW_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model,
      input: texts
    })
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Batch embedding API failed (${response.status}): ${errorText}`);
  }

  const data = await response.json();

  if (!data.data || !Array.isArray(data.data)) {
    throw new Error('Invalid batch embedding response format');
  }

  return data.data.map((item: any) => item.embedding);
}
