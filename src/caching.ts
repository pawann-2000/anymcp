
interface CacheEntry {
  data: any;
  expiry: number;
  hitCount: number;
  lastAccess: Date;
  toolType: string;
}

interface CacheStats {
  size: number;
  hitRate: number;
  totalRequests: number;
  totalHits: number;
  avgHitCount: number;
  oldestEntry: Date | null;
  newestEntry: Date | null;
  recommendations: string[];
}

export class CachingSystem {
  private cache: Map<string, CacheEntry> = new Map();
  private defaultTTL: number = 300000; // 5 minutes
  private maxSize: number = 1000;
  private totalRequests: number = 0;
  private totalHits: number = 0;
  
  private toolTypeTTL: Map<string, number> = new Map([
    ['filesystem', 60000],    // 1 minute for file operations
    ['database', 180000],     // 3 minutes for database queries
    ['network', 120000],      // 2 minutes for network calls
    ['computation', 600000],  // 10 minutes for expensive computations
    ['static', 3600000],      // 1 hour for static/reference data
  ]);

  public get(key: string): any | null {
    this.totalRequests++;
    
    const entry = this.cache.get(key);
    if (entry && entry.expiry > Date.now()) {
      entry.hitCount++;
      entry.lastAccess = new Date();
      this.totalHits++;
      return entry.data;
    }
    
    if (entry) {
      this.cache.delete(key);
    }
    
    return null;
  }

  public set(key: string, data: any, customTTL?: number, toolType: string = 'default') {
    if (!this.shouldCache(key, data)) {
      return;
    }

    const ttl = customTTL || this.getTTLForToolType(toolType);
    
    if (this.cache.size >= this.maxSize) {
      this.evictLeastRecentlyUsed();
    }
    
    this.cache.set(key, {
      data,
      expiry: Date.now() + ttl,
      hitCount: 0,
      lastAccess: new Date(),
      toolType
    });
  }

  public adjustTTL(toolType: string, hitRate: number) {
    const currentTTL = this.toolTypeTTL.get(toolType) || this.defaultTTL;
    let newTTL = currentTTL;

    if (hitRate > 0.7) {
      newTTL = Math.min(currentTTL * 1.2, 3600000); // Increase TTL by 20%, max 1 hour
    } else if (hitRate < 0.2) {
      newTTL = Math.max(currentTTL * 0.8, 60000); // Decrease TTL by 20%, min 1 minute
    }

    if (newTTL !== currentTTL) {
      this.toolTypeTTL.set(toolType, newTTL);
      console.error(`Adjusted TTL for ${toolType}: ${Math.round(currentTTL / 1000)}s -> ${Math.round(newTTL / 1000)}s`);
    }
  }

  public getTTLForToolType(toolType: string): number {
    return this.toolTypeTTL.get(toolType) || this.defaultTTL;
  }

  public shouldCache(toolName: string, params: any): boolean {
    if (toolName.includes('random') || toolName.includes('uuid')) {
      return false;
    }
    
    if (toolName.includes('current_time') || toolName.includes('now')) {
      return false;
    }
    
    if (params && typeof params === 'object') {
      const paramStr = JSON.stringify(params).toLowerCase();
      if (paramStr.includes('timestamp') || paramStr.includes('current')) {
        return false;
      }
    }
    
    return true;
  }

  private evictLeastRecentlyUsed() {
    let oldestKey: string | null = null;
    let oldestTime = Date.now();
    
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess.getTime() < oldestTime) {
        oldestTime = entry.lastAccess.getTime();
        oldestKey = key;
      }
    }
    
    if (oldestKey) {
      this.cache.delete(oldestKey);
    }
  }

  public getStats(): CacheStats {
    const entries = Array.from(this.cache.values());
    const now = Date.now();
    
    const validEntries = entries.filter(entry => entry.expiry > now);
    const hitRate = this.totalRequests > 0 ? this.totalHits / this.totalRequests : 0;
    const avgHitCount = validEntries.length > 0 
      ? validEntries.reduce((sum, entry) => sum + entry.hitCount, 0) / validEntries.length 
      : 0;
    
    const accessTimes = validEntries.map(entry => entry.lastAccess);
    const oldestEntry = accessTimes.length > 0 ? new Date(Math.min(...accessTimes.map(d => d.getTime()))) : null;
    const newestEntry = accessTimes.length > 0 ? new Date(Math.max(...accessTimes.map(d => d.getTime()))) : null;
    
    const recommendations = this.generateOptimizationRecommendations(hitRate, validEntries.length);

    this.updateToolTypeMetricsAndAdjustTTLs();
    
    return {
      size: this.cache.size,
      hitRate,
      totalRequests: this.totalRequests,
      totalHits: this.totalHits,
      avgHitCount,
      oldestEntry,
      newestEntry,
      recommendations
    };
  }

  private updateToolTypeMetricsAndAdjustTTLs() {
    const toolTypeMetrics = this.getToolTypeMetrics();
    for (const [toolType, metrics] of Object.entries(toolTypeMetrics)) {
      this.adjustTTL(toolType, metrics.hitRate);
    }
  }

  private generateOptimizationRecommendations(hitRate: number, validEntries: number): string[] {
    const recommendations: string[] = [];
    
    if (hitRate < 0.3) {
      recommendations.push('Low cache hit rate detected. Consider increasing TTL for frequently accessed tools.');
    }
    
    if (validEntries / this.maxSize > 0.9) {
      recommendations.push('Cache is near capacity. Consider increasing max size or implementing more aggressive eviction.');
    }
    
    if (hitRate > 0.8) {
      recommendations.push('Excellent cache performance! Consider expanding cache size to store more entries.');
    }
    
    if (this.totalRequests < 10) {
      recommendations.push('Insufficient data for meaningful cache analysis. Continue using the system to gather metrics.');
    }
    
    return recommendations;
  }

  public clear() {
    this.cache.clear();
    this.totalRequests = 0;
    this.totalHits = 0;
  }

  public getToolTypeMetrics() {
    const toolTypeStats = new Map<string, { count: number; avgHitCount: number; hitRate: number }>();
    
    for (const entry of this.cache.values()) {
      if (!toolTypeStats.has(entry.toolType)) {
        toolTypeStats.set(entry.toolType, { count: 0, avgHitCount: 0, hitRate: 0 });
      }
      
      const stats = toolTypeStats.get(entry.toolType)!;
      stats.count++;
      stats.avgHitCount += entry.hitCount;
    }
    
    for (const [toolType, stats] of toolTypeStats) {
      stats.avgHitCount = stats.avgHitCount / stats.count;
      stats.hitRate = stats.avgHitCount > 0 ? stats.avgHitCount / this.totalRequests : 0;
    }
    
    return Object.fromEntries(toolTypeStats);
  }
}
