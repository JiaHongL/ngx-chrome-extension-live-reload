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

function addDependencies(): Rule {
  return (tree: Tree, context: SchematicContext) => {

    const dependencies: Record<string, string> = {
      "@types/chrome": "0.0.263",
    };

    const packageJsonPath = '/package.json';
    const packageJsonBuffer = tree.read(packageJsonPath);

    if (packageJsonBuffer) {
      const packageJson = JSON.parse(packageJsonBuffer.toString());
      packageJson.dependencies = packageJson.dependencies || {};
      Object.entries(dependencies).forEach(([name, version]) => {
        if (!packageJson.dependencies[name]) {
          packageJson.dependencies[name] = version;
        }
      });
      tree.overwrite(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }

    context.addTask(new NodePackageInstallTask({
      packageName: Object.entries(dependencies).map(([name, version]) => `${name}@${version}`).join(' ')
    }));
    return tree;
  };
}

function addDevDependencies(): Rule {
  return (tree: Tree, context: SchematicContext) => {

    const devDependencies: Record<string, string> = {
      "archiver": "6.0.1",
      "chokidar": "3.5.3",
      "npm-run-all": "4.1.5",
      "copy-webpack-plugin": "12.0.2",
      "ts-loader": "9.5.1",
      "webpack": "5.91.0",
      "webpack-cli": "5.1.4"
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
        "ng": "ng",
        "start": "npm-run-all build:dev webpack:build watch-extension",
        "build": "ng build",
        "watch": "ng build --watch --configuration development",
        "test": "ng test",
        "watch-extension": "node extension-watcher.js",
        "webpack:build": "webpack --config extra-webpack.config.js --env enableLiveReload=true",
        "webpack:build:prod": "webpack --config extra-webpack.config.js --env enableLiveReload=false",
        "build:dev": "ng build --configuration development",
        "build:prod": "ng build",
        "zip-extension": "node zip-extension.js",
        "build:extension": "npm-run-all build:prod webpack:build:prod zip-extension"
      };

      packageJson.scripts = { ...packageJson.scripts, ...newScripts };

      tree.overwrite(packageJsonPath, JSON.stringify(packageJson, null, 2));
    }
    return tree;
  };
}

function updateTsConfigTypes(): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    const tsConfigPath = './tsconfig.app.json';
    if (tree.exists(tsConfigPath)) {
      const tsConfigBuffer = tree.read(tsConfigPath);
      if (!tsConfigBuffer) {
        return tree;
      }
      let tsConfigStr = tsConfigBuffer.toString();

      // 使用正則表達式查找 "types": []，並替換成 "types": ["chrome"]
      const typesRegex = /"types": \[\s*\]/;
      if (typesRegex.test(tsConfigStr)) {
        tsConfigStr = tsConfigStr.replace(typesRegex, `"types": ["chrome"]`);
        tree.overwrite(tsConfigPath, tsConfigStr);
      }
    }

    return tree;
  };
}

export function addChromeType(): Rule {
  return (tree: Tree, context: SchematicContext) => {
    const rule = updateTsConfigTypes();
    return rule(tree, context);
  };
}

function removeAppFiles(): Rule {
  return (tree: Tree, _context: SchematicContext) => {
    tree.getDir(normalize('src/app')).visit(filePath => {
      tree.delete(filePath);
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

    // 修正 js 和 css 打包時遇到的問題
    if (architect.build.configurations.production) {
      architect.build.configurations.production.optimization = {
        "scripts": true,
        "styles": {
          "minify": true,
          "inlineCritical": false
        },
        "fonts": true
      };
    }

    // 如果 package.json devDependencies 的 @angular/cli 為 17.1.0 以上的版本，就不需要設定 esbuild
    const packageJsonPath = '/package.json';
    const packageJsonBuffer = tree.read(packageJsonPath);
    if (packageJsonBuffer) {
      const packageJson = JSON.parse(packageJsonBuffer.toString());
      const angularCliVersion = packageJson.devDependencies['@angular/cli'];
      if (angularCliVersion && angularCliVersion >= '17.1.0') {
        // 設定 output path
        const originalOutputPath = architect.build.options.outputPath;
        architect.build.options.outputPath = {
          "base": originalOutputPath,
          "browser": ""
        };
        // 設定開發模式
        architect.build.configurations.development = {
          "optimization": false,
          "extractLicenses": false,
          "sourceMap": true,
          "namedChunks": true
        };
      }else{
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
          buildOptimizer: false,
          extractLicenses: false,
          sourceMap: true,
          namedChunks: true
        };
      }
    }

    tree.overwrite(angularJsonPath, JSON.stringify(angularJson, null, 2));
    
    return tree;
  };
}

export function ngAdd(options: any): Rule {
  return chain([
    addDependencies(),
    addDevDependencies(),
    updatePackageScripts(),
    addChromeType(),
    removeAppFiles(),
    addFiles(options),
    updateAngularJson(options),
  ]);
}