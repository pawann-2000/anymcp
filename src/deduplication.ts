import { Tool } from '@modelcontextprotocol/sdk/types.js';

export interface ToolSimilarity {
  score: number;           // 0-1 similarity score
  reason: string;          // Why tools are similar
  mergeStrategy: 'name' | 'description' | 'schema' | 'hybrid';
}

export interface MergedTool extends Tool {
  originalTools: { serverId: string; tool: Tool }[];
  confidence: number;      // Confidence in merge decision
  serverId: string;        // Primary server ID for routing
}

export interface DeduplicationConfig {
  enabled: boolean;
  similarityThreshold: number;
  autoMerge: boolean;
  nameWeight: number;
  descriptionWeight: number;
  schemaWeight: number;
}

export class ToolDeduplicationSystem {
  private config: DeduplicationConfig = {
    enabled: true,
    similarityThreshold: 0.8,
    autoMerge: true,
    nameWeight: 0.4,
    descriptionWeight: 0.35,
    schemaWeight: 0.25
  };

  constructor(config?: Partial<DeduplicationConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
  }

  public analyzeSimilarity(tool1: Tool, tool2: Tool): ToolSimilarity {
    let score = 0;
    const reasons: string[] = [];
    
    // Name similarity (configurable weight, default 40%)
    const nameScore = this.calculateStringSimilarity(tool1.name, tool2.name);
    score += nameScore * this.config.nameWeight;
    if (nameScore > 0.8) reasons.push('similar names');
    
    // Description similarity (configurable weight, default 35%) 
    const descScore = this.calculateStringSimilarity(
      tool1.description || '', 
      tool2.description || ''
    );
    score += descScore * this.config.descriptionWeight;
    if (descScore > 0.7) reasons.push('similar descriptions');
    
    // Schema similarity (configurable weight, default 25%)
    const schemaScore = this.calculateSchemaSimilarity(
      tool1.inputSchema, 
      tool2.inputSchema
    );
    score += schemaScore * this.config.schemaWeight;
    if (schemaScore > 0.8) reasons.push('similar schemas');
    
    return {
      score,
      reason: reasons.length > 0 ? reasons.join(', ') : 'no significant similarities',
      mergeStrategy: this.determineMergeStrategy(nameScore, descScore, schemaScore)
    };
  }

  public mergeTools(tools: { serverId: string; tool: Tool }[]): MergedTool[] {
    if (!this.config.enabled || tools.length === 0) {
      return [];
    }

    // Performance optimization: For large tool sets, use clustering approach
    if (tools.length > 100) {
      return this.mergeToolsWithClustering(tools);
    }

    const merged: MergedTool[] = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < tools.length; i++) {
      if (processed.has(i)) continue;
      
      const similarGroup = [tools[i]];
      const similarities: ToolSimilarity[] = [];
      
      // Find similar tools
      for (let j = i + 1; j < tools.length; j++) {
        if (processed.has(j)) continue;
        
        const similarity = this.analyzeSimilarity(tools[i].tool, tools[j].tool);
        if (similarity.score >= this.config.similarityThreshold) {
          similarGroup.push(tools[j]);
          similarities.push(similarity);
          processed.add(j);
        }
      }
      
      processed.add(i);
      
      if (similarGroup.length > 1) {
        // Create merged tool
        const bestTool = this.selectBestTool(similarGroup);
        const confidence = similarities.length > 0 
          ? similarities.reduce((sum, s) => sum + s.score, 0) / similarities.length
          : 1.0;
        
        const mergedTool: MergedTool = {
          ...bestTool.tool,
          name: this.generateMergedName(similarGroup),
          description: this.generateMergedDescription(similarGroup),
          originalTools: similarGroup,
          confidence,
          serverId: bestTool.serverId // Primary server for routing
        };
        
        merged.push(mergedTool);
      } else {
        // Single tool, convert to MergedTool format
        const singleTool: MergedTool = {
          ...tools[i].tool,
          originalTools: [tools[i]],
          confidence: 1.0,
          serverId: tools[i].serverId
        };
        merged.push(singleTool);
      }
    }
    
