// @flow

export interface Compiler {
  compile(files: string[]): string[];
}
