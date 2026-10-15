export const STORAGE_SERVICE = Symbol('STORAGE_SERVICE');

/** Abstraction over where uploaded files live (local disk today, S3/GCS later). */
export interface StorageService {
  /** Persists the object and returns its public URL. */
  put(key: string, body: Buffer, contentType: string): Promise<string>;
  delete(key: string): Promise<void>;
  /** Deletes every object whose key starts with `prefix`. */
  deletePrefix(prefix: string): Promise<void>;
}
