// @flow
import path from 'path';
import fs from 'fs-extra';
import Vinyl from 'vinyl';
import Dists from './dists';
import IsolatedEnvironment from '../../../environment';
import ComponentMap from '../../../consumer/bit-map/component-map';
import { BitId } from '../../../bit-id';
import logger from '../../../logger/logger';
import { DEFAULT_DIST_DIRNAME } from '../../../constants';
import ExternalBuildErrors from '../../../consumer/component/exceptions/external-build-errors';
import type { PathLinux } from '../../../utils/path';
import { isString } from '../../../utils';
import GeneralError from '../../../error/general-error';
import Dist from './dist';
import { writeEnvFiles } from '../../../consumer';
import Workspace from '../../context/workspace';
import Store from '../../context/store';
import type { Compiler } from './CompilerInterface';
import { Component } from '../../types';
import InvalidCompilerInterface from '../../../consumer/component/exceptions/invalid-compiler-interface';

export default (async function buildComponent({
  component,
  compilers,
  store,
  save,
  workspace,
  noCache,
  verbose,
  keep
}: {
  component: Component,
  compilers: Compiler[],
  store: Store,
  save?: boolean,
  workspace?: Workspace,
  noCache?: boolean,
  verbose?: boolean,
  keep?: boolean
}): Promise<?Dists> {
  logger.debug(`consumer-component.build ${component.id.toString()}`);
  // @TODO - write SourceMap Type
  if (!compilers || !compilers.length) {
    if (!workspace || shouldDistsBeInsideTheComponent(workspace)) {
      logger.debug('compiler was not found, nothing to build');
      return null;
    }
    logger.debug(
      'compiler was not found, however, because the dists are set to be outside the components directory, save the source file as dists'
    );
    copyFilesIntoDists(component);
    return component.dists;
  }

  const bitMap = workspace ? workspace.bitMap : undefined;
  // const consumerPath = workspace ? workspace.workspacePath : '';
  const componentMap = bitMap && bitMap.getComponent(component.id);
  // let componentDir = consumerPath;
  // if (componentMap) {
  //   componentDir = consumerPath && componentMap.rootDir ? path.join(consumerPath, componentMap.rootDir) : undefined;
  // }
  const needToRebuild = await _isNeededToReBuild(workspace, component.id, noCache);
  if (!needToRebuild && !component.dists.isEmpty()) {
    logger.debug('skip the build process as the component was not modified, use the dists saved in the model');
    return component.dists;
  }
  logger.debug('compiler found, start building');

  const builtFiles =
    (await _buildIfNeeded({
      component,
      compilers,
      workspace,
      componentMap,
      store,
      keep,
      verbose: !!verbose
    })) || [];
  // return buildFilesP.then((buildedFiles) => {
  builtFiles.forEach((file) => {
    if (file && (!file.contents || !isString(file.contents.toString()))) {
      throw new GeneralError('builder interface has to return object with a code attribute that contains string');
    }
  });
  setDists(component, builtFiles.map(file => new Dist(file)));

  if (save) {
    await store.sources.updateDist({ source: component });
  }
  return component.dists;
});

function shouldDistsBeInsideTheComponent(workspace: Workspace): boolean {
  return !workspace.bitJson.distEntry && !workspace.bitJson.distTarget;
}

function copyFilesIntoDists(component: Component) {
  const dists = component.files.map(file => new Dist({ base: file.base, path: file.path, contents: file.contents }));
  setDists(component, dists);
}

function setDists(component: Component, dists?: Dist[]) {
  component.dists = new Dists(dists);
}

