/* */ 
"format global";
"use strict";

var _interopRequireWildcard = function (obj) { return obj && obj.__esModule ? obj : { "default": obj }; };

var _interopRequire = function (obj) { return obj && obj.__esModule ? obj["default"] : obj; };

var _createClass = (function () { function defineProperties(target, props) { for (var key in props) { var prop = props[key]; prop.configurable = true; if (prop.value) prop.writable = true; } Object.defineProperties(target, props); } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

var _classCallCheck = function (instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } };

var PathHoister = _interopRequire(require("./hoister"));

var isBoolean = _interopRequire(require("lodash/lang/isBoolean"));

var isNumber = _interopRequire(require("lodash/lang/isNumber"));

var isRegExp = _interopRequire(require("lodash/lang/isRegExp"));

var isString = _interopRequire(require("lodash/lang/isString"));

var traverse = _interopRequire(require("../index"));

var includes = _interopRequire(require("lodash/collection/includes"));

var assign = _interopRequire(require("lodash/object/assign"));

var extend = _interopRequire(require("lodash/object/extend"));

var Scope = _interopRequire(require("../scope"));

var t = _interopRequireWildcard(require("../../types"));

var hoistVariablesVisitor = {
  enter: function enter(node, parent, scope) {
    if (this.isFunction()) {
      return this.skip();
    }

    if (this.isVariableDeclaration() && node.kind === "var") {
      var bindings = this.getBindingIdentifiers();
      for (var key in bindings) {
        scope.push({ id: bindings[key] });
      }

      var exprs = [];

      for (var i = 0; i < node.declarations.length; i++) {
        var declar = node.declarations[i];
        if (declar.init) {
          exprs.push(t.expressionStatement(t.assignmentExpression("=", declar.id, declar.init)));
        }
      }

      return exprs;
    }
  }
};

var TraversalPath = (function () {
  function TraversalPath(parent, container) {
    _classCallCheck(this, TraversalPath);

    this.container = container;
    this.parent = parent;
    this.data = {};
  }

  TraversalPath.get = function get(parentPath, context, parent, container, key, file) {
    var _container;

    var targetNode = container[key];
    var paths = (_container = container, !_container._paths && (_container._paths = []), _container._paths);
    var path;

    for (var i = 0; i < paths.length; i++) {
      var pathCheck = paths[i];
      if (pathCheck.node === targetNode) {
        path = pathCheck;
        break;
      }
    }

    if (!path) {
      path = new TraversalPath(parent, container);
      paths.push(path);
    }

    path.setContext(parentPath, context, key, file);

    return path;
  };

  TraversalPath.getScope = function getScope(path, scope, file) {
    var ourScope = scope;

    // we're entering a new scope so let's construct it!
    if (path.isScope()) {
      ourScope = new Scope(path, scope, file);
    }

    return ourScope;
  };

  TraversalPath.prototype.queueNode = function queueNode(path) {
    if (this.context) {
      this.context.queue.push(path);
    }
  };

  TraversalPath.prototype.insertBefore = function insertBefore(nodes) {
    nodes = this._verifyNodeList(nodes);
    this.checkNodes(nodes);

    if (this.parentPath.isExpressionStatement() || this.parentPath.isLabeledStatement()) {
      return this.parentPath.insertBefore(nodes);
    } else if (this.isPreviousType("Expression") || this.parentPath.isForStatement() && this.key === "init") {
      if (this.node) nodes.push(this.node);
      this.replaceExpressionWithStatements(nodes);
    } else if (this.isPreviousType("Statement")) {
      this._maybePopFromStatements(nodes);
      if (Array.isArray(this.container)) {
        this._containerInsertBefore(nodes);
      } else if (this.isStatementOrBlock()) {
        if (this.node) nodes.push(this.node);
        this.container[this.key] = t.blockStatement(nodes);
      } else {
        throw new Error("We don't know what to do with this node type. We were previously a Statement but we can't fit in here?");
      }
    } else {
      throw new Error("No clue what to do with this node type.");
    }
  };

  TraversalPath.prototype._containerInsert = function _containerInsert(from, nodes) {
    this.updateSiblingKeys(from, nodes.length);

    for (var i = 0; i < nodes.length; i++) {
      var to = from + i;
      this.container.splice(to, 0, nodes[i]);

      if (this.context) {
        this.queueNode(this.context.create(this.parent, this.container, to));
      }
    }
  };

  TraversalPath.prototype._containerInsertBefore = function _containerInsertBefore(nodes) {
    this._containerInsert(this.key, nodes);
  };

  TraversalPath.prototype._containerInsertAfter = function _containerInsertAfter(nodes) {
    this._containerInsert(this.key + 1, nodes);
  };

  TraversalPath.prototype._maybePopFromStatements = function _maybePopFromStatements(nodes) {
    var last = nodes[nodes.length - 1];
    if (t.isExpressionStatement(last) && t.isIdentifier(last.expression) && !this.isCompletionRecord()) {
      nodes.pop();
    }
  };

  TraversalPath.prototype.isCompletionRecord = function isCompletionRecord() {
    var path = this;

    do {
      var container = path.container;
      if (Array.isArray(container) && path.key !== container.length - 1) {
        return false;
      }
    } while (path = path.parentPath && !path.isProgram());

    return true;
  };

  TraversalPath.prototype.isStatementOrBlock = function isStatementOrBlock() {
    if (t.isLabeledStatement(this.parent) || t.isBlockStatement(this.container)) {
      return false;
    } else {
      return includes(t.STATEMENT_OR_BLOCK_KEYS, this.key);
    }
  };

  TraversalPath.prototype.insertAfter = function insertAfter(nodes) {
    nodes = this._verifyNodeList(nodes);
    this.checkNodes(nodes);

    if (this.parentPath.isExpressionStatement() || this.parentPath.isLabeledStatement()) {
      return this.parentPath.insertAfter(nodes);
    } else if (this.isPreviousType("Expression") || this.parentPath.isForStatement() && this.key === "init") {
      if (this.node) {
        var temp = this.scope.generateTemp();
        nodes.unshift(t.expressionStatement(t.assignmentExpression("=", temp, this.node)));
        nodes.push(t.expressionStatement(temp));
      }
      this.replaceExpressionWithStatements(nodes);
    } else if (this.isPreviousType("Statement")) {
      this._maybePopFromStatements(nodes);
      if (Array.isArray(this.container)) {
        this._containerInsertAfter(nodes);
      } else if (this.isStatementOrBlock()) {
        if (this.node) nodes.unshift(this.node);
        this.container[this.key] = t.blockStatement(nodes);
      } else {
        throw new Error("We don't know what to do with this node type. We were previously a Statement but we can't fit in here?");
      }
    } else {
      throw new Error("No clue what to do with this node type.");
    }
  };

  TraversalPath.prototype.updateSiblingKeys = function updateSiblingKeys(fromIndex, incrementBy) {
    var paths = this.container._paths;
    for (var i = 0; i < paths.length; i++) {
      var path = paths[i];
      if (path.key >= fromIndex) {
        path.key += incrementBy;
      }
    }
  };

  TraversalPath.prototype.setData = function setData(key, val) {
    return this.data[key] = val;
  };

  TraversalPath.prototype.getData = function getData(key, def) {
    var val = this.data[key];
    if (!val && def) val = this.data[key] = def;
    return val;
  };

  TraversalPath.prototype.setScope = function setScope(file) {
    this.scope = TraversalPath.getScope(this, this.context && this.context.scope, file);
  };

  TraversalPath.prototype.clearContext = function clearContext() {
    this.context = null;
  };

  TraversalPath.prototype.setContext = function setContext(parentPath, context, key, file) {
    this.shouldSkip = false;
    this.shouldStop = false;
    this.removed = false;

    this.parentPath = parentPath || this.parentPath;
    this.key = key;

    if (context) {
      this.context = context;
      this.state = context.state;
      this.opts = context.opts;
    }

    this.type = this.node && this.node.type;

    this.setScope(file);
  };

  TraversalPath.prototype._remove = function _remove() {
    if (Array.isArray(this.container)) {
      this.container.splice(this.key, 1);
      this.updateSiblingKeys(this.key, -1);
    } else {
      this.container[this.key] = null;
    }
  };

  TraversalPath.prototype.remove = function remove() {
    var removeParent = false;
    if (this.parentPath) {
      if (!removeParent) removeParent = this.parentPath.isExpressionStatement();
      if (!removeParent) removeParent = this.parentPath.isSequenceExpression() && this.parent.expressions.length === 1;

      if (removeParent) return this.parentPath.remove();
    }

    this._remove();
    this.removed = true;
  };

  TraversalPath.prototype.skip = function skip() {
    this.shouldSkip = true;
  };

  TraversalPath.prototype.stop = function stop() {
    this.shouldStop = true;
    this.shouldSkip = true;
  };

  TraversalPath.prototype.errorWithNode = function errorWithNode(msg) {
    var Error = arguments[1] === undefined ? SyntaxError : arguments[1];

    var loc = this.node.loc.start;
    var err = new Error("Line " + loc.line + ": " + msg);
    err.loc = loc;
    return err;
  };

  TraversalPath.prototype.replaceInline = function replaceInline(nodes) {
    if (Array.isArray(nodes)) {
      if (Array.isArray(this.container)) {
        nodes = this._verifyNodeList(nodes);
        this._containerInsertAfter(nodes);
        return this.remove();
      } else {
        return this.replaceWithMultiple(nodes);
      }
    } else {
      return this.replaceWith(nodes);
    }
  };

  TraversalPath.prototype._verifyNodeList = function _verifyNodeList(nodes) {
    if (nodes.constructor !== Array) {
      nodes = [nodes];
    }

    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (!node) {
        throw new Error("Node list has falsy node with the index of " + i);
      } else if (typeof node !== "object") {
        throw new Error("Node list contains a non-object node with the index of " + i);
      } else if (!node.type) {
        throw new Error("Node list contains a node without a type with the index of " + i);
      }
    }

    return nodes;
  };

  TraversalPath.prototype.replaceWithMultiple = function replaceWithMultiple(nodes) {
    nodes = this._verifyNodeList(nodes);
    t.inheritsComments(nodes[0], this.node);
    this.container[this.key] = null;
    this.insertAfter(nodes);
    if (!this.node) this.remove();
  };

  TraversalPath.prototype.replaceWith = function replaceWith(replacement, arraysAllowed) {
    if (this.removed) {
      throw new Error("You can't replace this node, we've already removed it");
    }

    if (!replacement) {
      throw new Error("You passed `path.replaceWith()` a falsy node, use `path.remove()` instead");
    }

    if (Array.isArray(replacement)) {
      if (arraysAllowed) {
        return this.replaceWithMultiple(replacement);
      } else {
        throw new Error("Don't use `path.replaceWith()` with an array of nodes, use `path.replaceWithMultiple()`");
      }
    }

    if (this.isPreviousType("Expression") && t.isStatement(replacement)) {
      return this.replaceExpressionWithStatements([replacement]);
    }

    var oldNode = this.node;
    if (oldNode) t.inheritsComments(replacement, oldNode);

    // replace the node
    this.container[this.key] = replacement;
    this.type = replacement.type;

    // potentially create new scope
    this.setScope();

    this.checkNodes([replacement]);
  };

  TraversalPath.prototype.checkNodes = function checkNodes(nodes) {
    var scope = this.scope;
    var file = scope && scope.file;
    if (!file) return;

    for (var i = 0; i < nodes.length; i++) {
      file.checkNode(nodes[i], scope);
    }
  };

  TraversalPath.prototype.getStatementParent = function getStatementParent() {
    var path = this;

    do {
      if (!path.parentPath || Array.isArray(path.container) && path.isStatement()) {
        break;
      } else {
        path = path.parentPath;
      }
    } while (path);

    if (path && (path.isProgram() || path.isFile())) {
      throw new Error("File/Program node, we can't possibly find a statement parent to this");
    }

    return path;
  };

  TraversalPath.prototype.getLastStatements = function getLastStatements() {
    var paths = [];

    var add = function add(path) {
      if (path) paths = paths.concat(path.getLastStatements());
    };

    if (this.isIfStatement()) {
      add(this.get("consequent"));
      add(this.get("alternate"));
    } else if (this.isDoExpression()) {
      add(this.get("body"));
    } else if (this.isProgram() || this.isBlockStatement()) {
      add(this.get("body").pop());
    } else {
      paths.push(this);
    }

    return paths;
  };

  TraversalPath.prototype.replaceExpressionWithStatements = function replaceExpressionWithStatements(nodes) {
    var toSequenceExpression = t.toSequenceExpression(nodes, this.scope);

    if (toSequenceExpression) {
      return this.replaceWith(toSequenceExpression);
    } else {
      var container = t.functionExpression(null, [], t.blockStatement(nodes));
      container.shadow = true;

      // add implicit returns to all ending expression statements
      var last = this.getLastStatements();
      for (var i = 0; i < last.length; i++) {
        var lastNode = last[i];
        if (lastNode.isExpressionStatement()) {
          lastNode.replaceWith(t.returnStatement(lastNode.node.expression));
        }
      }

      this.replaceWith(t.callExpression(container, []));

      this.traverse(hoistVariablesVisitor);

      return this.node;
    }
  };

  TraversalPath.prototype.call = function call(key) {
    var node = this.node;
    if (!node) return;

    var opts = this.opts;
    var fn = opts[key] || opts;
    if (opts[node.type]) fn = opts[node.type][key] || fn;

    var replacement = fn.call(this, node, this.parent, this.scope, this.state);
    if (replacement) this.replaceWith(replacement, true);
  };

  TraversalPath.prototype.isBlacklisted = function isBlacklisted() {
    var blacklist = this.opts.blacklist;
    return blacklist && blacklist.indexOf(this.node.type) > -1;
  };

  TraversalPath.prototype.visit = function visit() {
    if (this.isBlacklisted()) return false;

    this.call("enter");

    if (this.shouldSkip) {
      return this.shouldStop;
    }

    var node = this.node;
    var opts = this.opts;

    if (node) {
      if (Array.isArray(node)) {
        // traverse over these replacement nodes we purposely don't call exitNode
        // as the original node has been destroyed
        for (var i = 0; i < node.length; i++) {
          traverse.node(node[i], opts, this.scope, this.state, this);
        }
      } else {
        traverse.node(node, opts, this.scope, this.state, this);
        this.call("exit");
      }
    }

    return this.shouldStop;
  };

  TraversalPath.prototype.getSibling = function getSibling(key) {
    return TraversalPath.get(this.parentPath, null, this.parent, this.container, key, this.file);
  };

  TraversalPath.prototype.get = function get(key) {
    var _this = this;

    var parts = key.split(".");
    if (parts.length === 1) {
      // "foo.bar"
      var node = this.node;
      var container = node[key];
      if (Array.isArray(container)) {
        return container.map(function (_, i) {
          return TraversalPath.get(_this, null, node, container, i);
        });
      } else {
        return TraversalPath.get(this, null, node, node, key);
      }
    } else {
      // "foo"
      var path = this;
      for (var i = 0; i > parts.length; i++) {
        var part = parts[i];
        if (part === ".") {
          path = path.parentPath;
        } else {
          path = path.get(parts[i]);
        }
      }
      return path;
    }
  };

  TraversalPath.prototype.has = function has(key) {
    return !!this.node[key];
  };

  TraversalPath.prototype.is = function is(key) {
    return this.has(key);
  };

  TraversalPath.prototype.isnt = function isnt(key) {
    return !this.has(key);
  };

  TraversalPath.prototype.getTypeAnnotation = function getTypeAnnotation() {
    if (this.typeInfo) {
      return this.typeInfo;
    }

    var info = this.typeInfo = {
      inferred: false,
      annotation: null
    };

    var type = this.node.typeAnnotation;

    if (!type) {
      info.inferred = true;
      type = this.inferType(this);
    }

    if (type) {
      if (t.isTypeAnnotation(type)) type = type.typeAnnotation;
      info.annotation = type;
    }

    return info;
  };

  TraversalPath.prototype.resolve = function resolve() {
    if (this.isVariableDeclarator()) {
      if (this.get("id").isIdentifier()) {
        return this.get("init").resolve();
      } else {}
    } else if (this.isIdentifier()) {
      var binding = this.scope.getBinding(this.node.name);
      if (!binding || !binding.constant) return;

      // todo: take into consideration infinite recursion #1149
      return;

      if (binding.path === this) {
        return this;
      } else {
        return binding.path.resolve();
      }
    } else if (this.isMemberExpression()) {
      // this is dangerous, as non-direct target assignments will mutate it's state
      // making this resolution inaccurate

      var targetKey = this.toComputedKey();
      if (!t.isLiteral(targetKey)) return;
      var targetName = targetKey.value;

      var target = this.get("object").resolve();
      if (!target || !target.isObjectExpression()) return;

      var props = target.get("properties");
      for (var i = 0; i < props.length; i++) {
        var prop = props[i];
        if (!prop.isProperty()) continue;

        var key = prop.get("key");

        // { foo: obj }
        var match = prop.isnt("computed") && key.isIdentifier({ name: targetName });

        // { "foo": "obj" } or { ["foo"]: "obj" }
        if (!match) match = key.isLiteral({ value: targetName });

        if (match) return prop.get("value");
      }
    } else {
      return this;
    }
  };

  TraversalPath.prototype.inferType = function inferType(path) {
    path = path.resolve();
    if (!path) return;

    if (path.isRestElement() || path.parentPath.isRestElement() || path.isArrayExpression()) {
      return t.genericTypeAnnotation(t.identifier("Array"));
    }

    if (path.parentPath.isTypeCastExpression()) {
      return path.parentPath.node.typeAnnotation;
    }

    if (path.isTypeCastExpression()) {
      return path.node.typeAnnotation;
    }

    if (path.isObjectExpression()) {
      return t.genericTypeAnnotation(t.identifier("Object"));
    }

    if (path.isFunction()) {
      return t.identifier("Function");
    }

    if (path.isLiteral()) {
      var value = path.node.value;
      if (isString(value)) return t.stringTypeAnnotation();
      if (isNumber(value)) return t.numberTypeAnnotation();
      if (isBoolean(value)) return t.booleanTypeAnnotation();
    }

    if (path.isCallExpression()) {
      var callee = path.get("callee").resolve();
      if (callee && callee.isFunction()) return callee.node.returnType;
    }
  };

  TraversalPath.prototype.isScope = function isScope() {
    return t.isScope(this.node, this.parent);
  };

  TraversalPath.prototype.isReferencedIdentifier = function isReferencedIdentifier(opts) {
    return t.isReferencedIdentifier(this.node, this.parent, opts);
  };

  TraversalPath.prototype.isReferenced = function isReferenced() {
    return t.isReferenced(this.node, this.parent);
  };

  TraversalPath.prototype.isBlockScoped = function isBlockScoped() {
    return t.isBlockScoped(this.node);
  };

  TraversalPath.prototype.isVar = function isVar() {
    return t.isVar(this.node);
  };

  TraversalPath.prototype.isPreviousType = function isPreviousType(type) {
    return t.isType(this.type, type);
  };

  TraversalPath.prototype.isTypeGeneric = function isTypeGeneric(genericName) {
    var opts = arguments[1] === undefined ? {} : arguments[1];

    var typeInfo = this.getTypeAnnotation();
    var type = typeInfo.annotation;
    if (!type) return false;

    if (type.inferred && opts.inference === false) {
      return false;
    }

    if (!t.isGenericTypeAnnotation(type) || !t.isIdentifier(type.id, { name: genericName })) {
      return false;
    }

    if (opts.requireTypeParameters && !type.typeParameters) {
      return false;
    }

    return true;
  };

  TraversalPath.prototype.getBindingIdentifiers = function getBindingIdentifiers() {
    return t.getBindingIdentifiers(this.node);
  };

  TraversalPath.prototype.traverse = (function (_traverse) {
    var _traverseWrapper = function traverse(_x, _x2) {
      return _traverse.apply(this, arguments);
    };

    _traverseWrapper.toString = function () {
      return _traverse.toString();
    };

    return _traverseWrapper;
  })(function (visitor, state) {
    traverse(this.node, visitor, this.scope, state, this);
  });

  /**
   * Description
   */

  TraversalPath.prototype.hoist = function hoist() {
    var scope = arguments[0] === undefined ? this.scope : arguments[0];

    var hoister = new PathHoister(this, scope);
    return hoister.run();
  };

  /**
   * Match the current node if it matches the provided `pattern`.
   *
   * For example, given the match `React.createClass` it would match the
   * parsed nodes of `React.createClass` and `React["createClass"]`.
   */

  TraversalPath.prototype.matchesPattern = function matchesPattern(pattern, allowPartial) {
    var parts = pattern.split(".");

    // not a member expression
    if (!this.isMemberExpression()) return false;

    var search = [this.node];
    var i = 0;

    function matches(name) {
      var part = parts[i];
      return part === "*" || name === part;
    }

    while (search.length) {
      var node = search.shift();

      if (allowPartial && i === parts.length) {
        return true;
      }

      if (t.isIdentifier(node)) {
        // this part doesn't match
        if (!matches(node.name)) return false;
      } else if (t.isLiteral(node)) {
        // this part doesn't match
        if (!matches(node.value)) return false;
      } else if (t.isMemberExpression(node)) {
        if (node.computed && !t.isLiteral(node.property)) {
          // we can't deal with this
          return false;
        } else {
          search.push(node.object);
          search.push(node.property);
          continue;
        }
      } else {
        // we can't deal with this
        return false;
      }

      // too many parts
      if (++i > parts.length) {
        return false;
      }
    }

    return true;
  };

  _createClass(TraversalPath, {
    node: {
      get: function () {
        if (this.removed) {
          return null;
        } else {
          return this.container[this.key];
        }
      },
      set: function (replacement) {
        throw new Error("Don't use `path.node = newNode;`, use `path.replaceWith(newNode)` or `path.replaceWithMultiple([newNode])`");
      }
    }
  });

  return TraversalPath;
})();

module.exports = TraversalPath;

assign(TraversalPath.prototype, require("./evaluation"));
assign(TraversalPath.prototype, require("./conversion"));

for (var i = 0; i < t.TYPES.length; i++) {
  (function () {
    var type = t.TYPES[i];
    var typeKey = "is" + type;
    TraversalPath.prototype[typeKey] = function (opts) {
      return t[typeKey](this.node, opts);
    };
  })();
}

// otherwise it's a request for a destructuring declarator and i'm not
// ready to resolve those just yet