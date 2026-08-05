export interface Artifact {
  label: string;
  path: string;
}

export function extractArtifacts(result: any, projectDir: string): Artifact[] {
  const found: Artifact[] = [];
  const seen = new Set<string>();

  const normalize = (path: string) => {
    if (!projectDir) return path;
    const prefix = projectDir.endsWith('/') ? projectDir : `${projectDir}/`;
    if (path.startsWith(prefix)) return path.slice(prefix.length);
    return path;
  };

  const add = (label: string, path: string) => {
    if (!path || typeof path !== 'string' || seen.has(path)) return;
    const lower = path.toLowerCase();
    const isPathLike = path.startsWith('/') || path.startsWith('http');
    const isArtifactLike = /\.(html|css|js|png|jpg|jpeg|svg|txt|pdf|zip)$/i.test(lower) || /[\\/]outputs[\\/]/i.test(path) || /[\\/]artifacts[\\/]/i.test(path);
    if (!isPathLike || !isArtifactLike) return;
    const relative = normalize(path);
    if (seen.has(relative)) return;
    seen.add(path);
    seen.add(relative);
    found.push({ label, path: relative });
  };

  if (result.output_path) add('输出文件', result.output_path);

  const walk = (obj: any) => {
    if (!obj || typeof obj !== 'object') return;
    for (const [key, value] of Object.entries(obj)) {
      if (typeof value === 'string') {
        add(key, value);
      } else if (Array.isArray(value)) {
        value.forEach((v) => walk(v));
      } else if (typeof value === 'object') {
        walk(value);
      }
    }
  };

  walk(result);
  return found;
}
