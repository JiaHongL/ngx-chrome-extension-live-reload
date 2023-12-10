import {
  Rule,
  SchematicContext,
  Tree,
  apply,
  mergeWith,
  url,
  move,
  chain,
  MergeStrategy,
  applyTemplates,
  SchematicsException
} from '@angular-devkit/schematics';
import { normalize, strings } from '@angular-devkit/core';
import { NodePackageInstallTask } from '@angular-devkit/schematics/tasks';

function getProjectName(tree: Tree, _options: any): string {
  const workspaceConfigBuffer = tree.read('angular.json');
  if (!workspaceConfigBuffer) {
    throw new SchematicsException('Not an Angular CLI workspace');
  }
  const workspaceConfig = JSON.parse(workspaceConfigBuffer.toString());
  const projects = Object.keys(workspaceConfig.projects);
  return workspaceConfig.defaultProject || projects[0];
}

function addDevPackages(): Rule {
  return (tree: Tree, context: SchematicContext) => {

    const devDependencies: Record<string, string> = {
      "archiver": "6.0.1",
      "chokidar": "3.5.3",
      "npm-run-all": "4.1.5"
    };

    const packageJsonPath = '/package.json';
    const packageJsonBuffer = tree.read(packageJsonPath);

    if (packageJsonBuffer) {
      const packageJson = JSON.parse(packageJsonBuffer.toString());
      packageJson.devDependencies = packageJson.devDependencies || {};
      Object.entries(devDependencies).forEach(([name, version]) => {
        if (!packageJson.devDependencies[name]) {
          packageJson.devDependencies[name] = version;
        }
      });
      tree.overwrite(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    context.addTask(new NodePackageInstallTask({
      packageName: Object.entries(devDependencies).map(([name, version]) => `${name}@${version}`).join(' ')
    }));

    return tree;
  };
}

function updatePackageScripts(): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const packageJsonPath = '/package.json';
    const packageJsonBuffer = tree.read(packageJsonPath);

    if (packageJsonBuffer) {
      const packageJson = JSON.parse(packageJsonBuffer.toString());

      const newScripts = {
        "start": "npm-run-all build:dev copy-all:dev watch-extension",
        "watch-extension": "node extension-watcher.js",
        "build:dev": "ng build --configuration development",
        "build:prod": "ng build",
        "copy-background:dev": "node copy-background.js dev",
        "copy-background:prod": "node copy-background.js prod",
        "copy-all:dev": "npm-run-all copy-background:dev copy-content-script:dev",
        "copy-content-script:dev": "node copy-content-script.js dev",
        "copy-content-script:prod": "node copy-content-script.js prod",
        "copy-all:prod": "npm-run-all copy-background:prod copy-content-script:prod",
        "zip-extension": "node zip-extension.js",
        "build:extension": "npm-run-all build:prod copy-all:prod zip-extension",
      };

      packageJson.scripts = { ...packageJson.scripts, ...newScripts };

      tree.overwrite(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    return tree;
  };
}

function deleteRoutesFiles(): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const filesToDelete = [
      '/src/app/app.routes.ts',
    ];

    filesToDelete.forEach(path => {
      if (tree.exists(path)) {
        tree.delete(path);
      }
    });

    return tree;
  };
}

function deleteAppComponentFiles(): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const filesToDelete = [
      '/src/app/app.component.ts',
      '/src/app/app.component.html',
      '/src/app/app.component.css',
      '/src/app/app.component.scss',
      '/src/app/app.component.sass',
      '/src/app/app.component.less'
    ];

    filesToDelete.forEach(path => {
      if (tree.exists(path)) {
        tree.delete(path);
      }
    });

    return tree;
  };
}

function addFiles(options: any): Rule {
  return (_tree: Tree, _context: SchematicContext) => {

    const sourceTemplates = url('./files');
    const projectName = getProjectName(_tree, options);

    const sourceParametrizedTemplates = apply(sourceTemplates, [
      applyTemplates({
        ...options,
        projectName,
        ...strings
      }),
      move(normalize('/')),
    ]);

    return mergeWith(sourceParametrizedTemplates, MergeStrategy.Overwrite);

  };
}

function updateAngularJson(options: any): Rule {
  return (tree: Tree, _context: SchematicContext) => {

    const angularJsonPath = '/angular.json';
    const angularJsonBuffer = tree.read(angularJsonPath);

    if (!angularJsonBuffer) {
      throw new SchematicsException(`Could not find an angular.json file`);
    }
    const angularJson = JSON.parse(angularJsonBuffer.toString());
    const projectName = getProjectName(tree, options);
    const project = angularJson.projects[projectName];
    const architect = project.architect || project.targets;

    const buildOptions = architect.build.options;
    if (!buildOptions.assets.includes('src/manifest.json')) {
      buildOptions.assets.push('src/manifest.json');
    }

    // 輸出的檔案不要加上 hash
    if (architect.build.configurations.production) {
      architect.build.configurations.production.outputHashing = 'none';
    }

    // 設定 esbuild
    architect.build.builder = '@angular-devkit/build-angular:browser-esbuild';
    architect.build.options.main = 'src/main.ts';

    // 移除不必要的設定
    if(architect.build.options.browser){
      delete architect.build.options.browser;
    }

    // 設定開發模式
    architect.build.configurations.development = {
      optimization: false,
      extractLicenses: false,
      sourceMap: true,
      namedChunks: true
    };

    tree.overwrite(angularJsonPath, JSON.stringify(angularJson, null, 2));
    
    return tree;
  };
}

export function ngAdd(options: any): Rule {
  return chain([
    addDevPackages(),
    updatePackageScripts(),
    deleteAppComponentFiles(),
    deleteRoutesFiles(),
    addFiles(options),
    updateAngularJson(options),
  ]);
}