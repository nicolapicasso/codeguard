declare module 'redlock' {
  import type { Redis } from 'ioredis';

  interface Settings {
    driftFactor?: number;
    retryCount?: number;
    retryDelay?: number;
    retryJitter?: number;
    automaticExtensionThreshold?: number;
  }

  interface Lock {
    release(): Promise<void>;
  }

  class Redlock {
    constructor(clients: Redis[], settings?: Settings);
    acquire(resources: string[], duration: number): Promise<Lock>;
    release(lock: Lock): Promise<void>;
  }

  export default Redlock;
}
