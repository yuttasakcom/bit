// @flow
import type { Compiler } from './CompilerInterface';

export default class MyCompiler implements Compiler {
  compile(p: string[]) {
    return p;
  }
}
