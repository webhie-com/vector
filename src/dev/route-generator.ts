import { promises as fs } from 'node:fs';
import { dirname, relative } from 'node:path';
import type { GeneratedRoute } from '../types';

export class RouteGenerator {
  private outputPath: string;

  constructor(outputPath = './.vector/routes.generated.ts') {
    this.outputPath = outputPath;
  }

  async generate(routes: GeneratedRoute[]): Promise<void> {
    const outputDir = dirname(this.outputPath);
    await fs.mkdir(outputDir, { recursive: true });

    const imports: string[] = [];
    const groupedByFile = new Map<string, GeneratedRoute[]>();

    for (const route of routes) {
      if (!groupedByFile.has(route.path)) {
        groupedByFile.set(route.path, []);
      }
      groupedByFile.get(route.path)!.push(route);
    }

    let importIndex = 0;
    const routeEntries: string[] = [];

    for (const [filePath, fileRoutes] of groupedByFile) {
      const relativePath = relative(dirname(this.outputPath), filePath)
        .replace(/\\/g, '/')
        .replace(/\.(ts|js)$/, '');

      const importName = `route_${importIndex++}`;
      const namedImports = fileRoutes.filter((r) => r.name !== 'default').map((r) => r.name);

      if (fileRoutes.some((r) => r.name === 'default')) {
        if (namedImports.length > 0) {
          imports.push(
            `import ${importName}, { ${namedImports.join(', ')} } from '${relativePath}';`
          );
        } else {
          imports.push(`import ${importName} from '${relativePath}';`);
        }
      } else if (namedImports.length > 0) {
        imports.push(`import { ${namedImports.join(', ')} } from '${relativePath}';`);
      }

      for (const route of fileRoutes) {
        const routeVar = route.name === 'default' ? importName : route.name;
        routeEntries.push(`  ${routeVar},`);
      }
    }

    const content = `// This file is auto-generated. Do not edit manually.
// Generated at: ${new Date().toISOString()}

${imports.join('\n')}

export const routes = [
${routeEntries.join('\n')}
];

export default routes;
`;

    await fs.writeFile(this.outputPath, content, 'utf-8');
  }

  async generateDynamic(routes: GeneratedRoute[]): Promise<string> {
    const routeEntries: string[] = [];

    for (const route of routes) {
      const routeObj = JSON.stringify({
        method: route.method,
        path: route.options.path,
        options: route.options,
      });

      routeEntries.push(`  await import('${route.path}').then(m => ({ 
        ...${routeObj}, 
        handler: m.${route.name === 'default' ? 'default' : route.name} 
      }))`);
    }

    return `export const loadRoutes = async () => {
  return Promise.all([
${routeEntries.join(',\n')}
  ]);
};`;
  }
}