async function _buildIfNeeded({
  component,
  compilers,
  workspace,
  componentMap,
  store,
  verbose,
  directory,
  keep
}: {
  component: Component,
  compilers: Compiler[],
  workspace?: Workspace,
  componentMap?: ?ComponentMap,
  store: Store,
  verbose: boolean,
  directory?: ?string,
  keep: ?boolean
}): Promise<Vinyl[]> {
  if (!compilers || !compilers.length) {
    throw new GeneralError('compiler was not found, nothing to build');
  }

  const compilerResultsP = compilers.map(async (compiler) => {
    if (!compiler.compile) {
      throw new InvalidCompilerInterface(compiler.id);
    }
    if (workspace) { return _runBuild({ component, compiler, componentRoot: workspace.getPath(), workspace, componentMap, verbose }); }
    if (component.isolatedEnvironment) {
      return _runBuild({ component, compiler, componentRoot: component.writtenPath, workspace, componentMap, verbose });
    }

    const isolatedEnvironment = new IsolatedEnvironment(store, directory);
    try {
      await isolatedEnvironment.create();
      const isolateOpts = {
        verbose,
        installPackages: true,
        noPackageJson: false
      };
      const componentWithDependencies = await isolatedEnvironment.isolateComponent(component.id, isolateOpts);
      const isolatedComponent = componentWithDependencies.component;
      const result = await _runBuild({
        component,
        compiler,
        componentRoot: isolatedComponent.writtenPath,
        workspace,
        componentMap,
        verbose
      });
      if (!keep) await isolatedEnvironment.destroy();
      return result;
    } catch (err) {
      await isolatedEnvironment.destroy();
      throw err;
    }
  });
  const compilerResults = await Promise.all(compilerResultsP);
  // @todo: what to do with
  return compilerResults;
}

// Ideally it's better to use the dists from the model.
// If there is no consumer, it comes from the scope or isolated environment, which the dists are already saved.
// If there is consumer, check whether the component was modified. If it wasn't, no need to re-build.
const _isNeededToReBuild = async (workspace: ?Workspace, componentId: BitId, noCache: ?boolean): Promise<boolean> => {
  // Forcly rebuild
  if (noCache) return true;
  if (!workspace) return false;
  const componentStatus = await workspace.getComponentStatusById(componentId);
  return componentStatus.modified;
};

const _runBuild = async ({
  component,
  compiler,
  componentRoot,
  workspace,
  componentMap,
  verbose
}: {
  component: Component,
  compiler: Compiler,
  componentRoot: PathLinux,
  workspace: ?Workspace,
  componentMap: ?ComponentMap,
  verbose: boolean
}): Promise<Vinyl[]> => {
  if (!compiler) {
    throw new GeneralError('compiler was not found, nothing to build');
  }

  let rootDistDir = path.join(componentRoot, DEFAULT_DIST_DIRNAME);
  const consumerPath = workspace ? workspace.getPath() : '';
  const files = component.files.map(file => file.clone());
  let tmpFolderFullPath;

  let componentDir = '';
  if (componentMap) {
    // $FlowFixMe
    rootDistDir = component.dists.getDistDirForConsumer(workspace, componentMap.rootDir);
    if (consumerPath && componentMap && componentMap.getComponentDir()) {
      componentDir = componentMap.getComponentDir() || '';
    }
  }
  return Promise.resolve()
    .then(async () => {
      if (!compiler.compile) {
        throw new InvalidCompilerInterface(compiler.name);
      }

      const context: Object = {
        componentObject: component.toObject(),
        rootDistDir,
        componentDir
      };

      // Change the cwd to make sure we found the needed files
      process.chdir(componentRoot);
      const shouldWriteConfig = compiler.writeConfigFilesOnAction && component.getDetachedCompiler();
      // Write config files to tmp folder
      if (shouldWriteConfig) {
        tmpFolderFullPath = component.getTmpFolder(consumerPath);
        if (verbose) {
          console.log(`\nwriting config files to ${tmpFolderFullPath}`); // eslint-disable-line no-console
        }
        await writeEnvFiles({
          fullConfigDir: tmpFolderFullPath,
          env: compiler,
          consumer: workspace,
          component,
          deleteOldFiles: false,
          verbose
        });
      }

      const actionParams = {
        files,
        rawConfig: compiler.rawConfig,
        dynamicConfig: compiler.dynamicConfig,
        configFiles: compiler.files,
        api: compiler.api,
        context
      };
      const result = await compiler.compile(actionParams);
      if (tmpFolderFullPath) {
        if (verbose) {
          console.log(`\ndeleting tmp directory ${tmpFolderFullPath}`); // eslint-disable-line no-console
        }
        logger.info(`build-components, deleting ${tmpFolderFullPath}`);
        await fs.remove(tmpFolderFullPath);
      }
      // TODO: Gilad - handle return of main dist file
      if (!result || !result.files) {
        throw new Error('compiler return invalid response');
      }
      return result.files;
    })
    .catch((e) => {
      if (tmpFolderFullPath) {
        logger.info(`build-components, deleting ${tmpFolderFullPath}`);
        fs.removeSync(tmpFolderFullPath);
      }
      const errors = e.errors || [e];
      const err = new ExternalBuildErrors(component.id.toString(), errors);
      throw err;
    });
};
