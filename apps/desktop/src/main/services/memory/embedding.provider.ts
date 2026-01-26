import { injectable, inject } from 'inversify';
import { TYPES } from '@main/core/types';
import type { ILogger } from '@main/core/interfaces';

/**
 * Embedding provider interface for generating vector embeddings.
 */
export interface IEmbeddingProvider {
  /** Generate embedding vector for text */
  embed(text: string): Promise<number[]>;
  /** Batch embed multiple texts */
  embedBatch(texts: string[]): Promise<number[][]>;
  /** Calculate cosine similarity between two vectors */
  similarity(a: number[], b: number[]): number;
  /** Get the embedding dimension */
  getDimension(): number;
  /** Check if the provider is ready */
  isReady(): boolean;
}

/**
 * Configuration for local embedding generation.
 */
export interface LocalEmbeddingConfig {
  /** Embedding dimension (default: 384 for MiniLM) */
  dimension: number;
  /** Vocabulary size for hashing (default: 10000) */
  vocabSize: number;
  /** N-gram range for feature extraction */
  ngramRange: [number, number];
}

/**
 * Local embedding provider using TF-IDF style hashing.
 * 
 * This is a lightweight, local-only embedding solution that doesn't require
 * external APIs or ML models. It uses:
 * - Character and word n-grams for feature extraction
 * - Hash-based vectorization (feature hashing)
 * - TF-IDF weighting for better semantic representation
 * 
 * While not as sophisticated as neural embeddings, it's fast, private,
 * and works well for basic semantic search.
 */
@injectable()
export class LocalEmbeddingProvider implements IEmbeddingProvider {
  private config: LocalEmbeddingConfig;
  private idfWeights: Map<number, number> = new Map();
  private documentCount = 0;
  private readonly stopWords: Set<string>;

  constructor(@inject(TYPES.Logger) private logger: ILogger) {
    this.config = {
      dimension: 384,
      vocabSize: 10000,
      ngramRange: [1, 3],
    };

    // Common English stop words to filter out
    this.stopWords = new Set([
      'a', 'an', 'and', 'are', 'as', 'at', 'be', 'by', 'for', 'from',
      'has', 'he', 'in', 'is', 'it', 'its', 'of', 'on', 'that', 'the',
      'to', 'was', 'were', 'will', 'with', 'the', 'this', 'but', 'they',
      'have', 'had', 'what', 'when', 'where', 'who', 'which', 'why', 'how',
    ]);

    this.logger.debug('LocalEmbeddingProvider initialized', {
      dimension: this.config.dimension,
    });
  }

  /**
   * Generate embedding for a single text.
   */
  async embed(text: string): Promise<number[]> {
    const features = this.extractFeatures(text);
    const vector = this.hashFeatures(features);
    return this.normalize(vector);
  }

  /**
   * Generate embeddings for multiple texts in batch.
   */
  async embedBatch(texts: string[]): Promise<number[][]> {
    return Promise.all(texts.map(text => this.embed(text)));
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
   * Check if provider is ready (always true for local).
   */
  isReady(): boolean {
    return true;
  }

  /**
   * Update IDF weights from a corpus of texts.
   * Call this periodically to improve embedding quality.
   */
  updateIdfWeights(texts: string[]): void {
    const featureDocs = new Map<number, number>();
    
    for (const text of texts) {
      const features = this.extractFeatures(text);
      const uniqueHashes = new Set<number>();
      
      for (const feature of features) {
        const hash = this.hashFeature(feature);
        uniqueHashes.add(hash);
      }
      
      for (const hash of uniqueHashes) {
        featureDocs.set(hash, (featureDocs.get(hash) ?? 0) + 1);
      }
    }

    this.documentCount = texts.length;
    this.idfWeights.clear();

    for (const [hash, docFreq] of featureDocs) {
      // IDF = log(N / df) + 1 (smoothed)
      const idf = Math.log(this.documentCount / docFreq) + 1;
      this.idfWeights.set(hash, idf);
    }

    this.logger.debug('IDF weights updated', {
      documentCount: this.documentCount,
      uniqueFeatures: this.idfWeights.size,
    });
  }

  /**
   * Extract features (n-grams) from text.
   */
  private extractFeatures(text: string): string[] {
    const features: string[] = [];
    const normalized = this.normalizeText(text);
    const words = this.tokenize(normalized);

    const [minN, maxN] = this.config.ngramRange;

    // Word n-grams
    for (let n = minN; n <= maxN; n++) {
      for (let i = 0; i <= words.length - n; i++) {
        const ngram = words.slice(i, i + n).join(' ');
        features.push(`w:${ngram}`);
      }
    }

    // Character n-grams (for handling typos and morphological variations)
    for (const word of words) {
      if (word.length > 3) {
        for (let i = 0; i <= word.length - 3; i++) {
          features.push(`c:${word.slice(i, i + 3)}`);
        }
      }
    }

    return features;
  }

  /**
   * Normalize text for processing.
   */
  private normalizeText(text: string): string {
    return text
      .toLowerCase()
      .replace(/[^\w\s]/g, ' ')  // Replace punctuation with spaces
      .replace(/\s+/g, ' ')       // Collapse multiple spaces
      .trim();
  }

  /**
   * Tokenize text into words.
   */
  private tokenize(text: string): string[] {
    return text
      .split(/\s+/)
      .filter(word => word.length >= 2 && !this.stopWords.has(word));
  }

  /**
   * Hash a single feature to a bucket index.
   */
  private hashFeature(feature: string): number {
    // FNV-1a hash for good distribution
    let hash = 2166136261;
    for (let i = 0; i < feature.length; i++) {
      hash ^= feature.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return Math.abs(hash) % this.config.dimension;
  }

  /**
   * Hash features into a dense vector using feature hashing.
   */
  private hashFeatures(features: string[]): number[] {
    const vector = new Array(this.config.dimension).fill(0);
    const termFreq = new Map<number, number>();

    // Count term frequencies
    for (const feature of features) {
      const hash = this.hashFeature(feature);
      termFreq.set(hash, (termFreq.get(hash) ?? 0) + 1);
    }

    // Apply TF-IDF weighting
    const maxTf = Math.max(...termFreq.values(), 1);

    for (const [hash, tf] of termFreq) {
      // Sublinear TF scaling: 1 + log(tf)
      const tfWeight = 1 + Math.log(tf);
      // Normalized TF
      const tfNorm = tfWeight / (1 + Math.log(maxTf));
      // IDF weight (default to 1 if not in corpus)
      const idfWeight = this.idfWeights.get(hash) ?? 1;
      
      vector[hash] += tfNorm * idfWeight;
    }

    return vector;
  }

  /**
   * L2 normalize a vector to unit length.
   */
  private normalize(vector: number[]): number[] {
    const magnitude = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
    
    if (magnitude === 0) {
      return vector;
    }

    return vector.map(val => val / magnitude);
  }
}

export default LocalEmbeddingProvider;
