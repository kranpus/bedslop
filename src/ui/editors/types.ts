export type Patch<T> = (p: Partial<T>, coalesceKey?: string) => void;
