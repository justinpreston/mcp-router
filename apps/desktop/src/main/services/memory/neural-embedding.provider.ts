import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { ILogger } from '@main/core/interfaces';
import type { IEmbeddingProvider } from './embedding.provider';

/**
 * Configuration for neural embedding provider.
 */
export interface NeuralEmbeddingConfig {
  /** HuggingFace model ID */
  model: string;
  /** Embedding dimension (384 for all-MiniLM-L6-v2) */
  dimension: number;
  /** Use quantized model for faster inference */
  quantized: boolean;
}

// Default model - all-MiniLM-L6-v2 is fast and good for semantic search
const DEFAULT_MODEL = 'Xenova/all-MiniLM-L6-v2';
const EMBEDDING_DIMENSIONS = 384;

// Types for the transformers.js pipeline
type Pipeline = (
  text: string | string[],
  options: { pooling: string; normalize: boolean }
) => Promise<{ data: Float32Array }>;

/**
 * Neural embedding provider using HuggingFace Transformers.js
 * 
 * Uses the all-MiniLM-L6-v2 model for high-quality semantic embeddings.
 * The model runs locally in the Electron main process - no API calls needed.
 * 
 * Features:
 * - 384-dimensional dense embeddings
 * - Excellent semantic understanding
 * - Fast inference (~50ms per embedding)
 * - Fully local/private operation
 */
@injectable()
export class NeuralEmbeddingProvider implements IEmbeddingProvider {
  private config: NeuralEmbeddingConfig;
  private pipeline: Pipeline | null = null;
  private pipelinePromise: Promise<Pipeline> | null = null;
  private initError: Error | null = null;

  constructor(@inject(TYPES.Logger) private logger: ILogger) {
    this.config = {
      model: DEFAULT_MODEL,
      dimension: EMBEDDING_DIMENSIONS,
      quantized: false,
    };

    this.logger.info('NeuralEmbeddingProvider initialized', {
      model: this.config.model,
      dimension: this.config.dimension,
    });

    // Start loading the model in the background
    this.initPipeline().catch((error) => {
      this.logger.error('Failed to initialize embedding pipeline', { error });
      this.initError = error instanceof Error ? error : new Error(String(error));
    });
  }

  /**
   * Lazily initialize the transformers.js pipeline.
   */
  private async initPipeline(): Promise<Pipeline> {
    if (this.pipeline) {
      return this.pipeline;
    }

    if (this.pipelinePromise) {
      return this.pipelinePromise;
    }

    this.pipelinePromise = (async () => {
      this.logger.info('Loading embedding model...', { model: this.config.model });
      const startTime = Date.now();

      try {
        // Dynamic import to avoid loading at startup
        const { pipeline: createPipeline } = await import('@huggingface/transformers');
        
        // @ts-expect-error - Pipeline type is complex, we cast to our simplified type
        this.pipeline = await createPipeline('feature-extraction', this.config.model, {
          dtype: this.config.quantized ? 'q8' : 'fp32',
        }) as Pipeline;

        const loadTime = Date.now() - startTime;
        this.logger.info('Embedding model loaded', { 
          model: this.config.model,
          loadTimeMs: loadTime,
        });

        return this.pipeline;
      } catch (error) {
        this.logger.error('Failed to load embedding model', { error });
        throw error;
      }
    })();

    return this.pipelinePromise;
  }

  /**
   * Generate embedding for a single text.
   */
  async embed(text: string): Promise<number[]> {
    const pipe = await this.initPipeline();

    const result = await pipe(text, {
      pooling: 'mean',
      normalize: true,
    });

    // Convert Float32Array to regular array
    return Array.from(result.data);
  }

  /**
   * Generate embeddings for multiple texts in batch.
   * More efficient than calling embed() multiple times.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) {
      return [];
    }

    const pipe = await this.initPipeline();

    // Process in batches to avoid memory issues
    const batchSize = 32;
    const results: number[][] = [];

    for (let i = 0; i < texts.length; i += batchSize) {
      const batch = texts.slice(i, i + batchSize);
      
      // Process batch
      for (const text of batch) {
        const result = await pipe(text, {
          pooling: 'mean',
          normalize: true,
        });
        results.push(Array.from(result.data));
      }
    }

    return results;
  }

  /**
   * Calculate cosine similarity between two vectors.
   * Returns value between -1 and 1 (1 = identical, 0 = orthogonal, -1 = opposite).
   */
  similarity(a: number[], b: number[]): number {
    if (a.length !== b.length) {
      throw new Error(`Vector dimensions must match: ${a.length} vs ${b.length}`);
    }

    let dotProduct = 0;
    let normA = 0;
    let normB = 0;

    for (let i = 0; i < a.length; i++) {
      const aVal = a[i]!;
      const bVal = b[i]!;
      dotProduct += aVal * bVal;
      normA += aVal * aVal;
      normB += bVal * bVal;
    }

    const magnitude = Math.sqrt(normA) * Math.sqrt(normB);
    return magnitude === 0 ? 0 : dotProduct / magnitude;
  }

  /**
   * Get the embedding dimension.
   */
  getDimension(): number {
    return this.config.dimension;
  }

  /**
   * Check if provider is ready (model loaded).
   */
  isReady(): boolean {
    return this.pipeline !== null && this.initError === null;
  }

  /**
   * Get the initialization error if any.
   */
  getInitError(): Error | null {
    return this.initError;
  }

  /**
   * Get model info for diagnostics.
   */
  getModelInfo(): { model: string; dimension: number; ready: boolean; error?: string } {
    return {
      model: this.config.model,
      dimension: this.config.dimension,
      ready: this.isReady(),
      error: this.initError?.message,
    };
  }
}

export default NeuralEmbeddingProvider;
