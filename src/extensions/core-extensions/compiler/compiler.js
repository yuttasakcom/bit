// @flow
import { build, buildAll } from './build';
import type { ExtensionContext } from '../../extensions-loader';
import SuperExtension from '../../super-extension';

export default class Compiler extends SuperExtension {
  dists: { [id: string]: files[] };
  props: Object;
  context: ExtensionContext;
  addCommandHook(): Object {
    return {
      name: 'compile [id]',
      description: 'compile component files using other extensions',
      opts: [
        ['v', 'verbose', 'showing npm verbose output for inspection'],
        ['', 'no-cache', 'ignore component cache when creating dist file']
      ],
      action: this.action,
      report: this.report
    };
  }
  action(
    [id]: [string],
    {
      noCache = false,
      verbose = false
    }: {
      noCache: boolean,
      verbose: boolean
    }
  ): Promise<any> {
    if (!id) return buildAll(this.context, this.props, noCache, verbose);
    return build(this.context, this.props, id, noCache, verbose);
  }
  report(result) {}
  compileComponent(component) {
    this.context.hooks.triggerComponentsHook('preCompile', component);
    const dists = this.context.hooks.triggerComponentsHook('compile', component, { distPath: '' });
    this.context.hooks.triggerComponentsHook('postCompile', component, { dists });
    this.dists[component.id.toString()] = dists;
    return dists;
  }
  preTagHook(component, args) {
    this.compileComponent(component);
  }
  preSaveVersionHook(version: Version, componentId: string) {
    version.dists = this.dists[componentId];
  }
}