    return merged;
  }

  // New optimized method for large tool sets
  private mergeToolsWithClustering(tools: { serverId: string; tool: Tool }[]): MergedTool[] {
    const merged: MergedTool[] = [];
    const processed = new Set<number>();
    
    // Pre-group tools by name similarity for performance
    const nameGroups = this.groupToolsByNameSimilarity(tools);
    
    for (const group of nameGroups) {
      if (group.length === 1) {
        // Single tool, convert to MergedTool format
        const singleTool: MergedTool = {
          ...group[0].tool,
          originalTools: [group[0]],
          confidence: 1.0,
          serverId: group[0].serverId
        };
        merged.push(singleTool);
        continue;
      }
      
      // For tools in the same name group, do detailed similarity analysis
      const subProcessed = new Set<number>();
      
      for (let i = 0; i < group.length; i++) {
        if (subProcessed.has(i)) continue;
        
        const similarGroup = [group[i]];
        const similarities: ToolSimilarity[] = [];
        
        // Only compare within the pre-filtered group
        for (let j = i + 1; j < group.length; j++) {
          if (subProcessed.has(j)) continue;
          
          const similarity = this.analyzeSimilarity(group[i].tool, group[j].tool);
          if (similarity.score >= this.config.similarityThreshold) {
            similarGroup.push(group[j]);
            similarities.push(similarity);
            subProcessed.add(j);
          }
        }
        
        subProcessed.add(i);
        
        if (similarGroup.length > 1) {
          // Create merged tool
          const bestTool = this.selectBestTool(similarGroup);
          const confidence = similarities.length > 0 
            ? similarities.reduce((sum, s) => sum + s.score, 0) / similarities.length
            : 1.0;
          
          const mergedTool: MergedTool = {
            ...bestTool.tool,
            name: this.generateMergedName(similarGroup),
            description: this.generateMergedDescription(similarGroup),
            originalTools: similarGroup,
            confidence,
            serverId: bestTool.serverId
          };
          
          merged.push(mergedTool);
        } else {
          // Single tool in this subgroup
          const singleTool: MergedTool = {
            ...similarGroup[0].tool,
            originalTools: [similarGroup[0]],
            confidence: 1.0,
            serverId: similarGroup[0].serverId
          };
          merged.push(singleTool);
        }
      }
    }
    
    return merged;
  }

  // Helper method to pre-group tools by name similarity
  private groupToolsByNameSimilarity(tools: { serverId: string; tool: Tool }[]): Array<{ serverId: string; tool: Tool }[]> {
    const groups: Array<{ serverId: string; tool: Tool }[]> = [];
    const processed = new Set<number>();
    
    for (let i = 0; i < tools.length; i++) {
      if (processed.has(i)) continue;
      
      const group = [tools[i]];
      processed.add(i);
      
      // Fast name-based grouping (much cheaper than full similarity)
      for (let j = i + 1; j < tools.length; j++) {
        if (processed.has(j)) continue;
        
        const nameSimilarity = this.calculateStringSimilarity(
          tools[i].tool.name, 
          tools[j].tool.name
        );
        
        // Lower threshold for initial grouping to reduce comparisons
        if (nameSimilarity > 0.6) {
          group.push(tools[j]);
          processed.add(j);
        }
      }
      
      groups.push(group);
    }
    
    return groups;
  }

  private calculateStringSimilarity(str1: string, str2: string): number {
    if (!str1 || !str2) return 0;
    if (str1 === str2) return 1;
    
    // Implement Jaro-Winkler similarity
    const jaroSimilarity = this.jaroSimilarity(str1.toLowerCase(), str2.toLowerCase());
    
    // Add prefix bonus (Winkler modification)
    const prefixLength = Math.min(4, this.commonPrefixLength(str1.toLowerCase(), str2.toLowerCase()));
    const winklerSimilarity = jaroSimilarity + (0.1 * prefixLength * (1 - jaroSimilarity));
    
    return Math.min(1, winklerSimilarity);
  }

  private jaroSimilarity(s1: string, s2: string): number {
    if (s1.length === 0 && s2.length === 0) return 1;
    if (s1.length === 0 || s2.length === 0) return 0;
    
    const matchWindow = Math.floor(Math.max(s1.length, s2.length) / 2) - 1;
    const s1Matches = new Array(s1.length).fill(false);
    const s2Matches = new Array(s2.length).fill(false);
    
    let matches = 0;
    let transpositions = 0;
    
    // Find matches
    for (let i = 0; i < s1.length; i++) {
      const start = Math.max(0, i - matchWindow);
      const end = Math.min(i + matchWindow + 1, s2.length);
      
      for (let j = start; j < end; j++) {
        if (s2Matches[j] || s1[i] !== s2[j]) continue;
        s1Matches[i] = true;
        s2Matches[j] = true;
        matches++;
        break;
      }
    }
    
    if (matches === 0) return 0;
    
    // Count transpositions
    let k = 0;
    for (let i = 0; i < s1.length; i++) {
      if (!s1Matches[i]) continue;
      while (!s2Matches[k]) k++;
      if (s1[i] !== s2[k]) transpositions++;
      k++;
    }
    
    return (matches / s1.length + matches / s2.length + (matches - transpositions / 2) / matches) / 3;
  }

  private commonPrefixLength(s1: string, s2: string): number {
    let length = 0;
    for (let i = 0; i < Math.min(s1.length, s2.length); i++) {
      if (s1[i] === s2[i]) {
        length++;
      } else {
        break;
      }
    }
    return length;
  }

  private calculateSchemaSimilarity(schema1: any, schema2: any): number {
    if (!schema1 || !schema2) return 0;
    if (JSON.stringify(schema1) === JSON.stringify(schema2)) return 1;
    
    // Extract and compare key schema features
    const props1 = this.extractSchemaProperties(schema1);
    const props2 = this.extractSchemaProperties(schema2);
    
    if (props1.length === 0 && props2.length === 0) return 1;
    if (props1.length === 0 || props2.length === 0) return 0;
    
    // Calculate property similarity
    const commonProps = props1.filter(p1 => 
      props2.some(p2 => p1.name === p2.name && p1.type === p2.type)
    );
    
    const propSimilarity = (2 * commonProps.length) / (props1.length + props2.length);
    
    // Calculate required fields similarity
    const required1 = schema1.required || [];
    const required2 = schema2.required || [];
    const commonRequired = required1.filter((r: string) => required2.includes(r));
    const requiredSimilarity = required1.length + required2.length > 0 
      ? (2 * commonRequired.length) / (required1.length + required2.length)
      : 1;
    
    // Weighted combination
    return propSimilarity * 0.7 + requiredSimilarity * 0.3;
  }

  private extractSchemaProperties(schema: any): { name: string; type: string; required: boolean }[] {
    const properties = [];
    
    if (schema.properties) {
      const required = schema.required || [];
      for (const [name, prop] of Object.entries(schema.properties)) {
        properties.push({
          name,
          type: (prop as any).type || 'unknown',
          required: required.includes(name)
        });
      }
    }
    
    return properties;
  }

  private determineMergeStrategy(nameScore: number, descScore: number, schemaScore: number): ToolSimilarity['mergeStrategy'] {
    if (nameScore > 0.9 && schemaScore > 0.8) return 'name';
    if (descScore > 0.8 && schemaScore > 0.7) return 'description';
    if (schemaScore > 0.9) return 'schema';
    return 'hybrid';
  }

  private selectBestTool(tools: { serverId: string; tool: Tool }[]): { serverId: string; tool: Tool } {
    // Select tool with best description or most recent usage
    return tools.reduce((best, current) => {
      const bestDescLength = best.tool.description?.length || 0;
      const currentDescLength = current.tool.description?.length || 0;
      
      // Prefer tools with better descriptions
      if (currentDescLength > bestDescLength) return current;
      if (bestDescLength > currentDescLength) return best;
      
      // If descriptions are similar, prefer first tool (stable sorting)
      return best;
    });
  }

  private generateMergedName(tools: { serverId: string; tool: Tool }[]): string {
    // Use the most common or best name
    const names = tools.map(t => t.tool.name);
    const nameCount = new Map<string, number>();
    
    names.forEach(name => {
      nameCount.set(name, (nameCount.get(name) || 0) + 1);
    });
    
    // Return most frequent name, or first if tied
    const mostCommonName = Array.from(nameCount.entries())
      .sort((a, b) => b[1] - a[1])[0][0];
    
    return mostCommonName;
  }

  private generateMergedDescription(tools: { serverId: string; tool: Tool }[]): string {
    // Use the longest or most descriptive description
    const descriptions = tools
      .map(t => t.tool.description)
      .filter((desc): desc is string => desc !== undefined && desc.length > 0);
    
    if (descriptions.length === 0) return 'Merged tool from multiple servers';
    
    // Return longest description
    return descriptions.reduce((longest, current) => 
      current.length > longest.length ? current : longest
    );
  }

  public getConfig(): DeduplicationConfig {
    return { ...this.config };
  }

  public updateConfig(config: Partial<DeduplicationConfig>): void {
    this.config = { ...this.config, ...config };
  }

  public getStats(tools: { serverId: string; tool: Tool }[]): {
    totalTools: number;
    mergedGroups: number;
    reductionPercentage: number;
    avgConfidence: number;
  } {
    const merged = this.mergeTools(tools);
    const mergedGroups = merged.filter(t => t.originalTools.length > 1).length;
    const avgConfidence = merged.length > 0 
      ? merged.reduce((sum, t) => sum + t.confidence, 0) / merged.length
      : 0;
    
    return {
      totalTools: tools.length,
      mergedGroups,
      reductionPercentage: tools.length > 0 ? ((tools.length - merged.length) / tools.length) * 100 : 0,
      avgConfidence
    };
  }
} 