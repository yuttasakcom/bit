// @flow

export default class Extension implements lifeCycle {
  props: Object;
  context: Object;
  constructor(props: Object, context: Object) {
    this.props = props;
    this.context = context;
  }
}

// export class MyExtension extends Extension implements lifeCycle {
//   anotherOne() {}

//   onTag() {
//     console.log('hi');
//   }

//   onAdd() { return 4; }
// }

export class MyExtension extends Extension {
  onAdd() {
    return 4;
  }
}
