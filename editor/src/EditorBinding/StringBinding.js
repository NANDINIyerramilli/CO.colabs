import TextDiffBinding from './TextDiffBinding';

class StringBinding extends TextDiffBinding {
  setup = () => {
    if (!this.doc) return;

    if (!this.doc.data) {
      this.doc.once('create', () => this.setup());
      this.doc.once('load', () => this.setup());
      return;
    }

    this.update(true);
    const state = this.compoThis.state;
    const docData = this.doc.data;

    if (docData.input && Array.isArray(docData.input) && docData.input[0] !== undefined) {
      this.updateInputOutput(state.input, docData.input[0], 'input');
    }
    if (docData.output && Array.isArray(docData.output) && docData.output[0] !== undefined) {
      this.updateInputOutput(state.output, docData.output[0], 'output');
    }

    this.attachDoc();
    this.attachElement();
  };

  attachElement = () => {
    // Editor onChange listener
    this._inputListener = (newValue, e) => {
      this.onInput(newValue, e);
    };
    // I/O input onChange listener
    this._inoutListener = (before, after, key) => {
      this._insertInOut(before, after, key);
    };
  };

  attachDoc = () => {
    if (this._hasAttachedDoc) return;
    this._hasAttachedDoc = true;
    this.doc.on('op', this.onListener);
  };

  onListener = (op, source) => {
    if (source === this) return;
    if (!op || op.length === 0) return;
    if (op.length > 1) {
      // Handle multiple component ops safely
      for (const comp of op) {
        this._handleComponent(comp);
      }
      return;
    }
    this._handleComponent(op[0]);
  };

  _handleComponent = (component) => {
    if (!component || !component.p) return;
    const key = component.p[0];
    if (key === 'output' || key === 'input' || key === 'lang') {
      this.updateInputOutput(component.ld, component.li, key);
    } else if (this.isSubpath(this.path, component.p)) {
      this._parseInsertRemoveOp(component, 'si', 'onInsert');
      this._parseInsertRemoveOp(component, 'sd', 'onRemove');
    } else if (this.isSubpath(component.p, this.path)) {
      this._parseParentOp();
    }
  };

  _parseInsertRemoveOp(component, key, onHandler) {
    if (!component[key]) return;
    let rangeOffset = component.rangeOffset !== undefined ? component.rangeOffset : 0;
    let length = component[key].length;
    this[onHandler](rangeOffset, length);
  }

  _parseParentOp = () => {
    this.update();
  };

  _insertInOut = (before, after, key) => {
    if (!this.doc || !this.doc.data) return;
    let path = [key, 0];
    let op = { p: path, ld: before, li: after };
    this.doc.submitOp(op, { source: this });
  };

  isSubpath = (path, testPath) => {
    if (!path || !testPath) return false;
    for (var i = 0; i < path.length; i++) {
      if (testPath[i] !== path[i]) return false;
    }
    return true;
  };

  updateInputOutput(before, after, key) {
    if (before === after) return;
    this.compoThis.setState({ [key]: after });
  }
}

export default StringBinding;