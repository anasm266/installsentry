export interface LockfilePackage {
  version: string;
  resolved?: string;
  integrity?: string;
  dependencies?: Record<string, string>;
  dev?: boolean;
  optional?: boolean;
}

export interface Lockfile {
  lockfileVersion: number;
  packages: Record<string, LockfilePackage>;
}

export interface GraphNode {
  id: string; // e.g. "node_modules/foo"
  name: string; // "foo"
  version: string;
  hasLifecycleScripts: boolean;
  scripts?: Record<string, string>;
  resolved?: string;
  integrity?: string;
}

export interface GraphEdge {
  from: string;
  to: string;
}

export interface DependencyGraph {
  nodes: Map<string, GraphNode>;
  edges: GraphEdge[];
}

export interface TraceEvent {
  type: 'fs.read' | 'fs.write' | 'http.request' | 'child_process.spawn' | 'lifecycle.start' | 'lifecycle.end';
  package?: string; // which package triggered it
  script?: string; // which lifecycle script
  timestamp: number;
  details: Record<string, unknown>;
}

export interface SecretCanary {
  name: string;
  value: string;
  pattern: RegExp;
}

export interface AnalysisResult {
  events: TraceEvent[];
  secretHits: Array<{
    canary: string;
    package: string;
    filePath: string;
    timestamp: number;
  }>;
  networkRequests: Array<{
    package: string;
    host: string;
    method: string;
    url: string;
    timestamp: number;
  }>;
  fileChanges: Array<{
    package: string;
    path: string;
    operation: 'read' | 'write';
    timestamp: number;
  }>;
  lifecycleExecutions: Array<{
    package: string;
    script: string;
    durationMs: number;
    exitCode: number;
    timestamp: number;
  }>;
  blastRadiusPaths: Array<{
    target: string;
    path: string[];
    riskScore: number;
  }>;
}

export interface ReportData {
  graph: DependencyGraph;
  analysis: AnalysisResult;
  targetPackage: string;
  targetVersion: string;
}
